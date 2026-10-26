import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeIncoming } from '@/app/api/whatsapp/ingest';
import { requireUserPermission } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  requireUserPermission: vi.fn(),
}));

describe('authorizeIncoming', () => {
  const originalEnv = process.env;
  const deniedResponse = NextResponse.json({ error: 'Denied' }, { status: 403 });

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    delete process.env.API_MASTER_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('a. usuario con permiso -> null, sin mirar el secret', async () => {
    vi.mocked(requireUserPermission).mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/incoming');
    const result = await authorizeIncoming(req);
    expect(result).toBeNull();
  });

  it('b. sin permiso + ?secret correcto de WHATSAPP_WEBHOOK_SECRET -> null', async () => {
    vi.mocked(requireUserPermission).mockResolvedValue(deniedResponse);
    process.env.WHATSAPP_WEBHOOK_SECRET = 'mi-secreto-super-seguro';
    
    const req = new NextRequest('http://localhost/api/incoming?secret=mi-secreto-super-seguro');
    const result = await authorizeIncoming(req);
    expect(result).toBeNull();
  });

  it('c. sin permiso + ?secret incorrecto -> devuelve denied', async () => {
    vi.mocked(requireUserPermission).mockResolvedValue(deniedResponse);
    process.env.WHATSAPP_WEBHOOK_SECRET = 'mi-secreto-super-seguro';
    
    const req = new NextRequest('http://localhost/api/incoming?secret=secreto-hackeado');
    const result = await authorizeIncoming(req);
    expect(result).toBe(deniedResponse);
  });

  it('d. sin permiso + sin ?secret -> denied', async () => {
    vi.mocked(requireUserPermission).mockResolvedValue(deniedResponse);
    process.env.WHATSAPP_WEBHOOK_SECRET = 'mi-secreto-super-seguro';
    
    const req = new NextRequest('http://localhost/api/incoming');
    const result = await authorizeIncoming(req);
    expect(result).toBe(deniedResponse);
  });

  it('e. sin permiso + sin WEBHOOK_SECRET, pero API_MASTER_KEY y ?secret coinciden -> denied (fallback eliminado)', async () => {
    vi.mocked(requireUserPermission).mockResolvedValue(deniedResponse);
    process.env.API_MASTER_KEY = 'master-key';
    
    const req = new NextRequest('http://localhost/api/incoming?secret=master-key');
    const result = await authorizeIncoming(req);
    expect(result).toBe(deniedResponse);
  });

  it('f. sin permiso + variable vacia y ?secret vacio -> denied', async () => {
    vi.mocked(requireUserPermission).mockResolvedValue(deniedResponse);
    process.env.WHATSAPP_WEBHOOK_SECRET = '';
    
    const req = new NextRequest('http://localhost/api/whatsapp/incoming?secret=');
    const result = await authorizeIncoming(req);
    expect(result).toBe(deniedResponse);
  });
});