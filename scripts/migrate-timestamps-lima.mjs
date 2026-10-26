import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Migracion NO destructiva: recalcula el campo `timestamp` (texto ya formateado)
// de los mensajes y de la bitacora de webhooks a hora de Peru.
//
// Por que hace falta: `timestamp` se guarda como STRING, asi que la hora quedo
// congelada en la zona del proceso que la escribio. Cuando el servidor corre en
// UTC (Vercel, Docker), los mensajes entrantes quedaron grabados 5 horas
// adelantados. El instante real SI es correcto: vive en `createdAt`, que
// Mongoose escribe en UTC. Este script reformatea el texto a partir de ahi.
//
// Es idempotente: reformatear dos veces desde `createdAt` da el mismo resultado.
// Solo escribe los documentos cuyo texto cambia realmente.
//
// Uso:
//   node scripts/migrate-timestamps-lima.mjs --dry-run   (solo reporta)
//   node scripts/migrate-timestamps-lima.mjs             (aplica los cambios)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DRY_RUN = process.argv.includes('--dry-run');

let mongoUri = 'mongodb://127.0.0.1:27017/whato-crm';
let timeZone = 'America/Lima';
try {
  const envLocalPath = path.join(rootDir, '.env.local');
  const envPath = path.join(rootDir, '.env');
  const targetEnv = fs.existsSync(envLocalPath) ? envLocalPath : (fs.existsSync(envPath) ? envPath : null);
  if (targetEnv) {
    const envContent = fs.readFileSync(targetEnv, 'utf-8');
    const match = envContent.match(/MONGODB_URI=["']?([^"'\r\n]+)["']?/);
    if (match && match[1]) mongoUri = match[1].trim();
    const tzMatch = envContent.match(/BUSINESS_TIME_ZONE=["']?([^"'\r\n]+)["']?/);
    if (tzMatch && tzMatch[1]) timeZone = tzMatch[1].trim();
  }
} catch { /* usa los valores por defecto */ }

// Debe reflejar exactamente formatTime() de src/lib/time.ts.
function formatTime(date) {
  return date.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });
}

async function migrarColeccion(nombre) {
  const col = mongoose.connection.db.collection(nombre);

  // Solo documentos con `createdAt`: sin el instante real no hay nada desde lo
  // que recalcular, y reescribir a ciegas empeoraria el dato.
  const docs = await col.find({ createdAt: { $type: 'date' } }).toArray();

  let actualizados = 0;
  let yaCorrectos = 0;

  for (const doc of docs) {
    const nuevo = formatTime(doc.createdAt);
    if (doc.timestamp === nuevo) {
      yaCorrectos++;
      continue;
    }
    if (!DRY_RUN) {
      await col.updateOne({ _id: doc._id }, { $set: { timestamp: nuevo } });
    }
    actualizados++;
  }

  const sinCreatedAt = await col.countDocuments({ createdAt: { $not: { $type: 'date' } } });

  console.log('  ' + nombre + ':');
  console.log('    - Con timestamp corregido: ' + actualizados);
  console.log('    - Ya correctos (sin cambio): ' + yaCorrectos);
  console.log('    - Sin createdAt, omitidos: ' + sinCreatedAt);

  return actualizados;
}

async function run() {
  console.log('Zona horaria de destino: ' + timeZone);
  if (DRY_RUN) console.log('MODO SIMULACION (--dry-run): no se escribe nada.');
  console.log('Conectando a MongoDB: ' + mongoUri + '...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log('Conexion exitosa a MongoDB');

  let total = 0;
  total += await migrarColeccion('messages');
  total += await migrarColeccion('webhooklogs');

  console.log(
    DRY_RUN
      ? 'SIMULACION COMPLETADA. Documentos que se cambiarian: ' + total
      : 'MIGRACION COMPLETADA. Documentos actualizados: ' + total
  );

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Error en la migracion de timestamps:', err.message);
  process.exit(1);
});
