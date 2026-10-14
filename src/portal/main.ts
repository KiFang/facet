/* Facet OS — точка входа портала на сервере клуба. Собирается в web/portal.js. */
import type { ClubSchema } from '@/types/schema';
import { normalizeSchema } from '@/utils/normalize';
import { hashRouter, mountPortal } from './app';
import { pocketbaseSource } from './sources/pocketbase';
import { pocketbaseSession } from './session';
import { esc } from './render';

type RenderInfo = { path: string; entityId: string | null; recordId: string | null; root: HTMLElement };

declare global {
  interface Window {
    /** API для скриптов плагинов портала (web/plugins/*.js). */
    FacetPortal?: {
      version: string;
      schema: ClubSchema | null;
      onRender(cb: (info: RenderInfo) => void): () => void;
    };
  }
}

const renderListeners = new Set<(info: RenderInfo) => void>();
window.FacetPortal = {
  version: '1',
  schema: null,
  onRender(cb) {
    renderListeners.add(cb);
    return () => renderListeners.delete(cb);
  },
};

const root = document.getElementById('app')!;

fetch('/club-schema.json', { cache: 'no-cache' })
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ClubSchema>;
  })
  .then((raw) => {
    const schema = normalizeSchema(raw);
    window.FacetPortal!.schema = schema;
    document.title = schema.clubName;
    document.documentElement.lang = schema.locale ?? 'ru';
    const session = pocketbaseSession();
    mountPortal(root, {
      schema,
      session,
      source: pocketbaseSource('', session.token),
      router: hashRouter(),
      assets: { logoUrl: root.dataset.logo || undefined },
      onRender: (info) => renderListeners.forEach((cb) => {
        try {
          cb(info);
        } catch (err) {
          console.error('[facet plugin]', err);
        }
      }),
    });
  })
  .catch((err: Error) => {
    root.innerHTML = `<div class="fx-shell"><div class="fx-empty"><strong>club-schema.json</strong>${esc(err.message)}</div></div>`;
  });
