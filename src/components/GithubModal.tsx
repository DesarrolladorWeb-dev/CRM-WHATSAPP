import React, { useState } from 'react';
import { Copy, Github, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface GithubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GithubModal: React.FC<GithubModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  const envTemplate = `
  # Configuración XIO-crm - Next.js Full Stack, MongoDB & Postgres
  PORT=3000
  NODE_ENV=development
  APP_URL=http://localhost:3000

  # Clave privada de Google Gemini API (Server-Side)
  GEMINI_API_KEY=tu_api_key_de_google_ai
  # Completa el ID de un modelo disponible para tu clave
  GEMINI_MODEL=

  #URI de Conexión a Postgres (de manera local). Reemplazar 'postgres' por nombre de usuario y 'root' por contraseña
  DATABASE_URL=postgresql://postgres:root@localhost:5432/whato_crm?schema=public

  # URI de Conexión a MongoDB (Local o MongoDB Atlas)
  MONGODB_URI=mongodb://localhost:27017/whato-crm
  # O conexión remota Atlas:
  # MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/whato-crm?retryWrites=true&w=majority

  # Por defecto, si Postgres o Mongo no responden las rutas de la API devuelven 503 (y el frontend muestra un aviso de "datos de ejemplo")
  DEMO_MODE=false

  # Si falta con NODE_ENV=production el servidor aborta el arranque y cualquier operacion con claves lanza error
  # Genera uno con: 'openssl rand -hex 32'. Rotarlo invalida TODAS las API keys ya emitidas: hay que re-emitirlas.
  API_KEY_HASH_SECRET=tu_api_key_hash_secret

  # Clave maestra opcional: si se define, se acepta como x-api-key con permisos admin
  API_MASTER_KEY=tu_api_master_key

  # Origenes permitidos para llamar a /api/* desde otro dominio
  CORS_ALLOWED_ORIGINS=https://app.miempresa.com,https://admin.miempresa.com

  APP_URL=http://localhost:3000`;

  const copyEnv = () => {
    navigator.clipboard.writeText(envTemplate);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      icon={<Github className="w-5 h-5" />}
      title="Exportación para GitHub & Despliegue"
      description="XIO (xio-crm) Full Stack Next.js & MongoDB"
      footer={<Button onClick={onClose}>Entendido</Button>}
    >
      <div className="space-y-4 text-xs">
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-900 leading-relaxed font-medium flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Arquitectura unificada <strong>Next.js Full Stack (App Router)</strong> con persistencia en <strong>MongoDB</strong> (Mongoose), endpoints de Inteligencia Artificial con <strong>Gemini</strong> y soporte para WhatsApp Web Extension.</span>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="font-bold text-slate-800 text-xs">Pasos para desplegar o publicar en GitHub:</h4>
        <ol className="list-decimal list-inside space-y-1.5 text-slate-600 font-medium">
          <li>
            Configura las variables{' '}
            <code className="bg-slate-100 px-1 rounded text-emerald-600">GEMINI_API_KEY</code>,{' '}
            <code className="bg-slate-100 px-1 rounded text-emerald-600">GEMINI_MODEL</code> y{' '}
            <code className="bg-slate-100 px-1 rounded text-emerald-600">MONGODB_URI</code> en tu archivo{' '}
            <code className="bg-slate-100 px-1 rounded">.env.local</code>.
          </li>
          <li>
            Instala dependencias con <code className="bg-slate-100 px-1 rounded">npm install</code>.
          </li>
          <li>
            Ejecuta en desarrollo con <code className="bg-slate-100 px-1 rounded">npm run dev</code> o compila con{' '}
            <code className="bg-slate-100 px-1 rounded">npm run build</code>.
          </li>
          <li>Despliega fácilmente en Vercel, Railway, Render, Google Cloud Run o Docker.</li>
        </ol>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-700">Plantilla de Archivo .env.local</span>
          <Button variant="secondary" size="sm" onClick={copyEnv} leftIcon={<Copy className="w-3 h-3" />}>
            {copied ? '¡Copiado!' : 'Copiar .env'}
          </Button>
        </div>
        <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto whitespace-pre">
          {envTemplate}
        </pre>
      </div>
    </Modal>
  );
};
