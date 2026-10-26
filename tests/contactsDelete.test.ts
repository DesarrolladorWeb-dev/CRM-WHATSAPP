import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteContact, deleteContacts } from '@/lib/repositories/contactRepo';
import { MessageModel } from '@/models/Message';
import * as mongodb from '@/lib/mongodb';
import * as mediaStorage from '@/lib/mediaStorage';
import { logger } from '@/lib/logger';

vi.mock('@/lib/mongodb', () => ({
  connectToDatabase: vi.fn(),
  isDbConnected: vi.fn(),
}));

vi.mock('@/models/Message', () => ({
  MessageModel: { deleteMany: vi.fn() }
}));

vi.mock('@/lib/mediaStorage', () => ({
  deleteMediaDir: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  motivo: vi.fn((e) => (e instanceof Error ? e.message : String(e))),
}));

describe('contactRepo: borrado de contactos y limpieza', () => {
  const mockDb = {
    conversation: { findMany: vi.fn() },
    contact: { delete: vi.fn(), deleteMany: vi.fn() },
  } as any;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mongodb.connectToDatabase).mockResolvedValue({} as any);
    vi.mocked(mongodb.isDbConnected).mockReturnValue(true);
    vi.mocked(MessageModel.deleteMany).mockResolvedValue({ deletedCount: 2 } as any);
  });

  it('limpieza correcta al borrar', async () => {
    mockDb.conversation.findMany.mockResolvedValue([{ id: 'conv_1' }]);
    mockDb.contact.delete.mockResolvedValue({});

    await deleteContact(mockDb, 'c1');

    expect(MessageModel.deleteMany).toHaveBeenCalledWith({
      conversationId: { $in: ['conv_1'] },
      $or: [
        { createdAt: { $lte: expect.any(Date) } },
        { createdAt: null }
      ]
    });
    expect(mediaStorage.deleteMediaDir).toHaveBeenCalledWith('conv_1');
  });

  it('Postgres fallido sin limpiar nada', async () => {
    mockDb.conversation.findMany.mockResolvedValue([{ id: 'conv_1' }]);
    mockDb.contact.delete.mockRejectedValue(new Error('PG fail'));

    await deleteContact(mockDb, 'c1');

    expect(MessageModel.deleteMany).not.toHaveBeenCalled();
    expect(mediaStorage.deleteMediaDir).not.toHaveBeenCalled();
  });

  it('fallo de limpieza no rompe el borrado', async () => {
    mockDb.conversation.findMany.mockResolvedValue([{ id: 'conv_1' }]);
    mockDb.contact.delete.mockResolvedValue({});
    vi.mocked(MessageModel.deleteMany).mockRejectedValue(new Error('Mongo fail'));
    vi.mocked(mediaStorage.deleteMediaDir).mockRejectedValue(new Error('FS fail'));

    await expect(deleteContact(mockDb, 'c1')).resolves.not.toThrow();
    expect(logger.error).toHaveBeenCalledWith(
      'contactRepo.delete: fallo limpiando mensajes en Mongo',
      expect.any(Object)
    );
    expect(logger.error).toHaveBeenCalledWith(
      'contactRepo.delete: fallo limpiando medios en disco',
      expect.objectContaining({
        count: 1,
        motivo: 'FS fail'
      })
    );
  });

  it('deleteContacts masivo limpia si count > 0', async () => {
    mockDb.conversation.findMany.mockResolvedValue([{ id: 'conv_1' }]);
    mockDb.contact.deleteMany.mockResolvedValue({ count: 1 });

    const count = await deleteContacts(mockDb, ['c1']);

    expect(count).toBe(1);
    expect(MessageModel.deleteMany).toHaveBeenCalled();
  });
});