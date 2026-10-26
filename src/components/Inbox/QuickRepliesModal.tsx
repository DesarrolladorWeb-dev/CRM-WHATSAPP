import React, { useState, useRef, useId, useCallback } from 'react';
import { QuickReply } from '../../types';
import { useModalA11y } from '@/components/ui/useModalA11y';
import { apiFetch } from '@/lib/apiClient';
import { usePresetImages } from '@/hooks/usePresetImages';
import { formatTime } from '@/lib/time';
import { INITIAL_QUICK_REPLIES } from '../../mockData';
import { 
  Zap, Plus, Trash2, Image as ImageIcon, Check, X, Eye, 
  UploadCloud, FolderOpen, RotateCcw, AlertCircle, Undo2,
  Copy, Search, CheckCheck, Star, Hand, DollarSign, Tag, Wrench
} from 'lucide-react';
import { Button, Modal } from '../ui';

interface QuickRepliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  quickReplies: QuickReply[];
  onSaveQuickReplies: (updated: QuickReply[]) => void;
}

const LOCAL_STORAGE_QUICK_REPLIES_KEY = 'xio_crm_quick_replies_v2';

type QuickReplyCategory = NonNullable<QuickReply['category']>;

const generateQuickReplyId = () => `qr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

const CATEGORIES: { key: string; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'all', label: 'Todas', icon: Star, color: 'bg-slate-100 text-slate-800' },
  { key: 'saludo', label: 'Saludos', icon: Hand, color: 'bg-emerald-100 text-emerald-800' },
  { key: 'ventas', label: 'Ventas', icon: DollarSign, color: 'bg-blue-100 text-blue-800' },
  { key: 'precios', label: 'Precios', icon: Tag, color: 'bg-purple-100 text-purple-800' },
  { key: 'soporte', label: 'Soporte', icon: Wrench, color: 'bg-amber-100 text-amber-800' },
  { key: 'general', label: 'General', icon: Zap, color: 'bg-slate-100 text-slate-700' }
];

export const QuickRepliesModal: React.FC<QuickRepliesModalProps> = ({
  isOpen,
  onClose,
  quickReplies,
  onSaveQuickReplies
}) => {
  const [items, setItems] = useState<QuickReply[]>(() => {
    if (quickReplies && quickReplies.length > 0) return quickReplies;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_QUICK_REPLIES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_QUICK_REPLIES;
  });

  const [selectedId, setSelectedId] = useState<string>(() => {
    return (quickReplies && quickReplies[0]?.id) || items[0]?.id || 'qr_1';
  });

  const [searchFilter, setSearchFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string>('');

  // Galeria de imagenes de plantillas: ahora persistida en Postgres via
  // /api/preset-images (compartida con CampaignsView a traves de este hook;
  // antes vivia solo en localStorage y nunca se guardaba de verdad).
  const { images: presetImages, addImage: addPresetImage, removeImage: removePresetImage } = usePresetImages();

  // Track last removed image for the active form to allow restoring/undo
  const [lastRemovedImage, setLastRemovedImage] = useState<string>('');

  // New Preset Image Form State (Ingreso de nuevas imágenes a la galería)
  const [showAddImagePanel, setShowAddImagePanel] = useState<boolean>(false);
  const [newImageTitle, setNewImageTitle] = useState<string>('');
  const [newImageUrl, setNewImageUrl] = useState<string>('');
  const [newImageInputType, setNewImageInputType] = useState<'upload' | 'url'>('upload');
  const [newImagePreview, setNewImagePreview] = useState<string>('');
  const [imageUploadError, setImageUploadError] = useState<string>('');

  //Datos para la eliminacion y modales
  const [quickReplyToDelete, setQuickReplyToDelete] = useState<QuickReply | null>(null);
  const [activeModalResetQuickReplies, setActiveModalResetQuickReplies] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const modalTitleId = useId();
  const { panelRef, onKeyDown, onBackdropMouseDown } = useModalA11y<HTMLDivElement>({
    isOpen,
    onClose,
  });

  // Sync external quickReplies if changed from outside. Se ajusta durante el
  // render (patrón recomendado por React) en vez de en un efecto, para no
  // provocar un render en cascada.
  const [prevQuickReplies, setPrevQuickReplies] = useState(quickReplies);
  if (quickReplies !== prevQuickReplies) {
    setPrevQuickReplies(quickReplies);
    if (quickReplies && quickReplies.length > 0) {
      setItems(quickReplies);
    }
  }

  // Id estable para el botón de relleno cuando la lista está vacía.
  const [fallbackId] = useState(() => `qr_${Date.now()}`);

  // Active item
  const activeItem = items.find(i => i.id === selectedId) || items[0] || {
    id: fallbackId,
    title: 'Nueva Respuesta',
    emoji: '💬',
    text: '¡Hola {nombre}! ',
    imageUrl: '',
    category: 'general'
  };

  // Helper to persist list both to parent and localStorage
  const persistQuickReplies = (updatedList: QuickReply[], toastMsg?: string) => {
    setItems(updatedList);
    onSaveQuickReplies(updatedList);
    try {
      localStorage.setItem(LOCAL_STORAGE_QUICK_REPLIES_KEY, JSON.stringify(updatedList));
    } catch {
      // ignore
    }
    if (toastMsg) {
      setSaveSuccessMessage(toastMsg);
      setTimeout(() => setSaveSuccessMessage(''), 2500);
    }
  };

  // Sincroniza (crea/actualiza) un botón contra /api/quick-replies. Antes
  // este modal nunca llamaba a esa ruta: solo escribía en localStorage y en
  // el estado del padre, por lo que el texto/emoji nunca llegaba a Postgres.
  const syncQuickReplyToServer = useCallback(async (item: QuickReply) => {
    try {
      await apiFetch('/api/quick-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
    } catch {
      // Sin red: el cambio sigue en localStorage/estado y se reintenta en el
      // próximo guardado.
    }
  }, []);

  const syncQuickReplyDeleteToServer = useCallback(async (id: string) => {
    try {
      await apiFetch(`/api/quick-replies?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
  }, []);

  // Al "Reestablecer": borra en el backend los botones que no son de
  // fábrica y crea/actualiza los INITIAL_QUICK_REPLIES.
  const syncResetToDefaults = useCallback(
    async (previousItems: QuickReply[]) => {
      const keepIds = new Set(INITIAL_QUICK_REPLIES.map((i) => i.id));
      const toDelete = previousItems.filter((i) => !keepIds.has(i.id));
      await Promise.all([
        ...toDelete.map((i) => syncQuickReplyDeleteToServer(i.id)),
        ...INITIAL_QUICK_REPLIES.map((i) => syncQuickReplyToServer(i)),
      ]);
    },
    [syncQuickReplyDeleteToServer, syncQuickReplyToServer]
  );

  if (!isOpen) return null;

  // Select Item
  const handleSelectItem = (item: QuickReply) => {
    setSelectedId(item.id);
    setLastRemovedImage('');
  };

  // Create New Button (Unlimited)
  const handleAddNew = () => {
    const newId = generateQuickReplyId();
    const templateIndex = items.length + 1;
    const newItem: QuickReply = {
      id: newId,
      title: `Nuevo Botón ${templateIndex}`,
      emoji: '💬',
      text: '¡Hola {nombre}! Gracias por comunicarte con nosotros...',
      imageUrl: '',
      category: (categoryFilter !== 'all' ? categoryFilter : 'general') as QuickReplyCategory
    };

    const updatedList = [...items, newItem];
    persistQuickReplies(updatedList, '¡Nuevo botón creado y guardado!');
    syncQuickReplyToServer(newItem);
    setSelectedId(newId);
    setLastRemovedImage('');

    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 100);
  };

  // Duplicate an existing template / button
  const handleDuplicateItem = (itemToDuplicate: QuickReply, e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = generateQuickReplyId();
    const duplicatedItem: QuickReply = {
      ...itemToDuplicate,
      id: newId,
      title: `${itemToDuplicate.title} (Copia)`
    };

    const updatedList = [...items, duplicatedItem];
    persistQuickReplies(updatedList, '¡Botón duplicado y guardado!');
    syncQuickReplyToServer(duplicatedItem);
    setSelectedId(newId);
  };

  // Update field of current active template
  const handleUpdateActiveField = <K extends keyof QuickReply>(field: K, value: QuickReply[K]) => {
    const updatedList = items.map(item => {
      if (item.id === activeItem.id) {
        return { ...item, [field]: value };
      }
      return item;
    });

    persistQuickReplies(updatedList);
  };

  // Form Submit Save Handler
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    persistQuickReplies(items, '¡Botón guardado y sincronizado correctamente!');
    const currentItem = items.find(i => i.id === selectedId);
    if (currentItem) syncQuickReplyToServer(currentItem);
  };

  // Delete Template / Button
  const handleDeleteItem = (idToDelete: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updatedList = items.filter(i => i.id !== idToDelete);
    persistQuickReplies(updatedList, 'Botón eliminado');
    syncQuickReplyDeleteToServer(idToDelete);

    if (selectedId === idToDelete) {
      if (updatedList.length > 0) {
        setSelectedId(updatedList[0].id);
      } else {
        // If all were deleted, create a clean starter template
        const starterItem: QuickReply = {
          id: `qr_${Date.now()}`,
          title: 'Botón 1',
          emoji: '💬',
          text: '¡Hola {nombre}! ¿Cómo podemos ayudarte hoy?',
          category: 'general'
        };
        persistQuickReplies([starterItem]);
        setSelectedId(starterItem.id);
      }
    }
  };

  // Reset to default templates
  const handleResetToDefaults = () => {
    setActiveModalResetQuickReplies(true);
  };

  const handleInsertVariable = (variable: string) => {
    const currentText = activeItem.text || '';
    handleUpdateActiveField('text', currentText ? `${currentText} ${variable}` : variable);
  };

  // Remove image from current message with undo capability
  const handleRemoveImageFromMessage = () => {
    if (activeItem.imageUrl) {
      setLastRemovedImage(activeItem.imageUrl);
      handleUpdateActiveField('imageUrl', '');
    }
  };

  // Restore previously removed image
  const handleRestoreImageToMessage = () => {
    if (lastRemovedImage) {
      handleUpdateActiveField('imageUrl', lastRemovedImage);
      setLastRemovedImage('');
    }
  };

  // Handle local file selection for the Preset Gallery
  const handlePresetFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setImageUploadError('El archivo debe ser una imagen válida (JPG, PNG, WebP, GIF)');
      return;
    }

    if (!newImageTitle) {
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      setNewImageTitle(cleanName);
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setNewImagePreview(result);
        setNewImageUrl(result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Save New Image to Preset Gallery (Ingreso de Imagen) — ahora
  // persistida en /api/preset-images en vez de solo en localStorage.
  const handleSaveNewPresetImage = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalUrl = (newImageInputType === 'upload' ? newImagePreview : newImageUrl).trim();

    if (!finalUrl) {
      setImageUploadError('Debes subir un archivo o ingresar una URL de imagen válida');
      return;
    }

    const title = newImageTitle.trim() || 'Imagen personalizada';

    try {
      const saved = await addPresetImage({ name: title, url: finalUrl, type: 'Personalizada' });
      // Automatically select the newly created image for current message
      handleUpdateActiveField('imageUrl', saved.url);
      setLastRemovedImage('');

      // Reset and close panel
      setShowAddImagePanel(false);
      setNewImageTitle('');
      setNewImageUrl('');
      setNewImagePreview('');
      setImageUploadError('');
    } catch {
      setImageUploadError('No se pudo guardar la imagen en la galería. Inténtalo de nuevo.');
    }
  };

  // Handle Delete Image from Preset Gallery (Borrado de Imagen)
  const handleDeletePresetImage = (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removePresetImage(idToDelete).catch(() => {
      setImageUploadError('No se pudo eliminar la imagen de la galería.');
    });
  };

  // Filtered items list
  const filteredItems = items.filter(item => {
    const matchesSearch = !searchFilter.trim() || 
      item.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.text.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesCat = categoryFilter === 'all' || item.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs"
      onMouseDown={onBackdropMouseDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="bg-white border border-slate-200 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150 outline-none"
      >

        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 id={modalTitleId} className="font-extrabold text-sm sm:text-base text-slate-100 flex items-center gap-2 flex-wrap">
                <span>Configuración de Respuestas Rápidas (XIO Inbox)</span>
                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs font-extrabold rounded-md border border-emerald-500/30">
                  {items.length} Plantillas Creadas (Ilimitadas)
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Crea y edita cuantas plantillas desees con textos dinámicos e imágenes adjuntas. Se guardan automáticamente.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetToDefaults}
              title="Restablecer plantillas a valores iniciales"
              className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restablecer</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar modal de respuestas rápidas"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content - Two Columns */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          
          {/* Left Column: List of Quick Replies with Search & Category Filters */}
          <div className="w-full md:w-80 bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-hidden">
            
            {/* Action Bar: Create Button & Search */}
            <div className="p-3 border-b border-slate-200 bg-white space-y-2 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                  <span>BOTONES DISPONIBLES</span>
                  <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded-md font-mono text-[10px]">
                    {items.length}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleAddNew}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-extrabold flex items-center gap-1 shadow-xs cursor-pointer transition-all"
                  title="Crear un nuevo botón de respuesta rápida"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nuevo</span>
                </button>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar botones..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white text-slate-900"
                />
              </div>

              {/* Category Pills */}
              <div
                className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin text-[10px]"
                onWheel={(e) => {
                  if (e.deltaY === 0) return;
                  e.preventDefault();
                  e.currentTarget.scrollLeft += e.deltaY;
                }}
              >
                {CATEGORIES.map(cat => {
                  const isCatSelected = categoryFilter === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setCategoryFilter(cat.key)}
                      className={`px-2 py-0.5 rounded-md font-bold whitespace-nowrap cursor-pointer transition-colors inline-flex items-center gap-1 ${
                        isCatSelected
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <cat.icon className="w-2.5 h-2.5" />
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List of Items */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
              {filteredItems.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  <p className="font-semibold text-slate-600 mb-1">No hay botones disponibles</p>
                  <p className="text-[11px] mb-3">Haz clic en &quot;Nuevo&quot; para crear un botón.</p>
                  <button
                    type="button"
                    onClick={handleAddNew}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg font-bold text-xs cursor-pointer hover:bg-emerald-700 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Crear Nuevo Botón</span>
                  </button>
                </div>
              ) : (
                filteredItems.map((item, idx) => {
                  const isSelected = activeItem.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectItem(item)}
                      className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start justify-between gap-2 group ${
                        isSelected
                          ? 'bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'bg-white/80 border-slate-200 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs truncate">
                          <span className="text-sm shrink-0">{item.emoji || '💬'}</span>
                          <span className="truncate">{item.title || `Botón ${idx + 1}`}</span>
                          {item.category && item.category !== 'general' && (
                            <span className="px-1.5 py-0.2 text-[9px] font-extrabold uppercase rounded-md bg-slate-100 text-slate-600 shrink-0">
                              {item.category}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 font-normal">
                          {item.text || 'Sin texto'}
                        </p>
                        {item.imageUrl && (
                          <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold mt-1">
                            <ImageIcon className="w-3 h-3 shrink-0" />
                            <span className="truncate">Incluye imagen</span>
                          </div>
                        )}
                      </div>

                      {/* Action buttons on card (Duplicate & Always-Visible Trash Delete Icon) */}
                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={(e) => handleDuplicateItem(item, e)}
                          title="Duplicar este botón"
                          aria-label="Duplicar este botón"
                          className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickReplyToDelete(item)}
                          title="Borrar este botón permanentemente"
                          aria-label="Borrar este botón permanentemente"
                          className="p-1.5 text-red-500 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg transition-all cursor-pointer shadow-2xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Editor & Live Preview */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white space-y-4">
            <form onSubmit={handleSaveForm} className="space-y-4">
              
              {/* Top Row: Emoji, Title, Category */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Emoji / Ícono
                  </label>
                  <input
                    type="text"
                    value={activeItem.emoji || ''}
                    onChange={(e) => handleUpdateActiveField('emoji', e.target.value)}
                    placeholder="⚡"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-base font-bold text-center focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-slate-900"
                    maxLength={3}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Título del Botón (Texto en la barra del chat)
                  </label>
                  <input
                    ref={titleInputRef}
                    type="text"
                    required
                    value={activeItem.title}
                    onChange={(e) => handleUpdateActiveField('title', e.target.value)}
                    placeholder="Ej. Saludo WhatsApp, Catálogo & Precios, Link Extensión..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Categoría
                  </label>
                  <select
                    value={activeItem.category || 'general'}
                    onChange={(e) => handleUpdateActiveField('category', e.target.value as QuickReplyCategory)}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  >
                    <option value="general">General</option>
                    <option value="saludo">Saludos</option>
                    <option value="ventas">Ventas</option>
                    <option value="precios">Precios</option>
                    <option value="soporte">Soporte</option>
                  </select>
                </div>
              </div>

              {/* Message Text Area with Variable Tags */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <label className="text-xs font-bold text-slate-700">
                    Mensaje a Enviar por WhatsApp / Chat
                  </label>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span>Insertar variable:</span>
                    <button
                      type="button"
                      onClick={() => handleInsertVariable('{nombre}')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 rounded-md text-slate-700 font-mono font-bold cursor-pointer transition-colors"
                    >
                      {'{nombre}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertVariable('{empresa}')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 rounded-md text-slate-700 font-mono font-bold cursor-pointer transition-colors"
                    >
                      {'{empresa}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertVariable('{canal}')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 rounded-md text-slate-700 font-mono font-bold cursor-pointer transition-colors"
                    >
                      {'{canal}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInsertVariable('{agente}')}
                      className="px-1.5 py-0.5 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 rounded-md text-slate-700 font-mono font-bold cursor-pointer transition-colors"
                    >
                      {'{agente}'}
                    </button>
                  </div>
                </div>

                <textarea
                  required
                  rows={4}
                  value={activeItem.text}
                  onChange={(e) => handleUpdateActiveField('text', e.target.value)}
                  placeholder="Escribe el texto del mensaje..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none leading-relaxed"
                />
              </div>

              {/* Image URL / Attachment Section & Preset Management */}
              <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    <span>Imagen Adjunta (Opcional - Envía texto + imagen)</span>
                  </label>
                  
                  <div className="flex items-center gap-2">
                    {/* Botón Quitar Imagen del Mensaje Actual */}
                    {activeItem.imageUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveImageFromMessage}
                        className="text-[11px] text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded-md font-bold cursor-pointer flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Quitar imagen</span>
                      </button>
                    )}

                    {/* Botón Restablecer Imagen si se quitó por equivocación */}
                    {!activeItem.imageUrl && lastRemovedImage && (
                      <button
                        type="button"
                        onClick={handleRestoreImageToMessage}
                        title="Recuperar la imagen que acabas de quitar"
                        className="text-[11px] text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-md font-bold cursor-pointer flex items-center gap-1 transition-colors animate-in fade-in duration-150"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Restablecer imagen</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Preset Images Gallery Header & Controls */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        Galería de imágenes para plantillas:
                      </span>
                      <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-extrabold rounded-md">
                        {presetImages.length}
                      </span>
                    </div>

                    {/* Botón para Ingresar Imagen */}
                    <button
                      type="button"
                      onClick={() => setShowAddImagePanel(!showAddImagePanel)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${
                        showAddImagePanel
                          ? 'bg-slate-800 text-white'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      {showAddImagePanel ? (
                        <>
                          <X className="w-3 h-3" />
                          <span>Cerrar</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>Ingresar Imagen</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Panel de Ingreso de Nueva Imagen a la Galería */}
                  {showAddImagePanel && (
                    <div className="p-3.5 bg-white border-2 border-emerald-500/40 rounded-xl shadow-xs space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                          <UploadCloud className="w-4 h-4 text-emerald-600" />
                          <span>Ingresar Nueva Imagen a la Galería</span>
                        </div>
                        
                        {/* Selector Subir vs URL */}
                        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[11px]">
                          <button
                            type="button"
                            onClick={() => setNewImageInputType('upload')}
                            className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                              newImageInputType === 'upload'
                                ? 'bg-white text-emerald-700 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Subir Archivo
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewImageInputType('url')}
                            className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                              newImageInputType === 'url'
                                ? 'bg-white text-emerald-700 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Enlace / URL
                          </button>
                        </div>
                      </div>

                      {imageUploadError && (
                        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{imageUploadError}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                        {/* Left: Input File / URL */}
                        <div className="sm:col-span-2 space-y-2">
                          <div>
                            <label className="text-[11px] font-bold text-slate-700 block mb-1">
                              Nombre o Etiqueta de la Imagen
                            </label>
                            <input
                              type="text"
                              value={newImageTitle}
                              onChange={(e) => setNewImageTitle(e.target.value)}
                              placeholder="Ej. Menú Parrilla, Oferta Especial, Catálogo 2026..."
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                            />
                          </div>

                          {newImageInputType === 'upload' ? (
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                                Seleccionar archivo desde la computadora
                              </label>
                              <input
                                key="upload-file-input"
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handlePresetFileSelect}
                                className="hidden"
                              />
                              <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50 hover:bg-emerald-50/30 rounded-xl p-3 text-center cursor-pointer transition-colors"
                              >
                                <FolderOpen className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                                <p className="text-xs font-bold text-slate-800">
                                  {newImagePreview ? 'Cambiar archivo seleccionado' : 'Haz clic para explorar imágenes'}
                                </p>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  Formatos JPG, PNG, WEBP, GIF
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                                URL directa de la imagen
                              </label>
                              <input
                                key="url-image-input"
                                type="url"
                                value={newImageUrl}
                                onChange={(e) => {
                                  setNewImageUrl(e.target.value);
                                  setNewImagePreview(e.target.value);
                                }}
                                placeholder="https://miweb.com/imagen.jpg"
                                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                              />
                            </div>
                          )}
                        </div>

                        {/* Right: Instant Thumbnail Preview */}
                        <div className="border border-slate-200 rounded-xl p-2 bg-slate-50 text-center">
                          <span className="text-[10px] font-bold text-slate-500 block mb-1">
                            Vista Previa
                          </span>
                          {newImagePreview ? (
                            <img
                              src={newImagePreview}
                              alt="Preview"
                              className="w-full h-20 object-cover rounded-lg border border-slate-200 shadow-2xs"
                              onError={() => setImageUploadError('No se pudo cargar la imagen desde la URL provista.')}
                            />
                          ) : (
                            <div className="w-full h-20 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400">
                              <ImageIcon className="w-5 h-5 mb-0.5" />
                              <span className="text-[10px]">Sin imagen</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddImagePanel(false);
                            setImageUploadError('');
                          }}
                          className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-bold rounded-lg cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveNewPresetImage}
                          disabled={!newImagePreview && !newImageUrl}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-2xs disabled:opacity-50 flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Guardar en Galería</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Preset Images Grid with Delete Button on Each Card */}
                  {presetImages.length === 0 ? (
                    <div className="p-4 border border-dashed border-slate-300 rounded-xl text-center bg-slate-50">
                      <p className="text-xs text-slate-500 font-medium">
                        No hay imágenes en la galería predeterminada.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAddImagePanel(true)}
                        className="mt-2 px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-emerald-700"
                      >
                        + Ingresar primera imagen
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {presetImages.map((preset) => {
                        const isSelected = activeItem.imageUrl === preset.url;
                        return (
                          <div
                            key={preset.id}
                            onClick={() => {
                              handleUpdateActiveField('imageUrl', preset.url);
                              setLastRemovedImage('');
                            }}
                            className={`group relative p-1.5 border rounded-xl text-left transition-all cursor-pointer select-none ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500 shadow-xs'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
                            }`}
                          >
                            {/* Image Thumbnail */}
                            <div className="relative w-full h-14 rounded-lg overflow-hidden bg-slate-100 mb-1.5 flex items-center justify-center">
                              <img
                                key={preset.url}
                                src={preset.url}
                                alt={preset.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              />

                              {/* Selected Checkmark Badge */}
                              {isSelected && (
                                <div className="absolute top-1 left-1 w-4 h-4 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-xs">
                                  <Check className="w-2.5 h-2.5 stroke-3" />
                                </div>
                              )}

                              {/* Botón para Borrado de Imagen de la Galería */}
                              <button
                                type="button"
                                onClick={(e) => handleDeletePresetImage(preset.id, e)}
                                title="Borrar imagen de la galería"
                                aria-label="Borrar imagen de la galería"
                                className="absolute top-1 right-1 p-1 bg-slate-900/80 hover:bg-red-600 text-white rounded-md transition-all shadow-xs opacity-80 group-hover:opacity-100 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            <p className="text-[11px] font-bold text-slate-800 truncate leading-tight">
                              {preset.name}
                            </p>
                            <p className="text-[9px] text-slate-400 truncate mt-0.5">
                              {preset.type || 'Personalizada'}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Live Preview in WhatsApp Style */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Vista Previa del Mensaje en WhatsApp Web:</span>
                  </span>
                  {activeItem.imageUrl && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      <span>1 Imagen Adjunta</span>
                    </span>
                  )}
                </div>

                <div className="p-4 bg-[#efeae2]/80 rounded-xl border border-slate-200 flex justify-end">
                  <div className="max-w-md w-full sm:w-auto min-w-[260px] bg-[#dcf8c6] text-slate-900 rounded-2xl rounded-tr-xs p-3 text-xs shadow-xs border border-emerald-200/80 space-y-2">
                    {Boolean(activeItem.imageUrl) && (
                      <div className="rounded-xl overflow-hidden border border-emerald-300/50 bg-black/5 shadow-2xs">
                        <img
                          key={activeItem.imageUrl}
                          src={activeItem.imageUrl}
                          alt="Imagen adjunta al mensaje"
                          referrerPolicy="no-referrer"
                          className="w-full max-h-56 object-cover block"
                        />
                      </div>
                    )}
                    <p className="leading-relaxed whitespace-pre-line text-slate-900">
                      {activeItem.text
                        ? activeItem.text
                            .replace(/{nombre}/g, 'Valeria Gómez')
                            .replace(/{empresa}/g, 'Innovatech Latin America')
                            .replace(/{canal}/g, 'WhatsApp')
                            .replace(/{agente}/g, 'Asistente XIO')
                        : 'Escribe un mensaje para previsualizar...'}
                    </p>
                    <div className="flex items-center justify-end gap-1 text-[10px] text-slate-500 pt-0.5">
                      <span>{formatTime()}</span>
                      <CheckCheck className="w-3 h-3 text-emerald-700" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickReplyToDelete(activeItem)}
                    title="Eliminar este botón"
                    className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    <span>Borrar Botón</span>
                  </button>

                  {saveSuccessMessage && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 animate-in fade-in">
                      <CheckCheck className="w-4 h-4 stroke-2 text-emerald-600" />
                      <span>{saveSuccessMessage}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all cursor-pointer"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-xs cursor-pointer flex items-center gap-1.5 active:scale-95"
                  >
                    <Check className="w-4 h-4" />
                    <span>Guardar y Confirmar</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN DE RESPUESTA */}
      <Modal
        isOpen={quickReplyToDelete != null}
        onClose={() => setQuickReplyToDelete(null)}
        title="🗑️ Eliminar respuesta"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setQuickReplyToDelete(null)}
            >
              Cancelar
            </Button>

            <Button
              variant="danger"
              onClick={() => {
                if (quickReplyToDelete) {
                  handleDeleteItem(quickReplyToDelete.id);
                  setQuickReplyToDelete(null);
                }
              }}
            >
              Eliminar respuesta
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-md text-black">
            ¿Estás seguro de que deseas eliminar la respuesta rápida?
          </p>

          {quickReplyToDelete && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-md font-extrabold text-red-800">
                {quickReplyToDelete.title}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL DE CONFIRMACIÓN PARA RESTAURACIÓN DE RESPUESTAS BÁSICAS */}
      <Modal
        isOpen={activeModalResetQuickReplies}
        onClose={() => setActiveModalResetQuickReplies(false)}
        title="Reestablecer respuestas rápidas"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setActiveModalResetQuickReplies(false)}
            >
              Cancelar
            </Button>

            <Button
              variant="danger"
              onClick={() => {
                syncResetToDefaults(items);
                persistQuickReplies(INITIAL_QUICK_REPLIES, 'Botones restablecidos a valores iniciales');
                setSelectedId(INITIAL_QUICK_REPLIES[0].id);
              }}
            >
              Reestablecer
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-md text-black">
            ¿Estás seguro de que deseas reestablecer las respuestas por defecto? <br></br> <br></br>
            Se conservarán las imágenes de la galería
          </p>
        </div>
      </Modal>
    </div>
  );
};

