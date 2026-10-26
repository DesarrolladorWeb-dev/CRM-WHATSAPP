'use client';

import { apiFetch } from '@/lib/apiClient';
import { avatarPara } from '@/lib/avatar';
import { formatTime } from '@/lib/time';

import { useState, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { io as createSocket, Socket } from 'socket.io-client';
import {
  WHATSAPP_SERVICE_URL,
  normalizePhone,
  isLid,
  getJidForSending,
  getWhatsappStatus,
  getSessionPhone,
  getSessionName,
  formatPhoneDisplay,
  getReceivedMessages,
  sendTextMessage,
  sendMediaMessage,
  resetWhatsappSession,
  registerWebhook,
  type WhatsappStatus,
  type ReceivedWhatsAppMessage
} from '@/lib/whatsappService';

import { sendInteractiveMessage } from '@/lib/whatsappCloudClient';
import { WhatsAppConnectView } from '@/components/WhatsAppConnect/WhatsAppConnectView';
import {
  Contact, Conversation, Message, Segment, Campaign, AutomationRule,
  ApiKey, WebhookConfig, WebhookLog, PipelineStage, QuickReply,
  AnalyticsData, CampaignPreview
} from '@/types';
import {
  INITIAL_CONTACTS, INITIAL_CONVERSATIONS, INITIAL_MESSAGES,
  INITIAL_SEGMENTS, INITIAL_CAMPAIGN, INITIAL_AUTOMATIONS,
  INITIAL_API_KEYS, INITIAL_WEBHOOK, INITIAL_WEBHOOK_LOGS, INITIAL_ANALYTICS,
  INITIAL_QUICK_REPLIES
} from '@/mockData';

import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { InboxView } from '@/components/Inbox/InboxView';
import { ContactsView } from '@/components/Contacts/ContactsView';
import { SegmentsView } from '@/components/Segments/SegmentsView';
import { CampaignsView } from '@/components/Campaigns/CampaignsView';
import { AutomationView } from '@/components/Automation/AutomationView';
import { ApiGithubView } from '@/components/ApiGithub/ApiGithubView';
import { AnalyticsView } from '@/components/Analytics/AnalyticsView';
import { GithubModal } from '@/components/GithubModal';
import { LoginView } from '@/components/Login/LoginView';
import { User } from '../generated/prisma/client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { InteractiveContent, interactiveToText, parseInteractive } from '@/lib/whatsappInteractive';

const LOCAL_STORAGE_QUICK_REPLIES_KEY = 'whato_crm_quick_replies_v2';

function dedupeMessages(messages: Message[]): Message[] {
  const seen = new Set<string>();
  const out: Message[] = [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

function getMediaLabel(mediaType?: string): string {
  switch (mediaType) {
    case 'image': return 'Imagen';
    case 'audio': return 'Audio';
    case 'video': return 'Video';
    case 'document': return 'Documento';
    case 'sticker': return 'Sticker';
    default: return '📎 Archivo';
  }
}

// Suscripción vacía para useSyncExternalStore: solo interesa distinguir
// servidor/hidratación (false) de cliente ya montado (true).
const subscribeNoop = () => () => { };

export default function HomePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [activeTab, setActiveTab] = useState<string>(() => searchParams.get('tab') || 'inbox');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [whatsappStatus, setWhatsappStatus] = useState<WhatsappStatus | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);

  // Solicitar un nuevo código QR al servicio
  const handleRequestQr = async () => {
    try {
      await resetWhatsappSession();
    } catch {

    }
  };

  // Cierra la sesion activa para poder vincular otra cuenta. El servicio emite
  // 'qr-update' al soltarla, pero se refresca el estado igual por si el socket
  // no estuviera vivo en ese momento. Aqui el error SI se muestra: el usuario
  // esta esperando un cambio concreto y el silencio pareceria un boton muerto.
  const handleDisconnectWhatsapp = async () => {
    const res = await resetWhatsappSession();
    if (res.ok === false) {
      setWhatsappError(res.error || 'No se pudo desvincular la cuenta de WhatsApp');
      return;
    }
    const st = await getWhatsappStatus();
    if (st.ok && st.data) setWhatsappStatus(st.data);
  };


  useEffect(() => {
    if (!errorMessage) return;
    const id = setTimeout(() => setErrorMessage(null), 5000);
    return () => clearTimeout(id);
  }, [errorMessage]);

  // Aviso de errores de envio/recepcion de WhatsApp (se auto-oculta).
  useEffect(() => {
    if (!whatsappError) return;
    const id = setTimeout(() => setWhatsappError(null), 6500);
    return () => clearTimeout(id);
  }, [whatsappError]);

  const cambiarTab = (tab: string) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    url.searchParams.delete('id');
    router.replace(`${url}`)
  };

  // Core CRM Datasets State
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>(INITIAL_MESSAGES);
  const [activeConversationId, setActiveConversationId] = useState<string>(() => searchParams.get('id') || '');

  // Sincroniza ?id= con la conversación activa al recargar o navegar atrás/adelante.
  // Sin esto, recargar con ?id=conv_... dejaba activeConversationId='' y el efecto
  // de carga de mensajes nunca disparaba hasta hacer clic en la lista.
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      setActiveConversationId((prev) => (prev === id ? prev : id));
    }
  }, [searchParams]);


  // Persistent Quick Replies
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_QUICK_REPLIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // En el servidor no hay localStorage; se usan los valores por defecto.
    }
    return INITIAL_QUICK_REPLIES;
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [segments, setSegments] = useState<Segment[]>(INITIAL_SEGMENTS);
  const [campaigns, setCampaigns] = useState<Campaign[]>(INITIAL_CAMPAIGN);
  const [automations, setAutomations] = useState<AutomationRule[]>(INITIAL_AUTOMATIONS);
  const [apiKeys] = useState<ApiKey[]>(INITIAL_API_KEYS);
  const [webhookConfig] = useState<WebhookConfig>(INITIAL_WEBHOOK);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>(INITIAL_WEBHOOK_LOGS);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>(INITIAL_ANALYTICS);

  const [dbDegraded, setDbDegraded] = useState(false);

  const [preselectedSegmentForCampaign, setPreselectedSegmentForCampaign] = useState<string | undefined>(undefined);
  const [isGithubModalOpen, setIsGithubModalOpen] = useState<boolean>(false);


  // Fail-closed: si el backend no confirma explicitamente que se puede
  // borrar, el boton no se muestra. Antes el estado arrancaba en `true` y
  // solo bajaba a `false` si el servidor lo decia activamente; cuando la
  // respuesta no traia `capabilities` (era el caso), el boton quedaba
  // visible para todos los roles.
  const [canDeleteCampaigns, setCanDeleteCampaigns] = useState<boolean>(false);
  const [canDeleteContacts, setCanDeleteContacts] = useState<boolean>(false);

  // -------------------------------------------------------------------------
  // Integracion con el servicio local de WhatsApp (REST + Socket.IO, :3001)
  // -------------------------------------------------------------------------
  const whatsappSocketRef = useRef<Socket | null>(null);
  const [isWhatsappSocketConnected, setIsWhatsappSocketConnected] = useState(false);

  const conversationsRef = useRef<Conversation[]>(conversations);
  useLayoutEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  const incomingHandlerRef = useRef<(msg: ReceivedWhatsAppMessage) => void>(() => { });
  const outgoingHandlerRef = useRef<(msg: OutgoingWhatsAppMessage) => void>(() => { });

  const processedIncomingIdsRef = useRef<Set<string>>(new Set());

  const conversationByPhoneRef = useRef<Map<string, string>>(new Map());

  const logout = async () => {
    try {
      const response = await apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const resData = await response.json()
      if (!resData.success) {
        setErrorMessage('No se pudo cerrar la sesión correctamente')
        return
      }
      setCurrentUser(null)
    } catch {
      setErrorMessage('Error al intentar cerrar sesión')
    }
  }

  // Client-side hydration and DB sync
  useEffect(() => {

    const checkUser = async () => {
      try {
        const result = await apiFetch('/api/auth/user', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })

        const resData = await result.json()
        if (!resData.success) {
          setCurrentUser(null)
        }


        if (resData.success && resData.data) {
          setCurrentUser(resData.data)
        }

      }
      catch {
        setCurrentUser(null)
      } finally {
        setAuthChecked(true)
      }
    }

    checkUser()

    // Try fetching live data from MongoDB API endpoints
    const fetchDbData = async () => {
      try {
        const [cRes, convRes, segRes, campRes, autoRes, analyticsRes, meRes, qrRes] = await Promise.all([
          apiFetch('/api/contacts'),
          apiFetch('/api/conversations'),
          apiFetch('/api/segments'),
          apiFetch('/api/campaigns'),
          apiFetch('/api/automations'),
          apiFetch('/api/analytics'),
          apiFetch('/api/auth/me'),
          apiFetch('/api/quick-replies'),
        ]);

        const dataDown = [cRes, convRes, segRes, campRes, autoRes, analyticsRes].some(r => r.status >= 500);
        if (dataDown) setDbDegraded(true);

        // Este efecto solo corre al montar: el estado de contactos aún es el inicial.
        let latestContacts = INITIAL_CONTACTS;
        if (cRes.ok) {
          const cData = await cRes.json();
          if (cData.success && Array.isArray(cData.data) && cData.data.length > 0) {
            latestContacts = cData.data;
            setContacts(cData.data);
          }
        }
        if (convRes.ok) {
          const convData = await convRes.json();
          if (convData.success && Array.isArray(convData.data) && convData.data.length > 0) {

            const contactById = new Map(latestContacts.map(c => [c.id, c]));
            const hydrated = convData.data
              .map((conv: Conversation) => ({ ...conv, contact: conv.contact || contactById.get(conv.contactId) }))
              .filter((conv: Conversation) => !!conv.contact);
            if (hydrated.length > 0) {
              setConversations(hydrated);
              // Sin ?id= en la URL nadie elegía conversación y el panel mostraba
              // los mocks hasta el primer clic: se abre la más reciente.
              if (!searchParams.get('id')) {
                setActiveConversationId(hydrated[0].id);
                const params = new URLSearchParams(searchParams.toString());
                params.set('id', hydrated[0].id);
                router.replace(`${pathname}?${params.toString()}`);
              }
            }
          }
        }
        if (segRes.ok) {
          const segData = await segRes.json();
          if (segData.success && Array.isArray(segData.data) && segData.data.length > 0) {
            setSegments(segData.data);
          }
        }
        if (campRes.ok) {
          const campData = await campRes.json();
          if (campData.success && Array.isArray(campData.data) && campData.data.length > 0) {
            setCampaigns(campData.data);
          }
        }
        if (autoRes.ok) {
          const autoData = await autoRes.json();
          if (autoData.success && Array.isArray(autoData.data) && autoData.data.length > 0) {
            setAutomations(autoData.data);
          }
        }
        if (analyticsRes.ok) {
          const analyticsData = await analyticsRes.json();
          if (analyticsData.success && analyticsData.data) {
            setAnalyticsData(analyticsData.data);
          }
        }
        if (meRes.ok) {
          const meData = await meRes.json();
          // Solo ocultamos el boton si el backend dice explicitamente que NO.
          if (meData.success) {
            if (meData.data?.capabilities?.campaigns) {
              setCanDeleteCampaigns(!!meData.data.capabilities.campaigns.delete);
            }
            setCanDeleteContacts(!!meData.data?.capabilities?.contacts?.delete);
          }
        }
        if (qrRes.ok) {
          const qrData = await qrRes.json();

          if (qrData.success && Array.isArray(qrData.data) && qrData.data.length > 0) {
            setQuickReplies(qrData.data);
          }
        }
      } catch {
        setDbDegraded(true);
      }
    };
    fetchDbData();
  }, []);

  useEffect(() => {
    if (!mounted
      || !authChecked
    )
      return;
    try {
      localStorage.setItem(LOCAL_STORAGE_QUICK_REPLIES_KEY, JSON.stringify(quickReplies));
    } catch {
      // ignore
    }



  }, [quickReplies, mounted
    , authChecked
  ]);

  useEffect(() => {
    if (!mounted || !activeConversationId) return;

    let cancelled = false;
    const convId = activeConversationId;

    (async () => {
      try {
        const res = await apiFetch(`/api/messages?conversationId=${encodeURIComponent(convId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.success || !Array.isArray(data.data) || data.data.length === 0) return;

        setMessagesMap(prev => {
          const fetchedIds = new Set(data.data.map((m: Message) => m.id));
          const pendingLocal = (prev[convId] || []).filter(m => !fetchedIds.has(m.id));
          return { ...prev, [convId]: [...data.data, ...pendingLocal] };
        });
      } catch {
        // La conversación mantiene los mensajes que ya tuviera en memoria.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, mounted]);

  const isWhatsappServiceActive = isWhatsappSocketConnected;
  const visibleConversations = isWhatsappServiceActive
    ? conversations
    : conversations.filter(c => c.channel !== 'whatsapp');

  const unreadTotal = visibleConversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  // Handle Send Message
  const handleSendMessage = async (conversationId: string, text: string, aiGenerated: boolean = false, mediaUrl?: string, interactive?: InteractiveContent) => {
    const timestamp = formatTime();
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv) return;

    const newMsg: Message = {
      id: `m_${Date.now()}`,
      conversationId,
      sender: 'agent',
      senderName: 'Asistente XIO',
      text: interactive ? interactive.body : text,
      timestamp,
      channel: conv.channel,
      status: 'sent',
      aiGenerated,
      mediaUrl,
      interactive
    };

    // Update Messages Map
    setMessagesMap(prev => ({
      ...prev,
      [conversationId]: [...(prev[conversationId] || []), newMsg]
    }));

    // Update Conversation Last Message
    setConversations(prev => prev.map(c => {
      if (c.id === conversationId) {
        return {
          ...c,
          lastMessage: interactive ? interactive.body : mediaUrl ? `📷 ${text || 'Imagen adjunta'}` : text,
          lastMessageTime: 'Ahora',
          unreadCount: 0
        };
      }
      return c;
    }));


    if (conv.channel === 'whatsapp') {
      // Priorizar el handle si contiene @lid (es el identificador real de WhatsApp).
      // Si no, usar phone normalizado. Solo si phone no tiene @lid.
      const handleHasLid = isLid(conv.contact.handle || '');
      const phoneHasLid = isLid(conv.contact.phone || '');
      let phone: string;
      if (handleHasLid) {
        phone = getJidForSending(conv.contact.handle!);
      } else if (phoneHasLid) {
        phone = getJidForSending(conv.contact.phone!);
      } else {
        phone = normalizePhone(conv.contact.phone || conv.contact.handle || '');
      }

      const esAudioSimulado = !!mediaUrl && mediaUrl.startsWith('data:audio/');
      const esImagen = !!mediaUrl && mediaUrl.startsWith('data:image/');
      const esVideo = !!mediaUrl && mediaUrl.startsWith('data:video/');
      const esDocumento = !!mediaUrl && !esAudioSimulado && !esImagen && !esVideo;

      if (interactive) {
        const lid = isLid(conv.contact.handle || '') ? conv.contact.handle!.split('@')[0] : null;
        const real = normalizePhone(conv.contact.phone || '');
        const destino = real && real != lid ? real : ''

        const r = destino
          ? await sendInteractiveMessage(destino, interactive)
          : { ok: false as const, status: 0, error: 'No se puede enviar mensajes a leads' };

        if (r.ok === false) {

          setMessagesMap(prev => ({
            ...prev,
            [conversationId]: (prev[conversationId] || []).map(m =>
              m.id === newMsg.id ? { ...m, status: 'failed' } : m
            )

          }))
          setWhatsappError(`WhatsApp Cloud: ${r.error}`);
        }

      } else if (phone && (text.trim() || mediaUrl || interactive)) {
        let resultado;

        if (esImagen) {
          resultado = await sendMediaMessage({
            phone,
            type: 'image',
            media: mediaUrl,
            caption: text.trim() || undefined,
          });
        } else if (esAudioSimulado) {
          resultado = await sendMediaMessage({
            phone,
            type: 'audio',
            media: mediaUrl,
            mimetype: 'audio/mpeg; codecs=opus',
          });
        } else if (esVideo) {
          resultado = await sendMediaMessage({
            phone,
            type: 'video',
            media: mediaUrl,
            caption: text.trim() || undefined,
          });
        } else if (esDocumento) {
          resultado = await sendMediaMessage({
            phone,
            type: 'document',
            media: mediaUrl,
            filename: text.trim() || 'documento',
          });
        } else {
          resultado = await sendTextMessage(phone, text.trim());
        }

        if (resultado.ok === false) {
          // El mensaje quedo en el chat pero NO salio: se marca en rojo.
          setMessagesMap(prev => ({
            ...prev,
            [conversationId]: (prev[conversationId] || []).map(m =>
              m.id === newMsg.id ? { ...m, status: 'failed' } : m
            )
          }));
          const detalle = resultado.error === 'El numero no esta registrado en WhatsApp' ||
            resultado.error.includes('registrado')
            ? `El número ${phone} no está registrado en WhatsApp`
            : `WhatsApp: ${resultado.error}`;
          setWhatsappError(detalle);
        }
      }
    }

    // Asynchronously save to DB (best-effort; la persistencia depende de la API key)
    apiFetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMsg)
    }).catch(() => null);
  };


  const contactKeys = (c: Contact) => {
    const handle = c.handle || ''
    const lid = handle.endsWith('@lid') ? handle.split('@')[0] : null
    let phone = normalizePhone(c.phone || '')
    if (lid && phone === lid) phone = ''
    return { phone: phone || null, lid }
  }

  const handleDeleteConversation = async (conversationId: string) => {
    const conv = conversations.find(c => c.id === conversationId)
    if (!conv) return
    const eraLaActiva = activeConversationId === conversationId

    for (const [key, convId] of conversationByPhoneRef.current) {
      if (convId === conversationId) conversationByPhoneRef.current.delete(key)
    }


    if (eraLaActiva) {
      setActiveConversationId('')
      const params = new URLSearchParams(searchParams.toString())
      params.delete('id')
      router.replace(`${pathname}?${params.toString()}`)
    }

    await handleDeleteContact(conv.contactId)
  }

  const handleIncomingWhatsAppMessage = async (raw: ReceivedWhatsAppMessage) => {
    console.log('RAW INCOMING: ', JSON.stringify(raw, null, 2))
    if (!raw || typeof raw !== 'object') return;

    const messageId = String(raw.messageId || `m_inc_${Date.now()}`);
    if (processedIncomingIdsRef.current.has(messageId)) return;
    processedIncomingIdsRef.current.add(messageId);


    const from = String(raw.from || '')
    const fromIsLid = from.endsWith('@lid')
    const lidBase = fromIsLid ? from.split('@')[0] : null;

    const altJid = (raw as any).resolvedPhone || (raw as any).fromPn || (raw as any).senderPn || (raw as any).remoteJidAlt || ''
    const resolvedPhone = altJid
      ? normalizePhone(altJid)
      : !fromIsLid ? normalizePhone(from) : null;

    const conversationKey = resolvedPhone || (lidBase ? `lid:${lidBase}` : '')
    if (!conversationKey) return null


    // El pushName tal cual lo publica la persona, sin rellenar huecos. Se manda
    // crudo a /api/whatsapp/incoming para que el servidor aplique la misma
    // escalera de respaldo que el webhook (nombre -> telefono -> etiqueta
    // neutra); si aqui se enviara un marcador, el servidor lo guardaria como si
    // fuera un nombre de verdad y la ficha acabaria llamandose "Numero oculto".
    const pushName = String(raw.fromName || '').trim();

    // Para pintar en pantalla si hace falta una etiqueta. Mismo criterio que
    // src/app/api/whatsapp/ingest.ts, para que el nombre no baile entre lo que
    // se ve al llegar el mensaje y lo que queda guardado.
    const name = pushName
      || (resolvedPhone ? formatPhoneDisplay(resolvedPhone) : 'Contacto WhatsApp');
    const interactive = parseInteractive(raw.rawMessage)
    const text = String(raw.text || '') || (interactive ? interactiveToText(interactive) : '');
    const receivedAt = raw.receivedAt ? new Date(raw.receivedAt) : new Date();
    const timestampLbl = formatTime(receivedAt);

    let saved:
      | { contact?: Contact; conversation?: Conversation; message?: Message; isNewContact?: boolean; isNewConversation?: boolean }
      | undefined;
    try {
      const res = await apiFetch('/api/whatsapp/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          from,
          fromName: pushName,
          timestamp: raw.timestamp,
          text,
          hasMedia: raw.hasMedia,
          // El binario viene en el evento del socket: sin estos dos campos el
          // backend solo ve la bandera y no hay nada que persistir en disco.
          mediaType: raw.mediaType,
          media: raw.media,
          receivedAt: receivedAt.toISOString(),
          // Detectar si el from es un LID y enviar los campos adicionales
          isLid: fromIsLid,
          lidBase,
          resolvedPhone,
          rawMessage: raw.rawMessage
        }),
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload.success && payload.data) saved = payload.data;
      }
    } catch {
      saved = undefined;
    }

    const promoteKey = (convId: string) => {
      conversationByPhoneRef.current.set(conversationKey, convId)
      if (lidBase && resolvedPhone) {
        conversationByPhoneRef.current.delete(`lid:${lidBase}`)
      }
    }

    let targetId = '';

    if (saved?.conversation?.id) {
      targetId = saved.conversation.id;
      promoteKey(targetId)

      if (saved.contact) {
        const sc = saved.contact
        setContacts(prev =>
          prev.some(c => c.id === sc.id) ? prev.map(c => (c.id === sc.id ? { ...c, ...sc } : c)) : [sc, ...prev]
        );
      }
      if (saved.isNewConversation) {
        setConversations(prev => [saved!.conversation!, ...prev]);
        setActiveConversationId(targetId);
      } else {
        setConversations(prev =>
          prev.map(c => (c.id === targetId ? saved!.conversation! : c))
        );
      }
    } else {
      // Fallback: la BD no respondio; igual mostramos el chat en memoria.
      let foundId = conversationByPhoneRef.current.get(conversationKey) || (lidBase ? conversationByPhoneRef.current.get(`lid:${lidBase}`) : '');
      if (!foundId) {
        for (const c of conversationsRef.current) {
          const k = contactKeys(c.contact)
          if ((resolvedPhone && k.phone === resolvedPhone) || (lidBase && k.lid === lidBase)) {
            foundId = c.id;
            break;
          }
        }
      }
      if (foundId) {
        targetId = foundId;
        promoteKey(foundId)

        if (resolvedPhone && lidBase) {
          setContacts(prev => prev.map(c =>
            contactKeys(c).lid === lidBase ? { ...c, phone: resolvedPhone } : c
          ))
          setConversations(prev => prev.map(c =>
            c.id === foundId ? { ...c, contact: { ...c.contact, phone: resolvedPhone } } : c
          ))
        }

      } else {
        const newContact: Contact = {
          id: `c_wa_${Date.now()}`,
          name,
          avatar: avatarPara(name, Boolean(pushName)),
          handle: fromIsLid ? from : resolvedPhone!,
          phone: resolvedPhone || '',
          channel: 'whatsapp',
          tags: ['WhatsApp Entrante'],
          sentiment: 'neutral',
          leadScore: 50,
          stage: 'lead',
          dealValue: 0,
          notes: fromIsLid && !resolvedPhone ? `Contacto con LID ${lidBase}. Número real sin resolver` : 'Contacto creado automaticamente desde WhatsApp.',
          lastActive: 'Ahora',
          company: '',
        };
        const newConv: Conversation = {
          id: `conv_${newContact.id}`,
          contactId: newContact.id,
          contact: newContact,
          channel: 'whatsapp',
          unreadCount: 1,
          lastMessage: text,
          lastMessageTime: timestampLbl,
          status: 'open',
          assignedAgent: 'Asesor XIO'
        };
        targetId = newConv.id;
        promoteKey(newConv.id)
        setContacts(prev => [newContact, ...prev]);
        setConversations(prev => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
      }
    }

    // Agregar el mensaje al thread.
    const incomingMsg: Message = {
      id: saved?.message?.id || messageId,
      conversationId: targetId,
      sender: 'contact',
      senderName: name,
      text,
      timestamp: saved?.message?.timestamp || timestampLbl,
      channel: 'whatsapp',
      status: 'read',
      hasMedia: raw.hasMedia || false,
      mediaType: saved?.message?.mediaType ?? raw.mediaType,
      media: saved?.message?.media ?? raw.media,
      mediaUrl: saved?.message?.mediaUrl,
      interactive: saved?.message?.interactive ?? interactive ?? undefined
    };

    setMessagesMap(prev => ({
      ...prev,
      [targetId]: dedupeMessages([...(prev[targetId] || []), incomingMsg])
    }));

    // Si la conversacion esta abierta en pantalla, el mensaje se esta leyendo
    // ahora mismo: contarlo como no leido pondria un globo de "1 nuevo" en el
    // chat que el usuario tiene delante.
    const estaAbierta = targetId === activeConversationId;

    setConversations(prev => prev.map(c => {
      if (c.id === targetId) {
        const mediaLabel = raw.hasMedia ? getMediaLabel(raw.mediaType) : '';
        const lastMessageDisplay = text || mediaLabel || '[Mensaje]';
        return {
          ...c,
          lastMessage: lastMessageDisplay,
          lastMessageTime: saved ? 'Ahora' : timestampLbl,
          unreadCount: estaAbierta ? 0 : (c.unreadCount || 0) + 1
        };
      }
      return c;
    }));

    // El contador tambien vive en Postgres, y el servidor ya lo ha subido al
    // persistir el mensaje entrante. Hay que bajarlo alli tambien, o volveria
    // a aparecer en la siguiente recarga.
    if (estaAbierta) {
      apiFetch('/api/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: targetId, unreadCount: 0 }),
      }).catch(() => {
        /* Se corrige solo al volver a abrir la conversacion. */
      });
    }
  };

  // El socket se suscribe una sola vez; el handler lee los datos frescos via ref.
  useLayoutEffect(() => {
    incomingHandlerRef.current = handleIncomingWhatsAppMessage;
    outgoingHandlerRef.current = handleOutgoingWhatsAppMessage;
  });

  // Mensaje del bot (n8n: Enviar WhatsApp con "n8n":true -> el service emite
  // 'outgoing-message'). Sin esto solo existía en base y aparecía al recargar.
  interface OutgoingWhatsAppMessage {
    messageId?: string;
    jid?: string;
    text?: string;
    senderName?: string;
    timestamp?: string;
  }

  const handleOutgoingWhatsAppMessage = (raw: OutgoingWhatsAppMessage) => {
    if (!raw || typeof raw !== 'object') return;
    const messageId = String(raw.messageId || `m_out_${Date.now()}`);
    if (processedIncomingIdsRef.current.has(messageId)) return;
    processedIncomingIdsRef.current.add(messageId);

    const jid = String(raw.jid || '');
    const jidIsLid = jid.endsWith('@lid');
    const lidBase = jidIsLid ? jid.split('@')[0] : null;
    const digits = normalizePhone(jid);
    const key = jidIsLid ? (lidBase ? `lid:${lidBase}` : '') : digits;
    if (!key) return;

    // Misma resolución que el entrante: atajos, luego escaneo de contactos.
    let targetId = conversationByPhoneRef.current.get(key) || '';
    if (!targetId) {
      for (const c of conversationsRef.current) {
        if (!c.contact) continue;
        const k = contactKeys(c.contact);
        if ((!jidIsLid && k.phone && digits && k.phone === digits) || (lidBase && k.lid === lidBase)) {
          targetId = c.id;
          break;
        }
      }
    }
    // Si Crear Entrante aún no registró la conversación, el mensaje ya quedó
    // en base (Guardar) y aparece al abrir el chat (fetch por conversationId).
    if (!targetId) return;

    const text = String(raw.text || '');
    // El service firma como "Xiomara" y n8n guarda como "Asistente XIO":
    // se normaliza para que la burbuja del socket y la de base sean la misma.
    const botMsg: Message = {
      id: messageId,
      conversationId: targetId,
      sender: 'bot',
      senderName: 'Asistente XIO',
      text,
      timestamp: String(raw.timestamp || formatTime()),
      channel: 'whatsapp',
      status: 'sent',
      aiGenerated: true,
    };

    setMessagesMap(prev => {
      const thread = prev[targetId] || [];
      // Misma fila por id (Guardar debe usar el messageId del Enviar, no
      // m_n8n_...) o última burbuja bot con idéntico texto: no duplicar.
      const last = thread[thread.length - 1];
      const dup =
        thread.some(m => m.id === messageId) ||
        (text.length > 0 && !!last && last.sender === 'bot' && last.text === text);
      if (dup) return prev;
      return { ...prev, [targetId]: [...thread, botMsg] };
    });

    // Espejo de bumpLastMessage() en POST /api/messages: último mensaje + sin
    // no leídos (el bot respondió, no hay nada pendiente).
    setConversations(prev => prev.map(c =>
      c.id === targetId
        ? { ...c, lastMessage: text || '[Mensaje]', lastMessageTime: 'Ahora', unreadCount: 0 }
        : c
    ));
  };

  useEffect(() => {
    if (!mounted || !authChecked || !currentUser) return;

    const socket = createSocket(WHATSAPP_SERVICE_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      timeout: 5000
    });
    whatsappSocketRef.current = socket;

    socket.on('connect', () => {
      setIsWhatsappSocketConnected(true);
      socket.emit('subscribe-messages');
      // El servicio solo reenvia a su webhook si la URL esta configurada, y la
      // pierde al reiniciarse: registrarla en cada conexion garantiza que los
      // mensajes (y su multimedia) persistan en el backend aunque este
      // proceso de Next no reciba el evento por socket.
      registerWebhook(`${window.location.origin}/api/whatsapp/webhook`).catch(() => null);
    });
    socket.on('qr-update', (status: WhatsappStatus) => {
      if (status && typeof status === 'object') setWhatsappStatus(status);
    });
    socket.on('incoming-message', (msg: ReceivedWhatsAppMessage) => {
      incomingHandlerRef.current(msg);
    });
    socket.on('outgoing-message', (msg: { messageId?: string; jid?: string; text?: string; senderName?: string; timestamp?: string }) => {
      outgoingHandlerRef.current(msg);
    });
    socket.on('disconnect', () => {
      setIsWhatsappSocketConnected(false);
      setWhatsappStatus(prev =>
        prev ? { ...prev, isConnected: false, connectionStatus: 'disconnected' } : prev
      );
    });

    // Estado inicial + historial reciente cuando el CRM arranca.
    getWhatsappStatus().then(st => {
      if (st.ok && st.data) {
        setWhatsappStatus(st.data);
      }
    });
    getReceivedMessages(50).then(res => {
      if (res.ok && Array.isArray(res.data.messages)) {
        res.data.messages.forEach(m => incomingHandlerRef.current(m));
      }
    });

    return () => {
      socket.disconnect();
      whatsappSocketRef.current = null;
      setIsWhatsappSocketConnected(false);
    };
  }, [mounted, authChecked, currentUser]);

  useEffect(() => {
    if (whatsappStatus?.connectionStatus === 'connected') {
      setShowWhatsappModal(false)
    }
  }, [whatsappStatus?.connectionStatus])

  // Actualizar el valor comercial de un contacto
  const handleUpdateDealValue = async (
    contactId: string,
    dealValue: number
  ): Promise<string | null> => {
    try {
      const response = await apiFetch('/api/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contactId, dealValue })
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.success) {
        return result?.error || 'No se pudo actualizar el precio.';
      }

      setContacts(prev =>
        prev.map(contact =>
          contact.id === contactId
            ? { ...contact, dealValue }
            : contact
        )
      );

      setConversations(prev =>
        prev.map(conv =>
          conv.contactId === contactId
            ? {
              ...conv,
              contact: { ...conv.contact, dealValue }
            }
            : conv
        )
      );

      return null;
    } catch {
      return 'Error de conexión al actualizar el precio del cliente.';
    }
  };
  // Simulate Incoming Message from Social Channels & Trigger AI Auto-Responder
  // Update Contact Stage
  const handleUpdateContactStage = (contactId: string, newStage: PipelineStage) => {
    setContacts(prev => prev.map(c => {
      if (c.id === contactId) {
        const interactions = { ...(c.interactions || {}) };
        if (newStage === 'qualified') {
          interactions.firstReply = true;
        } else if (newStage === 'negotiation') {
          interactions.firstReply = true;
          interactions.appointmentConfirmed = true;
        } else if (newStage === 'closed_won') {
          interactions.firstReply = true;
          interactions.appointmentConfirmed = true;
          interactions.proposalSent = true;
          interactions.dealClosed = true;
        }
        return { ...c, stage: newStage, interactions };
      }
      return c;
    }));

    setConversations(prev => prev.map(c => {
      if (c.contactId === contactId) {
        const interactions = { ...(c.contact.interactions || {}) };
        if (newStage === 'qualified') {
          interactions.firstReply = true;
        } else if (newStage === 'negotiation') {
          interactions.firstReply = true;
          interactions.appointmentConfirmed = true;
        } else if (newStage === 'closed_won') {
          interactions.firstReply = true;
          interactions.appointmentConfirmed = true;
          interactions.proposalSent = true;
          interactions.dealClosed = true;
        }
        return { ...c, contact: { ...c.contact, stage: newStage, interactions } };
      }
      return c;
    }));

    // Log Webhook event automatically
    const newLog: WebhookLog = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      event: 'lead.stage_updated',
      statusCode: 200,
      payload: { contactId, newStage },
      durationMs: 85
    };
    setWebhookLogs(prev => [newLog, ...prev]);

    // Persist update
    apiFetch('/api/contacts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: contactId, stage: newStage })
    }).catch(() => null);
  };

  // Toggle Contact Interaction & Auto-Transition Stages
  const handleToggleContactInteraction = (
    contactId: string,
    interactionKey: 'firstReply' | 'appointmentConfirmed' | 'proposalSent' | 'dealClosed'
  ) => {
    setContacts(prev => prev.map(c => {
      if (c.id === contactId) {
        const currentInteractions = c.interactions || {};
        const isTurningOn = !currentInteractions[interactionKey];
        const updatedInteractions = {
          ...currentInteractions,
          [interactionKey]: isTurningOn
        };

        // Al desmarcar tambien se recalcula la etapa: las casillas son
        // acumulativas, asi que la etapa se deriva de la ultima activa en vez
        // de retroceder un paso a ciegas. Desmarcar la 2a con la 1a puesta
        // deja el contacto en 'qualified', no en 'lead'.
        if (isTurningOn) {
          if (interactionKey === 'appointmentConfirmed') {
            updatedInteractions.firstReply = true;
          }
          if (interactionKey === 'dealClosed') {
            updatedInteractions.firstReply = true;
            updatedInteractions.appointmentConfirmed = true;
            updatedInteractions.proposalSent = true;
          }
        } else {
          // Desmarcar una casilla desmarca las posteriores: no tiene sentido
          // un cierre confirmado sin cita confirmada.
          if (interactionKey === 'firstReply') {
            updatedInteractions.appointmentConfirmed = false;
            updatedInteractions.proposalSent = false;
            updatedInteractions.dealClosed = false;
          }
          if (interactionKey === 'appointmentConfirmed') {
            updatedInteractions.proposalSent = false;
            updatedInteractions.dealClosed = false;
          }
          if (interactionKey === 'proposalSent') {
            updatedInteractions.dealClosed = false;
          }
        }

        // 'closed_lost' es una decision manual del agente: ningun automatismo
        // saca un contacto de ahi.
        let newStage = c.stage;
        if (c.stage !== 'closed_lost') {
          if (updatedInteractions.dealClosed) newStage = 'closed_won';
          else if (updatedInteractions.appointmentConfirmed) newStage = 'negotiation';
          else if (updatedInteractions.firstReply) newStage = 'qualified';
          else newStage = 'lead';
        }

        return {
          ...c,
          stage: newStage,
          interactions: updatedInteractions
        };
      }
      return c;
    }));

    setConversations(prev => prev.map(conv => {
      if (conv.contactId === contactId) {
        const currentInteractions = conv.contact.interactions || {};
        const isTurningOn = !currentInteractions[interactionKey];
        const updatedInteractions = {
          ...currentInteractions,
          [interactionKey]: isTurningOn
        };

        let newStage = conv.contact.stage;
        if (interactionKey === 'firstReply' && isTurningOn && conv.contact.stage === 'lead') {
          newStage = 'qualified';
        }
        if (interactionKey === 'appointmentConfirmed' && isTurningOn) {
          updatedInteractions.firstReply = true;
          if (conv.contact.stage === 'lead' || conv.contact.stage === 'qualified') {
            newStage = 'negotiation';
          }
        }
        if (interactionKey === 'dealClosed' && isTurningOn) {
          updatedInteractions.firstReply = true;
          updatedInteractions.appointmentConfirmed = true;
          updatedInteractions.proposalSent = true;
          newStage = 'closed_won';
        }

        return {
          ...conv,
          contact: {
            ...conv.contact,
            stage: newStage,
            interactions: updatedInteractions
          }
        };
      }
      return conv;
    }));
  };

  // Update Contact Tags
  const handleUpdateContactTags = (contactId: string, newTags: string[]) => {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, tags: newTags } : c));
    setConversations(prev => prev.map(c => c.contactId === contactId ? { ...c, contact: { ...c.contact, tags: newTags } } : c));
    apiFetch('/api/contacts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: contactId, tags: newTags })
    }).catch(() => null);
  };

  // Update Contact Notes
  const handleUpdateContactNotes = (contactId: string, newNotes: string) => {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, notes: newNotes } : c));
    setConversations(prev => prev.map(c => c.contactId === contactId ? { ...c, contact: { ...c.contact, notes: newNotes } } : c));
    apiFetch('/api/contacts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: contactId, notes: newNotes })
    }).catch(() => null);
  };

  // Add Contact
  const handleAddContact = async (newContactData: Omit<Contact, 'id'>): Promise<string | null> => {
    const newId = `c_${Date.now()}`;
    const newContact: Contact = { ...newContactData, id: newId };
    setContacts(prev => [newContact, ...prev]);

    const newConvId = `conv_${newId}`;
    const newConv: Conversation = {
      id: newConvId,
      contactId: newId,
      contact: newContact,
      channel: newContact.channel,
      unreadCount: 0,
      lastMessage: 'Contacto registrado en XIO.',
      lastMessageTime: 'Ahora',
      status: 'open',
      assignedAgent: 'Asesor XIO'
    };

    setConversations(prev => [newConv, ...prev]);
    setMessagesMap(prev => ({
      ...prev,
      [newConvId]: [{
        id: `m_${Date.now()}`,
        conversationId: newConvId,
        sender: 'bot',
        senderName: 'XIO Engine',
        text: `Lead registrado vía ${newContact.channel.toUpperCase()}. Score inicial de IA: ${newContact.leadScore}%`,
        timestamp: 'Ahora',
        channel: newContact.channel,
        status: 'read'
      }]
    }));

    const revertOptimisticUpdate = () => {
      setContacts(prev => prev.filter(c => c.id !== newId));
      setConversations(prev => prev.filter(c => c.id !== newConvId));
      setMessagesMap(prev => {
        const rest = { ...prev };
        delete rest[newConvId];
        return rest;
      });
    };

    try {
      const res = await apiFetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact)
      });
      const resData = await res.json();
      if (!resData.success) {
        revertOptimisticUpdate();
        const mensaje = resData.details?.fieldErrors
          ? Object.values(resData.details.fieldErrors).flat().join(', ')
          : resData.error || 'No se pudo guardar el contacto';
        return mensaje;
      }
      return null;
    } catch {
      revertOptimisticUpdate();
      return 'No se pudo guardar el contacto (error de conexión)';
    }
  };
  // Create Segment
  const handleCreateSegment = async (newSegData: Omit<Segment, 'id' | 'createdAt' | 'contactCount'>) => {
    const newSeg: Segment = {
      ...newSegData,
      id: `seg_${Date.now()}`,
      // Placeholder; el numero real lo devuelve el servidor y sustituye a este
      // en cuanto llega la respuesta del POST.
      contactCount: 0,
      createdAt: new Date().toISOString().substring(0, 10)
    };
    setSegments(prev => [...prev, newSeg]);
    try {
      // `contactCount` y `createdAt` los calcula el servidor; mandarlos seria
      // escribir una metrica a mano, y el schema ya los rechaza.
      const { contactCount: _c, createdAt: _f, ...cuerpo } = newSeg;
      const res = await apiFetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo)
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.success && body.data) {
        setSegments(prev => prev.map(s => (s.id === newSeg.id ? (body.data as Segment) : s)));
      }
    } catch {
      // Se queda con el placeholder; el proximo GET /api/segments trae el
      // recuento real.
    }
  };
  const handleDeleteContact = async (contactId: string) => {
    const previos = contacts;
    const previasConvs = conversations;
    const previosMensajes = messagesMap;
    const previaActiva = activeConversationId;

    const convIds = conversations.filter(c => c.contactId === contactId).map(c => c.id);

    setContacts(prev => prev.filter(c => c.id !== contactId));
    setConversations(prev => prev.filter(c => c.contactId !== contactId));
    setMessagesMap(prev => {
      const next = { ...prev };
      convIds.forEach(id => delete next[id]);
      return next;
    });
    if (convIds.includes(activeConversationId)) {
      setActiveConversationId('');
    }

    try {
      const res = await apiFetch(`/api/contacts?id=${contactId}`, { method: 'DELETE' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('No tienes permisos para eliminar este contacto.');
        }
        if (res.status === 404) return; // Ya no existe en el servidor: la UI ya esta al dia.
        throw new Error('No se pudo eliminar el contacto. Intentalo de nuevo.');
      }
    } catch (err) {
      setContacts(previos);
      setConversations(previasConvs);
      setMessagesMap(previosMensajes);
      setActiveConversationId(previaActiva);
      setErrorMessage(err instanceof Error ? err.message : 'No se pudo eliminar el contacto. Intentalo de nuevo.');
    }
  };
  const handleDeleteContacts = async (contactIds: string[]) => {
    if (contactIds.length === 0) return;
    const idSet = new Set(contactIds);

    const previos = contacts;
    const previasConvs = conversations;
    const previosMensajes = messagesMap;
    const previaActiva = activeConversationId;

    const convIds = conversations.filter(c => idSet.has(c.contactId)).map(c => c.id);

    setContacts(prev => prev.filter(c => !idSet.has(c.id)));
    setConversations(prev => prev.filter(c => !idSet.has(c.contactId)));
    setMessagesMap(prev => {
      const next = { ...prev };
      convIds.forEach(id => delete next[id]);
      return next;
    });
    if (convIds.includes(activeConversationId)) {
      setActiveConversationId('');
    }

    try {
      const res = await apiFetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: contactIds }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('No tienes permisos para eliminar estos contactos.');
        }
        throw new Error('No se pudieron eliminar los contactos. Intentalo de nuevo.');
      }
    } catch (err) {
      setContacts(previos);
      setConversations(previasConvs);
      setMessagesMap(previosMensajes);
      setActiveConversationId(previaActiva);
      setErrorMessage(err instanceof Error ? err.message : 'No se pudieron eliminar los contactos. Intentalo de nuevo.');
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    const previas = campaigns;
    setCampaigns(prev => prev.filter(c => c.id !== campaignId));
    try {

      const res = await apiFetch(`/api/campaigns?id=${campaignId}`, { method: 'DELETE' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('No tienes permisos para eliminar esta campaña.');
        }
        if (res.status === 404) {
          // Ya no existe en el servidor: mantenemos la UI actualizada, sin error.
          return;
        }
        throw new Error('No se pudo eliminar la campaña. Inténtalo nuevamente.');
      }
    } catch (err) {
      setCampaigns(previas);
      setErrorMessage(err instanceof Error ? err.message : 'No se pudo eliminar la campaña. Inténtalo nuevamente.');
    }
  };

  const handleDeleteAutomation = async (automationId: string) => {
    const previas = automations;
    setAutomations(prev => prev.filter(a => a.id !== automationId));
    try {

      const res = await apiFetch(`/api/automations?id=${automationId}`, { method: 'DELETE' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('No tienes permisos para eliminar esta automatizacion.');
        }
        if (res.status === 404) return; // Ya no existe en el servidor: la UI ya esta al dia.
        throw new Error('No se pudo eliminar la automatizacion. Intentalo de nuevo.');
      }
    } catch (err) {
      setAutomations(previas);
      setErrorMessage(err instanceof Error ? err.message : 'No se pudo eliminar la automatizacion. Intentalo de nuevo.');
    }
  };
  const handleDeleteSegment = async (segmentId: string) => {
    const previos = segments;
    setSegments(prev => prev.filter(s => s.id !== segmentId));
    try {

      const res = await apiFetch(`/api/segments?id=${segmentId}`, { method: 'DELETE' });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error('No tienes permisos para eliminar este segmento.');
        }
        if (res.status === 404) return; // Ya no existe en el servidor: la UI ya esta al dia.
        throw new Error('No se pudo eliminar el segmento. Intentalo de nuevo.');
      }
    } catch (err) {
      setSegments(previos);
      setErrorMessage(err instanceof Error ? err.message : 'No se pudo eliminar el segmento. Intentalo de nuevo.');
    }
  };

  // Select Segment for Campaign
  const handleSelectSegmentForCampaign = (segmentId: string) => {
    setPreselectedSegmentForCampaign(segmentId);
    cambiarTab('campaigns');
  };

  // Guardar campaña. Guardar NO es enviar: la campaña nace siempre como
  // borrador y las métricas llegan del servidor (antes se inventaban aquí).
  // Devuelve el id para que la vista pueda pedir la previsualización.
  const handleCreateCampaign = async (
    newCampData: Omit<Campaign, 'id' | 'createdAt' | 'sentCount' | 'deliveredCount' | 'openRate' | 'clickRate' | 'conversions'>
  ): Promise<{ id: string | null; error?: string }> => {
    const id = `camp_${Date.now()}`;
    // Se respeta `scheduled` si el formulario lo pide; cualquier otra cosa
    // nace como borrador. Antes esto forzaba 'draft' siempre, lo que hacía
    // imposible programar una campaña desde la interfaz: el usuario elegía la
    // hora, el servidor recibía un borrador y la campaña no salía nunca.
    //
    // Que el cliente NO pueda pedir 'running' no depende de esta línea: el
    // route handler solo acepta draft/scheduled y para enviar hay que pasar
    // por /api/campaigns/[id]/send. Aquí solo se elige entre las dos formas
    // legítimas de guardar.
    const status = newCampData.status === 'scheduled' ? ('scheduled' as const) : ('draft' as const);
    const payload = { ...newCampData, id, status };
    console.log(payload)

    try {
      const res = await apiFetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => null);

      // El error del servidor se propaga a la interfaz. Antes esta llamada
      // terminaba en `.catch(() => null)`: la campaña aparecía en pantalla
      // aunque el guardado hubiera fallado, y el 500 solo se veía en la consola.
      if (!res.ok || !body?.success) {
        return { id: null, error: body?.error || `Error ${res.status} al guardar la campaña.` };
      }

      setCampaigns(prev => [body.data as Campaign, ...prev]);
      return { id: (body.data as Campaign).id };
    } catch {
      return { id: null, error: 'No se pudo contactar con el servidor.' };
    }
  };

  // Lanzar campaña: resuelve la audiencia en el servidor, registra los
  // destinatarios y arranca el envío. Solo se llama tras confirmar la
  // previsualización, porque no tiene vuelta atrás.
  const handleLaunchCampaign = async (
    campaignId: string
  ): Promise<{ ok: boolean; message: string; recipientCount?: number }> => {
    try {
      const res = await apiFetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.success) {
        return { ok: false, message: body?.error || 'No se pudo lanzar la campaña.' };
      }

      setCampaigns(prev =>
        prev.map(c => (c.id === campaignId ? { ...c, status: 'running' } : c))
      );

      return {
        ok: true,
        message: `Campaña lanzada a ${body.data.recipientCount} destinatarios.`,
        recipientCount: body.data.recipientCount
      };
    } catch {
      return { ok: false, message: 'No se pudo contactar con el servidor.' };
    }
  };

  // Previsualización: a cuántos contactos reales llegaría, sin enviar nada.
  const handlePreviewCampaign = async (campaignId: string): Promise<CampaignPreview | null> => {
    try {
      const res = await apiFetch(`/api/campaigns/${campaignId}/preview`);
      const body = await res.json().catch(() => null);
      return res.ok && body?.success ? (body.data as CampaignPreview) : null;
    } catch (e) {
      console.error('Preview: error de red', e)
      return null;
    }
  };

  // Toggle Automation Rule
  const handleToggleRule = (ruleId: string) => {
    setAutomations(prev => prev.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
  };

  // Simulate Rule Trigger
  const handleSimulateRuleTrigger = (ruleId: string) => {
    setAutomations(prev => prev.map(r => {
      if (r.id === ruleId) {
        return {
          ...r,
          triggerCount: r.triggerCount + 1,
          lastTriggered: 'Hace un momento'
        };
      }
      return r;
    }));
  };

  /**
   * Pone a cero el contador de no leidos al abrir una conversacion.
   *
   * Antes solo se reseteaba al ENVIAR un mensaje, asi que el globo de "18
   * nuevo" seguia ahi despues de haber leido el chat entero: para quitarlo
   * habia que contestar. Abrir la conversacion es justo lo que significa
   * haberla leido.
   *
   * Se actualiza el estado local primero para que el globo desaparezca al
   * instante, y se persiste despues: si solo se hiciera en memoria, el
   * contador volveria en cuanto se recargase la pagina, porque el valor llega
   * de /api/conversations.
   */
  const marcarConversacionLeida = (id: string) => {
    const conv = conversationsRef.current.find(c => c.id === id);
    // Sin no leidos no hay nada que hacer: evita un PUT por cada clic en la lista.
    if (!conv || !conv.unreadCount) return;

    setConversations(prev =>
      prev.map(c => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );

    // Sin await a proposito: abrir el chat no debe esperar a la red. Si falla,
    // el contador reaparece en la siguiente recarga, que es el comportamiento
    // de antes; no se pierde ningun mensaje.
    apiFetch('/api/conversations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, unreadCount: 0 }),
    }).catch(() => {
      /* El badge ya esta a cero en pantalla; se recuperara al recargar. */
    });
  };

  // Select Conversation by Contact ID
  const handleSelectConversationByContactId = (contactId: string) => {
    const conv = conversations.find(c => c.contactId === contactId);
    const params = new URLSearchParams(searchParams.toString())

    if (conv) {
      setActiveConversationId(conv.id);
      setActiveTab('inbox');
      marcarConversacionLeida(conv.id);
      params.set('id', conv.id)
      params.set('tab', 'inbox')
    } else {
      params.delete('id')
    }

    router.replace(`${pathname}?${params.toString()}`)
  };


  const handleSelectConversationId = (id: string) => {

    setActiveConversationId(id)
    marcarConversacionLeida(id)
    const params = new URLSearchParams(searchParams.toString())

    params.set('id', id)

    router.replace(`${pathname}?${params.toString()}`)
  }

  if (!mounted
    || !authChecked
  ) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-semibold tracking-wider text-emerald-400">Cargando XIO...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView onLoginSuccess={(user) => setCurrentUser(user)} />
  }


  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100 font-sans antialiased">

      {/* Aviso de error en acciones destructivas */}
      {errorMessage && (
        <div className="fixed top-0 inset-x-0 z-220 bg-rose-600 text-white shadow-md" role="alert">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-xs sm:text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-rose-700 font-bold">
              !
            </span>
            <p className="flex-1 font-semibold">{errorMessage}</p>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-base font-bold text-white/80 hover:text-white"
              aria-label="Cerrar aviso de error"
            >
              x
            </button>
          </div>
        </div>
      )}

      {/* Aviso: sin conexión a la base de datos, los datos son de ejemplo */}
      {dbDegraded && (
        <div className="fixed top-0 inset-x-0 z-210 bg-amber-500 text-amber-950 shadow-md">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-xs sm:text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-900 text-amber-50 font-bold">
              !
            </span>
            <p className="flex-1 font-semibold">
              Sin conexión a la base de datos. Los datos mostrados son de ejemplo y los cambios no se guardarán.
            </p>
            <button
              type="button"
              onClick={() => setDbDegraded(false)}
              className="text-base font-bold text-amber-900 hover:text-amber-950"
              aria-label="Cerrar aviso"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Aviso de error de WhatsApp (envio fallido, servicio caido, numero fuera de registro) */}
      {whatsappError && (
        <div className="fixed top-0 inset-x-0 z-220 bg-rose-600 text-white shadow-md" role="alert">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-xs sm:text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-rose-700 font-bold">
              !
            </span>
            <p className="flex-1 font-semibold">{whatsappError}</p>
            <button
              type="button"
              onClick={() => setWhatsappError(null)}
              className="text-base font-bold text-white/80 hover:text-white"
              aria-label="Cerrar aviso de WhatsApp"
            >
              x
            </button>
          </div>
        </div>
      )}


      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={cambiarTab}
        unreadTotal={unreadTotal}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          onLogout={logout}
          activeTab={activeTab}
          onSelectTab={cambiarTab}
          onOpenGithubModal={() => setIsGithubModalOpen(true)}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
          conversations={conversations}
          whatsappStatus={
            !isWhatsappSocketConnected
              ? 'inactive'
              : whatsappStatus?.connectionStatus === 'connected'
                ? 'active-session'
                : 'active-no-session'
          }
          sessionPhone={formatPhoneDisplay(getSessionPhone(whatsappStatus))}
          sessionName={getSessionName(whatsappStatus) || undefined}
          onConnectWhatsapp={() => setShowWhatsappModal(true)}
          onSelectConversationByContactId={handleSelectConversationByContactId}
        />

        {/* Tab Views Switcher */}
        <main className="flex-1 flex overflow-hidden">
          {activeTab === 'inbox' && (
            <InboxView
              canDeleteContacts={canDeleteContacts}
              conversations={visibleConversations}
              activeConversationId={activeConversationId}
              onSelectConversation={handleSelectConversationId}
              messagesMap={messagesMap}
              onSendMessage={handleSendMessage}
              onUpdateContactStage={handleUpdateContactStage}
              onUpdateContactTags={handleUpdateContactTags}
              onUpdateContactNotes={handleUpdateContactNotes}
              searchQuery={searchQuery}
              quickReplies={quickReplies}
              onUpdateQuickReplies={setQuickReplies}
              pathname={pathname}
              router={router}
              searchParams={searchParams}
              handleDeleteConversation={handleDeleteConversation}
              onDeleteContacts={handleDeleteContacts}
            />
          )}

          {activeTab === 'contacts' && (
            <ContactsView
              canDeleteContacts={canDeleteContacts}
              contacts={contacts}
              onDeleteContact={handleDeleteContact}
              onUpdateStage={handleUpdateContactStage}
              onToggleInteraction={handleToggleContactInteraction}
              onAddContact={handleAddContact}
              onSelectConversationByContactId={handleSelectConversationByContactId}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              conversations={conversations}
              messagesMap={messagesMap}
              onUpdateDealValue={handleUpdateDealValue}
            />
          )}

          {activeTab === 'segments' && (
            <SegmentsView
              segments={segments}
              onDeleteSegment={handleDeleteSegment}
              contacts={contacts}
              onCreateSegment={handleCreateSegment}
              onSelectSegmentForCampaign={handleSelectSegmentForCampaign}
            />
          )}

          {activeTab === 'campaigns' && (
            <CampaignsView
              campaigns={campaigns}
              onDeleteCampaign={handleDeleteCampaign}
              canDeleteCampaign={canDeleteCampaigns}
              segments={segments}
              onCreateCampaign={handleCreateCampaign}
              onPreviewCampaign={handlePreviewCampaign}
              onLaunchCampaign={handleLaunchCampaign}
              preselectedSegmentId={preselectedSegmentForCampaign}
            />
          )}

          {activeTab === 'automation' && (
            <AutomationView
              automations={automations}
              onDeleteAutomation={handleDeleteAutomation}
              onToggleRule={handleToggleRule}
              onSimulateRuleTrigger={handleSimulateRuleTrigger}
            />
          )}

          {activeTab === 'api-github' && (
            <ApiGithubView
              apiKeys={apiKeys}
              webhookConfig={webhookConfig}
              webhookLogs={webhookLogs}
              onOpenGithubModal={() => setIsGithubModalOpen(true)}

            />

          )}

          {activeTab === 'analytics' && (
            <AnalyticsView data={analyticsData} />
          )}
        </main>
      </div>

      {/* GitHub Export Modal */}
      <GithubModal
        isOpen={isGithubModalOpen}
        onClose={() => setIsGithubModalOpen(false)}
      />

      {/* WhatsApp Connect Modal */}

      {showWhatsappModal && (
        <div className="fixed inset-0 z-300 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowWhatsappModal(false)}
              aria-label="Cerrar ventana"
              className="absolute top-3 right-3 z-10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-slate-700 shadow-lg hover:bg-slate-100"
            >
              ×
            </button>

            <WhatsAppConnectView
              connectionStatus={whatsappStatus?.connectionStatus}
              qrData={whatsappStatus?.qrData}
              onRequestQr={handleRequestQr}
              onDisconnect={handleDisconnectWhatsapp}
            />
          </div>
        </div>
      )}

    </div>
  );
}


