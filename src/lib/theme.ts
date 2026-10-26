/** Tema claro/oscuro: clave de almacenamiento, script de arranque y helpers. */

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'xio-theme';

/** Aviso de que el tema cambio; lo escucha el boton del Header. */
export const THEME_EVENT = 'xio-theme-change';

/**
 * Aplica el tema antes del primer pintado. Va inline y sincrono en el `<head>`
 * para que no se vea el destello blanco al recargar en modo oscuro.
 */
export const themeScript = `!function(){try{var g=localStorage.getItem('${THEME_STORAGE_KEY}');var d=g==='dark'||(g!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){}}();`;

/** Aplica el tema al `<html>` y lo recuerda. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage puede estar bloqueado; el tema queda solo en esta sesion.
  }

  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Lee el tema que quedo aplicado en el `<html>`. */
export function readTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}
