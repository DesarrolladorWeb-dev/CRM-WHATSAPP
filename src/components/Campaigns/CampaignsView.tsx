import React, { useState, useRef, useId } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { useModalA11y } from '@/components/ui/useModalA11y';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { usePresetImages } from '@/hooks/usePresetImages';
import { Campaign, Segment, SocialChannel, CampaignPreview } from '../../types';
import { Sparkles, Plus, CheckCircle2, Image as ImageIcon,
  X, Trash2, Eye, FolderOpen, Check, AlertCircle, 
  Megaphone, Rocket, MessageCircle, Instagram,
  Target, Mail, Tag, Flame, Lightbulb, Save, PenLine, MousePointerClick,
  PartyPopper, CheckCheck, Clock
} from 'lucide-react';
import { Button, Modal } from '../ui';
import { formatWallClock, horaDeParedAUtc, formatDateTime, nombreZonaNegocio } from '@/lib/time';
import { WhatsAppIcon, XBrandIcon, MessengerIcon } from '@/components/Icons/ChannelIcons';

/**
 * Cómo se muestra cada estado del ciclo de vida.
 *
 * Antes la tarjeta solo distinguía «Completada» de todo lo demás, y todo lo
 * demás se pintaba como «En Ejecución» con un punto parpadeante. Con las
 * campañas programadas eso pasa de impreciso a peligroso: una campaña que aún
 * no ha salido diría que está enviándose, y quien la viera podría dispararla a
 * mano creyendo que se atascó — mandando la difusión dos veces.
 *
 * El mapa es exhaustivo sobre CampaignStatus: si algún día se añade un estado
 * nuevo, TypeScript obliga a decidir cómo se ve aquí.
 */
const ESTILO_ESTADO: Record<
  Campaign['status'],
  { texto: string; clase: string; icono: React.ReactNode }
> = {
  draft: {
    texto: 'Borrador',
    clase: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    icono: <PenLine className="w-2.5 h-2.5" />,
  },
  scheduled: {
    texto: 'Programada',
    clase: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    icono: <Clock className="w-2.5 h-2.5" />,
  },
  running: {
    texto: 'En Ejecución',
    clase: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 animate-pulse',
    icono: <Rocket className="w-2.5 h-2.5" />,
  },
  paused: {
    texto: 'Pausada',
    clase: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600',
    icono: <Clock className="w-2.5 h-2.5" />,
  },
  completed: {
    texto: 'Completada',
    clase: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    icono: <CheckCircle2 className="w-2.5 h-2.5" />,
  },
  failed: {
    texto: 'Fallida',
    clase: 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    icono: <AlertCircle className="w-2.5 h-2.5" />,
  },
  cancelled: {
    texto: 'Cancelada',
    clase: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    icono: <X className="w-2.5 h-2.5" />,
  },
};

interface CampaignsViewProps {
  campaigns: Campaign[];
  segments: Segment[];
  /** Guarda la campaña como borrador. Devuelve su id, o el motivo del fallo. */
  onCreateCampaign: (
    newCampaign: Omit<Campaign, 'id' | 'createdAt' | 'sentCount' | 'deliveredCount' | 'openRate' | 'clickRate' | 'conversions'>
  ) => Promise<{ id: string | null; error?: string }>;
  /** Calcula la audiencia real sin enviar nada. */
  onPreviewCampaign: (campaignId: string) => Promise<CampaignPreview | null>;
  /** Lanza el envío. Irreversible: solo se llama tras confirmar. */
  onLaunchCampaign: (
    campaignId: string
  ) => Promise<{ ok: boolean; message: string; recipientCount?: number }>;
  preselectedSegmentId?: string;
  onDeleteCampaign: (campaignId: string) => void;

