import { useMemo, useState } from 'react';
import { Lock, Monitor, RotateCw, Smartphone, Tablet } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import type { ClubEntity, ClubSchema } from '@/types/schema';
import { cssVarsToText, dividerCss, themeToCssVars } from '@/utils/theme';
import { sampleValue } from '@/utils/sampleData';
import { resolveRelations } from '@/utils/relations';
import { getEntityIcon } from '@/lib/icons';
import { slugify } from '@/lib/id';
import { cn } from '@/lib/cn';
import { Segmented } from './ui/Segmented';
import portalBaseCss from '@/export-templates/portal.base.css?raw';

type Viewport = 'desktop' | 'tablet' | 'mobile';
const VIEWPORT_WIDTH: Record<Viewport, string> = { desktop: '100%', tablet: '768px', mobile: '390px' };
const SAMPLE_ROWS = 6;

/** Тот же CSS, что уйдёт в web/portal.css, но в области .fx-preview — превью 1:1 с экспортом. */
const scopedBaseCss = portalBaseCss
  .replace('* { box-sizing: border-box; }', '')
  .replace('html, body { margin: 0; }', '')
  .replace(/^body \{/m, '.fx-preview {');

function SampleCard({ schema, entity, row }: { schema: ClubSchema; entity: ClubEntity; row: number }) {
  const titleField = entity.fields.find((f) => f.type === 'text') ?? entity.fields[0];
  const status = entity.fields.find((f) => f.type === 'status');
  const image = entity.fields.find((f) => f.type === 'file');
  const relations = resolveRelations(entity, schema);
  const rest = entity.fields.filter((f) => f !== titleField && f !== status && f !== image && f.type !== 'relation');

  return (
    <article className="fx-card">
      {image && row % 2 === 0 && (
        <div
          className="fx-card-media"
          style={{
            backgroundImage: `radial-gradient(circle at ${20 + row * 13}% 30%, var(--fx-accent-soft), transparent 55%), linear-gradient(135deg, var(--fx-primary-soft), var(--fx-accent-soft))`,
          }}
        />
      )}
      <div className="fx-card-head">
        <h3>{titleField ? sampleValue(schema, entity, titleField, row) : entity.name}</h3>
        {status && <span className="fx-badge">{sampleValue(schema, entity, status, row)}</span>}
      </div>
      <hr className="fx-divider" />
      <dl className="fx-rows">
        {rest.map((f) => (
          <div className="fx-row" key={f.id}>
            <dt>{f.name}</dt>
            <dd>{f.type === 'file' ? <a href="#" onClick={(e) => e.preventDefault()}>{sampleValue(schema, entity, f, row)}</a> : sampleValue(schema, entity, f, row)}</dd>
          </div>
        ))}
        {relations.map((r) => {
          const target = schema.entities.find((e) => e.id === r.targetEntityId);
          const tf = target?.fields.find((f) => f.type === 'text');
          if (!target || !tf) return null;
          const count = r.multiple ? 1 + (row % 3) : 1;
          return (
            <div className="fx-row" key={r.name}>
              <dt>{r.label}</dt>
              <dd>
                {Array.from({ length: count }, (_, i) => (
                  <span className="fx-chip" key={i}>{sampleValue(schema, target, tf, row + i * 2 + 1)}</span>
                ))}
              </dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}

export function LivePreview() {
  const schema = useClubStore((s) => s.schema);
  const activeEntityId = useClubStore((s) => s.activeEntityId);
  const setActiveEntity = useClubStore((s) => s.setActiveEntity);
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [query, setQuery] = useState('');

  const css = useMemo(
    () => `${cssVarsToText(themeToCssVars(schema.theme), '.fx-preview')}\n.fx-preview ${dividerCss(schema.theme)}\n${scopedBaseCss}`,
    [schema.theme],
  );

  const entity = schema.entities.find((e) => e.id === activeEntityId) ?? schema.entities[0];
  const titleField = entity?.fields.find((f) => f.type === 'text') ?? entity?.fields[0];
  const rows = entity
    ? Array.from({ length: SAMPLE_ROWS }, (_, i) => i).filter((i) => {
        if (!query.trim() || !titleField) return true;
        return entity.fields
          .map((f) => sampleValue(schema, entity, f, i))
          .join(' ')
          .toLowerCase()
          .includes(query.trim().toLowerCase());
      })
    : [];

  const host = `${slugify(schema.clubName).replace(/_/g, '-')}.club`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Живое превью портала
        </div>
        <Segmented
          size="sm"
          ariaLabel="Размер экрана"
          className="w-auto"
          value={viewport}
          onChange={setViewport}
          options={[
            { value: 'desktop', label: <Monitor className="h-3.5 w-3.5" />, title: 'Компьютер' },
            { value: 'tablet', label: <Tablet className="h-3.5 w-3.5" />, title: 'Планшет' },
            { value: 'mobile', label: <Smartphone className="h-3.5 w-3.5" />, title: 'Телефон' },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
        <div
          className="mx-auto flex h-full min-h-[560px] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40 transition-[max-width] duration-300"
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
              <span className="truncate">https://{host}/#/{entity?.id ?? ''}</span>
            </div>
            <RotateCw className="h-3.5 w-3.5 text-zinc-500" />
          </div>

          <style>{css}</style>
          <div className="fx-preview min-h-0 flex-1 overflow-auto">
            <div className="fx-shell">
              <header className="fx-hero">
                <div>
                  <h1>{schema.clubName || 'Название клуба'}</h1>
                  <p>{schema.motto}</p>
                </div>
                <a className="fx-btn" href="#" onClick={(e) => e.preventDefault()}>Панель управления</a>
              </header>

              <nav className="fx-nav">
                {schema.entities.map((e) => {
                  const Icon = getEntityIcon(e.icon);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      className="fx-tab"
                      aria-current={entity?.id === e.id ? 'page' : undefined}
                      onClick={() => { setActiveEntity(e.id); setQuery(''); }}
                    >
                      <Icon size={15} />
                      {e.pluralName}
                      <span className="fx-count">{SAMPLE_ROWS}</span>
                    </button>
                  );
                })}
              </nav>

              {entity ? (
                <>
                  <div className="fx-toolbar">
                    <h2>{entity.pluralName}</h2>
                    <input className="fx-search" type="search" placeholder="Поиск…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск в превью" />
                  </div>
                  <hr className="fx-divider" />
                  {rows.length ? (
                    <section className={cn('fx-grid')}>
                      {rows.map((i) => (
                        <SampleCard key={i} schema={schema} entity={entity} row={i} />
                      ))}
                    </section>
                  ) : (
                    <div className="fx-empty"><strong>Ничего не найдено</strong>Попробуйте другой запрос.</div>
                  )}
                </>
              ) : (
                <div className="fx-empty"><strong>В схеме нет модулей</strong>Добавьте первый модуль в конструкторе слева.</div>
              )}
              <footer className="fx-footer">Портал собран в Facet OS · данные хранятся на вашем сервере</footer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
