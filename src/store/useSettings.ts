import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePref = 'light' | 'dark' | 'system';
export type PreviewViewport = 'desktop' | 'tablet' | 'mobile';

export interface Settings {
  theme: ThemePref;
  /** Спрашивать подтверждение перед удалением модулей и полей. */
  confirmDeletes: boolean;
  /** Подсказки-пояснения под полями настроек. */
  showHints: boolean;
  /** Подключение редактора данных к развёрнутой системе по умолчанию. */
  server: { url: string; email: string };
  welcomeSeen: boolean;
  showNavigator: boolean;
  showProperties: boolean;
  viewport: PreviewViewport;
  navWidth: number;
  propsWidth: number;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'light',
      confirmDeletes: true,
      showHints: true,
      server: { url: '', email: '' },
      welcomeSeen: false,
      showNavigator: true,
      showProperties: true,
      viewport: 'desktop',
      navWidth: 240,
      propsWidth: 420,
      set: (patch) => set(patch),
    }),
    { name: 'facet-os:settings', version: 1 },
  ),
);

function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Применяет тему к <html data-theme> и следит за системной темой. */
export function useApplyTheme() {
  const pref = useSettings((s) => s.theme);
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(pref);
    };
    apply();
    if (pref !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);
}
