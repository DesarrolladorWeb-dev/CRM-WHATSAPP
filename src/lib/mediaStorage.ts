import fs from 'fs/promises';
import path from 'path';
import { logger, motivo } from '@/lib/logger';

// Almacenamiento en disco de la multimedia de los mensajes (imagenes, audio,
// video, documentos, stickers).
//
// Los binarios NO se guardan en MongoDB: en su lugar se escriben en una carpeta
// persistente (ver MEDIA_STORAGE_DIR) y en la coleccion `messages` solo queda
// la URL `/api/media/<conversationId>/<archivo>`. Esto mantiene los documentos
// de Mongo ligeros (el base64 infla ~33% y acerca el limite de 16MB por
// documento) y permite cachear/abrir los archivos en el navegador.
//
// En despliegues con contenedor (Dokploy/Docker) la carpeta debe montarse como
// volumen persistente para sobrevivir a los redeploys.

const DEFAULT_MEDIA_DIR = 'storage/media';

/** Raiz absoluta de la carpeta de multimedia (sobrescribible con MEDIA_STORAGE_DIR). */
export function getMediaRoot(): string {
  const configured = (process.env.MEDIA_STORAGE_DIR || '').trim();
  const dir = configured || DEFAULT_MEDIA_DIR;
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
  'video/webm': '.webm',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'text/plain': '.txt',
  'application/json': '.json',
};

const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime])
);

/** Extension a partir de un mimetype (si no se conoce, `.bin`). */
export function extForMime(mimetype: string | null | undefined): string {
  const base = (mimetype || '').split(';')[0].trim().toLowerCase();
  return EXT_BY_MIME[base] || '.bin';
}

/** Mimetype a partir de la extension del archivo servido. */
export function mimeForExt(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] || 'application/octet-stream';
}

/** Segmento de nombre de archivo/dir seguro (sin separadores ni traversal). */
export function sanitizeSegment(raw: string | null | undefined): string | null {
  const cleaned = String(raw ?? '')
    .replace(/\.\./g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : null;
}

export interface ParsedDataUrl {
  mimetype: string;
  base64: string;
}

/**
 * Interpreta un data URL base64 (`data:<mime>;base64,<datos>`).
 * Devuelve null si no es un data URL base64 valido.
 */
export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/i.exec(String(dataUrl || ''));
  if (!match || !match[2]) return null;
  if (!match[3]) return null;
  return { mimetype: match[1], base64: match[3] };
}

export interface SavedMedia {
  /** URL relativa para el front: `/api/media/<conversationId>/<archivo>`. */
  url: string;
  /** Nombre del archivo dentro de la carpeta de la conversacion. */
  filename: string;
  mimetype: string;
  size: number;
}

export interface SaveMediaOptions {
  conversationId: string;
  /** Nombre base del archivo (p. ej. el id del mensaje). */
  messageId: string;
  /** Data URL base64 (`data:...;base64,...`). */
  dataUrl?: string | null;
  /** Base64 sin prefijo (requiere `mimetype`). */
  base64?: string | null;
  mimetype?: string | null;
}

/**
 * Escribe un archivo de multimedia en disco bajo
 * `<mediaRoot>/<conversationId>/<messageId><ext>`.
 * Devuelve la URL para guardar en Mongo, o null si no hay datos que guardar
 * o el escritura falla (el caller decide el fallback).
 */
export async function saveMedia(opts: SaveMediaOptions): Promise<SavedMedia | null> {
  // Tamaño aproximado del base64 (longitud de caracteres, no bytes reales).
  // Se declara fuera del try para que el catch pueda reportarlo: dentro del
  // try las variables `let` no son accesibles desde el catch.
  let base64Length = 0;
  let resolvedMimetype: string | null = null;
  try {
    const dirSeg = sanitizeSegment(opts.conversationId);
    const nameSeg = sanitizeSegment(opts.messageId);
    if (!dirSeg || !nameSeg) return null;

    let base64: string | null = null;
    let mimetype = (opts.mimetype || '').split(';')[0].trim().toLowerCase();

    if (opts.dataUrl) {
      const parsed = parseDataUrl(opts.dataUrl);
      if (!parsed) return null;
      base64 = parsed.base64;
      if (parsed.mimetype) mimetype = parsed.mimetype;
    } else if (opts.base64) {
      base64 = opts.base64;
    }

    if (!base64 || !mimetype) return null;

    base64Length = base64.length;
    resolvedMimetype = mimetype;

    const ext = extForMime(mimetype);
    const filename = `${nameSeg}${ext}`;
    const dir = path.join(getMediaRoot(), dirSeg);
    const fullPath = path.join(dir, filename);

    // Defensa extra contra traversal: la ruta resuelta debe quedar dentro de la raiz.
    const root = getMediaRoot();
    if (!path.resolve(fullPath).startsWith(root + path.sep)) return null;

    await fs.mkdir(dir, { recursive: true });
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) return null;
    await fs.writeFile(fullPath, buffer);

    return {
      url: `/api/media/${dirSeg}/${filename}`,
      filename,
      mimetype,
      size: buffer.length,
    };
  } catch (error) {
    // Solo se registran fallos reales (I/O: disco lleno, sin permisos, ruta
    // rota). Los null de validacion (dataUrl invalido, sin datos, base64
    // vacio) son parte del contrato normal y no se loguean.
    // NO se registra el dataUrl ni el base64 (datos de cliente, pesan MB).
    logger.error('mediaStorage.saveMedia: fallo escribiendo el archivo', {
      conversationId: opts.conversationId,
      messageId: opts.messageId,
      mimetype: resolvedMimetype ?? opts.mimetype ?? null,
      base64Length,
      motivo: motivo(error),
    });
    return null;
  }
}

/**
 * Resuelve una ruta pedida a `/api/media/<...segmentos>` dentro de la raiz de
 * multimedia. Devuelve la ruta absoluta o null si algun segmento es invalido
 * o escapa de la raiz (path traversal).
 */
export function resolveMediaPath(segments: string[]): string | null {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  const parts: string[] = [];
  for (const raw of segments) {
    const seg = sanitizeSegment(raw);
    if (!seg) return null;
    parts.push(seg);
  }

  const root = getMediaRoot();
  const fullPath = path.resolve(root, ...parts);
  if (!fullPath.startsWith(root + path.sep)) return null;
  return fullPath;
}

/**
 * Borra el directorio de medios de una conversacion especifica.
 * Aplica defensas estrictas para no borrar nada fuera de su carpeta.
 */
export async function deleteMediaDir(conversationId: string): Promise<void> {
  if (!conversationId) return;

  const sanitized = sanitizeSegment(conversationId);
  
  // Guarda (a): segmento vacio tras sanitizar
  if (!sanitized) return;

  // Guarda (c): el id alterado por la sanitizacion
  if (sanitized !== conversationId) {
    logger.warn('mediaStorage.deleteMediaDir: id alterado por sanitizacion, se omite', { lengthOriginal: conversationId.length });
    return;
  }

  // Guarda (d): directorios compartidos o especiales
  if (sanitized === 'sin-conversacion' || sanitized === 'storage' || sanitized === 'media') {
    return;
  }

  const root = path.resolve(getMediaRoot()); // Elimina barras finales
  const dir = path.join(root, sanitized);

  // Guarda (b): estrictamente dentro de la raiz, nunca igual a la raiz
  if (dir === root || !path.resolve(dir).startsWith(root + path.sep)) {
    logger.warn('mediaStorage.deleteMediaDir: ruta resuelta sospechosa, se omite');
    return;
  }

  await fs.rm(dir, { recursive: true, force: true });
}
