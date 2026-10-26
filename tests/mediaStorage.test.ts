import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  parseDataUrl,
  sanitizeSegment,
  extForMime,
  mimeForExt,
  saveMedia,
  resolveMediaPath,
  getMediaRoot,
  deleteMediaDir,
} from '@/lib/mediaStorage';
import { logger } from '@/lib/logger';

// 1x1 png valido en base64 (sin prefijo data URL)
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

describe('mediaStorage', () => {
  let tmpDir: string;
  const envOriginal = { ...process.env };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'whato-media-'));
    process.env.MEDIA_STORAGE_DIR = tmpDir;
  });

  afterEach(async () => {
    // Restaura cualquier spy aunque el test haya fallado antes de mockRestore.
    vi.restoreAllMocks();
    process.env = { ...envOriginal };
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('parseDataUrl', () => {
    it('interpeta un data URL base64 valido', () => {
      const parsed = parseDataUrl(PNG_DATA_URL);
      expect(parsed).not.toBeNull();
      expect(parsed!.mimetype).toBe('image/png');
      expect(parsed!.base64).toBe(PNG_BASE64);
    });

    it('rechaza una cadena que no es data URL', () => {
      expect(parseDataUrl('https://ejemplo.com/a.png')).toBeNull();
      expect(parseDataUrl('')).toBeNull();
    });

    it('rechaza un data URL sin marcador ;base64', () => {
      expect(parseDataUrl('data:image/png,raw')).toBeNull();
    });
  });

  describe('sanitizeSegment', () => {
    it('elimina separadores de ruta y traversal', () => {
      // No contiene separadores: es un nombre plano seguro.
      expect(sanitizeSegment('../../etc/passwd')).toBe('__etc_passwd');
      expect(sanitizeSegment('a/b\\c')).toBe('a_b_c');
      expect(sanitizeSegment('..')).toBeNull();
      expect(sanitizeSegment('')).toBeNull();
      expect(sanitizeSegment(null)).toBeNull();
    });

    it('conserva ids normales', () => {
      expect(sanitizeSegment('conv_wa_57310892_num')).toBe('conv_wa_57310892_num');
      expect(sanitizeSegment('m_1693')).toBe('m_1693');
    });
  });

  describe('extensiones', () => {
    it('resuelve extension desde mimetype y viceversa', () => {
      expect(extForMime('image/png')).toBe('.png');
      expect(extForMime('audio/ogg; codecs=opus')).toBe('.ogg');
      expect(extForMime('desconocido')).toBe('.bin');
      expect(mimeForExt('.png')).toBe('image/png');
      expect(mimeForExt('.desconocido')).toBe('application/octet-stream');
    });
  });

  describe('saveMedia', () => {
    it('escribe el archivo en disco y devuelve la URL relativa', async () => {
      const saved = await saveMedia({
        conversationId: 'conv_c1',
        messageId: 'm_123',
        dataUrl: PNG_DATA_URL,
      });

      expect(saved).not.toBeNull();
      expect(saved!.url).toBe('/api/media/conv_c1/m_123.png');
      expect(saved!.mimetype).toBe('image/png');
      expect(saved!.size).toBeGreaterThan(0);

      const onDisk = await fs.readFile(path.join(tmpDir, 'conv_c1', 'm_123.png'));
      expect(onDisk.length).toBe(saved!.size);
    });

    it('acepta base64 sin prefijo cuando se pasa el mimetype', async () => {
      const saved = await saveMedia({
        conversationId: 'conv_c1',
        messageId: 'm_456',
        base64: PNG_BASE64,
        mimetype: 'image/png',
      });
      expect(saved!.url).toBe('/api/media/conv_c1/m_456.png');
    });

    it('devuelve null para entradas invalidas', async () => {
      expect(
        await saveMedia({ conversationId: 'conv_c1', messageId: 'm_1', dataUrl: 'no-es-url' })
      ).toBeNull();
      expect(
        await saveMedia({ conversationId: '..', messageId: 'm_1', dataUrl: PNG_DATA_URL })
      ).toBeNull();
      expect(
        await saveMedia({ conversationId: 'conv_c1', messageId: 'm_1', dataUrl: '' })
      ).toBeNull();
    });

    it('registra el error y sigue devolviendo null cuando la escritura falla', async () => {
      const writeFileSpy = vi
        .spyOn(fs, 'writeFile')
        .mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

      const saved = await saveMedia({
        conversationId: 'conv_c1',
        messageId: 'm_1',
        dataUrl: PNG_DATA_URL,
      });

      expect(saved).toBeNull();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [message, fields] = errorSpy.mock.calls[0];
      expect(String(message)).toContain('saveMedia');
      expect(fields).toMatchObject({
        conversationId: 'conv_c1',
        messageId: 'm_1',
        mimetype: 'image/png',
      });
      expect(fields).toHaveProperty('motivo', 'ENOSPC: no space left on device');
      expect(typeof (fields as Record<string, unknown>).base64Length).toBe('number');

      writeFileSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('no registra error cuando la entrada es invalida (contrato normal)', async () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

      const saved = await saveMedia({
        conversationId: 'conv_c1',
        messageId: 'm_1',
        dataUrl: 'no-es-url',
      });

      expect(saved).toBeNull();
      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('resolveMediaPath', () => {
    it('resuelve una ruta valida dentro de la raiz', async () => {
      await saveMedia({ conversationId: 'conv_c1', messageId: 'm_1', dataUrl: PNG_DATA_URL });
      const resolved = resolveMediaPath(['conv_c1', 'm_1.png']);
      expect(resolved).toBe(path.join(getMediaRoot(), 'conv_c1', 'm_1.png'));
      await expect(fs.readFile(resolved!)).resolves.toBeTruthy();
    });

    it('bloquea el path traversal', () => {
      expect(resolveMediaPath(['..', '..', 'etc', 'passwd'])).toBeNull();
      expect(resolveMediaPath(['conv_c1', '..%2F..%2Fetc'])).not.toBe(
        path.resolve('/etc/passwd')
      );
      expect(resolveMediaPath([])).toBeNull();
      expect(resolveMediaPath([''])).toBeNull();
    });

    it('nunca devuelve una ruta fuera de la raiz', () => {
      const resolved = resolveMediaPath(['..', 'secreto.txt']);
      if (resolved) {
        expect(resolved.startsWith(getMediaRoot() + path.sep)).toBe(true);
      } else {
        expect(resolved).toBeNull();
      }
    });
  });

  describe('deleteMediaDir', () => {
    it('no borra nada si el segmento queda vacio o es compartido', async () => {
      const rmSpy = vi.spyOn(fs, 'rm');
      
      await deleteMediaDir('...'); 
      await deleteMediaDir('sin-conversacion');
      await deleteMediaDir('');
      
      expect(rmSpy).not.toHaveBeenCalled();
      rmSpy.mockRestore();
    });

    it('no borra si el id original difiere del sanitizado', async () => {
      const rmSpy = vi.spyOn(fs, 'rm');
      
      await deleteMediaDir('conv_123/../../etc'); 
      
      expect(rmSpy).not.toHaveBeenCalled();
      rmSpy.mockRestore();
    });

    it('borra el directorio correcto y deja intactos los demás', async () => {
      await fs.mkdir(path.join(tmpDir, 'conv_1'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'conv_1', 'file.txt'), 'data');
      await fs.mkdir(path.join(tmpDir, 'conv_2'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'conv_2', 'file.txt'), 'data');

      await deleteMediaDir('conv_1');

      await expect(fs.access(path.join(tmpDir, 'conv_1'))).rejects.toThrow();
      await expect(fs.access(path.join(tmpDir, 'conv_2', 'file.txt'))).resolves.toBeUndefined();
    });

    it('no borra si la ruta es igual a la raíz (test en disco real)', async () => {
      const testFile = path.join(tmpDir, 'keep.txt');
      await fs.writeFile(testFile, 'keep me');
      
      await deleteMediaDir('.'); 
      
      // El archivo debe seguir existiendo
      const exists = await fs.access(testFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });
});
