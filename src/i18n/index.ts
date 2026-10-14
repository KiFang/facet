import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ru, type UiStrings } from './ru';
import { en } from './en';

export type UiLocale = 'ru' | 'en';
export type TKey = keyof UiStrings;
export type TParams = Record<string, string | number>;
export type TFunction = (key: TKey, params?: TParams) => string;

const DICTS: Record<UiLocale, UiStrings> = { ru, en };

const detect = (): UiLocale =>
  typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('ru') ? 'en' : 'ru';

interface UiState {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
}

/** Язык интерфейса редактора (язык портала задаётся в схеме — schema.locale). */
export const useUiStore = create<UiState>()(
  persist((set) => ({ locale: detect(), setLocale: (locale) => set({ locale }) }), { name: 'facet-os:ui' }),
);

export function translate(locale: UiLocale, key: TKey, params?: TParams): string {
  const text = DICTS[locale][key] ?? ru[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (_, p: string) => (p in params ? String(params[p]) : `{${p}}`)) : text;
}

export function useT(): TFunction {
  const locale = useUiStore((s) => s.locale);
  return useCallback((key, params) => translate(locale, key, params), [locale]);
}

export function useUiLocale(): UiLocale {
  return useUiStore((s) => s.locale);
}
