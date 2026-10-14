/**
 * Отдельные окна Facet OS: справка и редактор данных.
 * Это тот же index.html с параметром ?window=… — в браузере открывается новое окно,
 * в десктопе главный процесс создаёт BrowserWindow (см. desktop/main.cjs).
 * Уже открытое окно не перезагружается (там могут быть несохранённые правки) —
 * ему отправляется сообщение через BroadcastChannel.
 */
export type WindowKind = 'help' | 'data';

export type WindowMessage =
  | { type: 'help:section'; section: string }
  | { type: 'data:entity'; entityId: string };

const CHANNEL = 'facet-os';
const opened: Partial<Record<WindowKind, Window>> = {};

export function currentWindow(): WindowKind | 'main' {
  const w = new URLSearchParams(location.search).get('window');
  return w === 'help' || w === 'data' ? w : 'main';
}

const FEATURES: Record<WindowKind, string> = {
  help: 'width=1120,height=820',
  data: 'width=1360,height=860',
};

export function postToWindows(message: WindowMessage) {
  const ch = new BroadcastChannel(CHANNEL);
  ch.postMessage(message);
  ch.close();
}

export function listenWindows(handler: (message: WindowMessage) => void): () => void {
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e) => handler(e.data as WindowMessage);
  return () => ch.close();
}

function openWindow(kind: WindowKind, params: Record<string, string>, hash: string, message?: WindowMessage) {
  const existing = opened[kind];
  if (existing && !existing.closed) {
    if (message) postToWindows(message);
    existing.focus();
    return;
  }
  const search = new URLSearchParams({ window: kind, ...params });
  const win = window.open(`${location.pathname}?${search}${hash ? `#${hash}` : ''}`, `facet-${kind}`, FEATURES[kind]);
  if (win) {
    opened[kind] = win;
    win.focus();
  } else if (message) {
    // Окно открыто из другой вкладки/процесса — пусть переключится само.
    postToWindows(message);
  }
}

export const openHelp = (section = 'start') => openWindow('help', {}, section, { type: 'help:section', section });

export const openDataEditor = (entityId?: string) =>
  openWindow('data', entityId ? { entity: entityId } : {}, '', entityId ? { type: 'data:entity', entityId } : undefined);
