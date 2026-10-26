import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { DELETE } from '@/app/api/contacts/route';
import { requireUserPermission } from '@/lib/auth';
import { connectToPostgres } from '@/lib/postgres';
import { deleteContacts } from '@/lib/repositories/contactRepo';

vi.mock('@/lib/auth', () => ({
  requireUserPermission: vi.fn(),
}));
vi.mock('@/lib/postgres', () => ({
  connectToPostgres: vi.fn(),
}));
vi.mock('@/lib/repositories/contactRepo', () => ({
  deleteContacts: vi.fn(),
}));

describe('DELETE /api/contacts - Autorización y flujo', () => {
  beforeEach(() => {
    vi.resetAllMocks(); // Limpia implementaciones, no solo llamadas
    // Requisito del revisor: el DB falso debe fijarse en TODOS los tests
    vi.mocked(connectToPostgres).mockResolvedValue({} as any);
    vi.mocked(deleteContacts).mockResolvedValue(1);
  });

  it('Permitido con ?id=: llama a delete y borra', async () => {
    vi.mocked(requireUserPermission).mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/contacts?id=c1', { method: 'DELETE' });
    
    const res = await DELETE(req);
    
    expect(res.status).toBe(200);
    expect(requireUserPermission).toHaveBeenCalledWith(expect.any(NextRequest), 'delete');
    expect(deleteContacts).toHaveBeenCalledWith({}, ['c1']); // Pasa el db falso y el id
  });

  it('Permitido con { ids }: llama a delete y borra múltiples', async () => {
    vi.mocked(requireUserPermission).mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/contacts', {
      method: 'DELETE',
      body: JSON.stringify({ ids: ['c1', 'c2'] }),
    });
    
    const res = await DELETE(req);
    
    expect(res.status).toBe(200);
    expect(requireUserPermission).toHaveBeenCalledWith(expect.any(NextRequest), 'delete');
    expect(deleteContacts).toHaveBeenCalledWith({}, ['c1', 'c2']);
  });

  it('Denegado con ?id=: responde 403 y NO llama a delete', async () => {
    vi.mocked(requireUserPermission).mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );
    const req = new NextRequest('http://localhost/api/contacts?id=c1', { method: 'DELETE' });
    
    const res = await DELETE(req);
    
    expect(res.status).toBe(403);
    expect(deleteContacts).not.toHaveBeenCalled();
  });

  it('Denegado con { ids }: responde 403 y NO llama a delete', async () => {
    vi.mocked(requireUserPermission).mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );
    const req = new NextRequest('http://localhost/api/contacts', {
      method: 'DELETE',
      body: JSON.stringify({ ids: ['c1', 'c2'] }),
    });
    
    const res = await DELETE(req);
    
    expect(res.status).toBe(403);
    expect(deleteContacts).not.toHaveBeenCalled();
  });
});