import React, { useState, useEffect, useRef } from 'react';
import { Contact, Conversation, Message, PipelineStage, SocialChannel } from '../../types';
import {
  Users, Plus, Search, DollarSign, Sparkles, Mail, Tag, Trash2, 
  MessageCircle, Instagram, Sprout, Target,
  Briefcase, PartyPopper, XCircle, BarChart3, Star, Smartphone, User, ArrowRight, Inbox, RefreshCw, Settings, AlertCircle,
  FileText,
  XCircleIcon
} from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { contactCreateSchema, normalizarTelefonoPeru, primerErrorDeZod } from '@/lib/schemas';
import { apiFetch } from '@/lib/apiClient';
import { AI_MODEL_NAME } from '@/lib/constants';
import { WhatsAppIcon, XBrandIcon, MessengerIcon } from '@/components/Icons/ChannelIcons';
// Filas visibles por pagina en la vista "Tabla".
const TABLE_PAGE_SIZE = 20;

const getInitials = (name?: string | null): string => {
  const words = (name || "Desconocido").trim().split(/\s+/);

  return words
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join("");
};

const getAvatarColor = (name?: string | null): string => {
  const colors = [
    "bg-teal-700",
    "bg-purple-600",
    "bg-blue-600",
    "bg-orange-600",
    "bg-pink-600",
    "bg-indigo-600",
    "bg-rose-600",
    "bg-emerald-700",
  ];

  const hash = Array.from(name || "Desconocido")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);

  return colors[hash % colors.length];
};

interface ContactsViewProps {
  canDeleteContacts: boolean;
  contacts: Contact[];
  onUpdateStage: (contactId: string, stage: PipelineStage) => void;
  onUpdateDealValue: (
    contactId: string,
    dealValue: number
  ) => Promise<string | null>;
  onToggleInteraction?: (
    contactId: string,
    interactionKey: 'firstReply' | 'appointmentConfirmed' | 'proposalSent' | 'dealClosed'
  ) => void;
  onAddContact: (newContact: Omit<Contact, 'id'>) => Promise<string | null>;
  onSelectConversationByContactId: (contactId: string) => void;
  onDeleteContact: (contactId: string) => void;
  /** Estado de busqueda global compartido con el Header y el resto de vistas. */
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  conversations: Conversation[];
  messagesMap: Record<string, Message[]>;
}

// Etiqueta de canal con color + emoji. Definida a nivel de modulo para poder
// reutilizarla tanto en las vistas de escritorio como en la card movil.
const getChannelBadge = (channel: SocialChannel) => {
  switch (channel) {
    case 'whatsapp':
      return <span className="text-emerald-700 font-bold flex items-center gap-1"><WhatsAppIcon className="w-4 h-4 shrink-0" />WhatsApp</span>;
    case 'instagram':
      return <span className="text-pink-700 font-bold flex items-center gap-1"><Instagram className="w-4 h-4 shrink-0" /> Instagram</span>;
    case 'twitter':
      return <span className="text-black-600 font-bold flex items-center gap-1"><XBrandIcon className="w-4 h-4 shrink-0" /> X / Twitter</span>;
    case 'messenger':
      return <span className="text-blue-700 font-bold flex items-center gap-1"><MessengerIcon className="w-4 h-4 shrink-0" /> Messenger</span>;
    default:
      return <span className="text-purple-700 font-bold flex items-center gap-1"><Mail className="w-4 h-4 shrink-0" /> Email</span>;
  }
};


// Opciones del selector "mover a etapa". Antes estaban repetidas inline en el
// Kanban de escritorio; ahora se comparten con la card movil.
const STAGE_MOVE_OPTIONS: { value: PipelineStage; label: string }[] = [
  { value: 'lead', label: '🌱 Mover a Prospecto' },
  { value: 'qualified', label: '🎯 Mover a Cualificado' },
  { value: 'negotiation', label: '💼 Mover a Negociación' },
  { value: 'closed_won', label: '🎉 Mover a Ganada' },
  { value: 'closed_lost', label: '❌ Mover a Perdida' }
];

type InteractionKey = 'firstReply' | 'appointmentConfirmed' | 'proposalSent' | 'dealClosed';

