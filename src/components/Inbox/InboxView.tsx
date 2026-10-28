import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { apiFetch } from '@/lib/apiClient';
import {
  Conversation, Message, SocialChannel, LeadSentiment, PipelineStage, QuickReply
} from '../../types';
import {
  MessageSquare, Send, Sparkles, Phone, Mail, Tag, DollarSign,
  TrendingUp, CheckCircle, Clock,
  CheckCheck, Image as ImageIcon, Paperclip, ChevronRight, ChevronLeft, ChevronDown, FileText, RefreshCw, Zap,
  Chrome, Calendar, AudioLines, Star, ExternalLink, SlidersHorizontal, Edit3,
  FolderOpen, Plus, Smile, X, Instagram, Flame, AlertTriangle,
  Globe, Target, ArrowRight, Lightbulb, Headset, Rocket, Briefcase,
  Trash,
  Trash2,
  Copy,
  Check,
  Forward,
  Search
} from 'lucide-react';
import { QuickRepliesModal } from './QuickRepliesModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { ReadonlyURLSearchParams } from 'next/navigation';
import { AI_MODEL_NAME } from '@/lib/constants';
import { formatPhoneDisplay } from '@/lib/whatsappService';
import { WhatsAppIcon, XBrandIcon, MessengerIcon } from '@/components/Icons/ChannelIcons';
import { Button, Modal } from '../ui';
import { InteractiveButtons } from './InteractiveButtons';
import { InteractiveContent } from '@/lib/whatsappInteractive';
interface InboxViewProps {
  canDeleteContacts: boolean;
  conversations: Conversation[];
  activeConversationId: string;
  onSelectConversation: (id: string) => void;
  messagesMap: Record<string, Message[]>;
  onSendMessage: (conversationId: string, text: string, aiGenerated?: boolean, mediaUrl?: string, interactive?: InteractiveContent) => void;
  onUpdateContactStage: (contactId: string, newStage: PipelineStage) => void;
  onUpdateContactTags: (contactId: string, newTags: string[]) => void;
  handleDeleteConversation: (conversationId: string) => void;
  onUpdateContactNotes: (contactId: string, newNotes: string) => void;
  searchQuery: string;
  quickReplies?: QuickReply[];
  onUpdateQuickReplies?: (updated: QuickReply[]) => void;
  pathname: string;
  searchParams: ReadonlyURLSearchParams;
  router: AppRouterInstance;
  onDeleteContacts: (contactIds: string[]) => void;
}


interface CollapsibleSectionProps {
  sectionKey: string;
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  headerExtra?: React.ReactNode;
  bgClassName?: string;
}

const URL_RE = /(https?:\/\/[^\s]+)/g

