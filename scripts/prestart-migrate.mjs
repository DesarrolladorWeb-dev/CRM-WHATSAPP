// Se ejecuta automaticamente antes de `npm start` (ver "prestart" en
// package.json). Aplica las migraciones de Prisma pendientes contra el
// Postgres gestionado de produccion, para no depender de un paso manual que
// alguien se olvide de correr antes de desplegar.
//
// Postgres es opcional en este proyecto (ver src/lib/postgres.ts): sin
// DATABASE_URL, las rutas migradas caen al fallback en memoria. Por eso este
// script no falla el arranque si falta la variable; solo lo omite.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// process.env solo trae DATABASE_URL cuando la exporta el entorno real
// (orquestador/CI). En local, igual que scripts/migrate.mjs, vive en
// .env/.env.local y hay que leerla a mano: node no carga esos archivos solo.
function hasDatabaseUrl() {
  if (process.env.DATABASE_URL) return true;

  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const file of ['.env.local', '.env']) {
    const filePath = path.join(rootDir, file);
    if (!fs.existsSync(filePath)) continue;
    const match = fs.readFileSync(filePath, 'utf-8').match(/^DATABASE_URL=.*\S/m);
    if (match) return true;
  }
  return false;
}

if (!hasDatabaseUrl()) {
  console.log('[prestart-migrate] DATABASE_URL no definida: se omite "prisma migrate deploy" (modo sin Postgres/demo).');
  process.exit(0);
}

console.log('[prestart-migrate] Aplicando migraciones pendientes de Prisma...');
const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  console.error('[prestart-migrate] "prisma migrate deploy" fallo: se aborta el arranque para no servir con un esquema desactualizado.');
  process.exit(result.status ?? 1);
}
