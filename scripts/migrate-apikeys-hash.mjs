import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHmac } from 'crypto';

// Migracion NO destructiva: convierte las API Keys existentes en la coleccion
// `apikeys` que aun tengan el campo `key` en texto plano (formato antiguo) a su
// representacion hasheada (`keyHash` + `keyPrefix`). No borra ni imprime ninguna
// clave: solo transforma su representacion en el mismo documento.
//
// Es idempotente: se puede correr varias veces sin efecto sobre documentos que
// ya tengan `keyHash`.
//
// Uso: npm run migrate:apikeys-hash

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let mongoUri = 'mongodb://127.0.0.1:27017/whato-crm';
let apiKeyHashSecret = null;
try {
  const envLocalPath = path.join(rootDir, '.env.local');
  const envPath = path.join(rootDir, '.env');
  const targetEnv = fs.existsSync(envLocalPath) ? envLocalPath : (fs.existsSync(envPath) ? envPath : null);
  if (targetEnv) {
    const envContent = fs.readFileSync(targetEnv, 'utf-8');
    const match = envContent.match(/MONGODB_URI=["']?([^"'\r\n]+)["']?/);
    if (match && match[1]) mongoUri = match[1].trim();
    const hashSecretMatch = envContent.match(/API_KEY_HASH_SECRET=["']?([^"'\r\n]+)["']?/);
    const masterKeyMatch = envContent.match(/API_MASTER_KEY=["']?([^"'\r\n]+)["']?/);
    apiKeyHashSecret = (hashSecretMatch && hashSecretMatch[1]) || (masterKeyMatch && masterKeyMatch[1]) || null;
  }
} catch { /* usa el valor por defecto */ }

if (!apiKeyHashSecret) {
  console.warn(
    'ADVERTENCIA: API_KEY_HASH_SECRET (o API_MASTER_KEY) no esta configurado. ' +
    'Se usara un secreto de desarrollo NO apto para produccion. Configuralo en tu ' +
    '.env antes de migrar datos reales, o las claves ya migradas dejaran de ' +
    'coincidir si luego cambias el secreto.'
  );
}

// Debe reflejar exactamente src/lib/apiKeySecurity.ts.
function hashApiKey(rawKey) {
  const secret = apiKeyHashSecret || 'dev-only-insecure-api-key-pepper';
  return createHmac('sha256', secret).update(rawKey).digest('hex');
}

function keyPrefixOf(rawKey) {
  return rawKey.slice(0, 14);
}

async function run() {
  console.log('Conectando a MongoDB: ' + mongoUri + '...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log('Conexion exitosa a MongoDB');

  const col = mongoose.connection.db.collection('apikeys');

  const pendientes = await col.find({ keyHash: { $exists: false } }).toArray();

  let migradas = 0;
  let omitidasSinClave = 0;

  for (const doc of pendientes) {
    if (typeof doc.key !== 'string' || doc.key.length === 0) {
      omitidasSinClave++;
      continue;
    }

    const keyHash = hashApiKey(doc.key);
    const keyPrefix = keyPrefixOf(doc.key);

    // No se imprime ni doc.key ni keyHash en ningun momento.
    await col.updateOne(
      { _id: doc._id },
      { $set: { keyHash, keyPrefix }, $unset: { key: '' } }
    );
    migradas++;
  }

  console.log('MIGRACION DE API KEYS COMPLETADA');
  console.log('   - Claves migradas a formato con hash: ' + migradas);
  console.log('   - Documentos sin campo "key" (ya migrados u otro formato) omitidos: ' + omitidasSinClave);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  // Nunca se registra el contenido de los documentos, solo el mensaje de error.
  console.error('Error en la migracion de API keys:', err.message);
  process.exit(1);
});
