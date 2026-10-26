import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { RateLimiterRes } from 'rate-limiter-flexible';
import {
  AI_RATE_LIMIT_POINTS,
  enforceAiRateLimit,
  getRateLimitIdentity,
  type RateLimitConsumer,
} from '@/lib/rateLimit';

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/ai/summarize', { headers });
}

function result(overrides: Partial<RateLimiterRes> = {}): RateLimiterRes {
  return {
    msBeforeNext: 40_000,
    remainingPoints: 0,
    consumedPoints: 1,
    isFirstInDuration: true,
    ...overrides,
  } as RateLimiterRes;
}

describe('rate limit distribuido de IA', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('genera una identidad opaca y estable para una API key', () => {
    const withApiKey = request({
      'x-verified-user-id': 'clave-muy-secreta',
      'x-forwarded-for': '203.0.113.8, 10.0.0.2',
    });
    

    const identity = getRateLimitIdentity(withApiKey);

    expect(identity).toMatch(/^[a-f0-9]{64}$/);
    expect(identity).not.toContain('clave-muy-secreta');
  });

  it('separa credenciales y no confía en la IP si existe autenticación', () => {
    const first = getRateLimitIdentity(
      request({ 'x-verified-user-id': 'key-a', 'x-real-ip': '203.0.113.8' })
    );
    const otherKey = getRateLimitIdentity(
      request({ 'x-verified-user-id': 'key-b', 'x-real-ip': '203.0.113.8' })
    );
    const otherClient = getRateLimitIdentity(
      request({ 'x-verified-user-id': 'key-a', 'x-real-ip': '203.0.113.9' })
    );

    expect(first).not.toBe(otherKey);
    expect(first).toBe(otherClient);
  });

  it('usa la IP como fallback cuando no existe una credencial', () => {
    const first = getRateLimitIdentity(
      request({ 'x-real-ip': '203.0.113.8' })
    );
    const otherClient = getRateLimitIdentity(
      request({ 'x-real-ip': '203.0.113.9' })
    );

    expect(first).not.toBe(otherClient);
  });

  it('consume una clave con el ámbito del endpoint', async () => {
    const consume = vi.fn(async () => result());
    const consumer: RateLimitConsumer = { consume };
    const req = request({ 'x-verified-user-id': 'key-a', 'x-real-ip': '203.0.113.8' });

    const response = await enforceAiRateLimit(req, 'summarize', consumer);

    expect(response).toBeNull();
    expect(consume).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledWith(
      `summarize:${getRateLimitIdentity(req)}`
    );
  });

  it('responde 429 con tiempo de espera y cabeceras de rate limit', async () => {
    const consumer: RateLimitConsumer = {
      consume: vi.fn().mockRejectedValue(
        result({ msBeforeNext: 1_500, consumedPoints: 2 })
      ),
    };

    const response = await enforceAiRateLimit(
      request({ 'x-verified-user-id': 'key-a', 'x-real-ip': '203.0.113.8' }),
      'summarize',
      consumer
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('retry-after')).toBe('2');
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(response?.headers.get('x-ratelimit-limit')).toBe(
      String(AI_RATE_LIMIT_POINTS)
    );
    expect(response?.headers.get('x-ratelimit-remaining')).toBe('0');
    await expect(response?.json()).resolves.toMatchObject({
      success: false,
      retryAfter: 2,
    });
  });

  it('falla cerrado con 503 cuando el almacén distribuido falla', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consumer: RateLimitConsumer = {
      consume: vi.fn().mockRejectedValue(new Error('MongoDB unavailable')),
    };

    const response = await enforceAiRateLimit(
      request({ 'x-verified-user-id': 'key-a', 'x-real-ip': '203.0.113.8' }),
      'summarize',
      consumer
    );

    expect(response?.status).toBe(503);
    expect(response?.headers.get('retry-after')).toBe('1');
    await expect(response?.json()).resolves.toMatchObject({ success: false });
  });
});