// Fuente unica de las 4 interacciones del pipeline. `label` = texto visible en la
// card movil; `caption` = mini-etiqueta bajo la barra en el Kanban de escritorio;
// `aria` = nombre accesible del boton-barra (issue #33); `activeBar` = color de la
// barra cuando la interaccion esta marcada; `dot`/`onClass` estilos de la card movil.
const INTERACTIONS: {
  key: InteractionKey;
  label: string;
  caption: string;
  aria: string;
  activeBar: string;
  dot: string;
  onClass: string;
}[] = [
    { key: 'firstReply', label: '1ª Respuesta positiva', caption: '1ª Resp.', aria: '1ª interacción: respuesta positiva al primer mensaje (pasa a Cualificados)', activeBar: 'bg-red-600 ring-2 ring-red-400 shadow-xs', dot: 'bg-red-600', onClass: 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300' },
    { key: 'appointmentConfirmed', label: '2ª Cita confirmada', caption: '2ª Cita', aria: '2ª interacción: cita confirmada (pasa a Negociación)', activeBar: 'bg-yellow-400 ring-2 ring-yellow-300 shadow-xs', dot: 'bg-yellow-400', onClass: 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300' },
    { key: 'proposalSent', label: '3ª Propuesta enviada', caption: '3ª Prop.', aria: '3ª interacción: propuesta enviada', activeBar: 'bg-amber-500 ring-2 ring-amber-300 shadow-xs', dot: 'bg-amber-500', onClass: 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'},
    { key: 'dealClosed', label: '4ª Cierre / Pago', caption: '4ª Pago', aria: '4ª interacción: venta cerrada y pago confirmado', activeBar: 'bg-emerald-600 ring-2 ring-emerald-400 shadow-xs', dot: 'bg-emerald-600', onClass: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300' }
  ];



// Card compacta de contacto para viewports < lg. La usan tanto el Kanban movil
// (dentro de cada acordeon de etapa) como la vista Tabla movil, para no duplicar
// el markup ni la logica de acciones.
const MobileContactCard: React.FC<{
  canDeleteContacts: boolean;
  contact: Contact;
  onUpdateStage: ContactsViewProps['onUpdateStage'];
  onToggleInteraction?: ContactsViewProps['onToggleInteraction'];
  onSelectConversationByContactId: ContactsViewProps['onSelectConversationByContactId'];
  onDeleteContact: ContactsViewProps['onDeleteContact'];
  onEditPrice: (contact: Contact) => void;
  handleSummarizeConversation: (conv: Conversation, contact: Contact) => Promise<void>;
  isSummaryLoading: boolean;
  summaryWait: number;
  summaryData: {
    contactId: string;
    summary: string;
    keyIntent: string;
    suggestedNextAction: string;
  };
  setSummaryData: React.Dispatch<React.SetStateAction<{
    contactId: string;
    summary: string;
    keyIntent: string;
    suggestedNextAction: string;
  }>>;
  conversations: Conversation[];
}> = ({ canDeleteContacts, contact, onUpdateStage, onToggleInteraction, onSelectConversationByContactId, onDeleteContact, handleSummarizeConversation, isSummaryLoading, summaryWait, summaryData, setSummaryData, conversations, onEditPrice }) => {
  const [showDetails, setShowDetails] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const detailsId = `contact-details-${contact.id}`;

  return (
    <article className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs space-y-3 text-slate-800 dark:text-slate-100">
      {/* Cabecera: avatar + identidad + valor del deal */}
      <div className="flex items-start gap-3">
        <div
          className={`relative w-10 h-10 rounded-2xl ${getAvatarColor(contact.name)} flex items-center justify-center text-white font-bold text-xs border border-slate-200 shrink-0 shadow-2xs overflow-hidden`}
        >
          {getInitials(contact.name)}

          {contact.avatar && (
            <img
              src={contact.avatar}
              alt={contact.name}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-extrabold text-sm text-emerald-900 dark:text-emerald-300 truncate">{contact.name}</h4>
          {contact.company && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold truncate">🏢 {contact.company}</p>
          )}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
            {contact.email ? `📧 ${contact.email}` : `📱 ${contact.phone || contact.handle}`}
          </p>
          <div className="mt-1 text-[11px]">{getChannelBadge(contact.channel)}</div>
        </div>
        <span className="shrink-0 text-slate-900 dark:text-slate-100 font-black text-xs tracking-tight bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
          💰 ${contact.dealValue.toLocaleString()}
        </span>
      </div>

      {/* Estado actual + score IA */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-1">
          <button
            onClick={() => handleSummarizeConversation(conversations.find(c => c.contactId === contact.id), contact)}
            disabled={isSummaryLoading || summaryWait > 0}
            title={summaryWait > 0 ? `Límite de solicitudes excedido. Reintenta en ${summaryWait}s.` : undefined}
            className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="inline">
              {summaryWait > 0 ? `Espera ${summaryWait}s` : isSummaryLoading ? 'Analizando...' : 'Resumen IA'}
            </span>
          </button>
        </div>
        <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold rounded-full border border-emerald-200 dark:border-emerald-700">
          ⭐ IA {contact.leadScore}%
        </span>
        {summaryData && summaryData.contactId === contact.id && (
          <div className="p-4 bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/60 dark:to-slate-900 border-b border-emerald-200 dark:border-emerald-800 text-xs text-slate-800 dark:text-slate-200 justify-between shadow-2xs rounded-xl">
            <div className="space-y-1.5 flex items-center flex-col">
              <button
                onClick={() => setSummaryData(null)}
                aria-label="Cerrar resumen ejecutivo IA"
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 px-2 cursor-pointer"
              >
                <XCircleIcon className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-2 font-extrabold text-emerald-900 dark:text-emerald-300">
                <Sparkles className="w-4 h-4" />
                <span>Resumen Ejecutivo IA (XIO + {AI_MODEL_NAME}):</span>
              </div>
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed font-medium bg-white/60 dark:bg-slate-800/80 p-2 rounded-xl border border-emerald-100 dark:border-slate-700">{summaryData.summary}</p>
              <div className="flex flex-col justify-center items-start gap-4 text-[11px] text-slate-700 dark:text-slate-300 pt-0.5">
                <span className=""> <strong>Intención Principal:</strong> {summaryData.keyIntent}</span>
                <span className=""> <strong>Siguiente Acción:</strong> {summaryData.suggestedNextAction}</span>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Etiquetas */}
      {contact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {contact.tags.slice(0, 3).map(t => (
            <span key={t} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10px] rounded-md font-bold border border-slate-200 dark:border-slate-600">
              🏷️ {t}
            </span>
          ))}
        </div>
      )}

      {/* Cambio de estado (equivalente tactil al drag & drop del Kanban) */}
      <select
        value={contact.stage}
        onChange={(e) => onUpdateStage(contact.id, e.target.value as PipelineStage)}
        aria-label={`Cambiar etapa de ${contact.name}`}
        className="w-full text-xs p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
      >
        {STAGE_MOVE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Acciones principales */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSelectConversationByContactId(contact.id)}
          className="flex-1 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-extrabold rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs transition-colors cursor-pointer"
        >
          💬 Abrir Chat
        </button>
        <button
          type="button"
          onClick={() => setShowDetails(v => !v)}
          aria-expanded={showDetails}
          aria-controls={detailsId}
          aria-label={showDetails ? `Ocultar detalles de ${contact.name}` : `Ver detalles de ${contact.name}`}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
        </button>
        {contact.stage === 'negotiation' && (
          <button
            type="button"
            onClick={() => onEditPrice(contact)}
            title={`Modificar precio de ${contact.name}`}
            aria-label={`Modificar precio de ${contact.name}`}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
        {canDeleteContacts && (
          <button
            type="button"
            onClick={() => setContactToDelete(contact)}
            aria-label={`Eliminar a ${contact.name}`}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN DE CONTACTO */}
      <Modal
        isOpen={contactToDelete != null}
        onClose={() => setContactToDelete(null)}
        title="🗑️ Eliminar contacto"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setContactToDelete(null)}
            >
              Cancelar
            </Button>

            <Button
              variant="danger"
              onClick={() => {
                if (contactToDelete) {
                  onDeleteContact(contactToDelete.id);
                  setContactToDelete(null);
                }
              }}
            >
              Eliminar contacto
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-md text-black dark:text-slate-200">
            ¿Estás seguro de que deseas eliminar {contactToDelete ? contactToDelete.name : ''}?
          </p>

          {contactToDelete && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl">
              <p className="text-md font-extrabold text-red-800 dark:text-red-300">
                {contactToDelete.name}
              </p>
            </div>
          )}

          <p className="text-md text-black dark:text-slate-300">
            Esta acción no se puede deshacer.
          </p>
        </div>
      </Modal>

      {/* Detalle expandible: interacciones + contacto secundario */}
      {showDetails && (
        <div id={detailsId} className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-3 animate-fadeIn">
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">🔄 Interacciones</p>
            <div className="grid grid-cols-2 gap-2">
              {INTERACTIONS.map(it => {
                const active = !!contact.interactions?.[it.key];
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => onToggleInteraction && onToggleInteraction(contact.id, it.key)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 min-w-0 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold text-left transition-colors cursor-pointer ${
                      active
                        ? it.onClass
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${active ? it.dot : 'bg-slate-300'}`} />
                    <span className="leading-tight">{it.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {(contact.phone || contact.email) && (
            <div className="text-[11px] text-slate-500 font-mono space-y-0.5">
              {contact.phone && <p>📱 {contact.phone}</p>}
              {contact.email && <p>📧 {contact.email}</p>}
            </div>
          )}
        </div>
      )}
    </article>
  );
};

export const ContactsView: React.FC<ContactsViewProps> = ({
  canDeleteContacts,
  contacts,
  onUpdateStage,
  onUpdateDealValue,
  onToggleInteraction,
  onAddContact,
  onSelectConversationByContactId,
  onDeleteContact,
  searchQuery,
  setSearchQuery,
  conversations,
  messagesMap
}) => {
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addContactError, setAddContactError] = useState<string | null>(null);
  const [isSavingContact, setIsSavingContact] = useState<boolean>(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [contactEditingPrice, setContactEditingPrice] = useState<Contact | null>(null);
  const [newDealValue, setNewDealValue] = useState('');
  const [isSavingDealValue, setIsSavingDealValue] = useState(false);
  const [dealValueError, setDealValueError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // En la vista tabla la seleccion es explicita: se activa con el boton
  // "Seleccionar" para no marcar contactos sin querer al hacer clic. El
  // Kanban no lo necesita porque su clic en la tarjeta ya es la accion.
  const [tableSelectionMode, setTableSelectionMode] = useState(false);

  const handleSaveDealValue = async () => {
    if (!contactEditingPrice) return;

    const value = Number(newDealValue);

    if (
      newDealValue.trim() === '' ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      setDealValueError('Ingresa un monto válido, mayor o igual a cero.');
      return;
    }

    setIsSavingDealValue(true);
    setDealValueError(null);

    try {
      // Aplica el mismo precio a todos los seleccionados en negociacion. Si no
      // hay seleccion multiple activa, cae al contacto que abrio el modal.
      const idsToUpdate = negotiationSelected.length > 0
        ? negotiationSelected.map(c => c.id)
        : [contactEditingPrice.id];

      for (const id of idsToUpdate) {
        await onUpdateDealValue(id, Math.round(value * 100) / 100);
      }

      setSelectedIds(new Set());
      setContactEditingPrice(null);
    } catch {
      setDealValueError('No se pudo guardar el nuevo precio.');
    } finally {
      setIsSavingDealValue(false);
    }
  };
  const [summaryData, setSummaryData] = useState<{ contactId: string; summary: string; keyIntent: string; suggestedNextAction: string } | null>(null);
  const [summaryWait, startSummaryWait] = useRetryCountdown();
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(false);

  // Etapas expandidas en el acordeon movil. Por defecto solo la primera etapa
  // esta abierta para no generar una pantalla excesivamente larga.
  const [openStages, setOpenStages] = useState<Set<PipelineStage>>(() => new Set<PipelineStage>(['lead']));

  function useRetryCountdown(): [number, (seconds: number) => void] {
    const [secondsLeft, setSecondsLeft] = useState<number>(0);

    useEffect(() => {
      if (secondsLeft <= 0) return;
      const intervalId = setInterval(() => {
        setSecondsLeft(prev => (prev <= 1 ? 0 : prev - 1));
      }, 1000);
      return () => clearInterval(intervalId);
    }, [secondsLeft]);

    const start = (seconds: number) => {
      setSecondsLeft(Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 0);
    };

    return [secondsLeft, start];
  }


  const handleSummarizeConversation = async (conv: Conversation, contact: Contact) => {
    if (!conv || !contact || summaryWait > 0) return;
    setIsSummaryLoading(true);

    const activeMessages = messagesMap[conv.id] || [];

    try {
      const response = await apiFetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: activeMessages.map(m => ({ sender: m.sender, text: m.text })),
          contactName: contact.name
        })
      });

      const resData = await response.json();

      if (!resData.success && response.status === 429) {
        const retrySeconds =
          Number(resData.retryAfter) || Number(response.headers.get('Retry-After')) || 1;
        startSummaryWait(retrySeconds);
      }

      if (resData.success && resData.data) {
        startSummaryWait(0);
        setSummaryData({ contactId: contact.id, ...resData.data });
      }
    } catch (err) {
      console.error('Error summarizing conversation:', err);
    } finally {
      setIsSummaryLoading(false);
    }
  };

  // Helper to get channel color label with icon
  const getChannelBadge = (channel: SocialChannel) => {
    switch (channel) {
      case 'whatsapp':
        return <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1"><WhatsAppIcon className="w-5 h-5 shrink-0" /> WhatsApp</span>;
      case 'instagram':
        return <span className="text-pink-700 dark:text-pink-400 font-bold flex items-center gap-1"><Instagram className="w-5 h-5 shrink-0" /> Instagram</span>;
      case 'twitter':
        return <span className="text-black dark:text-slate-100 font-bold flex items-center gap-1 whitespace-nowrap"><XBrandIcon className="w-5 h-5 shrink-0" /> X /Twitter</span>;
      case 'messenger':
        return <span className="text-blue-700 dark:text-blue-400 font-bold flex items-center gap-1"><MessengerIcon className="w-5 h-5 shrink-0" /> Messenger</span>;
      default:
        return <span className="text-purple-700 dark:text-purple-400 font-bold flex items-center gap-1"><Mail className="w-5 h-5 shrink-0" /> Email</span>;
    }
  }

  const toggleStage = (id: PipelineStage) => {
    setOpenStages(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // New Contact Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    channel: 'whatsapp' as SocialChannel,
    dealValue: 2400,
    stage: 'lead' as PipelineStage,
    tags: 'VIP, WhatsApp, Cotización Activa',
    company: ''
  });

  const stages: { id: PipelineStage; label: string; icon: React.ElementType; color: string; bgColor: string; badgeColor: string }[] = [
    {
      id: 'lead',
      label: 'Prospectos Iniciales',
      icon: Sprout,
      color: 'border-slate-300 dark:border-slate-700',
      bgColor: 'bg-slate-50/90 dark:bg-slate-900',
      badgeColor: 'bg-slate-200 text-slate-800'
    },
    {
      id: 'qualified',
      label: 'Cualificados',
      icon: Target,
      color: 'border-blue-400 dark:border-blue-700',
      bgColor: 'bg-blue-50/70 dark:bg-blue-950/40',
      badgeColor: 'bg-blue-200 text-blue-900'
    },
    {
      id: 'negotiation',
      label: 'En Negociación',
      icon: Briefcase,
      color: 'border-amber-400 dark:border-amber-700',
      bgColor: 'bg-amber-50/70 dark:bg-amber-950/30',
      badgeColor: 'bg-amber-200 text-amber-900'
    },
    {
      id: 'closed_won',
      label: 'Venta Ganada',
      icon: PartyPopper,
      color: 'border-emerald-500 dark:border-emerald-700',
      bgColor: 'bg-emerald-50/85 dark:bg-emerald-950/30',
      badgeColor: 'bg-emerald-200 text-emerald-900'
    },
    {
      id: 'closed_lost',
      label: 'Perdidos',
      icon: XCircle,
      color: 'border-rose-300 dark:border-rose-800',
      bgColor: 'bg-rose-50/50 dark:bg-rose-950/30',
      badgeColor: 'bg-rose-200 text-rose-900'
    }
  ];

  // Filter Contacts
  const filteredContacts = contacts.filter(c => {
    const matchesChannel = selectedChannel === 'all' || c.channel === selectedChannel;
    const matchesSearch = !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesChannel && matchesSearch;
  });

  // Calculate Totals
  const totalPipelineValue = filteredContacts.reduce((acc, c) => acc + c.dealValue, 0);
  const totalWonValue = filteredContacts.filter(c => c.stage === 'closed_won').reduce((acc, c) => acc + c.dealValue, 0);

  const selectedContacts = filteredContacts.filter(c => selectedIds.has(c.id));
  const negotiationSelected = selectedContacts.filter(c => c.stage === 'negotiation');
  // Los seleccionados de otras etapas no entran al guardado: avisamos en vez de
  // ignorarlos en silencio, para que el usuario sepa a cuantos contactos afecta.
  const nonNegotiationSelected = selectedContacts.filter(c => c.stage !== 'negotiation');

  const hasNegotiation = negotiationSelected.length > 0;
  const selectedCount = selectedIds.size;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

    // Selección múltiple por arrastre en el Kanban
  const isDraggingSelectionRef = useRef(false);
  const dragStartContactIdRef = useRef<string | null>(null);
  const dragInitialSelectionRef = useRef<Set<string>>(new Set());
  const dragVisitedRef = useRef<Set<string>>(new Set());
  const hasDraggedSelectionRef = useRef(false);

  // Iniciar el arrastre
  const startContactDrag = (contactId: string) => {
    isDraggingSelectionRef.current = true;
    dragStartContactIdRef.current = contactId;

    // Guardar selección original antes del arrastre
    dragInitialSelectionRef.current = new Set(selectedIds);

    // Reiniciar contactos recorridos
    dragVisitedRef.current = new Set();

    hasDraggedSelectionRef.current = false;
  };

  // Cambiar la selección de cada contacto una sola vez
  const toggleContactDuringDrag = (contactId: string) => {
    if (dragVisitedRef.current.has(contactId)) return;

    dragVisitedRef.current.add(contactId);

    const wasSelected =
      dragInitialSelectionRef.current.has(contactId);

    setSelectedIds(prev => {
      const next = new Set(prev);

      if (wasSelected) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }

      return next;
    });
  };

  // Seleccionar o deseleccionar al pasar sobre otra tarjeta
  const enterContactDuringDrag = (contactId: string) => {
    if (!isDraggingSelectionRef.current) return;

    const startId = dragStartContactIdRef.current;

    if (!startId || startId === contactId) return;

    hasDraggedSelectionRef.current = true;

    // Incluir también el contacto donde comenzó el arrastre
    toggleContactDuringDrag(startId);

    // Cambiar la selección del contacto atravesado
    toggleContactDuringDrag(contactId);
  };

  // Detener el arrastre al soltar el mouse
  useEffect(() => {
    const stopDragging = () => {
      isDraggingSelectionRef.current = false;
      dragStartContactIdRef.current = null;
    };

    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);

    return () => {
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('blur', stopDragging);
    };
  }, []);

  // Paginacion de la vista "Tabla" (el Kanban no se pagina: agrupa por etapa).
  const [tablePage, setTablePage] = useState(1);
  const tablePageCount = Math.max(1, Math.ceil(filteredContacts.length / TABLE_PAGE_SIZE));
  const safeTablePage = Math.min(tablePage, tablePageCount);
  const pagedContacts = filteredContacts.slice(
    (safeTablePage - 1) * TABLE_PAGE_SIZE,
    safeTablePage * TABLE_PAGE_SIZE
  );

  // Volver a la primera pagina cuando cambian los filtros o la vista. Se
  // ajusta durante el render (patron recomendado por React) en vez de en un
  // efecto. Si la pagina queda fuera de rango (p. ej. al borrar contactos),
  // `safeTablePage` ya la acota.
  const tableFilterKey = `${searchQuery}|${selectedChannel}|${viewMode}`;
  const [prevTableFilterKey, setPrevTableFilterKey] = useState(tableFilterKey);
  if (tableFilterKey !== prevTableFilterKey) {
    setPrevTableFilterKey(tableFilterKey);
    setTablePage(1);
  }

  const trimmedName = formData.name.trim();
  const trimmedPhone = formData.phone.trim();
  const trimmedEmail = formData.email.trim();
  // El boton no se deshabilita por falta de telefono o correo: si lo hiciera,
// el formulario no explicaria nunca por que no se puede guardar. Se deja
// activo y el mensaje aparece al pulsar, en la caja de error de arriba.
const isNewContactFormValid = trimmedName.length > 0;

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!trimmedName) {
      setAddContactError('El nombre es obligatorio.');
      return;
    }
    if (!trimmedPhone && !trimmedEmail) {
      setAddContactError('Agrega al menos un teléfono o un correo para poder contactar al lead.');
      return;
    }
    // Peru: 9 digitos y el +51 se pone solo. Un numero de otro pais se
    // escribe con su '+' delante. Cualquier otra cosa se rechaza aqui y no
    // despues, cuando el lead ya esta guardado con un numero imposible.
    const telefonoNormalizado = normalizarTelefonoPeru(trimmedPhone);
    // El campo ya muestra el +51 fijo y no deja pasar mas de 9 digitos, asi
    // que el unico error posible es que falten. No hace falta explicar el
    // formato: se ve en la pantalla.
    if (trimmedPhone && !telefonoNormalizado) {
      setAddContactError('Por favor ingrese un numero valido.');
      return;
    }
    if (!telefonoNormalizado && !trimmedEmail) {
      setAddContactError('El correo no es válido. Revisa que tenga el formato correcto.');
      return;
    }

    const candidate = {
      name: trimmedName,
      avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
      // El handle se deriva del telefono o del correo, y ambos son obligatorios
      // (uno de los dos), asi que ya no hace falta el '@nuevo_lead'. Ademas
      // `handle` es unico en Postgres: el segundo contacto sin telefono reventaba
      // con un 500 en vez de un 400 con mensaje util.
      handle: telefonoNormalizado || trimmedEmail,
      phone: telefonoNormalizado,
      email: trimmedEmail,
      channel: formData.channel,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      sentiment: 'positive' as const,
      leadScore: Math.floor(Math.random() * 30) + 65,
      stage: formData.stage,
      dealValue: Number(formData.dealValue) || 2400,
      notes: 'Contacto registrado en XIO.',
      lastActive: 'Ahora',
      company: formData.company.trim() || 'Empresa'
    };

    // Mismo schema que usa el backend: si esto pasa, el backend no debería rechazarlo
    // por formato, y el mensaje de error (si lo hay) es idéntico al que daría el servidor.
    const parsed = contactCreateSchema.safeParse(candidate);
    if (!parsed.success) {
      setAddContactError(primerErrorDeZod(parsed.error));
      return;
    }

    setAddContactError(null);
    setIsSavingContact(true);

    const error = await onAddContact(candidate);

    setIsSavingContact(false);

    if (error) {
      // Se queda en el modal para que el usuario corrija el dato, con el error corto ahí mismo.
      setAddContactError(error);
      return;
    }

    setIsAddModalOpen(false);
    setFormData({
      name: '',
      phone: '',
      email: '',
      channel: 'whatsapp',
      dealValue: 2400,
      stage: 'lead',
      tags: 'VIP, WhatsApp, Cotización Activa',
      company: ''
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans">
      {/* Top Header / Stats */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              <span>Embudo de Ventas Kanban - XIO</span>
            </h2>
            <span className="px-3 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold rounded-full border border-emerald-300 dark:border-emerald-800 shadow-2xs flex items-center gap-1">
              <Users className="w-3 h-3" /> {filteredContacts.length} Clientes Sincronizados
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5" /> Organiza tus prospectos capturados en WhatsApp Web, Instagram y X/Twitter con flujos automáticos.
          </p>
        </div>

        {/* Pipeline Totals & Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs shadow-2xs w-full sm:w-auto justify-between">
            <div>
              <span className="text-slate-400 font-bold block text-[10px] uppercase tracking-wider">TOTAL PIPELINE:</span>
              <span className="font-black text-slate-900 dark:text-slate-100 text-sm">${totalPipelineValue.toLocaleString()} USD</span>
            </div>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-600" />
            <div>
              <span className="text-slate-400 font-bold block text-[10px] uppercase tracking-wider">VENTAS GANADAS:</span>
              <span className="font-black text-emerald-600 text-sm">${totalWonValue.toLocaleString()} USD</span>
            </div>
          </div>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${viewMode === 'kanban'
                ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs scale-102'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
            >
              <span>Kanban</span>
            </button>
            <button
              onClick={() => {
                setViewMode('table');
                setTableSelectionMode(false);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${viewMode === 'table'
                ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs scale-102'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
            >
              <span>Tabla</span>
            </button>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-black shadow-sm shadow-emerald-700/20 transition-all cursor-pointer hover:scale-102 active:scale-98"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuevo Lead / Cliente</span>
            <Sparkles className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
        <div className="px-4 lg:px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center gap-3">        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 w-full">
          <div className="relative w-full lg:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, tag o empresa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium"            />
          </div>

          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="w-full sm:w-auto px-3.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-extrabold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="all">Todos los Canales</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="twitter">X/Twitter</option>
            <option value="messenger">Messenger</option>
          </select>

          {viewMode === 'table' && (
            tableSelectionMode ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                  {selectedCount} seleccionados
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTableSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="h-7 px-2.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300/60 dark:border-slate-700 cursor-pointer transition-all"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setTableSelectionMode(true)}
                className="h-7 px-2.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300/60 dark:border-slate-700 cursor-pointer transition-all"
              >
                Seleccionar
              </button>
            )
          )}
        </div>
      </div>

      {/* MAIN VIEW CONTENT */}
      <div className="flex-1 p-4 lg:p-6 overflow-y-auto overflow-x-hidden lg:overflow-x-auto">
        {viewMode === 'kanban' ? (
          <>
            {/* KANBAN BOARD - DESKTOP (>= lg) */}
            <div className="hidden lg:flex gap-4 min-w-1100px h-full items-start">
              {stages.map(stg => {
                const stageContacts = filteredContacts.filter(c => c.stage === stg.id);
                const stageTotal = stageContacts.reduce((acc, c) => acc + c.dealValue, 0);

                return (
                  <div
                    key={stg.id}
                    className={`w-72 flex flex-col max-h-full rounded-2xl border ${stg.color} ${stg.bgColor} p-3.5 shrink-0 shadow-sm`}
                  >
                    {/* Column Header */}
                    <div className="flex items-start justify-between mb-3 px-1">
                      <div>
                        <h3 className="font-extrabold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <stg.icon className="w-3.5 h-3.5" />
                          <span>{stg.label}</span>
                          <span className={`w-5 h-5 rounded-full ${stg.badgeColor} text-[10px] font-black flex items-center justify-center border border-black/10 shadow-2xs`}>
                            {stageContacts.length}
                          </span>
                        </h3>

                        <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          ${stageTotal.toLocaleString()} USD
                        </p>
                      </div>
                    </div>

                    {/* Cards List */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {stageContacts.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 dark:text-slate-400 text-xs border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-white/60 dark:bg-slate-800/60 font-medium flex flex-col items-center gap-1.5">
                          <Inbox className="w-4 h-4" />
                          Sin clientes en esta etapa
                        </div>
                      ) : (
                        stageContacts.map(contact => (
                          <div
                          key={contact.id}

                          // Iniciar selección por arrastre
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;

                            const target = e.target as HTMLElement;

                            // No interferir con los botones internos
                            if (
                              target.closest(
                                'button, a, select, textarea, label, input:not([type="checkbox"])'
                              )
                            ) return;

                            startContactDrag(contact.id);

                            // Evitar seleccionar texto o arrastrar imágenes
                            if (
                              !(
                                target instanceof HTMLInputElement &&
                                target.type === 'checkbox'
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}

                          // Seleccionar o deseleccionar al atravesar la tarjeta
                          onMouseEnter={(e) => {
                            if ((e.buttons & 1) === 0) return;

                            enterContactDuringDrag(contact.id);
                          }}

                          // Mantener la selección individual por clic
                          onClick={(e) => {
                            const target = e.target as HTMLElement;

                            if (
                              target.closest(
                                'button, a, input, select, textarea, label'
                              )
                            ) return;

                            // Evitar un clic adicional después del arrastre
                            if (hasDraggedSelectionRef.current) return;

                            toggleSelect(contact.id);
                          }}

                          role="checkbox"
                          aria-checked={selectedIds.has(contact.id)}
                          aria-label={`Seleccionar ${contact.name}`}
                          tabIndex={0}

                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              toggleSelect(contact.id);
                            }
                          }}

                          className={`p-2 flex flex-col items-center bg-white dark:bg-slate-800 border rounded-2xl shadow-xs hover:shadow-md space-y-2 cursor-pointer transition-transform active:scale-[0.99] select-none ${
                            selectedIds.has(contact.id)
                              ? 'border-emerald-400 dark:border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-700/50'
                              : 'border-slate-200/90 dark:border-slate-700'
                          }`}
                        >
                            <div className="grid grid-cols-3 items-center w-full mb-1">
                              <span />
                              <div className="justify-self-center">
                                {getChannelBadge(contact.channel)}
                              </div>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(contact.id)}
                                onChange={() => {
                                  if (hasDraggedSelectionRef.current) return;
                                  toggleSelect(contact.id);
                                }}
                                aria-label={`Seleccionar ${contact.name}`}
                                className="w-4 h-4 justify-self-end rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                            </div>
                            {/* Top Section: Avatar + Name/Phone/Channel on Left, Monetary Value on Top Right */}
                            <div className="flex items-start justify-between gap-2">

                              <div className="flex flex-wrap items-start gap-2.5 min-w-0 flex-1">
                                <div
                                  className={`relative w-10 h-10 rounded-2xl ${getAvatarColor(contact.name)} flex items-center justify-center text-white font-bold text-xs border border-slate-200 shrink-0 shadow-2xs overflow-hidden`}
                                >
                                  {getInitials(contact.name)}

                                  {contact.avatar && (
                                    <img
                                      src={contact.avatar}
                                      alt={contact.name}
                                      className="absolute inset-0 w-full h-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                      }}
                                    />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h4 className="font-extrabold text-xs text-emerald-900 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-emerald-200 transition-colors truncate">                                    {contact.name}
                                  </h4>
                                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tracking-tight flex items-center gap-1">
                                    <Smartphone className="w-2.5 h-2.5" /> {contact.phone || contact.handle}
                                  </p>

                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-2 shrink-0">

                                {/* Precio actual */}
                                <span className="text-slate-900 dark:text-slate-100 font-black text-xs tracking-tight bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                                  <DollarSign className="w-3 h-3" />
                                  ${contact.dealValue.toLocaleString()}
                                </span>

                                <div className="flex items-center gap-1">

                                  {/* Editar precio: solo En Negociación */}
                                  {contact.stage === 'negotiation' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setContactEditingPrice(contact);
                                        setNewDealValue(String(contact.dealValue));
                                        setDealValueError(null);
                                      }}
                                      title={`Modificar precio de ${contact.name}`}
                                      aria-label={`Modificar precio de ${contact.name}`}
                                      className="p-1 rounded-lg text-slate-400 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                  )}

                                  {/* Eliminar contacto */}
                                  {canDeleteContacts && (
                                    <button
                                      type="button"
                                      onClick={() => setContactToDelete(contact)}
                                      title={`Eliminar contacto ${contact.name}`}
                                      aria-label={`Eliminar contacto ${contact.name}`}
                                      className="p-1 rounded-lg text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}

                                </div>
                              </div>
                            </div>

                            {/* 4 Interaction Indicator Boxes & Score Pill */}
                            <div className="flex flex-row items-center justify-between gap-1.5 pt-0.5">
                              <div className="flex items-start gap-1">
                                <button
                                  onClick={() => handleSummarizeConversation(conversations.find(c => c.contactId === contact.id), contact)}
                                  disabled={isSummaryLoading || summaryWait > 0}
                                  title={summaryWait > 0 ? `Límite de solicitudes excedido. Reintenta en ${summaryWait}s.` : undefined}
                                  className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span className="hidden md:inline">
                                    {summaryWait > 0 ? `Espera ${summaryWait}s` : isSummaryLoading ? 'Analizando...' : 'Resumen IA'}
                                  </span>
                                </button>
                              </div>

                              {/* Score Pill Badge */}
                              <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold rounded-full border border-emerald-300 dark:border-emerald-700 shadow-2xs flex items-center gap-1">
                                <Star className="w-2.5 h-2.5" /> IA: {contact.leadScore}%
                              </span>
                            </div>

                            {summaryData && summaryData.contactId === contact.id && (
                              <div className="p-4 bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/60 dark:to-slate-900 border-b border-emerald-200 dark:border-emerald-800 text-xs text-slate-800 dark:text-slate-200 justify-between shadow-2xs rounded-xl">
                                <div className="space-y-1.5 flex items-center flex-col">
                                  <button
                                    onClick={() => setSummaryData(null)}
                                    aria-label="Cerrar resumen ejecutivo IA"
                                    className="text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 px-2 cursor-pointer"
                                  >
                                    <XCircleIcon className="w-3.5 h-3.5" />
                                  </button>
                                  <div className="flex items-center gap-2 font-extrabold text-emerald-900 dark:text-emerald-300">
                                    <Sparkles className="w-4 h-4" />
                                    <span>Resumen Ejecutivo IA (XIO + {AI_MODEL_NAME}):</span>
                                  </div>
                                  <p className="text-slate-700 dark:text-slate-200 leading-relaxed font-medium bg-white/60 dark:bg-slate-800/80 p-2 rounded-xl border border-emerald-100 dark:border-slate-700">{summaryData.summary}</p>
                                  <div className="flex flex-col justify-center items-start gap-4 text-[11px] text-slate-700 dark:text-slate-300 pt-0.5">
                                    <span className=""> <strong>Intención Principal:</strong> {summaryData.keyIntent}</span>
                                    <span className=""> <strong>Siguiente Acción:</strong> {summaryData.suggestedNextAction}</span>
                                  </div>
                                </div>

                              </div>
                            )}

                            {/* Tags */}
                            <div className="flex items-center felx-row gap-1">
                              {contact.tags.slice(0, 2).map(t => (
                                <span key={t} className="p-1 bg-slate-100 dark:bg-slate-700 text-center text-slate-800 dark:text-slate-200 text-[10px] rounded-md font-bold border border-slate-200 dark:border-slate-600 flex items-center gap-1">
                                  <Tag className="w-2.5 h-2.5" /> {t}
                                </span>
                              ))}
                            </div>

                            {/* Quick Stage Change Controls */}
                            <div className="pt-2 flex flex-col items-center justify-center gap-2 border-t border-slate-100 dark:border-slate-700">
                              <select
                                value={contact.stage}
                                onChange={(e) => onUpdateStage(contact.id, e.target.value as PipelineStage)}
                                className="text-[10px] p-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              >
                                <option value="lead">Mover a Prospecto</option>
                                <option value="qualified">Mover a Cualificado</option>
                                <option value="negotiation">Mover a Negociación</option>
                                <option value="closed_won">Mover a Ganada</option>
                                <option value="closed_lost">Mover a Perdida</option>
                              </select>
                              <button
                                onClick={() => onSelectConversationByContactId(contact.id)}
                                className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                              >
                                <WhatsAppIcon className="w-18px h-18px" /><span>WhatsApp</span><ArrowRight className="w-18px h-18px" />
                              </button>


                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* KANBAN - MOBILE / TABLET (< lg): acordeon de una sola columna por etapa */}
            <div className="lg:hidden space-y-3">
              {stages.map(stg => {
                const stageContacts = filteredContacts.filter(c => c.stage === stg.id);
                const stageTotal = stageContacts.reduce((acc, c) => acc + c.dealValue, 0);
                const isOpen = openStages.has(stg.id);
                const panelId = `stage-panel-${stg.id}`;

                return (
                  <section key={stg.id} className={`rounded-2xl border ${stg.color} ${stg.bgColor}`}>
                    <h3>
                      <button
                        type="button"
                        onClick={() => toggleStage(stg.id)}
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        className="w-full flex items-center justify-between gap-2 p-3.5 text-left cursor-pointer"
                      >
                        <span className="flex items-center gap-2 font-extrabold text-xs text-slate-900 dark:text-slate-100 min-w-0">
                          <span className="text-base shrink-0">{/*stg.emoji*/}</span>
                          <span className="truncate">{stg.label}</span>
                          <span className={`min-w-5 h-5 px-1 rounded-full ${stg.badgeColor} text-[10px] font-black flex items-center justify-center border border-black/10 shadow-2xs shrink-0`}>
                            {stageContacts.length}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 hidden sm:inline">
                            ${stageTotal.toLocaleString()}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </span>
                      </button>
                    </h3>

                    {isOpen && (
                      <div id={panelId} className="p-3.5 pt-0 space-y-3">
                        <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 sm:hidden">
                          ${stageTotal.toLocaleString()} USD
                        </p>
                        {stageContacts.length === 0 ? (
                          <div className="p-6 text-center text-slate-400 dark:text-slate-400 text-xs border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-white/60 dark:bg-slate-800/60 font-medium">
                            Sin clientes en esta etapa
                          </div>
                        ) : (
                          stageContacts.map(contact => (
                            <MobileContactCard
                              key={contact.id}
                              canDeleteContacts={canDeleteContacts}
                              contact={contact}
                              onUpdateStage={onUpdateStage}
                              onToggleInteraction={onToggleInteraction}
                              onSelectConversationByContactId={onSelectConversationByContactId}
                              onDeleteContact={onDeleteContact}
                              handleSummarizeConversation={handleSummarizeConversation}
                              isSummaryLoading={isSummaryLoading}
                              summaryWait={summaryWait}
                              summaryData={summaryData}
                              setSummaryData={setSummaryData}
                              conversations={conversations}
                              onEditPrice={(contact) => {
                                setContactEditingPrice(contact);
                                setNewDealValue(String(contact.dealValue));
                                setDealValueError(null);
                              }}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        ) : (
          /* TABLE VIEW */
          <div className="w-full max-w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs">
            <div className="max-h-[45dvh] lg:max-h-[calc(100dvh-320px)] overflow-x-scroll overflow-y-auto">
              <table className="w-full min-w-1050px text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-black uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-3.5"><span className="flex items-center gap-1"><User className="w-3 h-3" /> Cliente</span></th>
                    <th className="p-3.5"><span className="flex items-center gap-1"><Smartphone className="w-3 h-3" /> Canal</span></th>
                    <th className="p-3.5"><span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Etapa Embudo</span></th>
                    <th className="p-3.5"><span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Interacciones</span></th>
                    <th className="p-3.5"><span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> Valor Deal</span></th>
                    <th className="p-3.5"><span className="flex items-center gap-1"><Star className="w-3 h-3" /> Score IA</span></th>
                    <th className="p-3.5"><span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Etiquetas</span></th>
                    <th className="p-3.5 text-right"><span className="flex items-center justify-end gap-1"><Settings className="w-3 h-3" /> Acción</span></th>
                  </tr>
                </thead>
                <tbody className={`divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 font-medium ${tableSelectionMode ? 'select-none' : ''}`}>
                  {pagedContacts.map(contact => {
                    const isSelected = selectedIds.has(contact.id);
                    return (
                    <tr
                      key={contact.id}

                      // Iniciar selección por arrastre
                      onMouseDown={(e) => {
                        if (!tableSelectionMode || e.button !== 0) return;

                        const target = e.target as HTMLElement;

                        // No interferir con botones o controles internos
                        if (
                          target.closest(
                            'button, a, input, select, textarea, label'
                          )
                        ) return;

                        startContactDrag(contact.id);

                        // Evitar selección accidental de texto
                        e.preventDefault();
                      }}

                      // Seleccionar o deseleccionar al pasar por una fila
                      onMouseEnter={(e) => {
                        if (!tableSelectionMode) return;

                        // Solo si el botón izquierdo sigue presionado
                        if ((e.buttons & 1) === 0) return;

                        enterContactDuringDrag(contact.id);
                      }}

                      // Mantener selección individual por clic
                      onClick={(e) => {
                        if (!tableSelectionMode) return;

                        const target = e.target as HTMLElement;

                        // Evitar que los botones seleccionen contactos
                        if (
                          target.closest(
                            'button, a, input, select, textarea, label'
                          )
                        ) return;

                        // Evitar selección duplicada después de arrastrar
                        if (hasDraggedSelectionRef.current) return;

                        toggleSelect(contact.id);
                      }}

                      role={tableSelectionMode ? 'checkbox' : undefined}
                      aria-checked={tableSelectionMode ? isSelected : undefined}
                      aria-label={
                        tableSelectionMode
                          ? `Seleccionar ${contact.name}`
                          : undefined
                      }

                      tabIndex={tableSelectionMode ? 0 : -1}

                      onKeyDown={(e) => {
                        if (!tableSelectionMode) return;

                        if (e.key === ' ' || e.key === 'Enter') {
                          e.preventDefault();
                          toggleSelect(contact.id);
                        }
                      }}

                      className={`transition-colors ${
                        tableSelectionMode
                          ? 'cursor-pointer select-none'
                          : ''
                      } ${
                        isSelected
                          ? 'bg-emerald-100 dark:bg-emerald-800/55 hover:bg-emerald-200 dark:hover:bg-emerald-800/70 [&>td:first-child]:border-l-4 [&>td:first-child]:border-emerald-500 dark:[&>td:first-child]:border-emerald-400'
                          : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/70'
                      }`}
                    >
                      <td className="p-3.5 font-medium flex items-center gap-3">
                        <div
                          className={`relative w-9 h-9 rounded-2xl ${getAvatarColor(contact.name)} flex items-center justify-center text-white font-bold text-xs border border-slate-200 shrink-0 overflow-hidden ${isSelected ? 'ring-2 ring-emerald-400' : ''}`}
                        >
                          {getInitials(contact.name)}

                          {contact.avatar && (
                            <img
                              src={contact.avatar}
                              alt={contact.name}
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-100">{contact.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{contact.email || contact.phone}</div>
                        </div>
                      </td>
                      <td className="p-3.5 capitalize font-bold">
                        {getChannelBadge(contact.channel)}
                      </td>
                      <td className="p-3.5">
                        <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[11px] font-bold rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1 w-fit">
                          {contact.stage === 'lead' ? <><Sprout className="w-3 h-3" /> Prospecto</> : contact.stage === 'qualified' ? <><Target className="w-3 h-3" /> Cualificado</> : contact.stage === 'negotiation' ? <><Briefcase className="w-3 h-3" /> Negociación</> : contact.stage === 'closed_won' ? <><PartyPopper className="w-3 h-3" /> Ganada</> : <><XCircle className="w-3 h-3" /> Perdida</>}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onToggleInteraction && onToggleInteraction(contact.id, 'firstReply')}
                            title="1era Interacción (Rojo): Respuesta positiva"
                            aria-label="1era Interacción: Respuesta positiva"
                            className={`w-5 h-3 rounded-xs cursor-pointer ${contact.interactions?.firstReply ? 'bg-red-600' : 'bg-slate-200 dark:bg-slate-700'
                              }`}
                          />
                          <button
                            type="button"
                            onClick={() => onToggleInteraction && onToggleInteraction(contact.id, 'appointmentConfirmed')}
                            title="2da Interacción (Amarillo): Cita confirmada"
                            aria-label="2da Interacción: Cita confirmada"
                            className={`w-5 h-3 rounded-xs cursor-pointer ${contact.interactions?.appointmentConfirmed ? 'bg-yellow-400' : 'bg-slate-200 dark:bg-slate-700'
                              }`}
                          />
                          <button
                            type="button"
                            onClick={() => onToggleInteraction && onToggleInteraction(contact.id, 'proposalSent')}
                            title="3ra Interacción: Propuesta enviada"
                            aria-label="3ra Interacción: Propuesta enviada"
                            className={`w-5 h-3 rounded-xs cursor-pointer ${contact.interactions?.proposalSent ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'
                              }`}
                          />
                          <button
                            type="button"
                            onClick={() => onToggleInteraction && onToggleInteraction(contact.id, 'dealClosed')}
                            title="4ta Interacción: Cierre/Pago"
                            aria-label="4ta Interacción: Cierre/Pago"
                            className={`w-5 h-3 rounded-xs cursor-pointer ${contact.interactions?.dealClosed ? 'bg-emerald-600' : 'bg-slate-200 dark:bg-slate-700'
                              }`}
                          />
                        </div>
                      </td>
                      <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${contact.dealValue.toLocaleString()} USD</span>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold rounded-full border border-emerald-200 dark:border-emerald-700 flex items-center gap-1 w-fit">
                          <Star className="w-2.5 h-2.5" /> {contact.leadScore}%
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-1">
                          {contact.tags.map(t => (
                            <span key={t} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] rounded-md font-bold flex items-center gap-1 border border-transparent dark:border-slate-700">
                              <Tag className="w-2.5 h-2.5" /> {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => onSelectConversationByContactId(contact.id)}
                          className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-extrabold rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs transition-colors cursor-pointer inline-flex items-center gap-1"
                        >
                          <MessageCircle className="w-3 h-3" /> Abrir Chat
                        </button>

                        {/* Modificar precio: solo En Negociación */}
                        {contact.stage === 'negotiation' && (
                          <button
                            type="button"
                            onClick={() => {
                              setContactEditingPrice(contact);
                              setNewDealValue(String(contact.dealValue));
                              setDealValueError(null);
                            }}
                            title={`Modificar precio de ${contact.name}`}
                            aria-label={`Modificar precio de ${contact.name}`}
                            className="ml-2 p-1.5 rounded-lg text-slate-400 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer align-middle"
                          >
                            <Pencil size={15} />
                          </button>
                        )}

                        {/* Eliminar contacto */}
                        {canDeleteContacts && (
                          <button
                            type="button"
                            onClick={() => setContactToDelete(contact)}
                            title="Eliminar contacto"
                            aria-label="Eliminar contacto"
                            className="ml-2 p-1.5 rounded-lg text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer align-middle"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={safeTablePage}
              pageCount={tablePageCount}
              onPageChange={setTablePage}
              total={filteredContacts.length}
              itemLabel="clientes"
              className="border-t border-slate-100 dark:border-slate-700 px-3"
            />
          </div>
        )}
      </div>

      {/* BARRA FLOTANTE DE ACCIONES MASIVAS
          Va fuera del ternario de vistas a proposito: opera sobre `selectedIds`,
          que es compartido, asi que funciona igual desde el Kanban y desde la
          tabla. */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700 backdrop-blur-md">
          <span className="text-xs font-bold">{selectedCount} seleccionado{selectedCount > 1 ? 's' : ''}</span>
          <div className="w-px h-4 bg-slate-600" />
          <button
            type="button"
            onClick={() => {
              setSelectedIds(new Set());
              setTableSelectionMode(false);
            }}
            className="text-xs font-bold hover:text-amber-300 cursor-pointer"
          >
            Cancelar
          </button>
          {hasNegotiation && (
            <button onClick={() => {
              const firstNeg = negotiationSelected[0];
              if (firstNeg) {
                setContactEditingPrice(firstNeg);
                setNewDealValue(String(firstNeg.dealValue));
                setDealValueError(null);
              }
            }} className="text-xs font-black bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-xl cursor-pointer">Modificar Precio (Negociación)</button>
          )}
          {canDeleteContacts && (
            <button onClick={() => {
              const first = filteredContacts.find(c => selectedIds.has(c.id));
              if (first) {
                setContactToDelete(first);
              }
            }} className="text-xs font-black bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl cursor-pointer">Eliminar</button>
          )}
        </div>
      )}
      {/* MODAL PARA MODIFICAR PRECIO */}
      <Modal
        isOpen={contactEditingPrice !== null}
        onClose={() => {
          if (!isSavingDealValue) setContactEditingPrice(null);
        }}
        title="Modificar precio del cliente"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={isSavingDealValue}
              onClick={() => setContactEditingPrice(null)}
            >
              Cancelar
            </Button>

            <Button
              disabled={isSavingDealValue}
              onClick={handleSaveDealValue}
            >
              {isSavingDealValue ? 'Guardando...' : 'Guardar precio'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {negotiationSelected.length > 0 ? (
              <>Cliente{negotiationSelected.length > 1 ? 's' : ''}: <strong>{negotiationSelected.map(c => c.name).join(', ')}</strong></>
            ) : (
              <>Cliente: <strong>{contactEditingPrice?.name}</strong></>
            )}
          </p>

          {nonNegotiationSelected.length > 0 && (
            <p
              className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5 flex items-start gap-2"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {nonNegotiationSelected.length === 1
                  ? '1 contacto seleccionado no está en Negociación y no se modificará.'
                  : `${nonNegotiationSelected.length} contactos seleccionados no están en Negociación y no se modificarán.`}
              </span>
            </p>
          )}

          <Input
            label="Nuevo precio (USD)"
            type="number"
            value={newDealValue}
            onChange={(e) => setNewDealValue(e.target.value)}
          />

          {dealValueError && (
            <p className="text-sm text-red-600" role="alert">
              {dealValueError}
            </p>
          )}
        </div>
      </Modal>
      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN DE CONTACTO */}
      <Modal
        isOpen={contactToDelete != null}
        onClose={() => setContactToDelete(null)}
        title="Eliminar contacto"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setContactToDelete(null)}
            >
              Cancelar
            </Button>

            <Button
              variant="danger"
              onClick={() => {
                if (contactToDelete) {
                  onDeleteContact(contactToDelete.id);
                  Array.from(selectedIds).filter(id => id !== contactToDelete.id).forEach(id => onDeleteContact(id));
                  setSelectedIds(new Set());
                  setContactToDelete(null);
                }
              }}
            >
              Eliminar contacto
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-md text-black dark:text-slate-200">
            ¿Estás seguro de que deseas eliminar {filteredContacts.filter(c => selectedIds.has(c.id)).map(c => c.name).join(', ') || (contactToDelete ? contactToDelete.name : '')}?
          </p>

          {contactToDelete && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl">
              <p className="text-md font-extrabold text-red-800 dark:text-red-300">
                {filteredContacts.filter(c => selectedIds.has(c.id)).map(c => c.name).join(', ') || contactToDelete.name}
              </p>
            </div>
          )}

          <p className="text-md text-black dark:text-slate-300">
            Esta acción no se puede deshacer.
          </p>
        </div>
      </Modal>

      {/* New Contact Creation Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setAddContactError(null); }}
        title="Registrar Nuevo Lead / Cliente"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setIsAddModalOpen(false); setAddContactError(null); }}>
              Cancelar
            </Button>
            <Button type="submit" form="create-contact-form" disabled={isSavingContact || !isNewContactFormValid}>
              {isSavingContact ? 'Guardando...' : 'Guardar Lead en CRM'}
            </Button>
          </>
        }
      >
        <form id="create-contact-form" onSubmit={handleCreateContact} noValidate className="space-y-3.5">
          {addContactError && (
            <div className="p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-2" role="alert">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-red-700 dark:text-red-300">{addContactError}</p>
            </div>
          )}
          <Input
            label="Nombre Completo"
            required
            placeholder="Ej: Daniel Castillo"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Teléfono / WhatsApp"
              prefix="+51"
              placeholder="987654321"
              className="font-mono"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={9}
              value={formData.phone}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  // Solo digitos: el +51 ya esta fijo no se puede borrar por error.
                  phone: e.target.value.replace(/\D+/g, ''),
                })
              }
            />
            <Input
              label="Empresa"
              placeholder="Empresa S.A."
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
            />
          </div>

          <Input
            label="Correo Electrónico"
            type="email"
            placeholder="contacto@empresa.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Canal de Origen"
              value={formData.channel}
              onChange={(e) => setFormData({ ...formData, channel: e.target.value as SocialChannel })}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="twitter">X/Twitter</option>
              <option value="messenger">Messenger</option>
            </Select>
            <Input
              label="Valor Deal ($ USD)"
              type="number"
              min={0}
              value={formData.dealValue}
              onChange={(e) => setFormData({ ...formData, dealValue: Number(e.target.value) })}
            />
          </div>

          <Input
            label="Etiquetas (separadas por coma)"
            value={formData.tags}
            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
          />
        </form>
      </Modal>
    </div>
  );
};
