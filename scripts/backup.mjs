// Backups automaticos de Postgres (pg_dump) y MongoDB (mongodump).
//
// Uso manual:
//   npm run db:backup
//
// Requiere tener instaladas las herramientas de linea de comandos:
//   - Postgres:  pg_dump   (viene con "PostgreSQL Command Line Tools" / postgresql-client)
//   - MongoDB:   mongodump (viene con "MongoDB Database Tools", se instala aparte del servidor)
//
// Igual que scripts/prestart-migrate.mjs y scripts/migrate.mjs: node no carga
// .env/.env.local solo, asi que se leen a mano si no vienen ya en process.env
// (por ejemplo, exportadas por el orquestador/CI en produccion).
//
// Politica de retencion: se guardan los ultimos N backups de cada base
// (por defecto 7) y se borran los mas viejos automaticamente en cada corrida,
// para no llenar el disco con archivos acumulados indefinidamente.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_DIR = path.join(ROOT_DIR, 'backups');
const RETENTION_COUNT = Number(process.env.BACKUP_RETENTION_COUNT ?? 7);

// ---------------------------------------------------------------------------
// Lectura de variables de entorno (.env.local tiene prioridad sobre .env,
// igual que en Next.js)
// ---------------------------------------------------------------------------
function readEnvVar(name) {
  if (process.env[name]) return process.env[name];

  for (const file of ['.env.local', '.env']) {
    const filePath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    const match = fs.readFileSync(filePath, 'utf-8').match(new RegExp(`^${name}=(.*\\S)$`, 'm'));
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return undefined;
}

function timestamp() {
  // Formato ordenable y sin caracteres invalidos en nombres de archivo de
  // Windows (":" no esta permitido), ej: 2026-09-04_18-30-05
  return new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '').replace('T', '_');
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// Borra los backups mas viejos de un prefijo dado, dejando solo los N mas
// recientes (RETENTION_COUNT).
function applyRetention(prefix) {
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(prefix))
    .map((f) => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time); // mas reciente primero

  const toDelete = files.slice(RETENTION_COUNT);
  for (const file of toDelete) {
    fs.unlinkSync(path.join(BACKUP_DIR, file.name));
    console.log(`[backup] Eliminado backup antiguo: ${file.name}`);
  }
}

// ---------------------------------------------------------------------------
// Postgres: pg_dump en formato "custom" (-Fc). Es comprimido y permite
// restaurar con pg_restore de forma selectiva (tablas, orden de FKs, etc.),
// a diferencia de un .sql plano.
// ---------------------------------------------------------------------------
//
// Prisma agrega a DATABASE_URL parametros que le pertenecen solo a Prisma
// (?schema=..., connection_limit=..., pool_timeout=...) y que libpq/pg_dump
// no reconoce como validos en una cadena de conexion. Hay que quitarlos antes
// de pasarle la URL a pg_dump: el "schema" se reenvia aparte como --schema,
// y el resto simplemente se descarta (solo importan para el pool de Prisma).
function toPgDumpConnectionString(databaseUrl) {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema');

  const PG_DUMP_PARAMS = new Set(['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'connect_timeout']);
  for (const key of [...url.searchParams.keys()]) {
    if (!PG_DUMP_PARAMS.has(key)) url.searchParams.delete(key);
  }

  return { connectionString: url.toString(), schema };
}

function backupPostgres() {
  const databaseUrl = readEnvVar('DATABASE_URL');
  if (!databaseUrl) {
    console.log('[backup] DATABASE_URL no definida: se omite backup de Postgres.');
    return;
  }

  const { connectionString, schema } = toPgDumpConnectionString(databaseUrl);

  const outFile = path.join(BACKUP_DIR, `postgres_${timestamp()}.dump`);
  console.log(`[backup] Respaldando Postgres -> ${path.basename(outFile)}`);

  const args = ['--format=custom', '--file', outFile];
  if (schema) args.push('--schema', schema);
  args.push(connectionString);

  const result = spawnSync('pg_dump', args, { stdio: 'inherit' });

  if (result.error || result.status !== 0) {
    console.error('[backup] pg_dump fallo. ¿Esta instalado y en el PATH? (paquete "PostgreSQL Command Line Tools")');
    if (result.error) console.error(result.error.message);
    process.exitCode = 1;
    return;
  }

  console.log('[backup] Postgres OK.');
  applyRetention('postgres_');
}

// ---------------------------------------------------------------------------
// MongoDB: mongodump con --archive + --gzip, es decir todo en un solo archivo
// comprimido en vez de una carpeta con muchos .bson sueltos.
// ---------------------------------------------------------------------------
function backupMongo() {
  const mongoUri = readEnvVar('MONGODB_URI');
  if (!mongoUri) {
    console.log('[backup] MONGODB_URI no definida: se omite backup de MongoDB.');
    return;
  }

  const outFile = path.join(BACKUP_DIR, `mongo_${timestamp()}.archive.gz`);
  console.log(`[backup] Respaldando MongoDB -> ${path.basename(outFile)}`);

  const result = spawnSync(
    'mongodump',
    ['--uri', mongoUri, '--archive=' + outFile, '--gzip'],
    { stdio: 'inherit' }
  );

  if (result.error || result.status !== 0) {
    console.error('[backup] mongodump fallo. ¿Esta instalado y en el PATH? (paquete "MongoDB Database Tools")');
    if (result.error) console.error(result.error.message);
    process.exitCode = 1;
    return;
  }

  console.log('[backup] MongoDB OK.');
  applyRetention('mongo_');
}

// ---------------------------------------------------------------------------
ensureBackupDir();
console.log(`[backup] Iniciando backups en ${BACKUP_DIR} (retencion: ${RETENTION_COUNT} por base)`);
backupPostgres();
backupMongo();
console.log('[backup] Proceso terminado.');
