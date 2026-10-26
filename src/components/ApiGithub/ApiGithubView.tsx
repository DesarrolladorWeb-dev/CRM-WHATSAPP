import React, { useState, useEffect } from 'react';
import { ApiKey, WebhookConfig, WebhookLog } from '../../types';
import { apiFetch } from '../../lib/apiClient';
import {
  Code2, Key, Globe, Terminal, Play, Download, CheckCircle2,
  Copy, FileCode, Database, Gamepad2, FolderGit2, ChevronDown,
  Plus, Trash2, X, AlertTriangle
} from 'lucide-react';

// Resultado de una petición del playground: la respuesta HTTP o el error local.
interface PlaygroundResult {
  status: number;
  statusText?: string;
  durationMs?: number;
  data?: unknown;
  error?: string;
}

// Numero de logs de webhook visibles por carga.
const LOG_PAGE_SIZE = 8;

interface ApiGithubViewProps {
  apiKeys: ApiKey[];
  webhookConfig: WebhookConfig;
  webhookLogs: WebhookLog[];
  onOpenGithubModal: () => void;
}

export const ApiGithubView: React.FC<ApiGithubViewProps> = ({
  apiKeys,
  webhookConfig,
  webhookLogs,
  onOpenGithubModal
}) => {
  const [activeTab, setActiveTab] = useState<'playground' | 'keys' | 'github'>('playground');

  // Logs de webhook visibles (carga incremental con "Ver más").
  const [visibleLogCount, setVisibleLogCount] = useState<number>(LOG_PAGE_SIZE);

  // API Playground State
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('/api/ai/chatbot-autorespond');
  const [requestBody, setRequestBody] = useState<string>(
    JSON.stringify({
      incomingMessage: "¿Cuáles son los planes de precios y cómo se conecta a WhatsApp?",
      channel: "whatsapp",
      contactName: "Valeria Gómez",
      companyNotes: "Lead de alta intención"
    }, null, 2)
  );

  const [responseResult, setResponseResult] = useState<PlaygroundResult | null>(null);
  const [isLoadingApi, setIsLoadingApi] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal de creación de API Key
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>(['read']);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyCreated, setNewKeyCreated] = useState<(ApiKey & { rawKey?: string }) | null>(null);

  // Lista viva de claves: se rellena desde /api/apikeys al montar; el prop `apiKeys`
  // es solo el estado inicial mientras carga.
  const [keys, setKeys] = useState<ApiKey[]>(apiKeys);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);

  // Clave de operador (permiso 'admin'): crear/revocar la exigen y la clave pública
  // del dashboard no la tiene. Se envía solo en esa petición y nunca se guarda.
  const [operatorKey, setOperatorKey] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  // Revocación
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadKeys = async () => {
      setIsLoadingKeys(true);
      try {
        const res = await apiFetch('/api/apikeys');
        if (!res.ok) return;
        const data = await res.json();
        if (
          !cancelled &&
          data.success &&
          Array.isArray(data.data) &&
          (data.data.length > 0 || data.source === 'mongodb')
        ) {
          setKeys(data.data);
        }
      } catch {
        // se mantiene el estado inicial recibido por props
      } finally {
        if (!cancelled) setIsLoadingKeys(false);
      }
    };
    loadKeys();
    return () => {
      cancelled = true;
    };
  }, []);

  const closeCreateModal = () => {
    if (isCreating) return;
    setIsCreateModalOpen(false);
    setCreateError(null);
    setOperatorKey('');
  };

  const closeRevokeModal = () => {
    if (isRevoking) return;
    setRevokeTarget(null);
    setRevokeError(null);
    setOperatorKey('');
  };

  const handleEndpointChange = (ep: string) => {
    setSelectedEndpoint(ep);
    if (ep === '/api/ai/chatbot-autorespond') {
      setRequestBody(JSON.stringify({
        incomingMessage: "¿Cuáles son los planes de precios y cómo se conecta a WhatsApp?",
        channel: "whatsapp",
        contactName: "Valeria Gómez",
        companyNotes: "Lead de alta intención"
      }, null, 2));
    } else if (ep === '/api/ai/smart-reply') {
      setRequestBody(JSON.stringify({
        conversationHistory: [
          { sender: "contact", text: "Me interesa contratar el plan Enterprise para 15 usuarios" }
        ],
        contactName: "Valeria Gómez",
        channel: "whatsapp",
        stage: "negotiation"
      }, null, 2));
    } else if (ep === '/api/ai/campaign-copy') {
      setRequestBody(JSON.stringify({
        campaignTopic: "Promoción Black Friday CRM",
        productOffer: "30% de descuento en el plan anual",
        targetChannel: "whatsapp",
        tone: "Persuasivo y directo con emojis"
      }, null, 2));
    } else if (ep === '/api/ai/summarize') {
      setRequestBody(JSON.stringify({
        contactName: "Valeria Gómez",
        messages: [
          { sender: "contact", text: "Hola, me gustaría saber si tienen integración con WhatsApp y Google Calendar" },
          { sender: "agent", text: "¡Hola Valeria! Sí, contamos con sincronización nativa y extensión web." },
          { sender: "contact", text: "Genial, ¿cuándo podríamos agendar una demo técnica?" }
        ]
      }, null, 2));
    } else if (ep === '/api/webhooks/test') {
      setRequestBody(JSON.stringify({
        webhookUrl: "https://api.empresa.com/v1/whato/events",
        event: "lead.stage_updated",
        payload: { contactId: "c1", newStage: "negotiation", leadScore: 92 },
        secret: webhookConfig.secret
      }, null, 2));
    } else if (ep === '/api/seed') {
      // En produccion el endpoint exige esta frase de confirmacion (y el flag
      // ALLOW_DESTRUCTIVE_SEED). En desarrollo el campo se ignora.
      setRequestBody(JSON.stringify({ confirm: 'RESET-WHATO-DB' }, null, 2));
    }
  };

  const handleRunApiRequest = async () => {
    setIsLoadingApi(true);
    setResponseResult(null);

    const startTime = performance.now();
    try {
      const isGet = selectedEndpoint === '/api/health' || selectedEndpoint === '/api/contacts';
      let parsedBody = undefined;
      if (!isGet && requestBody.trim()) {
        parsedBody = JSON.parse(requestBody);
      }

      const res = await fetch(selectedEndpoint, {
        method: isGet ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: isGet ? undefined : JSON.stringify(parsedBody || {})
      });

      const data = await res.json();
      const endTime = performance.now();

      setResponseResult({
        status: res.status,
        statusText: res.statusText,
        durationMs: Math.round(endTime - startTime),
        data
      });
    } catch (err) {
      setResponseResult({
        status: 500,
        error: (err instanceof Error && err.message) || 'Error executing request'
      });
    } finally {
      setIsLoadingApi(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim() || !operatorKey.trim()) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const response = await fetch('/api/apikeys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // POST /api/apikeys exige permiso 'admin'. El operador pega aquí una
          // credencial admin solo para esta petición; no se persiste en el cliente.
          'x-api-key': operatorKey.trim()
        },
        body: JSON.stringify({
          name: newKeyName,
          permissions: newKeyPermissions
        })
      });

      const data = await response.json();

      if (response.ok && data.success && data.data) {
        setNewKeyCreated({
          ...data.data,
          rawKey: data.data.key
        });
        setKeys(prev => [data.data, ...prev]);
        setIsCreateModalOpen(false);
        setNewKeyName('');
        setNewKeyPermissions(['read']);
        setOperatorKey('');
      } else {
        setCreateError(data.error || 'No se pudo crear la clave API');
      }
    } catch (err) {
      console.error('Error creating API key:', err);
      setCreateError('Error de red al crear la clave API');
    } finally {
      setIsCreating(false);
    }
  };

  const requestRevoke = (key: ApiKey) => {
    setRevokeError(null);
    setOperatorKey('');
    setRevokeTarget(key);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget || !operatorKey.trim()) return;

    setIsRevoking(true);
    setRevokeError(null);
    try {
      const res = await fetch(`/api/apikeys?id=${revokeTarget.id}`, {
        method: 'DELETE',
        // DELETE /api/apikeys también exige 'admin'.
        headers: { 'x-api-key': operatorKey.trim() }
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setKeys(prev => prev.filter(k => k.id !== revokeTarget.id));
        setRevokeTarget(null);
        setOperatorKey('');
      } else {
        setRevokeError(data.error || 'No se pudo revocar la clave API');
      }
    } catch (err) {
      console.error('Error revoking API key:', err);
      setRevokeError('Error de red al revocar la clave API');
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      {/* Top Bar Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Code2 className="w-5 h-5 text-indigo-600" />
            Integraciones API REST, MongoDB & GitHub Studio
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Prueba endpoints Next.js en tiempo real, verifica el estado de MongoDB y exporta el proyecto para GitHub.
          </p>
        </div>

        <button
          onClick={onOpenGithubModal}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Exportar Código para GitHub</span>
        </button>
      </div>

      {/* Sub Tabs */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 flex items-center gap-2 text-xs">
        <button
          onClick={() => setActiveTab('playground')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
            activeTab === 'playground' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Gamepad2 className="w-3.5 h-3.5" /> Playground de API REST & MongoDB
        </button>
        <button
          onClick={() => setActiveTab('keys')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
            activeTab === 'keys' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Key className="w-3.5 h-3.5" /> Claves API & Webhooks
        </button>
        <button
          onClick={() => setActiveTab('github')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
            activeTab === 'github' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FolderGit2 className="w-3.5 h-3.5" /> Guía de Despliegue en GitHub
        </button>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'playground' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
            {/* Left: Request Form */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-600" />
                Probador Interactivo de Endpoints Next.js Route Handlers
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Seleccionar Endpoint</label>
                  <select
                    value={selectedEndpoint}
                    onChange={(e) => handleEndpointChange(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="/api/health">GET /api/health (Estado del Servidor & MongoDB)</option>
                    <option value="/api/contacts">GET /api/contacts (Consultar Contactos MongoDB)</option>
                    <option value="/api/seed">POST /api/seed (Poblar Base de Datos MongoDB)</option>
                    <option value="/api/ai/chatbot-autorespond">POST /api/ai/chatbot-autorespond (Respuesta Bot IA)</option>
                    <option value="/api/ai/smart-reply">POST /api/ai/smart-reply (Sugerencias Rápidas IA)</option>
                    <option value="/api/ai/campaign-copy">POST /api/ai/campaign-copy (Copywriting IA)</option>
                    <option value="/api/ai/summarize">POST /api/ai/summarize (Resumen Ejecutivo IA)</option>
                    <option value="/api/webhooks/test">POST /api/webhooks/test (Simular Evento Webhook)</option>
                  </select>
                </div>

                {selectedEndpoint !== '/api/health' && selectedEndpoint !== '/api/contacts' && (
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Cuerpo de Solicitud (JSON Payload)</label>
                    <textarea
                      value={requestBody}
                      onChange={(e) => setRequestBody(e.target.value)}
                      rows={9}
                      className="w-full p-3 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl focus:outline-none"
                    />
                  </div>
                )}

                <button
                  onClick={handleRunApiRequest}
                  disabled={isLoadingApi}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>{isLoadingApi ? 'Ejecutando llamada API...' : 'Ejecutar Solicitud HTTP'}</span>
                </button>
              </div>
            </div>

            {/* Right: Response Output */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xs flex flex-col justify-between text-xs space-y-3">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                  <span className="font-mono text-slate-400 font-bold">Respuesta del Servidor Next.js</span>
                  {responseResult && (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 font-bold rounded-md text-[10px]">
                        HTTP {responseResult.status} {responseResult.statusText || 'OK'}
                      </span>
                      {responseResult.durationMs !== undefined && (
                        <span className="text-slate-400 font-mono text-[10px]">
                          {responseResult.durationMs}ms
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <pre className="text-slate-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[380px]">
                  {responseResult ? (
                    JSON.stringify(responseResult.data || responseResult, null, 2)
                  ) : (
                    '// Haz clic en "Ejecutar Solicitud HTTP" para ver la respuesta en vivo...'
                  )}
                </pre>
              </div>

              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700 text-slate-400 text-[11px] flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Esta API ejecuta operaciones completas en Next.js Full Stack conectadas a MongoDB con soporte para Gemini AI.</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'keys' && (
          <div className="space-y-6">
            {/* API Keys Table */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-600" />
                  Claves de Acceso API REST (API Keys)
                </h3>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nueva Clave</span>
                </button>
              </div>

              <div className="space-y-2">
                {isLoadingKeys ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <p className="text-sm text-slate-500">Cargando claves API...</p>
                  </div>
                ) : keys.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <p className="text-sm text-slate-500">No hay claves API creadas aún.</p>
                  </div>
                ) : (
                  keys.map(k => (
                    <div key={k.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-slate-900">{k.name}</div>
                        <div className="font-mono text-slate-500 text-[11px] mt-0.5 truncate">{k.keyPreview || k.key}</div>
                        {Array.isArray(k.permissions) && k.permissions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {k.permissions.map((perm: string) => (
                              <span key={perm} className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[9px] font-bold rounded uppercase tracking-wide">
                                {perm}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => copyToClipboard(k.keyPreview || k.key, k.id)}
                          className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedKey === k.id ? '¡Copiado!' : 'Copiar'}</span>
                        </button>
                        <button
                          onClick={() => requestRevoke(k)}
                          className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Revocar</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Webhook Settings & Activity Logs */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600" />
                Endpoint de Webhook Suscrito
              </h3>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">URL del Webhook de Eventos:</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">
                    Activo (SSL)
                  </span>
                </div>
                <div className="font-mono text-indigo-700 font-bold bg-white p-2 border border-slate-200 rounded-lg">
                  {webhookConfig.url}
                </div>
              </div>

              {/* Webhook Activity Logs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-xs text-slate-800">Últimos Eventos Entregados (Logs HTTP)</h4>
                  {webhookLogs.length > 0 && (
                    <span className="text-[10px] font-bold text-slate-400">
                      Mostrando {Math.min(visibleLogCount, webhookLogs.length)} de {webhookLogs.length}
                    </span>
                  )}
                </div>
                <div className="bg-slate-900 rounded-xl p-3 text-slate-300 font-mono text-[11px] space-y-2">
                  {webhookLogs.length === 0 ? (
                    <div className="text-slate-500 text-center py-2">Sin eventos registrados todavía.</div>
                  ) : (
                    webhookLogs.slice(0, visibleLogCount).map(log => (
                      <div key={log.id} className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                        <span className="text-emerald-400 font-bold">[{log.statusCode}] {log.event}</span>
                        <span className="text-slate-400">{log.timestamp} ({log.durationMs}ms)</span>
                      </div>
                    ))
                  )}
                </div>
                {webhookLogs.length > LOG_PAGE_SIZE && (
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {visibleLogCount < webhookLogs.length && (
                      <button
                        type="button"
                        onClick={() => setVisibleLogCount(c => c + LOG_PAGE_SIZE)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-extrabold text-[11px] hover:bg-slate-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                        Ver más
                      </button>
                    )}
                    {visibleLogCount > LOG_PAGE_SIZE && (
                      <button
                        type="button"
                        onClick={() => setVisibleLogCount(LOG_PAGE_SIZE)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 font-bold text-[11px] hover:bg-slate-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                      >
                        Ver menos
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'github' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-5">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-600" />
                Guía de Instalación y Despliegue de XIO (xio-crm)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Este proyecto está construido en <strong>Next.js Full Stack (App Router)</strong> con persistencia en <strong>MongoDB</strong> y backend unificado.
              </p>
            </div>

            <div className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-xs space-y-3">
              <div>
                <span className="text-slate-500"># 1. Clonar el repositorio</span>
                <div className="text-emerald-400 font-bold">git clone https://github.com/tu-usuario/whato-crm.git</div>
                <div className="text-emerald-400 font-bold">cd whato-crm</div>
              </div>

              <div>
                <span className="text-slate-500"># 2. Instalar dependencias</span>
                <div className="text-emerald-400 font-bold">npm install</div>
              </div>

              <div>
                <span className="text-slate-500"># 3. Configurar variables de entorno en .env.local</span>
                <div className="text-indigo-300 font-bold">GEMINI_API_KEY=&quot;tu_clave_de_gemini_api&quot;</div>
                <div className="text-indigo-300 font-bold">GEMINI_MODEL=&quot;ID_DEL_MODELO_DISPONIBLE&quot;</div>
                <div className="text-indigo-300 font-bold">MONGODB_URI=&quot;mongodb://localhost:27017/whato-crm&quot;</div>
              </div>

              <div>
                <span className="text-slate-500"># 4. Iniciar servidor Next.js</span>
                <div className="text-emerald-400 font-bold">npm run dev</div>
              </div>
            </div>

            <button
              onClick={onOpenGithubModal}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Abrir Modal de Exportación y Configuración</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal de Creación de API Key */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4"
          onClick={closeCreateModal}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Nueva API Key</h3>
                  <p className="text-xs text-slate-500">Guarda esta clave: no se volverá a mostrar completa</p>
                </div>
              </div>
              <button
                onClick={closeCreateModal}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="font-bold text-slate-700 text-xs block mb-1">Nombre de la Clave</label>
                <input
                  type="text"
                  placeholder="Ej: Clave de Producción"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  disabled={isCreating}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 text-xs block mb-2">Permisos</label>
                <div className="space-y-2">
                  {['read', 'write', 'admin'].map(perm => (
                    <label key={perm} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        value={perm}
                        checked={newKeyPermissions.includes(perm)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewKeyPermissions([...newKeyPermissions, perm]);
                          } else {
                            setNewKeyPermissions(newKeyPermissions.filter(p => p !== perm));
                          }
                        }}
                        disabled={isCreating}
                        className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                      />
                      <span className="text-xs font-semibold text-slate-700 capitalize">{perm}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  * admin: lectura + escritura + revocar otras claves (requiere credencial de operador)
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 text-xs block mb-1">Clave de operador (permiso admin)</label>
                <input
                  type="password"
                  placeholder="x-api-key con permiso 'admin'"
                  value={operatorKey}
                  onChange={(e) => setOperatorKey(e.target.value)}
                  disabled={isCreating}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Se envía solo en esta petición y no se guarda. La clave pública del dashboard no puede crear ni revocar claves.
                </p>
              </div>

              {createError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-[11px] text-red-700 font-semibold">{createError}</p>
                </div>
              )}

              <button
                onClick={handleCreateApiKey}
                disabled={isCreating || !newKeyName.trim() || !operatorKey.trim()}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all"
              >
                {isCreating ? 'Generando clave...' : 'Generar API Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de "Copiar una sola vez" */}
      {newKeyCreated && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4"
          onClick={() => {
            if (!isCreating) setNewKeyCreated(null);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">¡Clave API Generada!</h3>
                  <p className="text-xs text-slate-500">Copia ahora: esta es la única oportunidad</p>
                </div>
              </div>
              <button
                onClick={() => setNewKeyCreated(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 text-xs block mb-1">Nombre</label>
                <p className="text-sm font-semibold text-slate-900">{newKeyCreated.name}</p>
              </div>

              <div>
                <label className="font-bold text-slate-700 text-xs block mb-1">Clave API Completa</label>
                <div className="relative">
                  <textarea
                    readOnly
                    value={newKeyCreated.rawKey || newKeyCreated.key}
                    rows={3}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(newKeyCreated.rawKey || newKeyCreated.key, 'new-key')}
                    className="absolute top-2 right-2 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copiar</span>
                  </button>
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-xs text-emerald-800 font-bold">
                  ⚠️ No podrás ver esta clave completa nuevamente. Asegúrate de guardarla en un lugar seguro.
                </p>
              </div>

              <div>
                <label className="font-bold text-slate-700 text-xs block mb-2">Permisos Asignados</label>
                <div className="flex flex-wrap gap-2">
                  {newKeyCreated.permissions.map(perm => (
                    <span key={perm} className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full capitalize">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de revocación */}
      {revokeTarget && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4"
          onClick={closeRevokeModal}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Revocar API Key</h3>
                  <p className="text-xs text-slate-500">Esta acción no se puede deshacer</p>
                </div>
              </div>
              <button
                onClick={closeRevokeModal}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Se revocará la clave <span className="font-bold text-slate-900">{revokeTarget.name}</span>
              <span className="font-mono text-slate-500"> ({revokeTarget.keyPreview || revokeTarget.key})</span>.
              Cualquier integración que la use dejará de funcionar de inmediato.
            </p>

            <div>
              <label className="font-bold text-slate-700 text-xs block mb-1">Clave de operador (permiso admin)</label>
              <input
                type="password"
                placeholder="x-api-key con permiso 'admin'"
                value={operatorKey}
                onChange={(e) => setOperatorKey(e.target.value)}
                disabled={isRevoking}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-red-500/20 disabled:opacity-50"
              />
            </div>

            {revokeError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-[11px] text-red-700 font-semibold">{revokeError}</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={closeRevokeModal}
                disabled={isRevoking}
                className="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold rounded-xl text-xs cursor-pointer disabled:opacity-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={confirmRevoke}
                disabled={isRevoking || !operatorKey.trim()}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs transition-all"
              >
                {isRevoking ? 'Revocando...' : 'Revocar clave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
