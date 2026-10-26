import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHmac, randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Fuente unica de datos de ejemplo, compartida con src/mockData.ts
const seed = JSON.parse(fs.readFileSync(path.join(rootDir, 'src', 'seedData.json'), 'utf-8'));

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

console.log('Conectando a MongoDB: ' + mongoUri + '...');

// Debe reflejar exactamente src/lib/apiKeySecurity.ts: las API Keys se guardan
// como hash HMAC-SHA256, nunca en texto plano.
function hashApiKey(rawKey) {
  const secret = apiKeyHashSecret || 'dev-only-insecure-api-key-pepper';
  return createHmac('sha256', secret).update(rawKey).digest('hex');
}

function generateApiKey() {
  const rawKey = 'scrm_live_' + randomBytes(24).toString('hex');
  return { rawKey, keyHash: hashApiKey(rawKey), keyPrefix: rawKey.slice(0, 14) };
}

const COLECCIONES = {
  contacts: 'INITIAL_CONTACTS',
  conversations: 'INITIAL_CONVERSATIONS',
  segments: 'INITIAL_SEGMENTS',
  campaigns: 'INITIAL_CAMPAIGN',
  automationrules: 'INITIAL_AUTOMATIONS',
  apikeys: 'INITIAL_API_KEYS',
  quickreplies: 'INITIAL_QUICK_REPLIES',
  webhooklogs: 'INITIAL_WEBHOOK_LOGS'
};

async function runMigration() {
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
    console.log('Conexion exitosa a MongoDB');
    const db = mongoose.connection.db;

    console.log('Limpiando colecciones anteriores...');
    await Promise.allSettled(
      Object.keys(COLECCIONES).concat('messages').map(c => db.collection(c).deleteMany({}))
    );

    console.log('Insertando datos iniciales...');
    const resumen = {};
    const clavesGeneradas = [];
    for (const [coleccion, clave] of Object.entries(COLECCIONES)) {
      const datos = seed[clave];
      if (!Array.isArray(datos) || !datos.length) continue;

      if (coleccion === 'apikeys') {
        // src/seedData.json ya no incluye ningun secreto: se genera una clave real
        // y aleatoria por entrada, y solo se guarda su hash en MongoDB.
        const docs = datos.map((entry) => {
          const generated = generateApiKey();
          clavesGeneradas.push({ name: entry.name, key: generated.rawKey });
          return { ...entry, keyHash: generated.keyHash, keyPrefix: generated.keyPrefix };
        });
        await db.collection(coleccion).insertMany(JSON.parse(JSON.stringify(docs)));
        resumen[coleccion] = docs.length;
        continue;
      }

      await db.collection(coleccion).insertMany(JSON.parse(JSON.stringify(datos)));
      resumen[coleccion] = datos.length;
    }

    // INITIAL_MESSAGES es un objeto agrupado por conversacion
    const mensajes = Object.values(seed.INITIAL_MESSAGES || {}).flat();
    if (mensajes.length) {
      await db.collection('messages').insertMany(JSON.parse(JSON.stringify(mensajes)));
      resumen.messages = mensajes.length;
    }

    console.log('MIGRACION COMPLETADA');
    console.log('Datos insertados en la base ' + mongoUri.split('/').pop() + ':');
    for (const [c, n] of Object.entries(resumen)) console.log('   - ' + c + ': ' + n);

    if (clavesGeneradas.length) {
      console.log('');
      console.log('API Keys de ejemplo generadas (solo se muestran ahora, guardalas):');
      for (const k of clavesGeneradas) console.log('   - ' + k.name + ': ' + k.key);
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error en la migracion:', err.message);
    process.exit(1);
  }
}

runMigration();