  canDeleteCampaign: boolean;
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  campaigns,
  segments,
  onCreateCampaign,
  onPreviewCampaign,
  onLaunchCampaign,
  preselectedSegmentId,
  onDeleteCampaign,
  canDeleteCampaign
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  // Estado del flujo de lanzamiento: guardar -> previsualizar -> confirmar.
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchResult, setLaunchResult] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState<SocialChannel>('whatsapp');
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>(preselectedSegmentId || (segments[0]?.id || 'seg_1'));
  const [offerTopic, setOfferTopic] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string>('');
  /**
   * Hora de pared elegida en el selector ("2026-09-25T14:30"), sin zona.
   * Se manda tal cual: es el SERVIDOR quien la interpreta en la zona del
   * negocio. Convertirla aquí usaría la zona del portátil de quien la
   * programa, y la misma campaña saldría a horas distintas según desde dónde
   * se configure.
   */
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [campaingToDelete, setCampaingToDelete] = useState<Campaign>(null);

  const { images: presetImages, addImage: addPresetImage } = usePresetImages();

  // Image Upload / Custom URL panel state
  const [isAddImagePanelOpen, setIsAddImagePanelOpen] = useState<boolean>(false);
  const [newImageName, setNewImageName] = useState<string>('');
  const [newImageUrl, setNewImageUrl] = useState<string>('');
  const [imageUploadError, setImageUploadError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Copy Generation State
  const [isAiCopyLoading, setIsAiCopyLoading] = useState(false);
  const [aiVariations, setAiVariations] = useState<{ title: string; content: string }[] | null>(null);
  const [copyWait, setCopyWait] = useState<number>(null);
  const [, setAiHashtags] = useState<string[]>([]);

  const modalTitleId = useId();
  const scheduleInputId = useId();

  const zonaNegocio = nombreZonaNegocio();

  /**
   * Suelo del selector: dentro de cinco minutos.
   *
   * Es solo una ayuda del navegador; quien valida de verdad es el servidor,
   * que rechaza cualquier fecha pasada. Se recalcula al abrir el modal y no en
   * cada render, porque un `min` que cambia mientras escribes haría saltar el
   * control bajo el cursor.
   */
  const [minScheduledAt, setMinScheduledAt] = useState('');
  const openCampaignModal = () => {
    setMinScheduledAt(formatWallClock(new Date(Date.now() + 5 * 60 * 1000)));
    setIsModalOpen(true);
  };

  /** "25/09/2026, 14:30" a partir de la hora de pared del selector. */
  const formatearHoraElegida = (valor: string) => {
    const fecha = horaDeParedAUtc(valor);
    return fecha ? formatDateTime(fecha) : valor;
  };
  const { panelRef, onKeyDown, onBackdropMouseDown } = useModalA11y<HTMLDivElement>({
    isOpen: isModalOpen,
    onClose: () => setIsModalOpen(false),
  });


  // Call Server-Side Gemini AI Campaign Copy Endpoint
  const handleGenerateAiCopy = async () => {
    if (!offerTopic.trim()) return;
    setIsAiCopyLoading(true);

    try {
      const response = await apiFetch('/api/ai/campaign-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignTopic: title || 'Lanzamiento Promocional',
          targetChannel: channel,
          productOffer: offerTopic,
          tone: 'Persuasivo, profesional y directo con emojis'
        })
      });

      const resData = await response.json();

      if(!resData.success){
        if(response.status === 429){
          setCopyWait(resData.retryAfter);
        }
      }

      if (resData.success && resData.data) {
        setCopyWait(null);
        setAiVariations(resData.data.variations || []);
        setAiHashtags(resData.data.recommendedHashtags || []);
        if (resData.data.variations?.[0]?.content && !content) {
          setContent(resData.data.variations[0].content);
        }
      }
    } catch (err) {
      console.error('Error generating AI copy:', err);
    } finally {
      setIsAiCopyLoading(false);
    }
  };

  // Handle local file selection and convert to Base64 Data URL
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setImageUploadError('Por favor selecciona un archivo de imagen válido (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageUploadError('La imagen no debe superar los 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const result = loadEvent.target?.result as string;
      if (result) {
        const defaultName = file.name.replace(/\.[^/.]+$/, "");
        setNewImageUrl(result);
        if (!newImageName) {
          setNewImageName(defaultName);
        }
      }
    };
    reader.onerror = () => {
      setImageUploadError('Ocurrió un error al leer el archivo de imagen.');
    };
    reader.readAsDataURL(file);
  };

  // Save new uploaded image to gallery (persistida en /api/preset-images) and
  // select it for the campaign being edited.
  const handleSaveAndApplyNewImage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setImageUploadError('');

    const finalUrl = newImageUrl.trim();
    if (!finalUrl) {
      setImageUploadError('Debes subir un archivo o ingresar una URL de imagen válida.');
      return;
    }

    try {
      const saved = await addPresetImage({
        name: newImageName.trim() || 'Imagen de Campaña',
        url: finalUrl,
        type: 'Campaña / Banner',
      });
      setImageUrl(saved.url);
    } catch {
      // Si falla el guardado en la galería, al menos se aplica a esta campaña.
      setImageUploadError('No se pudo guardar la imagen en la galería, pero se aplicó a esta campaña.');
      setImageUrl(finalUrl);
    }

    // Reset and close panel
    setNewImageName('');
    setNewImageUrl('');
    setIsAddImagePanelOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Limpia el formulario tras guardar. */
  const resetForm = () => {
    setTitle('');
    setOfferTopic('');
    setContent('');
    setImageUrl('');
    setScheduledAt('');
    setAiVariations(null);
    setIsAddImagePanelOpen(false);
  };

  /**
   * Datos del formulario listos para enviar al servidor.
   *
   * `programar` decide el estado con el que nace la campaña. Un borrador no
   * sale nunca solo; una `scheduled` la recoge el worker cuando llega su hora.
   * Por eso son dos botones distintos y no una casilla: la diferencia entre
   * guardar y comprometerse a enviar tiene que ser un gesto explícito.
   */
  const buildPayload = ({ programar = false }: { programar?: boolean } = {}) => {
    const targetSeg = segments.find(s => s.id === selectedSegmentId);
    return {
      title: title || 'Nueva Campaña Omnicanal',
      channel,
      segmentId: selectedSegmentId,
      segmentName: targetSeg?.name || 'Segmento General',
      content: content || 'Contenido de la campaña.',
      imageUrl: imageUrl || undefined,
      status: programar ? ('scheduled' as const) : ('draft' as const),
      // Se manda la hora de pared tal cual la escribió el usuario. El servidor
      // la interpreta en la zona del negocio (ver src/lib/time.ts).
      scheduledAt: programar ? scheduledAt : null,
    };
  };

  /**
   * «Guardar Borrador»: solo persiste. Antes este botón y el de disparar
   * llamaban a la misma función y únicamente cambiaba el texto del estado.
   */
  const handleSaveDraft = async () => {
    setIsPreparing(true);
    setLaunchError(null);
    try {
      const res = await onCreateCampaign(buildPayload());
      if (!res.id) {
        // El modal se queda abierto con el motivo a la vista: cerrarlo como si
        // hubiera ido bien haría creer al usuario que la campaña se guardó.
        setLaunchError(res.error || 'No se pudo guardar la campaña.');
        return;
      }
      setIsModalOpen(false);
      resetForm();
    } finally {
      setIsPreparing(false);
    }
  };

  /**
   * «Programar»: guarda la campaña en estado `scheduled` con su hora.
   *
   * A partir de aquí no hace falta que nadie vuelva a entrar: el worker
   * (src/lib/services/campaignScheduler.ts) la recoge cuando llega el momento
   * y la envía solo. Antes de esto el estado `scheduled` existía en el modelo
   * pero no había forma de crearlo desde la interfaz, y nada lo disparaba.
   */
  const handleSchedule = async () => {
    if (!scheduledAt) {
      setLaunchError('Elige la fecha y la hora antes de programar la campaña.');
      return;
    }

    setIsPreparing(true);
    setLaunchError(null);
    try {
      const res = await onCreateCampaign(buildPayload({ programar: true }));
      if (!res.id) {
        // El servidor rechaza fechas pasadas y horas que no existen. Su motivo
        // se muestra tal cual: es más preciso que cualquier texto genérico.
        setLaunchError(res.error || 'No se pudo programar la campaña.');
        return;
      }
      setIsModalOpen(false);
      resetForm();
    } finally {
      setIsPreparing(false);
    }
  };

  /**
   * «Disparar»: guarda y pide la audiencia real, pero NO envía. Abre el
   * diálogo de confirmación con los números de verdad. El envío solo ocurre
   * si el usuario confirma, porque no se puede deshacer.
   */
  const handlePrepareLaunch = async () => {
    setIsPreparing(true);
    setLaunchError(null);
    try {
      const guardado = await onCreateCampaign(buildPayload());
      if (!guardado.id) {
        setLaunchError(guardado.error || 'No se pudo guardar la campaña.');
        return;
      }
      const datos = await onPreviewCampaign(guardado.id);
      if (!datos) {
        onDeleteCampaign(guardado.id)
        setLaunchError('No se pudo calcular la audiencia de la campaña.');
        return;
      }
      console.log(datos)
      setIsModalOpen(false);
      resetForm();
      setPreview(datos);
    } finally {
      setIsPreparing(false);
    }
  };

  /** Confirmación final: aquí sí salen los mensajes. */
  const handleConfirmLaunch = async () => {
    if (!preview) return;
    setIsLaunching(true);
    setLaunchError(null);
    try {
      const res = await onLaunchCampaign(preview.campaignId);
      if (!res.ok) {
        setLaunchError(res.message);
        return;
      }
      setPreview(null);
      setLaunchResult(res.message);
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between shadow-2xs">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-indigo-600" />
            <span>Campañas de Marketing & Difusión Masiva IA</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> Genera textos persuasivos con IA y transmite broadcasts masivos con imágenes en WhatsApp, Instagram y X/Twitter.
          </p>
        </div>

        <button
          onClick={openCampaignModal}
          className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-black shadow-sm shadow-emerald-700/25 transition-all cursor-pointer hover:scale-102 active:scale-98"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Crear Campaña con Gemini IA</span>
          <Rocket className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Campaigns List */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          { (!campaigns || campaigns.length <= 0) && (
            <div className='flex items-center justify-center w-screen'>
              <p className='pt-32 text-2xl'>Sin contenido que mostrar</p>
            </div>)
          }
          {campaigns.map(camp => (
            <div
              key={camp.id}
              className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-3xl p-6 shadow-xs hover:shadow-md dark:hover:shadow-black/30 transition-all space-y-4 flex flex-col justify-between hover:scale-[1.01] dark:hover:border-slate-600"
            >
              <div className="space-y-3.5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold uppercase rounded-full border border-emerald-200 dark:border-emerald-700 flex items-center gap-1">
                        {camp.channel === 'whatsapp' ? <><WhatsAppIcon className="w-2.5 h-2.5" /> WhatsApp</> : camp.channel === 'instagram' ? <><Instagram className="w-2.5 h-2.5" /> Instagram</> : camp.channel === 'twitter' ? <><XBrandIcon className="w-2.5 h-2.5" /> X</> : <><MessengerIcon className="w-2.5 h-2.5" /> Messenger</>}
                      </span>
                      <span className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-full border flex items-center gap-1 ${ESTILO_ESTADO[camp.status].clase}`}>
                        {ESTILO_ESTADO[camp.status].icono}
                        {ESTILO_ESTADO[camp.status].texto}
                      </span>
                    </div>
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">{camp.title}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5 flex items-center gap-1">
                      <Target className="w-3 h-3" /> Audiencia: <span className="text-emerald-600 dark:text-emerald-400 font-bold">{camp.segmentName}</span>
                    </p>

                    {/* Cuándo sale. Sin esto, «Programada» no dice lo único
                        que de verdad se quiere saber de una campaña programada. */}
                    {camp.status === 'scheduled' && camp.scheduledAt && (
                      <p className="text-xs text-indigo-700 dark:text-indigo-300 font-bold mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Se enviará el {formatDateTime(new Date(camp.scheduledAt))} (hora de {zonaNegocio})
                      </p>
                    )}

                    {/* Una campaña fallida sin motivo a la vista obliga a
                        abrir los logs del servidor para saber qué pasó. */}
                    {camp.status === 'failed' && camp.failureReason && (
                      <p className="text-xs text-rose-700 dark:text-rose-300 font-semibold mt-0.5 flex items-start gap-1">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{camp.failureReason}</span>
                      </p>
                    )}
                  </div>
                  {canDeleteCampaign && (
                    <button
                      type="button"
                      onClick={() => setCampaignToDelete(camp)}
                      title="Eliminar campaña"
                      aria-label="Eliminar campaña"
                      className="p-1.5 rounded-lg text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {/* Campaign Image if attached */}
                {camp.imageUrl && (
                  <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-48 bg-slate-100 dark:bg-slate-800 relative group shadow-2xs">
                    <img 
                      src={camp.imageUrl} 
                      alt={camp.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-40 object-cover"
                    />
                    <div className="absolute top-2 right-2 px-2.5 py-1 bg-slate-950/80 backdrop-blur-xs text-white text-[10px] font-extrabold rounded-xl flex items-center gap-1.5 shadow-xs">
                      <ImageIcon className="w-3 h-3" />
                      <span>Banner Adjunto</span>
                    </div>
                  </div>
                )}

                {/* Message Preview */}
                <div className="p-3.5 bg-[#efeae2]/50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed shadow-inner">
                  &quot;{camp.content}&quot;
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 text-center">
                <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase flex items-center justify-center gap-1"><Mail className="w-2.5 h-2.5" /> Enviados</span>
                  <span className="font-black text-xs text-slate-900 dark:text-slate-100">{camp.sentCount}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase flex items-center justify-center gap-1"><Eye className="w-2.5 h-2.5" /> Apertura</span>
                  <span className="font-black text-xs text-emerald-600 dark:text-emerald-400">{camp.openRate}%</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase flex items-center justify-center gap-1"><MousePointerClick className="w-2.5 h-2.5" /> Clics</span>
                  <span className="font-black text-xs text-teal-600 dark:text-teal-400">{camp.clickRate}%</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase flex items-center justify-center gap-1"><PartyPopper className="w-2.5 h-2.5" /> Ventas</span>
                  <span className="font-black text-xs text-emerald-600 dark:text-emerald-400">{camp.conversions}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN DE CAMPAÑA */}
      <Modal
        isOpen={campaingToDelete != null}
        onClose={() => setCampaingToDelete(null)}
        title="🗑️ Eliminar campaña"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCampaingToDelete(null)}
            >
              Cancelar
            </Button>

            <Button
              variant="danger"
              onClick={() => {
                if (campaingToDelete) {
                  onDeleteCampaign(campaingToDelete.id);
                  setCampaingToDelete(null);
                }
              }}
            >
              Eliminar campaña
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-md text-black">
            ¿Estás seguro de que deseas eliminar la campaña?
          </p>

          {campaingToDelete && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-md font-extrabold text-red-800">
                {campaingToDelete.title}
              </p>
            </div>
          )}

          <p className="text-md text-black">
            Esta acción no se puede deshacer.
          </p>
        </div>
      </Modal>

      {/* CREATE CAMPAIGN WITH IA MODAL */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4"
          onMouseDown={onBackdropMouseDown}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-700 space-y-4 max-h-[92vh] overflow-y-auto animate-fadeIn outline-none"
          >

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-800 shadow-2xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 id={modalTitleId} className="text-base font-black text-slate-900 dark:text-slate-100">
                    Creador de Campañas Masivas con IA Gemini 3.6
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Redacta copys persuasivos y adjunta banners promocionales para WhatsApp Web.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                aria-label="Cerrar modal de creación de campaña"
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              
              {/* Campaign Name & Channel */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1"><Tag className="w-3 h-3" /> Nombre de la Campaña</label>
                  <input
                    type="text"
                    placeholder="Ej: Promo Descuento Módulo IA"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium"
                  />
                </div>

                <div>
                  <label className="font-extrabold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1"><MessageCircle className="w-3 h-3" /> Canal de Difusión</label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as SocialChannel)}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-bold"
                  >
                    <option value="whatsapp">WhatsApp Broadcast</option>
                  </select>
                </div>
              </div>

              {/* Target Segment */}
              <div>
                <label className="font-extrabold text-slate-700 flex items-center gap-1 mb-1"><Target className="w-3 h-3" /> Segmento Objetivo de Audiencia</label>
                <select
                  value={selectedSegmentId}
                  onChange={(e) => setSelectedSegmentId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-bold dark:color-scheme:dark"
                >
                  {segments.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.contactCount} Clientes)</option>
                  ))}
                </select>
              </div>

              {/* Programación: opcional. Vacío = la campaña se guarda o se
                  dispara a mano, como hasta ahora. */}
              <div>
                <label
                  htmlFor={scheduleInputId}
                  className="font-extrabold text-slate-700 flex items-center gap-1 mb-1"
                >
                  <Clock className="w-3 h-3" /> Programar envío
                  <span className="font-semibold text-slate-400">(opcional)</span>
                </label>
                <input
                  id={scheduleInputId}
                  type="datetime-local"
                  value={scheduledAt}
                  min={minScheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 dark:color-scheme:dark"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-1">
                  {scheduledAt ? (
                    <>
                      Se enviará sola el{' '}
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                        {formatearHoraElegida(scheduledAt)}
                      </span>{' '}
                      (hora de {zonaNegocio}). No hace falta que vuelvas a entrar.
                    </>
                  ) : (
                    <>Déjalo vacío para guardar como borrador o disparar ahora.</>
                  )}
                </p>
              </div>

              {/* Step 1: AI Prompt Input */}
              <div className="p-4 bg-linear-to-r from-emerald-50/90 to-teal-50/90 dark:from-emerald-950/50 dark:to-slate-800 border border-emerald-200 dark:border-emerald-800 rounded-3xl space-y-3">
                <label className="font-black text-emerald-950 dark:text-emerald-300 flex items-center gap-1.5 text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>1. Indícale a la IA el producto, beneficio u oferta:</span>
                  { copyWait && (
                    <div>
                      <br></br>
                      <span className="mt-1 text-xs font-bold text-red-800">*Segundos restantes para un nuevo intento: {copyWait}</span>
                    </div>
                  )}
                </label>
                <textarea
                  placeholder="Ej: Ofrecemos 30% de descuento en el plan anual de XIO con automatización de WhatsApp e IA Gemini. Código: PROMO30."
                  value={offerTopic}
                  onChange={(e) => setOfferTopic(e.target.value)}
                  className="w-full p-3 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700 rounded-2xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium leading-relaxed"
                  rows={2}
                />
                <button
                  type="button"
                  onClick={handleGenerateAiCopy}
                  disabled={isAiCopyLoading || !offerTopic.trim()}
                  className="w-full py-2.5 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50 transition-all active:scale-[0.99]"
                >
                  <Sparkles className={`w-4 h-4 ${isAiCopyLoading ? 'animate-spin' : ''}`} />
                  <span>{isAiCopyLoading ? 'Generando variaciones con Gemini IA...' : 'Generar Variaciones de Textos con IA'}</span>
                </button>
              </div>

              {/* Step 2: AI Generated Variations Selection */}
              {aiVariations && aiVariations.length > 0 && (
                <div className="space-y-2 pt-1">
                  <label className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5" /> 2. Selecciona la variación preferida:</span>
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold">Haz clic para cargar en el mensaje final</span>
                  </label>
                  <div className="space-y-2.5">
                    {aiVariations.map((v, i) => (
                      <div
                        key={i}
                        onClick={() => setContent(v.content)}
                        className={`p-3.5 border rounded-2xl cursor-pointer transition-all text-xs space-y-1.5 ${
                          content === v.content
                            ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/90 dark:bg-emerald-950/40 shadow-xs font-medium scale-[1.01]'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <div className="font-extrabold text-emerald-900 dark:text-emerald-300 flex items-center justify-between">
                          <span className="flex items-center gap-1">{i === 0 ? <Flame className="w-3.5 h-3.5" /> : i === 1 ? <Lightbulb className="w-3.5 h-3.5" /> : <Target className="w-3.5 h-3.5" />} {v.title}</span>
                          {content === v.content && <span className="text-emerald-600 dark:text-emerald-400 font-black text-xs flex items-center gap-1"><Check className="w-3 h-3" /> Seleccionado</span>}
                        </div>
                        <p className="text-slate-700 dark:text-slate-200 font-medium text-[11px] leading-relaxed">
                          &quot;{v.content}&quot;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CUADRO PARA INSERTAR IMAGEN A LA CAMPAÑA */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl space-y-3 shadow-2xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 flex items-center justify-center">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs block">
                        Imagen / Banner Adjunto a la Campaña (Opcional)
                      </span>
                      <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        Inserta un flyer o foto de producto que acompañará el mensaje en WhatsApp.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {imageUrl && (
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="px-3 py-1 text-[11px] font-extrabold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer border border-rose-200 inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Quitar imagen
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsAddImagePanelOpen(!isAddImagePanelOpen)}
                      className={`px-3.5 py-1.5 text-[11px] font-extrabold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                        isAddImagePanelOpen
                          ? 'bg-slate-900 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAddImagePanelOpen ? 'Cerrar' : 'Subir / Ingresar Imagen'}</span>
                    </button>
                  </div>
                </div>

                {/* Subida o Ingreso de Nueva Imagen Form Panel */}
                {isAddImagePanelOpen && (
                  <div className="p-4 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-2xl space-y-3 shadow-xs animate-fadeIn">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Subir Imagen desde Computadora o Pegar Enlace</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAddImagePanelOpen(false)}
                        aria-label="Cerrar panel de imagen"
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {imageUploadError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-[11px] font-bold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {imageUploadError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 block mb-1">
                          1. Subir archivo local (JPG, PNG, WebP)
                        </label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 dark:file:bg-emerald-950/50 file:text-emerald-800 dark:file:text-emerald-300 hover:file:bg-emerald-100 dark:hover:file:bg-emerald-900/50 cursor-pointer bg-slate-50 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 rounded-xl"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-extrabold text-slate-700 block mb-1">
                          2. O pegar URL directa
                        </label>
                        <input
                          type="url"
                          placeholder="https://ejemplo.com/banner-promo.jpg"
                          value={newImageUrl.startsWith('data:') ? '' : newImageUrl}
                          onChange={(e) => setNewImageUrl(e.target.value)}
                          className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium"
                        />
                      </div>
                    </div>

                    {newImageUrl && (
                      <div>
                        <label className="text-[11px] font-extrabold text-slate-700 block mb-1">
                          Vista previa
                        </label>
                        <div className="w-full h-32 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex items-center justify-center">
                          <img
                            src={newImageUrl}
                            alt="Vista previa de la imagen a adjuntar"
                            className="max-w-full max-h-full object-contain"
                            onError={() => setImageUploadError('No se pudo cargar la imagen desde esa URL.')}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAddImagePanelOpen(false)}
                        className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveAndApplyNewImage}
                        disabled={!newImageUrl}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-extrabold rounded-xl cursor-pointer shadow-xs flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /><span>Adjuntar a Campaña</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Galería de Imágenes Disponibles */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" /> Selecciona una imagen de la galería:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {presetImages.map((preset) => {
                      const isSelected = imageUrl === preset.url;
                      return (
                        <div
                          key={preset.id}
                          onClick={() => setImageUrl(preset.url)}
                          className={`p-2 border rounded-2xl cursor-pointer transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'border-emerald-500 dark:border-emerald-400 ring-2 ring-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/40 shadow-xs scale-102'
                              : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-400'
                          }`}
                        >
                          <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 mb-1.5">
                            <img
                              src={preset.url}
                              alt={preset.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            {isSelected && (
                              <div className="absolute top-1 right-1 w-5 h-5 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-xs">
                                <Check className="w-3 h-3" strokeWidth={3} />
                              </div>
                            )}
                          </div>
                          <span className="text-[11px] font-extrabold text-slate-900 dark:text-slate-100 truncate block px-0.5">
                            {preset.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Step 3: Selected Final Content */}
              <div>
                <label className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1 mb-1">
                  <PenLine className="w-3 h-3" /> 3. Mensaje Final de la Campaña
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="El texto seleccionado se cargará aquí para enviar..."
                  rows={3}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed"
                />
              </div>

              {/* Vista Previa del Mensaje de la Campaña (Live Preview) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Vista Previa en WhatsApp:</span>
                  </span>
                  {imageUrl && (
                    <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <ImageIcon className="w-2.5 h-2.5" /> Con Imagen Adjunta
                    </span>
                  )}
                </div>

                <div className="p-4 bg-[#efeae2]/80 dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 flex justify-end">
                  <div className="max-w-md w-full bg-[#dcf8c6] text-slate-900 rounded-2xl rounded-tr-xs p-3.5 text-xs shadow-xs border border-emerald-300/80 space-y-2">
                    {Boolean(imageUrl) && (
                      <div className="rounded-xl overflow-hidden border border-emerald-300/50 bg-black/5 shadow-2xs">
                        <img
                          key={imageUrl}
                          src={imageUrl}
                          alt="Imagen adjunta a la campaña"
                          referrerPolicy="no-referrer"
                          className="w-full max-h-52 object-cover block"
                        />
                      </div>
                    )}
                    <p className="leading-relaxed whitespace-pre-line text-slate-900 font-medium text-[11px]">
                      {content
                        ? content.replace(/{nombre}/g, 'Valeria Gómez').replace(/{empresa}/g, 'Innovatech')
                        : 'El mensaje de la campaña aparecerá aquí...'}
                    </p>
                    <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 pt-0.5 font-bold">
                      <span>12:00</span>
                      <CheckCheck className="w-3 h-3 text-emerald-700" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Error del servidor al guardar: visible en el propio modal. */}
              {launchError && !preview && (
                <div className="mt-3 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  <p className="text-xs font-bold text-rose-800">{launchError}</p>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="pt-3 flex items-center justify-between border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-2xl font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isPreparing}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-2xl font-bold cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" /> Guardar Borrador
                  </button>
                  {/* Solo aparece cuando hay una hora elegida: un botón
                      «Programar» sin fecha solo puede acabar en error. */}
                  {scheduledAt && (
                    <button
                      type="button"
                      onClick={handleSchedule}
                      disabled={isPreparing || !selectedSegmentId}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-bold cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{isPreparing ? 'Programando…' : 'Programar'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePrepareLaunch}
                    disabled={isPreparing || !selectedSegmentId}
                    className="px-5 py-2.5 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-black rounded-2xl shadow-sm cursor-pointer flex items-center gap-1.5"
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    <span>{isPreparing ? 'Calculando audiencia…' : 'Revisar y Disparar'}</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/*
        Confirmación de envío. Es la pantalla que faltaba entre rellenar el
        formulario y mandar cientos de mensajes: muestra la audiencia REAL
        calculada en el servidor, por qué se excluye al resto y cómo queda el
        mensaje ya personalizado con un contacto de verdad.
      */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-confirmar-envio"
            className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
          >
            <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
              <h3
                id="titulo-confirmar-envio"
                className="text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2"
              >
                <Rocket className="w-5 h-5 text-emerald-600" />
                Vas a enviar a {preview.recipientCount} contacto{preview.recipientCount === 1 ? '' : 's'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                Segmento «{preview.segmentName}» · {preview.channelLabel}
              </p>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl py-3">
                  <div className="text-xl font-black text-emerald-700 dark:text-emerald-400">{preview.recipientCount}</div>
                  <div className="text-[10px] font-bold text-emerald-900/70 dark:text-emerald-300 uppercase">Reciben</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl py-3">
                  <div className="text-xl font-black text-slate-700 dark:text-slate-100">
                    {preview.excluded.sinDireccion + preview.excluded.otroCanal}
                  </div>
                  <div className="text-[10px] font-bold text-slate-900/60 dark:text-slate-400 uppercase">No alcanzables</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl py-3">
                  <div className="text-xl font-black text-amber-700 dark:text-amber-400">{preview.excluded.bajaDifusion}</div>
                  <div className="text-[10px] font-bold text-amber-900/70 dark:text-amber-300 uppercase">Dados de baja</div>
                </div>
              </div>

              {preview.sampleMessage && (
                <div>
                  <p className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase mb-1.5">
                    Vista previa · {preview.sampleName}
                  </p>
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 rounded-2xl px-4 py-3 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                    {preview.sampleMessage}
                  </div>
                </div>
              )}

              {preview.warnings.length > 0 && (
                <ul className="space-y-1.5">
                  {preview.warnings.map((aviso, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{aviso}</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 rounded-2xl px-4 py-3">
                Esta acción no se puede deshacer. Los mensajes enviados no se pueden retirar.
              </p>

              {launchError && (
                <p className="text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/50 rounded-2xl px-4 py-3">
                  {launchError}
                </p>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { if (preview) onDeleteCampaign(preview.campaignId); setPreview(null); setLaunchError(null); }}
                disabled={isLaunching}
                className="px-4 py-2.5 rounded-2xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLaunch}
                disabled={isLaunching || preview.recipientCount === 0}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black rounded-2xl cursor-pointer inline-flex items-center gap-1.5"
              >
                <Rocket className="w-3.5 h-3.5" />
                {isLaunching ? 'Enviando…' : `Sí, enviar a ${preview.recipientCount}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {launchResult && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white rounded-2xl px-5 py-4 shadow-2xl flex items-center gap-3">
          <CheckCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-bold">{launchResult}</span>
          <button
            type="button"
            onClick={() => setLaunchResult(null)}
            aria-label="Cerrar aviso"
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={campaignToDelete !== null}
        onClose={() => setCampaignToDelete(null)}
        onConfirm={() => {
          if (campaignToDelete) onDeleteCampaign(campaignToDelete.id);
        }}
        title="¿Eliminar campaña?"
        message={
          <>
            Esta acción eliminará la campaña
            {campaignToDelete ? <> «<strong>{campaignToDelete.title}</strong>»</> : null}.
            {' '}Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar campaña"
        cancelLabel="Cancelar"
        tone="danger"
      />
    </div>
  );
};