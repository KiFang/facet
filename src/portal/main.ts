/* Facet OS — точка входа портала на сервере клуба. Собирается в web/portal.js. */
import type { ClubSchema } from '@/types/schema';
import { normalizeSchema } from '@/utils/normalize';
import { hashRouter, mountPortal } from './app';
import { pocketbaseSource } from './sources/pocketbase';
import { esc } from './render';

const root = document.getElementById('app')!;

fetch('/club-schema.json', { cache: 'no-cache' })
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<ClubSchema>;
  })
  .then((raw) => {
    const schema = normalizeSchema(raw);
    document.title = schema.clubName;
    document.documentElement.lang = schema.locale ?? 'ru';
    mountPortal(root, {
      schema,
      source: pocketbaseSource(),
      router: hashRouter(),
      assets: { logoUrl: root.dataset.logo || undefined },
    });
  })
  .catch((err: Error) => {
    root.innerHTML = `<div class="fx-shell"><div class="fx-empty"><strong>club-schema.json</strong>${esc(err.message)}</div></div>`;
  });