function renderTextWithLinks(text: string) {
  return text.split(URL_RE).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target='_blank' rel='noopener noreferrer' className='text-emerald-700 underline break-all'>{part}</a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  )
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  sectionKey,
  title,
  icon,
  isOpen,
  onToggle,
  children,
  headerExtra,
  bgClassName = '',
}) => {
  const panelId = `contact-panel-section-${sectionKey}`;
  return (
    <div className={`border-b border-slate-200 dark:border-slate-700 ${bgClassName}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="w-full flex items-center justify-between p-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-inset"
        style={isOpen ? { paddingBottom: '0.5rem' } : undefined}
      >
        <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          {icon}
          <span>{title}</span>
        </span>
        <div className="flex items-center gap-2">
          {headerExtra}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>
      {isOpen && (
        <div id={panelId} role="region" className="px-4 pb-4 space-y-2.5">
          {children}
        </div>
      )}
    </div>
  );
};

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

export const InboxView: React.FC<InboxViewProps> = ({
  canDeleteContacts,
  conversations,
  activeConversationId,
  onSelectConversation,
  messagesMap,
  onSendMessage,
  onUpdateContactStage,
  onUpdateContactTags,
  onUpdateContactNotes,
  searchQuery,
  quickReplies = [],
  onUpdateQuickReplies,
  searchParams,
  pathname,
  handleDeleteConversation,
  router,
  onDeleteContacts
}) => {
  const [selectionMode, setSelectionMode] = useState<boolean>(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  // Control de selección múltiple por arrastre
  const isDraggingSelectionRef = useRef(false);
  const dragStartIndexRef = useRef<number | null>(null);
  const hasDraggedSelectionRef = useRef(false);
  const dragInitialSelectionRef = useRef<Set<string>>(new Set());
  const [showButtonEditor, setShowButtonEditor] = useState(false);
  const [btnBody, setBtnBody] = useState<string>('');
  const [btnList, setBtnList] = useState<{ label: string; url: string }[]>([{label: '', url: ''}]);

  useEffect(() => {
    const stopDragging = () => {
      isDraggingSelectionRef.current = false;
      dragStartIndexRef.current = null;
    };

    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);

    return () => {
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('blur', stopDragging);
    };
  }, []);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState<boolean>(false);

  const MAX_BULK_DELETE = 100;

  const toggleContactSelection = (contactId: string) => {
    setSelectedContactIds(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else if (next.size < MAX_BULK_DELETE) {
        next.add(contactId);
      }
      return next;
    });
  };

  

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedContactIds(new Set());
  };
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [mobileStage, setMobileStage] = useState<'list' | 'chat' | 'info'>('chat');
  const [inputText, setInputText] = useState<string>('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [forwardText, setForwardText] = useState<string | null>(null);
  const [forwardTargets, setForwardTargets] = useState<Set<string>>(new Set());
  const [forwardSearch, setForwardSearch] = useState('');
  const isForwardDraggingRef = useRef(false);
  const forwardDragStartRef = useRef<string | null>(null);
  const forwardDragInitialRef = useRef<Set<string>>(new Set());
  const forwardDragVisitedRef = useRef<Set<string>>(new Set());
  const forwardHasDraggedRef = useRef(false);

  useEffect(() => {
    const stopForwardDragging = () => {
      isForwardDraggingRef.current = false;
      forwardDragStartRef.current = null;
    };

    window.addEventListener('mouseup', stopForwardDragging);
    window.addEventListener('blur', stopForwardDragging);

    return () => {
      window.removeEventListener('mouseup', stopForwardDragging);
      window.removeEventListener('blur', stopForwardDragging);
    };
  }, []);

  useEffect(() => {
    if (!copiedMessageId) return;

    const timer = window.setTimeout(() => {
      setCopiedMessageId(null);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [copiedMessageId]);

  const [tagInput, setTagInput] = useState<string>('');
  const [isQuickRepliesModalOpen, setIsQuickRepliesModalOpen] = useState<boolean>(false);
  const [attachedImageUrl, setAttachedImageUrl] = useState<string>('');
  const [showAttachInput, setShowAttachInput] = useState<boolean>(false);

  const [showExtensionPanel, setShowExtensionPanel] = useState<boolean>(true);
  const [openPanelSections, setOpenPanelSections] = useState<Record<string, boolean>>({
    calendar: true,
    pipeline: true,
    tags: true,
    details: true,
    notes: true,
  });
  const togglePanelSection = (key: string) => {
    setOpenPanelSections(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const [calendarDate, setCalendarDate] = useState<string>('2026-08-20');
  const [calendarTime, setCalendarTime] = useState<string>('15:00');
  const [calendarNotification, setCalendarNotification] = useState<string | null>(null);
  const [conversationToDelete, setConversationToDelete] = useState(null)

  const messageContainerRef = useRef<HTMLDivElement>(null)
  const aperturaPendienteRef = useRef(true)

  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [suggestionsWait, startSuggestionsWait] = useRetryCountdown();
  const [aiSuggestions, setAiSuggestions] = useState<{ label: string; text: string }[] | null>(null);
  const [aiReasoning, setAiReasoning] = useState<string>('');
  const [, setDetectedSentiment] = useState<LeadSentiment | null>(null);

  const [summaryData, setSummaryData] = useState<{ summary: string; keyIntent: string; suggestedNextAction: string } | null>(null);
  const [summaryWait, startSummaryWait] = useRetryCountdown();
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(false);

  const activeConv = conversations.find(c => c.id === activeConversationId) || conversations[0];
  const activeMessages = activeConv ? (messagesMap[activeConv.id] || []) : [];
  const contact = activeConv?.contact;
  const lidDigits = contact?.handle?.endsWith('@lid') ? contact.handle.split('@')[0] : null
  const realPhone = contact?.phone && contact.phone !== lidDigits ? contact.phone : ''

  const [isVoiceNoteLoading, setIsVoiceNoteLoading] = useState<boolean>(false);

  const quickRepliesScrollRef = useRef<HTMLDivElement>(null);
  const [hoverEdge, setHoverEdge] = useState<'left' | 'right' | null>(null);
  const [btnMode, setBtnMode] = useState<'reply' | 'url'>('url');
  const [btnError, setBtnError] = useState<string >('');
  const scrollQuickReplies = (direction: 'left' | 'right') => {
    const container = quickRepliesScrollRef.current;
    if (!container) return;
    container.scrollBy({ left: direction === 'left' ? -150 : 150, behavior: 'smooth' });
  };

  const handleSendButtons = () => {
    if (!activeConv || !btnBody.trim()) return;
    const validos = btnList.filter(b => b.label.trim())

    const buttons = btnMode === 'url'
    ? validos.filter(b => /^https?:\/\//.test(b.url.trim())).slice(0,1)
    .map(b => ({ kind: 'url' as const, label: b.label.trim().slice(0, 20), url: b.url.trim() }))
    : validos.slice(0, 3)
    .map(b => ({ kind: 'reply' as const, label: b.label.trim().slice(0, 20) }));

    if (!buttons.length) {
      setBtnError(btnMode === 'url' ? 'Pon un texto y una URL que empiece por https://' : 'Pon al menos un texto de botón');
      return;
    };
    setBtnError('')
    onSendMessage(activeConv.id, btnBody.trim(), false, undefined, {body: btnBody.trim(), buttons});
    setBtnBody('');
    setBtnList([{label: '', url: ''}]);
    setShowButtonEditor(false);
  }

  useLayoutEffect(() => {
    const container = messageContainerRef.current
    if (!container || !activeConv) return;

    const ultimo = activeMessages[activeMessages.length - 1]
    const cercaDelFinal = container.scrollHeight - container.scrollTop - container.clientHeight < 150

    if (aperturaPendienteRef.current || ultimo?.sender === 'agent' || cercaDelFinal) {
      container.scrollTop = container.scrollHeight
      if (activeMessages.length > 0) aperturaPendienteRef.current = false
    }


  }, [activeConv?.id, activeMessages?.length])


  useLayoutEffect(() => {
    aperturaPendienteRef.current = true
  }, [activeConv?.id])

  const handleQuickRepliesMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const edgeZone = 30;

    if (x < edgeZone) {
      setHoverEdge('left');
    } else if (x > rect.width - edgeZone) {
      setHoverEdge('right');
    } else {
      setHoverEdge(null);
    }
  };

  const filteredConversations = conversations.filter(c => {
    const matchesChannel = channelFilter === 'all' || c.channel === channelFilter;
    const matchesSearch = !searchQuery ||
      c.contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contact.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesChannel && matchesSearch;
  });

  const handleCopyMessage = async (
    messageId: string,
    text: string
  ) => {
    try {
      await navigator.clipboard.writeText(text);

      setCopiedMessageId(messageId);
    } catch (error) {
      console.error('Error al copiar mensaje:', error);
    }
  };

  const openForwardModal = (text: string) => {
    if (!text.trim()) return;

    setForwardText(text);
    setForwardTargets(new Set());
    setForwardSearch('');
  };


  const closeForwardModal = () => {
    setForwardText(null);
    setForwardTargets(new Set());
    setForwardSearch('');
  };

  const toggleForwardTarget = (conversationId: string) => {
    setForwardTargets(prev => {
      const next = new Set(prev);

      if (next.has(conversationId)) {
        next.delete(conversationId);
      } else {
        next.add(conversationId);
      }

      return next;
    });
  };
  
  const startForwardDrag = (conversationId: string) => {
    isForwardDraggingRef.current = true;
    forwardDragStartRef.current = conversationId;
    forwardDragInitialRef.current = new Set(forwardTargets);
    forwardDragVisitedRef.current = new Set();
    forwardHasDraggedRef.current = false;
  };

  const enterForwardDrag = (conversationId: string) => {
    if (!isForwardDraggingRef.current) return;

    const startId = forwardDragStartRef.current;

    if (!startId || startId === conversationId) return;

    forwardHasDraggedRef.current = true;

    const visited = forwardDragVisitedRef.current;
    const initial = forwardDragInitialRef.current;

    const idsToToggle = [startId, conversationId].filter(
      id => !visited.has(id)
    );

    if (idsToToggle.length === 0) return;

    idsToToggle.forEach(id => visited.add(id));

    setForwardTargets(prev => {
      const next = new Set(prev);

      idsToToggle.forEach(id => {
        if (initial.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });

      return next;
    });
  };

  const handleForwardMessage = () => {
    if (!forwardText || forwardTargets.size === 0) return;

    for (const conversationId of forwardTargets) {
      onSendMessage(conversationId, forwardText);
    }

    closeForwardModal();
  };

  const handleSend = () => {
    if ((!inputText.trim() && !attachedImageUrl) || !activeConv) return;
    onSendMessage(activeConv.id, inputText.trim(), false, attachedImageUrl || undefined);
    setInputText('');
    setAttachedImageUrl('');
    setShowAttachInput(false);
    setAiSuggestions(null);
  };

  const handleExecuteQuickReply = (qr: QuickReply) => {
    if (!contact || !activeConv) return;
    const replacedText = qr.text
      .replace(/{nombre}/g, contact.name)
      .replace(/{empresa}/g, contact.company || '')
      .replace(/{canal}/g, contact.channel)
      .replace(/{agente}/g, activeConv.assignedAgent || 'Asistente XIO');

    if (qr.imageUrl) {
      onSendMessage(activeConv.id, replacedText, false, qr.imageUrl);
    } else {
      setInputText(replacedText);
    }
  };

  const handleSendVoiceNote = async () => {
    if (!activeConv || !inputText.trim()) return;
    setIsVoiceNoteLoading(true);

    try {
      const response = await apiFetch('/api/ai/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText.trim() })
      });

      const resData = await response.json();

      if (resData.success && resData.data?.audioUrl) {
        onSendMessage(activeConv.id, '🎙️ Nota de voz', false, resData.data.audioUrl);
        setInputText('');
      } else if (resData.success && resData.data?.simulated) {
        onSendMessage(activeConv.id, `🎙️ [Simulado: ${resData.data.message}]`);
      }
    } catch (err) {
      console.error('Error generating voice note:', err);
    } finally {
      setIsVoiceNoteLoading(false);
    }
  };

  const handleScheduleGoogleCalendar = () => {
    if (!contact) return;
    setCalendarNotification(`¡Cita agendada en Google Calendar para ${contact.name} el ${calendarDate} a las ${calendarTime}!`);
    onSendMessage(activeConv.id, `📅 Hola ${contact.name}, he agendado nuestra reunión en Google Calendar para el ${calendarDate} a las ${calendarTime}. Te he enviado la invitación a tu correo.`);
    setTimeout(() => setCalendarNotification(null), 4000);
  };

  const handleGenerateAiSmartReplies = async () => {
    if (!activeConv || !contact || suggestionsWait > 0) return;
    setIsAiLoading(true);

    try {
      const response = await apiFetch('/api/ai/smart-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationHistory: activeMessages.map(m => ({ sender: m.sender, text: m.text })),
          contactName: contact.name,
          channel: contact.channel,
          stage: contact.stage
        })
      });

      const resData = await response.json();

      if (!resData.success && response.status === 429) {
        const retrySeconds =
          Number(resData.retryAfter) || Number(response.headers.get('Retry-After')) || 1;
        startSuggestionsWait(retrySeconds);
      }

      if (resData.success && resData.data) {
        startSuggestionsWait(0);
        setAiSuggestions(resData.data.suggestedReplies || []);
        setAiReasoning(resData.data.reasoning || '');
        if (resData.data.sentiment) {
          setDetectedSentiment(resData.data.sentiment);
        }
      }
    } catch (err) {
      console.error('Error generating AI Smart Replies:', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSummarizeConversation = async () => {
    if (!activeConv || !contact || summaryWait > 0) return;
    setIsSummaryLoading(true);

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
        setSummaryData(resData.data);
      }
    } catch (err) {
      console.error('Error summarizing conversation:', err);
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim() && contact) {
      if (!contact.tags.includes(tagInput.trim())) {
        onUpdateContactTags(contact.id, [...contact.tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (contact) {
      onUpdateContactTags(contact.id, contact.tags.filter(t => t !== tagToRemove));
    }
  };

  // Las clases van completas (no armadas con interpolacion) para que
  // Tailwind las detecte al compilar. Messenger y Email usan los mismos
  // tonos que sus badges en getChannelBadge.
  const channelFilters: {
    id: SocialChannel | 'all';
    label: string;
    Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    activeClass: string;
    idleClass: string;
  }[] = [
      {
        id: 'all', label: 'Todos', Icon: Globe,
        activeClass: 'bg-slate-900 text-white shadow-sm scale-102',
        idleClass: 'text-slate-600 hover:bg-slate-200/70',
      },
      {
        id: 'whatsapp', label: 'WhatsApp', Icon: WhatsAppIcon,
        activeClass: 'bg-emerald-600 text-white shadow-sm shadow-emerald-700/20 scale-102',
        idleClass: 'text-emerald-700 bg-emerald-50/60 hover:bg-emerald-100 border border-emerald-200/60',
      },
      {
        id: 'instagram', label: 'Instagram', Icon: Instagram,
        activeClass: 'bg-pink-600 text-white shadow-sm shadow-pink-700/20 scale-102',
        idleClass: 'text-pink-700 bg-pink-50/60 hover:bg-pink-100 border border-pink-200/60',
      },
      {
        id: 'twitter', label: 'X / Twitter', Icon: XBrandIcon,
        activeClass: 'bg-slate-900 text-white shadow-sm scale-102',
        idleClass: 'text-slate-800 bg-slate-100/80 hover:bg-slate-200 border border-slate-300/60',
      },
      {
        id: 'messenger', label: 'Messenger', Icon: MessengerIcon,
        activeClass: 'bg-blue-600 text-white shadow-sm shadow-blue-700/20 scale-102',
        idleClass: 'text-blue-700 bg-blue-50/60 hover:bg-blue-100 border border-blue-200/60',
      },
      {
        id: 'email', label: 'Email', Icon: Mail,
        activeClass: 'bg-slate-600 text-white shadow-sm shadow-slate-700/20 scale-102',
        idleClass: 'text-slate-700 bg-slate-100/80 hover:bg-slate-200 border border-slate-300/60',
      },
    ];

  const getChannelBadge = (ch: SocialChannel) => {
    switch (ch) {
      case 'whatsapp':
        return <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 font-extrabold rounded-full text-[10px] flex items-center gap-1 shadow-2xs"><WhatsAppIcon className="w-2.5 h-2.5" /> WhatsApp</span>;
      case 'instagram':
        return <span className="px-2 py-0.5 bg-pink-50 text-pink-800 border border-pink-300 font-extrabold rounded-full text-[10px] flex items-center gap-1 shadow-2xs"><Instagram className="w-2.5 h-2.5" /> Instagram</span>;
      case 'twitter':
        return <span className="px-2 py-0.5 bg-sky-50 text-sky-800 border border-sky-300 font-extrabold rounded-full text-[10px] flex items-center gap-1 shadow-2xs"><XBrandIcon className="w-2.5 h-2.5" /> X / Twitter </span>;
      case 'messenger':
        return <span className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-300 font-extrabold rounded-full text-[10px] flex items-center gap-1 shadow-2xs"><MessengerIcon className="w-2.5 h-2.5" /> Messenger</span>;
      default:
        return <span className="px-2 py-0.5 bg-slate-100 text-slate-800 font-bold rounded-full text-[10px] flex items-center gap-1"><Mail className="w-2.5 h-2.5" /> Email</span>;
    }
  };

  const getSentimentBadge = (sentiment: LeadSentiment) => {
    switch (sentiment) {
      case 'positive':
        return <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-300 text-emerald-800 text-[10px] font-extrabold rounded-full shadow-2xs flex items-center gap-1"><Flame className="w-2.5 h-2.5" /> Positivo</span>;
      case 'urgent':
        return <span className="px-2.5 py-0.5 bg-amber-50 border border-amber-300 text-amber-800 text-[10px] font-extrabold rounded-full shadow-2xs flex items-center gap-1"><Zap className="w-2.5 h-2.5" /> Urgente</span>;
      case 'churn_risk':
        return <span className="px-2.5 py-0.5 bg-rose-50 border border-rose-300 text-rose-800 text-[10px] font-extrabold rounded-full shadow-2xs flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Riesgo Churn</span>;
      default:
        return <span className="px-2.5 py-0.5 bg-slate-100 border border-slate-300 text-slate-700 text-[10px] font-bold rounded-full shadow-2xs flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> Neutral</span>;
    }
  };


  return (
    <div className="flex-1 flex overflow-hidden bg-slate-100 dark:bg-slate-950 font-sans">
      {/* COLUMN 1: Conversation List & Filters */}
      <div className={`${mobileStage === 'list' ? 'flex' : 'hidden'} lg:flex w-full lg:w-80 border-r border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 flex-col shrink-0 shadow-sm z-10`}>
        <div className="p-3 border-b border-slate-200/80 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-slate-100/50 dark:bg-none dark:bg-slate-800/80">
          {/* Solo iconos para que los seis canales entren en una fila dentro
              de la columna de ancho fijo (lg:w-80); con texto se partian en dos
              filas. El nombre se conserva en title (tooltip) y aria-label
              (lectores de pantalla), porque el icono solo no lo comunica. */}
          <div className="flex items-center justify-between gap-1 pb-1 text-xs">
            {channelFilters.map(({ id, label, Icon, activeClass, idleClass }) => {
              const isActive = channelFilter === id;
              // "Todos" no tiene logo propio, asi que su contador sigue
              // visible junto al globo y tambien se anuncia en aria-label.
              const fullLabel = id === 'all' ? `${label} (${conversations.length} conversaciones)` : label;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setChannelFilter(id)}
                  title={fullLabel}
                  aria-label={fullLabel}
                  aria-pressed={isActive}
                  className={`h-8 min-w-8 px-2 inline-flex items-center justify-center gap-1 rounded-xl font-bold whitespace-nowrap cursor-pointer transition-all ${isActive ? activeClass : idleClass}`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {id === 'all' && <span className="tabular-nums">{conversations.length}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 pt-2">
            {selectionMode ? (
              <>
                <span className="text-xs font-extrabold text-slate-700 dark:text-slate-100 tabular-nums">
                  {selectedContactIds.size} seleccionados
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={selectedContactIds.size === 0}
                    onClick={() => setShowBulkDeleteConfirm(true)}
                    className="h-7 px-2.5 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                  >
                    Eliminar ({selectedContactIds.size})
                  </button>
                  <button
                    type="button"
                    onClick={exitSelectionMode}
                    className="h-7 px-2.5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300/60 dark:border-slate-700 cursor-pointer transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : canDeleteContacts ? (
              <button
                type="button"
                onClick={() => setSelectionMode(true)}
                className="h-7 px-2.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300/60 cursor-pointer transition-all"
              >
                Seleccionar
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 scrollbar-thin">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <MessageSquare className="w-6 h-6 mx-auto mb-1" />
              No hay conversaciones en este filtro.
            </div>
          ) : (
            filteredConversations.map((conv, index) => {
              const isSelected = activeConv && activeConv.id === conv.id;
              const isChecked = selectionMode && selectedContactIds.has(conv.contact.id);
              return (
                <div
                  key={conv.id}

                  onMouseDown={(e) => {
                    if (
                      !selectionMode ||
                      e.button !== 0 ||
                      (e.target as HTMLElement).closest('button')
                    ) return;

                    isDraggingSelectionRef.current = true;
                    dragStartIndexRef.current = index;
                    hasDraggedSelectionRef.current = false;

                    dragInitialSelectionRef.current = new Set(selectedContactIds);

                    e.preventDefault();
                  }}

                  onMouseEnter={() => {
                    if (
                      !selectionMode ||
                      !isDraggingSelectionRef.current ||
                      dragStartIndexRef.current === null
                    ) return;

                    const start = Math.min(
                      dragStartIndexRef.current,
                      index
                    );

                    const end = Math.max(
                      dragStartIndexRef.current,
                      index
                    );

                    if (dragStartIndexRef.current !== index) {
                      hasDraggedSelectionRef.current = true;
                    }

                    if (!hasDraggedSelectionRef.current) return;

                    setSelectedContactIds(() => {
                      const initial = dragInitialSelectionRef.current;
                      const next = new Set(initial);

                      // Contactos incluidos en el recorrido
                      const rangeIds = new Set(
                        filteredConversations
                          .slice(start, end + 1)
                          .map(conv => conv.contact.id)
                      );

                      // Deseleccionar los que ya estaban seleccionados
                      for (const contactId of rangeIds) {
                        if (initial.has(contactId)) {
                          next.delete(contactId);
                        }
                      }

                      // Seleccionar los que no estaban seleccionados
                      for (const contactId of rangeIds) {
                        if (
                          !initial.has(contactId) &&
                          next.size < MAX_BULK_DELETE
                        ) {
                          next.add(contactId);
                        }
                      }

                      return next;
                    });
                  }}

                  onClick={() => {
                    if (selectionMode) {
                      if (hasDraggedSelectionRef.current) {
                        hasDraggedSelectionRef.current = false;
                        return;
                      }

                      toggleContactSelection(conv.contact.id);
                      return;
                    }

                    onSelectConversation(conv.id);
                    setMobileStage('chat');
                  }}

                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-all relative ${selectionMode ? 'select-none' : ''
                    } ${isChecked
                      ? 'bg-rose-50/80 dark:bg-rose-950/40 border-l-4 border-rose-500'
                      : isSelected && !selectionMode
                        ? 'bg-gradient-to-r from-emerald-50/95 to-teal-50/40 dark:from-emerald-950/70 dark:to-slate-900 border-l-4 border-emerald-600 shadow-xs'
                        : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/80'
                    }`}
                >
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      readOnly
                      aria-label={`Seleccionar ${conv.contact.name}`}
                      className="mt-3 w-4 h-4 shrink-0 accent-rose-600 pointer-events-none"
                    />
                  )}
                  <div className="relative shrink-0">
                    <div className={`relative w-11 h-11 rounded-2xl ${getAvatarColor(conv.contact.name)} flex items-center justify-center text-white font-bold text-sm border border-slate-200 shadow-2xs overflow-hidden`}>
                      {getInitials(conv.contact.name)}
                      {conv.contact.avatar && (
                        <img
                          src={conv.contact.avatar}
                          alt={conv.contact.name}
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                    </div>
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-2xs border border-slate-100">
                      {conv.channel === 'whatsapp' ? <WhatsAppIcon className="w-2.5 h-2.5 text-emerald-600" /> : conv.channel === 'instagram' ? <Instagram className="w-2.5 h-2.5 text-pink-600" /> : conv.channel === 'twitter' ? <XBrandIcon className="w-2.5 h-2.5 text-slate-900" /> : <MessengerIcon className="w-2.5 h-2.5 text-blue-600" />}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {conv.contact.name}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                        {conv.lastMessageTime}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate mb-1.5 font-medium">
                      {conv.lastMessage}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {getSentimentBadge(conv.contact.sentiment)}
                      {conv.unreadCount > 0 && (
                        <span className="ml-auto px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-extrabold rounded-full animate-bounce shadow-2xs">
                          {conv.unreadCount} nuevo
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setConversationToDelete(conv)
                    }}
                    aria-label={`Eliminar conversación ${conv.id}`}
                    className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 font-extrabold rounded-full text-[10px] flex items-center gap-1 shadow-2xs cursor-pointer"                  >
                    <Trash className='h-4 w-4' />
                  </button>

                </div>
              );
            })
          )}
        </div>
      </div>



      {/* COLUMN 2: Central WhatsApp Style Chat Canvas */}
      <div className={`${mobileStage === 'chat' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col bg-white dark:bg-slate-900 min-w-0 border-r border-slate-200 dark:border-slate-800 shadow-xs`}>
        {activeConv && contact ? (
          <>
            {/* Active Chat Header */}
            <div className="px-3 md:px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <button
                  onClick={() => {
                    const params = new URLSearchParams(searchParams)
                    params.delete('id')
                    router.replace(`${pathname}?${params.toString()}`)
                    setMobileStage('list')
                  }}
                  className="lg:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
                  aria-label="Volver a conversaciones"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                <div className="relative shrink-0">
                  <div className={`relative w-11 h-11 rounded-2xl ${getAvatarColor(contact.name)} flex items-center justify-center text-white font-bold text-sm border border-slate-200 shadow-xs overflow-hidden`}>
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
                  <span className="w-3 h-3 bg-emerald-500 rounded-full absolute -top-0.5 -right-0.5 border-2 border-white"></span>
                </div>
                <div className="min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate min-w-0">{contact.name}</h3>
                    {getChannelBadge(contact.channel)}
                  </div>
                  <p className="text-xs text-slate-500 font-medium flex items-center gap-1 min-w-0 overflow-hidden whitespace-nowrap">
                    {/* <span className="flex items-center gap-1 truncate min-w-0"><Building2 className="w-3 h-3 shrink-0" /> <span className="truncate">{'Empresa'}</span></span>
                    <span className="text-slate-300 hidden lg:inline shrink-0">â€¢</span> */}
                    <span className="text-emerald-600 font-bold hidden lg:inline-flex items-center gap-1 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> En lí­nea</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setShowExtensionPanel(prev => !prev);
                    setMobileStage('info');
                  }}
                  className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${showExtensionPanel
                    ? 'bg-slate-900 text-white shadow-slate-900/20'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                    }`}
                  title="Muestra u oculta la barra lateral de la Extensión XIO"
                >
                  <Chrome className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Extensión XIO</span>
                </button>

                <button
                  onClick={handleSummarizeConversation}
                  disabled={isSummaryLoading || summaryWait > 0}
                  title={summaryWait > 0 ? `Lí­mite de solicitudes excedido. Reintenta en ${summaryWait}s.` : undefined}
                  className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">
                    {summaryWait > 0 ? `Espera ${summaryWait}s` : isSummaryLoading ? 'Analizando...' : 'Resumen IA'}
                  </span>
                </button>

                <button
                  onClick={handleGenerateAiSmartReplies}
                  disabled={isAiLoading || suggestionsWait > 0}
                  title={suggestionsWait > 0 ? `Lí­mite de solicitudes excedido. Reintenta en ${suggestionsWait}s.` : undefined}
                  className="flex items-center gap-1.5 px-2.5 md:px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-extrabold shadow-sm shadow-emerald-700/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">
                    {suggestionsWait > 0 ? `Espera ${suggestionsWait}s` : isAiLoading ? 'Generando...' : 'Respuestas IA'}
                  </span>
                </button>

                {canDeleteContacts && (
                  <button
                    onClick={() => { setConversationToDelete(activeConv) }}
                    title="Eliminar este chat"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {(summaryWait > 0 || suggestionsWait > 0) && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs font-bold text-red-800 space-y-0.5">
                {summaryWait > 0 && (
                  <p className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    Resumen IA: lí­mite de solicitudes excedido. Reintenta en {summaryWait}s.
                  </p>
                )}
                {suggestionsWait > 0 && (
                  <p className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    Respuestas IA: lí­mite de solicitudes excedido. Reintenta en {suggestionsWait}s.
                  </p>
                )}
              </div>
            )}

            {calendarNotification && (
              <div className="p-3 bg-emerald-100 border-b border-emerald-300 text-emerald-900 text-xs font-extrabold flex items-center gap-2 animate-fadeIn">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{calendarNotification}</span>
              </div>
            )}

            {summaryData && (
              <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200 text-xs text-slate-800 flex items-start justify-between shadow-2xs">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 font-extrabold text-emerald-900">
                    <Sparkles className="w-4 h-4" />
                    <span>Resumen Ejecutivo IA (XIO + {AI_MODEL_NAME}):</span>
                  </div>
                  <p className="text-slate-700 leading-relaxed font-medium bg-white/60 p-2 rounded-xl border border-emerald-100">{summaryData.summary}</p>
                  <div className="flex items-center gap-4 text-[11px] text-slate-700 pt-0.5">
                    <span className="flex items-center gap-1"><Target className="w-3 h-3" /> <strong>Intención Principal:</strong> {summaryData.keyIntent}</span>
                    <span className="flex items-center gap-1"><ArrowRight className="w-3 h-3" /> <strong>Siguiente Acción:</strong> {summaryData.suggestedNextAction}</span>
                  </div>
                </div>
                <button
                  onClick={() => setSummaryData(null)}
                  aria-label="Cerrar resumen ejecutivo IA"
                  className="text-slate-400 hover:text-slate-700 px-2 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {aiSuggestions && aiSuggestions.length > 0 && (
              <div className="p-3.5 bg-gradient-to-r from-emerald-50/95 via-teal-50/95 to-slate-50 border-b border-emerald-200 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                    <Zap className="w-4 h-4" />
                    Sugerencias Inteligentes Gemini IA (Haz clic para usar):
                  </span>
                  {aiReasoning && <span className="text-[11px] text-emerald-800 italic font-medium flex items-center gap-1"><Lightbulb className="w-3 h-3" /> {aiReasoning}</span>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {aiSuggestions.map((sug, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInputText(sug.text)}
                      className="p-3 bg-white hover:bg-emerald-50 border border-emerald-200 hover:border-emerald-400 rounded-2xl text-left text-xs transition-all shadow-xs group cursor-pointer hover:scale-[1.02]"
                    >
                      <div className="font-extrabold text-emerald-900 text-[11px] mb-1 flex items-center gap-1">
                        <span>{idx === 0 ? <Smile className="w-3.5 h-3.5" /> : idx === 1 ? <Briefcase className="w-3.5 h-3.5" /> : <Target className="w-3.5 h-3.5" />}</span>
                        <span>{sug.label}</span>
                      </div>
                      <p className="text-slate-700 text-[11px] line-clamp-2 font-medium">
                        &quot;{sug.text}&quot;
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message Thread */}
            <div
              ref={messageContainerRef}
              className="
                flex-1 p-5 overflow-y-auto space-y-3.5
                bg-[#efeae2]/60
                bg-[radial-gradient(#cbd5e1_1px,transparent_1px)]
                dark:bg-slate-950
                dark:bg-[radial-gradient(#334155_1px,transparent_1px)]
                [background-size:16px_16px]
              "
            >
              {activeMessages.map((msg) => {
                const isAgent = msg.sender === 'agent' || msg.sender === 'bot';
                // Obtener el texto visible del mensaje
                const textToCopy = [
                  msg.interactive?.header,
                  msg.interactive?.body || msg.text,
                  msg.interactive?.footer
                ].filter(Boolean).join('\n');
                // La multimedia nueva se sirve desde /api/media/... (disco);
                // los mensajes antiguos siguen trayendo el base64 embebido.
                const mediaSrc =
                  msg.mediaUrl ||
                  (msg.media?.data
                    ? `data:${msg.media.mimetype};base64,${msg.media.data}`
                    : '');
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-500 font-semibold px-1">
                      <span className="flex items-center gap-1">{msg.senderName ? msg.senderName : isAgent ? <><Headset className="w-2.5 h-2.5" /> Asesor XIO</> : contact.name}</span>
                      <span>·</span>
                      <span>{msg.timestamp}</span>
                      {msg.aiGenerated && (
                        <span className="px-1.5 py-0.2 bg-emerald-200 text-emerald-900 font-extrabold rounded-md shadow-2xs flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" /> Bot IA
                        </span>
                      )}
                    </div>

                    <div
                      className={`max-w-md rounded-2xl p-3.5 text-xs leading-relaxed shadow-sm transition-all ${isAgent
                        ? 'bg-[#dcf8c6] dark:bg-emerald-900/70 text-slate-900 dark:text-emerald-50 rounded-tr-xs border border-emerald-300/80 dark:border-emerald-700 shadow-emerald-900/5'
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/90 dark:border-slate-700 rounded-tl-xs shadow-slate-900/5'
                      }`}
                    >
                      {mediaSrc && (msg.hasMedia || msg.mediaUrl) && (
                        <>
                          {(msg.mediaType === 'image' || (!msg.mediaType && msg.mediaUrl && !msg.mediaUrl.startsWith('data:audio/'))) && (
                            <div className="mb-2 rounded-xl overflow-hidden border border-black/10 bg-black/5 shadow-2xs">
                              <img
                                src={mediaSrc}
                                alt={msg.media?.filename || "Imagen"}
                                className="w-full max-h-60 object-cover cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => window.open(mediaSrc, '_blank')}
                              />
                            </div>
                          )}
                          {msg.mediaType === 'video' && (
                            <div className="mb-2 rounded-xl overflow-hidden border border-black/10 bg-black/5 shadow-2xs">
                              <video
                                src={mediaSrc}
                                controls
                                className="w-full max-h-60 object-cover"
                              />
                            </div>
                          )}
                          {(msg.mediaType === 'audio' || mediaSrc.startsWith('data:audio/')) && (
                            <div className="mb-2">
                              <VoiceNotePlayer src={mediaSrc} />
                            </div>
                          )}
                          {msg.mediaType === 'document' && (
                            <div className="mb-2 p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-3">
                              <FileText className="w-8 h-8 text-slate-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">
                                  {msg.media?.filename || 'Documento'}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {msg.media?.mimetype}
                                </p>
                              </div>
                              <a
                                href={mediaSrc.startsWith('/') ? `${mediaSrc}?download=1` : mediaSrc}
                                target={mediaSrc.startsWith('/') ? undefined : '_blank'}
                                rel="noopener"
                                download={msg.media?.filename || 'documento'}
                                className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[10px] font-bold transition-colors"
                              >
                                Descargar
                              </a>
                            </div>
                          )}
                          {msg.mediaType === 'sticker' && (
                            <div className="mb-2">
                              <img
                                src={mediaSrc}
                                alt="Sticker"
                                className="w-32 h-32 object-contain"
                              />
                            </div>
                          )}
                        </>
                      )}

                      {/* {msg.text && (
                        <p className="whitespace-pre-line leading-relaxed font-medium">
                          {renderTextWithLinks(msg.text)}
                        </p>
                      )}

                      <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-400 mt-1.5 font-medium">
                        <span>{msg.timestamp}</span>
                        {isAgent && <CheckCheck className="w-3 h-3 text-emerald-700" />}
                      </div> */}

                      {msg.interactive?.header && (
                        <p className="font-bold text-[13px] mb-1">{msg.interactive.header}</p>
                      )}

                      {(msg.interactive?.body || msg.text) && (
                        <p className="whitespace-pre-line leading-relaxed font-medium">
                          {renderTextWithLinks(msg.interactive ? msg.interactive.body : msg.text)}
                        </p>
                      )}

                      {msg.interactive?.footer && (
                        <p className="text-[11px] text-slate-400 mt-1">{msg.interactive.footer}</p>
                      )}

                      <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-400 mt-1.5 font-medium">

                        {/* Copiar mensajes enviados y recibidos */}
                        {textToCopy && (
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg.id, textToCopy)}
                            title="Copiar mensaje"
                            aria-label="Copiar mensaje"
                            className="flex items-center gap-1 px-1.5 py-1 rounded-md text-slate-500 hover:text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            {copiedMessageId === msg.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-600">Copiado</span>
                              </>
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        {/* Reenviar mensaje */}
                        {textToCopy && (
                          <button
                            type="button"
                            onClick={() => openForwardModal(textToCopy)}
                            title="Reenviar mensaje"
                            aria-label="Reenviar mensaje"
                            className="flex items-center justify-center px-1.5 py-1 rounded-md text-slate-500 hover:text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            <Forward className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Hora del mensaje */}
                        <span>{msg.timestamp}</span>

                        {/* Confirmación de mensajes enviados */}
                        {isAgent && (
                          <CheckCheck className="w-3 h-3 text-emerald-700" />
                        )}

                      </div>

                      {msg.interactive && <InteractiveButtons buttons={msg.interactive.buttons} />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Templates Bar & Composer */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-2 shadow-xs">
              <div
                className="relative"
                onMouseMove={handleQuickRepliesMouseMove}
                onMouseLeave={() => setHoverEdge(null)}
              >
                {hoverEdge === 'left' && (
                  <button
                    onClick={() => scrollQuickReplies('left')}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center cursor-pointer hover:bg-slate-100 animate-fadeIn"
                    aria-label="Desplazar a la izquierda"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                )}

                {/* Antes esta fila se desplazaba en horizontal con la barra oculta y
                    unas flechas que solo aparecian al pasar el raton por 30px del borde.
                    El ultimo boton (Audio WhatsApp) quedaba fuera de pantalla y era
                    practicamente inalcanzable: de ahi el reporte de que el audio no
                    funcionaba. Ahora los botones se acomodan en varias lineas. */}
                <div
                  ref={quickRepliesScrollRef}
                  className="flex flex-wrap items-center gap-1.5 text-xs pb-1"
                >
                  <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      <span>Respuestas Rápidas</span>
                      <span className="px-1.5 py-0.2 bg-emerald-600 text-white rounded-full text-[9px] font-mono font-bold">
                        {quickReplies.length}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsQuickRepliesModalOpen(true)}
                      title="Configurar y crear plantillas ilimitadas"
                      aria-label="Configurar y crear plantillas ilimitadas"
                      className="p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsQuickRepliesModalOpen(true)}
                    className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 rounded-xl text-[11px] font-extrabold shrink-0 flex items-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-105"
                    title="Crear una nueva plantilla de WhatsApp"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Plantilla</span>
                  </button>

                  <button
                  type="button"
                  onClick={() => setShowButtonEditor(v => !v)}
                  title='Enviar mensaje con botones' aria-label='Enviar mensaje con botones'
                  className='px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-[11px] font-extrabold shrink-0 flex items-center gap-1 cursor-pointer transition-all shadow-2xs hover:scale-105'
                  >
                    Enviar boton <ExternalLink className='w-4 h-4' />
                  </button>

                  {quickReplies.map((qr) => (
                    <button
                      key={qr.id}
                      onClick={() => handleExecuteQuickReply(qr)}
                      title={qr.imageUrl ? `Enviar: "${qr.text}" + Imagen adjunta` : `Insertar: "${qr.text}"`}
                      className={`px-3 py-1 rounded-xl text-[11px] font-semibold shrink-0 flex items-center gap-1.5 transition-all cursor-pointer hover:scale-102 ${qr.imageUrl
                        ? 'bg-emerald-50 dark:bg-emerald-900/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 shadow-2xs font-bold'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span>{qr.emoji || '⚡'}</span>
                      <span>{qr.title}</span>
                      {qr.imageUrl && (
                        <ImageIcon className="w-3 h-3 text-emerald-600" />
                      )}
                    </button>
                  ))}

                </div>

                {hoverEdge === 'right' && (
                  <button
                    onClick={() => scrollQuickReplies('right')}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center cursor-pointer hover:bg-slate-100 animate-fadeIn"
                    aria-label="Desplazar a la derecha"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                )}
              </div>

              {
                showButtonEditor && (
                
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl shadow-2xs space-y-2">
                    <select
                    value={btnMode}
                    onChange={(e) => {
                      setBtnMode(e.target.value as 'url' | 'reply')
                      setBtnList([{label: '', url: ''}])
                    }}
                    className="w-full p-2 text-xs font-bold bg-white border border-slate-200 rounded-xl"
                    >
                      <option value="url">1 Botón de enlace</option>
                      <option value="reply">Hasta 3 botones de respuesta rápida</option>
                    </select>

                    <textarea
                    value={btnBody}
                    onChange={(e) => setBtnBody(e.target.value)}
                    rows={2}
                    maxLength={1024}
                    placeholder="Texto del mensaje que contendrá los botones"
                    className="w-full p-2 text-xs font-medium bg-white border border-slate-200 rounded-xl resize-none focus:ring-2 focus:ring-emerald-500/20"
                    />

                    {btnList.map((btn, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                        value={btn.label}
                        maxLength={20}
                        placeholder="Etiqueta del botón (máx. 20 caracteres)"
                        onChange={(e) => setBtnList(l => l.map((x, j) => j === idx ? {...x, label: e.target.value} : x))}
                        className="flex-1 p-2 text-xs font-medium bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                        />
                        {btnMode === 'url' && (
                          <input
                          value={btn.url}
                          placeholder="https://..."
                          onChange={(e) => setBtnList(l => l.map((x, j) => j === idx ? {...x, url: e.target.value} : x))}
                          className="flex-1 p-2 text-xs font-medium bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                          />
                        )}
                      </div>
                    ))}

                    <div className="flex items-center gap-2">
                      {btnMode === 'reply' ? (
                        <button
                        type="button"
                        disabled={btnList.length >= 3}
                        onClick={() => setBtnList(l => [...l, {label: '', url: ''}])}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                        >
                          + Añadir botón
                        </button>
                      ): <span/>}
                      <button
                      type="button"
                      onClick={handleSendButtons}
                      className="px-3 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-[11px] font-extrabold shadow-sm shadow-emerald-700/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >Enviar</button>
                    </div>


                  </div>
                  
                )
              }

              {showAttachInput && (
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center gap-2 shadow-2xs text-slate-600 dark:text-slate-300">
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <input
                    type="url"
                    value={attachedImageUrl}
                    onChange={(e) => setAttachedImageUrl(e.target.value)}
                    placeholder="Pega la URL de una imagen (ej: https://...)"
                    className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <label
                    title="Subir imagen desde tu PC"
                    className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Subir de PC</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          if (ev.target?.result) {
                            setAttachedImageUrl(ev.target.result as string);
                          }
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {attachedImageUrl && (
                    <img
                      src={attachedImageUrl}
                      alt="Preview"
                      className="w-8 h-8 rounded-lg object-cover border border-slate-200 shadow-2xs shrink-0"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachInput(false);
                      setAttachedImageUrl('');
                    }}
                    aria-label="Cancelar adjunto de imagen"
                    className="text-slate-400 hover:text-slate-600 px-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all shadow-inner">
                <button
                  type="button"
                  onClick={() => setShowAttachInput(!showAttachInput)}
                  title="Adjuntar imagen por URL o archivo"
                  aria-label="Adjuntar imagen por URL o archivo"
                  className={`p-2 rounded-xl transition-colors cursor-pointer ${attachedImageUrl || showAttachInput
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/60'
                    }`}
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={`Escribe un mensaje de WhatsApp para ${contact.name}...`}
                  rows={2}
                  className="flex-1 bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none resize-none px-1 font-medium"
                />


                {/* Al lado del campo, como el microfono de WhatsApp. El icono es de
                    ondas y no de microfono a proposito: esto no graba la voz del
                    agente, convierte en audio el texto escrito. */}
                <button
                  onClick={handleSendVoiceNote}
                  disabled={isVoiceNoteLoading || !inputText.trim()}
                  aria-label="Convertir el texto en nota de voz"
                  title={!inputText.trim() ? 'Escribe un mensaje para convertirlo en nota de voz' : 'Convertir el texto en nota de voz'}
                  className="p-2 rounded-xl text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400 shrink-0"
                >
                  <AudioLines className={`w-4 h-4 ${isVoiceNoteLoading ? 'animate-pulse' : ''}`} />
                </button>
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() && !attachedImageUrl}
                  aria-label="Enviar mensaje"
                  className="p-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-emerald-700/20 active:scale-95 shrink-0 flex items-center justify-center gap-1 font-bold"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-xs">
            <MessageSquare className="w-9 h-9 mb-2" />
            <span className="font-bold text-slate-600 text-sm">Selecciona una conversación para comenzar</span>
          </div>
        )}
      </div>

      {/* COLUMN 3: Right Sidepanel (XIO Extension & Contact CRM Info) */}
      {contact && (showExtensionPanel || mobileStage === 'info') && (
        <div
          className={`${mobileStage === 'info' ? 'flex' : 'hidden'} ${showExtensionPanel ? 'lg:flex' : 'lg:hidden'} w-full lg:w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 flex-col shrink-0 overflow-y-auto shadow-sm`}
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMobileStage('chat')}
                className="lg:hidden p-1 -ml-1.5 mr-0.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
                aria-label="Volver al chat"
              >
                <ChevronLeft className="w-4.5 h-4.5" />
              </button>
              <Chrome className="w-4 h-4" />
              <span className="font-extrabold text-xs tracking-wide text-emerald-300">Extensión XIO</span>
            </div>
            <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold rounded-full border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> v3.4 Activa
            </span>
          </div>

          <div className="p-3.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50">
            <button
              type="button"
              onClick={() => setIsQuickRepliesModalOpen(true)}
              className="w-full py-2.5 px-3 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600 rounded-2xl text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center justify-between transition-all shadow-xs group cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <span className="group-hover:text-emerald-950 dark:group-hover:text-emerald-300">Respuestas Rápidas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 text-[10px] font-extrabold rounded-full border border-emerald-200">
                  {quickReplies.length} Botones
                </span>
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600" />
              </div>
            </button>
          </div>

          <div className="p-5 border-b border-slate-200 dark:border-slate-700 text-center bg-gradient-to-b from-slate-50/60 to-white dark:from-slate-800/70 dark:to-slate-900">
            <div className={`relative w-16 h-16 rounded-2xl ${getAvatarColor(contact.name)} flex items-center justify-center text-white font-bold text-xl mx-auto mb-2 border-2 border-emerald-300 dark:border-emerald-700 shadow-md overflow-hidden`}>
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
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">{contact.name}</h3>
            {/* <p className="text-xs text-slate-500 font-medium mb-3 flex items-center justify-center gap-1"><Building2 className="w-3 h-3" /> {contact.company || 'InnovateTech Latin America'}</p> */}

            <div className="flex items-center justify-center gap-2 flex-wrap mt-2">
              {getSentimentBadge(contact.sentiment)}
              <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-300 text-emerald-800 text-[10px] font-extrabold rounded-full shadow-2xs flex items-center gap-1">
                <Star className="w-2.5 h-2.5" /> Score IA: {contact.leadScore}/100 <Flame className="w-2.5 h-2.5" />
              </span>
            </div>
          </div>

          <CollapsibleSection
            title="Agendar en Google Calendar"
            icon={<Calendar className="w-3.5 h-3.5" />}
            sectionKey="calendar"
            isOpen={openPanelSections.calendar}
            onToggle={() => togglePanelSection('calendar')}
            bgClassName="bg-emerald-50/25 dark:bg-slate-900"
            headerExtra={
              <span className="text-[10px] text-emerald-800 font-extrabold bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <RefreshCw className="w-2.5 h-2.5" /> Sincronización
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-300 mb-1 font-bold flex items-center gap-1"><Calendar className="w-2.5 h-2.5" /> Fecha:</span>
                <input
                  type="date"
                  value={calendarDate}
                  onChange={(e) => setCalendarDate(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 dark:[color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-300 mb-1 font-bold flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Hora:</span>
                <input
                  type="time"
                  value={calendarTime}
                  onChange={(e) => setCalendarTime(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 dark:[color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                onClick={handleScheduleGoogleCalendar}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold rounded-xl text-xs transition-all cursor-pointer shadow-sm shadow-emerald-700/20 flex items-center justify-center gap-1.5 active:scale-98"
              >
                <Calendar className="w-3.5 h-3.5" /><span>Sincronizar y Notificar en Chat</span><Rocket className="w-3.5 h-3.5" />
              </button>

              <a
                href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Reunión Demo / Asesorí­a: ${contact.name} - XIO`)}&dates=${calendarDate.replace(/-/g, '')}T${calendarTime.replace(/:/g, '')}00/${calendarDate.replace(/-/g, '')}T${calendarTime.replace(/:/g, '')}00&details=${encodeURIComponent(`Reunión agendada ví­a XIO.\nCliente: ${contact.name}\nEmpresa: ${contact.company || 'N/A'}\nTel/WhatsApp: ${realPhone || 'N/A'}\nEmail: ${contact.email || 'N/A'}\nNotas: ${contact.notes || ''}`)}&location=${encodeURIComponent('Google Meet / WhatsApp Video')}${contact.email ? `&add=${encodeURIComponent(contact.email)}` : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-100 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1 text-center shadow-2xs"
              >
                <ExternalLink className="w-3.5 h-3.5" /><span>Abrir en Google Calendar Web</span>
              </a>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Etapa del Funnel (XIO)"
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            sectionKey="pipeline"
            isOpen={openPanelSections.pipeline}
            onToggle={() => togglePanelSection('pipeline')}
          >
            <select
              value={contact.stage}
              onChange={(e) => onUpdateContactStage(contact.id, e.target.value as PipelineStage)}
              className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-extrabold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 shadow-2xs"
            >
              <option value="lead">Prospecto Inicial (Lead)</option>
              <option value="qualified">Lead Cualificado</option>
              <option value="negotiation">En Negociación / Cotización</option>
              <option value="closed_won">Venta Cerrada (Ganada)</option>
              <option value="closed_lost">Perdida</option>
            </select>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-500 font-semibold flex items-center gap-1"><DollarSign className="w-3 h-3" /> Valor Estimado:</span>
              <span className="font-black text-emerald-600 text-sm">${contact.dealValue.toLocaleString()} USD</span>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Etiquetas WhatsApp"
            icon={<Tag className="w-3.5 h-3.5" />}
            sectionKey="tags"
            isOpen={openPanelSections.tags}
            onToggle={() => togglePanelSection('tags')}
          >
            <div className="flex flex-wrap gap-1.5 mb-2">
              {contact.tags.map(t => (
                <span
                  key={t}
                  className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-bold rounded-lg flex items-center gap-1.5 shadow-2xs"
                >
                  <span className="flex items-center gap-1"><Tag className="w-2.5 h-2.5" /> {t}</span>
                  <button
                    onClick={() => handleRemoveTag(t)}
                    aria-label={`Eliminar etiqueta ${t}`}
                    className="text-slate-400 hover:text-rose-600 cursor-pointer font-black"
                  >
                    —
                  </button>
                </span>
              ))}
            </div>
            <input
              type="text"
              placeholder="Agregar etiqueta + Enter..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium"
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Datos de Contacto"
            icon={<Phone className="w-3.5 h-3.5" />}
            sectionKey="details"
            isOpen={openPanelSections.details}
            onToggle={() => togglePanelSection('details')}
          >
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-mono font-semibold text-xs">
              <Phone className="w-3.5 h-3.5" />
              <span>{realPhone ? formatPhoneDisplay(realPhone) : 'Sin teléfono'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium text-xs">
              <Mail className="w-3.5 h-3.5" />
              <span>{contact.email || 'Sin correo'}</span>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Bloc de Notas Privado (Extensión XIO)"
            icon={<FileText className="w-3.5 h-3.5" />}
            sectionKey="notes"
            isOpen={openPanelSections.notes}
            onToggle={() => togglePanelSection('notes')}
          >
            <textarea
              value={contact.notes}
              onChange={(e) => onUpdateContactNotes(contact.id, e.target.value)}
              rows={4}
              placeholder="Guarda recordatorios sobre este cliente..."
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed font-medium shadow-inner"
            />
          </CollapsibleSection>
        </div>
      )}

      {isQuickRepliesModalOpen && (
        <QuickRepliesModal
          isOpen={isQuickRepliesModalOpen}
          onClose={() => setIsQuickRepliesModalOpen(false)}
          quickReplies={quickReplies}
          onSaveQuickReplies={(updated) => {
            if (onUpdateQuickReplies) {
              onUpdateQuickReplies(updated);
            }
          }}
        />
      )}
      {/* MODAL PARA REENVIAR MENSAJES */}
      <Modal
        isOpen={forwardText !== null}
        onClose={closeForwardModal}
        title="Reenviar mensaje"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={closeForwardModal}
            >
              Cancelar
            </Button>

            <Button
              disabled={forwardTargets.size === 0}
              onClick={handleForwardMessage}
            >
              <Forward className="w-4 h-4 mr-1" />
              Reenviar ({forwardTargets.size})
            </Button>
          </div>
        }
      >
        <div className="space-y-4">

          {/* Vista previa del mensaje */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <p className="text-xs font-bold text-emerald-800 mb-2">
              Mensaje seleccionado:
            </p>

            <p className="text-sm text-slate-800 whitespace-pre-line break-words max-h-32 overflow-y-auto">
              {forwardText}
            </p>
          </div>

          {/* Buscar destinatarios */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />

            <input
              type="search"
              value={forwardSearch}
              onChange={(e) => setForwardSearch(e.target.value)}
              placeholder="Buscar contacto..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Lista de conversaciones disponibles */}
          
          <div className="max-h-64 overflow-y-auto space-y-1 select-none">
            {conversations
              .filter(conv =>
                conv.id !== activeConv?.id &&
                conv.contact.name
                  .toLowerCase()
                  .includes(forwardSearch.toLowerCase())
              )
              .map(conv => (
                <div
                  key={conv.id}

                  onMouseDown={(e) => {
                    if (e.button !== 0) return;

                    const target = e.target as HTMLElement;

                    // Mantener el checkbox independiente
                    if (target.closest('input, button, a')) return;

                    startForwardDrag(conv.id);
                    e.preventDefault();
                  }}

                  onMouseEnter={(e) => {
                    if ((e.buttons & 1) === 0) return;
                    enterForwardDrag(conv.id);
                  }}

                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input')) {
                      return;
                    }

                    if (forwardHasDraggedRef.current) {
                      forwardHasDraggedRef.current = false;
                      return;
                    }

                    toggleForwardTarget(conv.id);
                  }}

                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all ${
                    forwardTargets.has(conv.id)
                      ? 'bg-emerald-50 border-emerald-300'
                      : 'bg-white border-transparent hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={forwardTargets.has(conv.id)}
                    onChange={() => toggleForwardTarget(conv.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Seleccionar ${conv.contact.name}`}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  />

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">
                      {conv.contact.name}
                    </p>

                    <p className="text-xs text-slate-500 capitalize">
                      {conv.channel}
                    </p>
                  </div>

                  {forwardTargets.has(conv.id) && (
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
              ))}
          </div>


          <p className="text-xs text-slate-500">
            {forwardTargets.size} conversación(es) seleccionada(s)
          </p>

        </div>
      </Modal>

      <ConfirmDialog
        isOpen={conversationToDelete != null}
        onClose={() => setConversationToDelete(null)}
        onConfirm={() => {
          if (conversationToDelete) {
            handleDeleteConversation(conversationToDelete.id)
            setConversationToDelete(null)
          }
        }
        }
        title="¿Eliminar este chat?"
        message="Esta acción eliminará el contacto y toda la conversación de forma permanente. No se puede deshacer."
        confirmLabel="Eliminar"
        tone="danger"
      />

      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={() => {
          onDeleteContacts(Array.from(selectedContactIds));
          setShowBulkDeleteConfirm(false);
          exitSelectionMode();
        }}
        title={`¿Eliminar ${selectedContactIds.size} ${selectedContactIds.size === 1 ? 'chat' : 'chats'}?`}
        message={`Esta acción eliminará ${selectedContactIds.size === 1 ? 'el contacto seleccionado' : `los ${selectedContactIds.size} contactos seleccionados`} y todas sus conversaciones en todos los canales, de forma permanente. No se puede deshacer.`}
        confirmLabel="Eliminar"
        tone="danger"
      />
    </div>
  );
};