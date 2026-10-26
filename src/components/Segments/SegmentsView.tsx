import React, { useState } from 'react';
import { Segment, SocialChannel, Contact } from '../../types';
import { Target, Users, Plus, Sparkles, Check, Megaphone, ChevronRight, Trash2, MessageCircle, Instagram, Twitter, MessageSquare, Star, Flame } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { WhatsAppIcon, XBrandIcon,MessengerIcon } from '@/components/Icons/ChannelIcons';
interface SegmentsViewProps {
  segments: Segment[];
  contacts: Contact[];
  onCreateSegment: (newSegment: Omit<Segment, 'id' | 'createdAt' | 'contactCount'>) => void;
  onSelectSegmentForCampaign: (segmentId: string) => void;
  onDeleteSegment: (segmentId: string) => void;
}

const CHANNEL_LABELS: Record<SocialChannel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  twitter: 'X/Twitter',
  messenger: 'Messenger',
  email: 'Email',
};

export const SegmentsView: React.FC<SegmentsViewProps> = ({
  segments,
  onCreateSegment,
  onSelectSegmentForCampaign,
  onDeleteSegment,
}) => {

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [segmentToDelete, setSegmentToDelete] = useState<Segment | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<SocialChannel[]>(['whatsapp']);
  const [minScore, setMinScore] = useState<number>(70);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    onCreateSegment({
      name,
      description: description || 'Segmento personalizado creado en XIO.',
      channels: selectedChannels,
      minScore,
    });

    setIsModalOpen(false);
    setName('');
    setDescription('');
  };

  const toggleChannel = (ch: SocialChannel) => {
    setSelectedChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 shadow-2xs items-center text-center md:text-left">
        <div className="mx-auto md:mx-0">
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center justify-center md:justify-start gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            <span>Segmentación de Audiencia & Clusters IA</span>
          </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium flex items-center justify-center md:justify-start gap-1">
            <Users className="w-3.5 h-3.5" /> Crea grupos dinámicos de clientes basados en comportamiento, canal y score de IA para campañas masivas de WhatsApp.
          </p>
        </div>

        
         <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-2xl text-xs font-black shadow-sm shadow-emerald-700/20 transition-all cursor-pointer hover:scale-102 w-auto mx-auto md:mx-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Crear Segmento IA</span>
          <Sparkles className="w-3 h-3" />
        </button>
      </div>

      {/* Grid of Segments */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {(!segments || segments.length <= 0) && (
            <div className='flex items-center justify-center w-screen'>
              <p className='pt-32 text-2xl'>Sin contenido que mostrar</p>
            </div>)
          }
          {segments.map((seg) => (
            <Card
              key={seg.id}
              interactive
              className="flex flex-col justify-between space-y-4 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-800 shadow-2xs shrink-0">
                      <Target className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate">{seg.name}</h3>
                      <span className="text-[10px] text-slate-400 dark:text-slate-400 font-semibold">Creado: {seg.createdAt}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-extrabold rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                      <Users className="w-3 h-3" /> {seg.contactCount} leads
                    </span>
                    <button
                      type="button"
                      onClick={() => setSegmentToDelete(seg)}
                      title="Eliminar segmento"
                      aria-label="Eliminar segmento"
                      className="p-1.5 rounded-lg text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">{seg.description}</p>

                {/* Filter Conditions */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                    ⚙️ Filtros Aplicados:
                  </span>

                  <div className="flex flex-wrap gap-1.5">
                    {seg.channels.map(ch => (
                      <span key={ch} className="px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                        {ch === 'whatsapp' ? <><WhatsAppIcon className="w-2.5 h-2.5" /> WhatsApp</> : ch === 'instagram' ? <><Instagram className="w-2.5 h-2.5" /> Instagram</> : ch === 'twitter' ? <><XBrandIcon className="w-2.5 h-2.5" /> Twitter</> : <><MessengerIcon className="w-2.5 h-2.5" /> Messenger</>}
                      </span>
                    ))}
                    {seg.minScore !== undefined && (
                      <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 rounded-lg text-[10px] font-bold border border-emerald-200 dark:border-emerald-700 flex items-center gap-1">
                        <Star className="w-2.5 h-2.5" /> Score IA ≥ {seg.minScore}% <Flame className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <Button
                fullWidth
                onClick={() => onSelectSegmentForCampaign(seg.id)}
                leftIcon={<Megaphone className="w-3.5 h-3.5" />}
                rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
              >
                Lanzar Difusión Masiva
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN DE SEGMENTO */}
      <Modal
        isOpen={segmentToDelete != null}
        onClose={() => setSegmentToDelete(null)}
        title="🗑️ Eliminar segmento"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setSegmentToDelete(null)}
            >
              Cancelar
            </Button>

            <Button
              variant="danger"
              onClick={() => {
                if (segmentToDelete) {
                  onDeleteSegment(segmentToDelete.id);
                  setSegmentToDelete(null);
                }
              }}
            >
              Eliminar segmento
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-md text-black dark:text-slate-200">
            ¿Estás seguro de que deseas eliminar el segmento?
          </p>

          {segmentToDelete && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl">
              <p className="text-md font-extrabold text-red-800 dark:text-red-300">
                {segmentToDelete.name}
              </p>
            </div>
          )}

          <p className="text-md text-black dark:text-slate-300">
            Esta acción no se puede deshacer.
          </p>
        </div>
      </Modal>

      {/* Create Segment Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Crear Nuevo Segmento de Clientes"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="create-segment-form">
              Guardar Segmento
            </Button>
          </>
        }
      >
        <form id="create-segment-form" onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Nombre de la Audiencia"
            required
            placeholder="Ej: Clientes VIP WhatsApp > 80% Score"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Textarea
            label="Descripción del Grupo"
            rows={2}
            placeholder="Explica qué tipo de clientes califican en este grupo..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="space-y-1">
            <span className="block font-extrabold text-slate-700 dark:text-slate-300 text-xs">Canales Incluidos</span>
            <div className="flex flex-wrap gap-2">
              {(['whatsapp', 'instagram', 'twitter', 'messenger'] as SocialChannel[]).map((ch) => {
                const active = selectedChannels.includes(ch);
                return (
                  <Button
                    key={ch}
                    size="sm"
                    variant={active ? 'primary' : 'secondary'}
                    aria-pressed={active}
                    onClick={() => toggleChannel(ch)}
                    rightIcon={active ? <Check className="w-3.5 h-3.5" /> : undefined}
                  >
                    {CHANNEL_LABELS[ch].replace(' / Twitter', '')}
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="segment-min-score" className="font-extrabold text-slate-700 dark:text-slate-300 text-xs block mb-1">
              Score Mínimo de IA ({minScore}%)
            </label>
            <input
              id="segment-min-score"
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
