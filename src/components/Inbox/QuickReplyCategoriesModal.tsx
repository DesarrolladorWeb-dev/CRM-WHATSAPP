'use client';

import React, { useId, useRef, useState } from 'react';
import { AlertTriangle, Check, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import type { QuickReplyCategory } from '@/types';
import { apiFetch } from '@/lib/apiClient';
import { useModalA11y } from '@/components/ui/useModalA11y';

interface QuickReplyCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: QuickReplyCategory[];
  onCategoriesChanged: (deletedId?: string) => Promise<void>;
}

export const QuickReplyCategoriesModal: React.FC<QuickReplyCategoriesModalProps> = ({
  isOpen,
  onClose,
  categories,
  onCategoriesChanged,
}) => {
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [pendingDelete, setPendingDelete] = useState<QuickReplyCategory | null>(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();
  const newCategoryInputRef = useRef<HTMLInputElement>(null);
  const { panelRef, onKeyDown, onBackdropMouseDown } = useModalA11y<HTMLDivElement>({ isOpen, onClose });

  const readError = async (response: Response, fallback: string) => {
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(result?.error || fallback);
    return result;
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) return;

    setIsSaving(true);
    setError('');
    try {
      const response = await apiFetch('/api/quick-reply-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      await readError(response, 'No se pudo crear la categoría');
      setNewLabel('');
      await onCategoriesChanged();
      newCategoryInputRef.current?.focus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo crear la categoría');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId || !editingLabel.trim()) return;

    setIsSaving(true);
    setError('');
    try {
      const response = await apiFetch('/api/quick-reply-categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, label: editingLabel.trim() }),
      });
      await readError(response, 'No se pudo renombrar la categoría');
      setEditingId(null);
      setEditingLabel('');
      await onCategoriesChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo renombrar la categoría');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;

    setIsSaving(true);
    setError('');
    try {
      const response = await apiFetch(
        `/api/quick-reply-categories?id=${encodeURIComponent(pendingDelete.id)}`,
        { method: 'DELETE' }
      );
      await readError(response, 'No se pudo eliminar la categoría');
      const deletedId = pendingDelete.id;
      setPendingDelete(null);
      await onCategoriesChanged(deletedId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo eliminar la categoría');
      setPendingDelete(null);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs"
      onMouseDown={onBackdropMouseDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          onKeyDown(event);
          event.stopPropagation();
        }}
        className="bg-white border border-slate-200 w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden outline-none"
      >
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 id={titleId} className="font-extrabold text-sm sm:text-base text-slate-100">
                Administrar categorías
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Las categorías se comparten entre tus plantillas.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar administración de categorías"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          <form onSubmit={handleCreate} className="flex items-end gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex-1 min-w-0">
              <label htmlFor={`${titleId}-new`} className="text-xs font-bold text-slate-700 block mb-1">
                Nueva categoría
              </label>
              <input
                ref={newCategoryInputRef}
                id={`${titleId}-new`}
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                maxLength={50}
                placeholder="Ej. Seguimiento"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving || !newLabel.trim()}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </form>

          {error && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">Categorías disponibles</h3>
              <span className="text-[10px] font-bold text-slate-400">{categories.length}</span>
            </div>
            {categories.map((category) => {
              const isDefault = category.id === 'general';
              const isInUse = (category.usageCount ?? 0) > 0;
              const isPendingDelete = pendingDelete?.id === category.id;

              return (
                <div key={category.id} className="p-3 bg-white border border-slate-200 rounded-xl">
                  {isPendingDelete ? (
                    <div role="alertdialog" aria-label="Confirmar eliminación de categoría" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2 text-amber-800">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <p className="text-xs font-semibold">¿Estás seguro de eliminar “{category.label}”?</p>
                      </div>
                      <div className="flex justify-end gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={isSaving}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs cursor-pointer inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Sí, eliminar
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(null)}
                          disabled={isSaving}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs cursor-pointer"
                        >
                          No, cancelar
                        </button>
                      </div>
                    </div>
                  ) : editingId === category.id ? (
                    <form onSubmit={handleRename} className="flex items-center gap-2">
                      <input type="hidden" value={editingId} readOnly />
                      <input
                        autoFocus
                        value={editingLabel}
                        onChange={(event) => setEditingLabel(event.target.value)}
                        maxLength={50}
                        aria-label={`Nuevo nombre para ${category.label}`}
                        className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                      <button type="submit" disabled={isSaving || !editingLabel.trim()} className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer disabled:opacity-50" aria-label="Guardar nombre">
                        <Check className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} disabled={isSaving} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg cursor-pointer" aria-label="Cancelar edición">
                        <X className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-8 h-8 shrink-0 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                          <Tag className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{category.label}</p>
                          <p className="text-[10px] text-slate-400">
                            {isDefault ? 'Categoría predeterminada' : `${category.usageCount ?? 0} plantillas asignadas`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setError('');
                            setEditingId(category.id);
                            setEditingLabel(category.label);
                          }}
                          title="Renombrar categoría"
                          aria-label={`Renombrar ${category.label}`}
                          className="p-2 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isDefault || isInUse}
                          onClick={() => {
                            setError('');
                            setPendingDelete(category);
                          }}
                          title={isDefault ? 'General es la categoría predeterminada' : isInUse ? 'Reasigna sus plantillas antes de eliminarla' : 'Eliminar categoría'}
                          aria-label={`Eliminar ${category.label}`}
                          className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer disabled:text-slate-300 disabled:bg-transparent disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
