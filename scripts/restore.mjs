// Restaura un backup generado por scripts/backup.mjs. Pensado sobre todo para
// PROBAR que los backups sirven de verdad -- un backup que nunca se intento
// restaurar no es una garantia real.
//
// Uso:
//   node scripts/restore.mjs --postgres backups/postgres_2026-09-04_18-30-05.dump
//   node scripts/restore.mjs --mongo    backups/mongo_2026-09-04_18-30-05.archive.gz
//
// ADVERTENCIA: esto sobreescribe datos en la base de destino (DATABASE_URL /
// MONGODB_URI del .env actual). Nunca lo corras apuntando a produccion salvo
// que sea un restore real y deliberado -- para pruebas, usa una base local o
// de staging.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const args = process.argv.slice(2);
const kind = args[0]; // '--postgres' | '--mongo'
const file = args[1];

if (!kind || !file) {
  console.error('Uso: node scripts/restore.mjs --postgres|--mongo <archivo-de-backup>');
  process.exit(1);
}

if (!fs.existsSync(file)) {
  console.error(`[restore] No se encuentra el archivo: ${file}`);
  process.exit(1);
}

// pg_restore, igual que pg_dump, no reconoce el parametro ?schema=... que
// Prisma agrega a DATABASE_URL -- hay que quitarlo de la URL antes de usarla.
function toPgConnectionString(databaseUrl) {
  const url = new URL(databaseUrl);
  const PG_PARAMS = new Set(['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'connect_timeout']);
  for (const key of [...url.searchParams.keys()]) {
    if (!PG_PARAMS.has(key)) url.searchParams.delete(key);
  }
  return url.toString();
}

if (kind === '--postgres') {
  const databaseUrl = readEnvVar('DATABASE_URL');
  if (!databaseUrl) {
    console.error('[restore] DATABASE_URL no definida.');
    process.exit(1);
  }
  console.log(`[restore] Restaurando Postgres desde ${file} (--clean: borra objetos existentes antes de recrearlos)...`);
  const result = spawnSync(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '--dbname', toPgConnectionString(databaseUrl), file],
    { stdio: 'inherit' }
  );
  process.exit(result.status ?? 1);
} else if (kind === '--mongo') {
  const mongoUri = readEnvVar('MONGODB_URI');
  if (!mongoUri) {
    console.error('[restore] MONGODB_URI no definida.');
    process.exit(1);
  }
  console.log(`[restore] Restaurando MongoDB desde ${file} (--drop: reemplaza colecciones existentes)...`);
  const result = spawnSync(
    'mongorestore',
    ['--uri', mongoUri, '--archive=' + file, '--gzip', '--drop'],
    { stdio: 'inherit' }
  );
  process.exit(result.status ?? 1);
} else {
  console.error('Primer argumento debe ser --postgres o --mongo');
  process.exit(1);
}
