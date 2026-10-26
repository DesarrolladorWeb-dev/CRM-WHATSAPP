'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { PresetImage } from '@/types';
import { INITIAL_PRESET_IMAGES } from '@/mockData';

const LOCAL_STORAGE_PRESETS_KEY = 'xio_crm_preset_images_v1';

export function usePresetImages() {
  const [images, setImages] = useState<PresetImage[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_PRESETS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_PRESET_IMAGES;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/preset-images');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.success && Array.isArray(data.data) && data.data.length > 0) {
          setImages(data.data);
        }
      } catch {
        // Sin red: se queda con localStorage/mock como fallback.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cache local de respaldo (no es la fuente de verdad).
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_PRESETS_KEY, JSON.stringify(images));
    } catch {
      // ignore
    }
  }, [images]);

  const addImage = useCallback(
    async (input: { name: string; url: string; type?: string }): Promise<PresetImage> => {
      setError('');
      const res = await apiFetch('/api/preset-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const message = data.error || 'No se pudo guardar la imagen en la galería';
        setError(message);
        throw new Error(message);
      }
      const saved: PresetImage = data.data;
      setImages((prev) => [saved, ...prev]);
      return saved;
    },
    []
  );

  const removeImage = useCallback(async (id: string): Promise<void> => {
    setError('');
    const previous = images;
    setImages((prev) => prev.filter((p) => p.id !== id));
    try {
      const res = await apiFetch(`/api/preset-images?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo eliminar la imagen');
      }
    } catch (err) {
      setImages(previous);
      setError((err instanceof Error && err.message) || 'No se pudo eliminar la imagen');
      throw err;
    }
  }, [images]);

  return { images, loading, error, addImage, removeImage };
}
