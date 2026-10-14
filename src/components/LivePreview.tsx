import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Monitor, Smartphone, Tablet } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { cssVarsToText, dividerCss, fontStylesheetUrl, themeToCssVars } from '@/utils/theme';
import { mountPortal, memoryRouter, type PortalHandle } from '@/portal/app';
import { sampleSource } from '@/portal/sources/sample';
import portalCss from '@/portal/portal.css?raw';
import { slugify } from '@/lib/id';
import { useT } from '@/i18n';
import { Segmented } from './ui/Segmented';

type Viewport = 'desktop' | 'tablet' | 'mobile';
const VIEWPORT_WIDTH: Record<Viewport, string> = { desktop: '100%', tablet: '768px', mobile: '390px' };

/** Подключает шрифт темы (Google Fonts) в редакторе, чтобы превью выглядело как портал. */
function useFontStylesheet(url: string | null) {
  useEffect(() => {
    if (!url || document.querySelector(`link[data-facet-font="${url}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.dataset.facetFont = url;
    document.head.appendChild(link);
  }, [url]);
}

/**
 * Живое превью — тот же код портала (src/portal), что работает на сервере клуба,
 * но с примерами данных (или импортированными строками) и маршрутизатором в памяти.
 */
export function LivePreview() {
  const t = useT();
  const schema = useClubStore((s) => s.schema);
  const seeds = useClubStore((s) => s.seeds);
  const activeEntityId = useClubStore((s) => s.activeEntityId);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const hostRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<PortalHandle | null>(null);
  const routerRef = useRef(memoryRouter(activeEntityId ? `/${activeEntityId}` : '/'));
  const [path, setPath] = useState(routerRef.current.get());

  const source = useMemo(() => sampleSource(schema, seeds), [schema, seeds]);
  const assets = useMemo(() => ({ logoUrl: schema.theme.logo }), [schema.theme.logo]);
  useFontStylesheet(fontStylesheetUrl(schema.theme.font));

  const css = useMemo(
    () => `${cssVarsToText(themeToCssVars(schema.theme), '.fx-preview-scope')}\n.fx-preview-scope ${dividerCss(schema.theme)}\n${portalCss}`,
    [schema.theme],
  );

  useEffect(() => {
    const router = routerRef.current;
    const unlisten = router.listen(setPath);
    portalRef.current = mountPortal(hostRef.current!, {
      schema: useClubStore.getState().schema,
      source,
      router,
      assets,
      onEntityChange: (id) => {
        const store = useClubStore.getState();
        if (id && id !== store.activeEntityId) store.setActiveEntity(id);
      },
    });
    return () => {
      unlisten();
      portalRef.current?.destroy();
      portalRef.current = null;
    };
    // Монтируем один раз; дальнейшие изменения — через update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    portalRef.current?.update({ schema, source, assets });
  }, [schema, source, assets]);

  // Выбор раздела в конструкторе открывает его в превью.
  useEffect(() => {
    const router = routerRef.current;
    const current = router.get().split('/')[1] ?? '';
    if (activeEntityId && current !== activeEntityId) router.go(`/${activeEntityId}`);
  }, [activeEntityId]);

  const host = `${slugify(schema.clubName).replace(/_/g, '-')}.club`;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          {t('preview.title')}
          {Object.keys(seeds).length > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">{t('preview.realData')}</span>}
        </div>
        <Segmented
          size="sm"
          ariaLabel={t('preview.viewport')}
          className="w-auto"
          value={viewport}
          onChange={setViewport}
          options={[
            { value: 'desktop', label: <Monitor className="h-3.5 w-3.5" />, title: t('preview.desktop') },
            { value: 'tablet', label: <Tablet className="h-3.5 w-3.5" />, title: t('preview.tablet') },
            { value: 'mobile', label: <Smartphone className="h-3.5 w-3.5" />, title: t('preview.mobile') },
          ]}
        />
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto px-5 pb-5">
        <div
          className="mx-auto flex h-full min-h-[560px] w-full min-w-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40 transition-[max-width] duration-300"
          style={{ maxWidth: VIEWPORT_WIDTH[viewport] }}
        >
          <div className="flex items-center gap-3 border-b border-zinc-800 px-3 py-2">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-zinc-950 px-3 py-1 text-xs text-zinc-400">
              <Lock className="h-3 w-3 shrink-0 text-emerald-400" />
              <span className="truncate">https://{host}/#{path}</span>
            </div>
          </div>
          <style>{css}</style>
          <div className="fx-preview-scope min-h-0 min-w-0 flex-1 overflow-auto" data-testid="portal-preview">
            <div ref={hostRef} className="min-h-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
