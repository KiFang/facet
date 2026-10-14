import { useEffect, useMemo, useRef, useState } from 'react';
import { useSettings, type PreviewViewport } from '@/store/useSettings';
import { pluginCss } from '@/plugins/runtime';
import { Lock, Monitor, Smartphone, Tablet, UserRound } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { cssVarsToText, dividerCss, fontStylesheetUrl, themeToCssVars } from '@/utils/theme';
import { mountPortal, memoryRouter, type PortalHandle } from '@/portal/app';
import { sampleSource } from '@/portal/sources/sample';
import { previewSession } from '@/portal/session';
import { CHAIR_ROLE } from '@/utils/access';
import portalCss from '@/portal/portal.css?raw';
import { slugify } from '@/lib/id';
import { useT } from '@/i18n';
import { Segmented } from './ui/Segmented';

type Viewport = PreviewViewport;
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
  const viewport = useSettings((s) => s.viewport);
  const setViewport = (v: Viewport) => useSettings.getState().set({ viewport: v });
  const plugins = useClubStore((s) => s.schema.plugins);
  const hostRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<PortalHandle | null>(null);
  const routerRef = useRef(memoryRouter(activeEntityId ? `/${activeEntityId}` : '/'));
  const [path, setPath] = useState(routerRef.current.get());

  const source = useMemo(() => sampleSource(schema, seeds), [schema, seeds]);
  // «Смотреть как»: роль из схемы или гость (без входа).
  const [viewAs, setViewAs] = useState<string>(CHAIR_ROLE);
  const roles = schema.roles;
  const roleKey = roles?.map((r) => `${r.id}:${r.name}`).join('|') ?? '';
  const effectiveRole = viewAs && roles?.some((r) => r.id === viewAs) ? viewAs : viewAs ? CHAIR_ROLE : '';
  const session = useMemo(
    () => (roles?.length ? previewSession(useClubStore.getState().schema, effectiveRole || null) : undefined),
    [roleKey, effectiveRole], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const assets = useMemo(() => ({ logoUrl: schema.theme.logo }), [schema.theme.logo]);
  useFontStylesheet(fontStylesheetUrl(schema.theme.font));

  const css = useMemo(
    () => `${cssVarsToText(themeToCssVars(schema.theme), '.fx-preview-scope')}\n.fx-preview-scope ${dividerCss(schema.theme)}\n${portalCss}\n${pluginCss(schema)}`,
    [schema.theme, plugins], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    const router = routerRef.current;
    const unlisten = router.listen(setPath);
    portalRef.current = mountPortal(hostRef.current!, {
      schema: useClubStore.getState().schema,
      source,
      session,
      router,
      assets,
      confirm: (text) => window.confirm(text),
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
    portalRef.current?.update({ schema, source, assets, ...(session ? { session } : {}) });
  }, [schema, source, assets, session]);

  // Выбор раздела в конструкторе открывает его в превью.
  useEffect(() => {
    const router = routerRef.current;
    const current = router.get().split('/')[1] ?? '';
    if (activeEntityId && current !== activeEntityId) router.go(`/${activeEntityId}`);
  }, [activeEntityId]);

  const host = `${slugify(schema.clubName).replace(/_/g, '-')}.club`;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-3">
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          {t('preview.title')}
          {Object.keys(seeds).length > 0 && <span className="rounded-full bg-success-soft px-2 py-0.5 text-2xs text-success">{t('preview.realData')}</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
        {roles?.length ? (
          <label className="flex items-center gap-1.5 text-2xs text-fg-muted">
            <UserRound className="h-3.5 w-3.5" />
            {t('preview.viewAs')}
            <select
              data-testid="preview-view-as"
              className="h-6 rounded border border-line bg-panel px-1.5 text-xs text-fg"
              value={effectiveRole}
              onChange={(e) => setViewAs(e.target.value)}
            >
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              <option value="">{t('preview.guest')}</option>
            </select>
          </label>
        ) : null}
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
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-4">
        <div
          className="mx-auto flex h-full min-h-[560px] w-full min-w-0 flex-col overflow-hidden rounded-md border border-line-strong bg-sunken shadow-panel transition-[max-width] duration-300"
          style={{ maxWidth: VIEWPORT_WIDTH[viewport] }}
        >
          <div className="flex items-center gap-3 border-b border-line bg-panel px-3 py-1.5">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded border border-line bg-sunken px-2.5 py-0.5 text-2xs text-fg-muted">
              <Lock className="h-3 w-3 shrink-0 text-success" />
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
