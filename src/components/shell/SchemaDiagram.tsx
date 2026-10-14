import { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Maximize2 } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useWorkbench } from '@/store/useWorkbench';
import { useT, type TKey } from '@/i18n';
import { getEntityIcon } from '@/lib/icons';
import { resolveRelations } from '@/utils/relations';
import { FIELD_ICONS } from '../properties/EntityProperties';
import { Button } from '../ui/Button';
import { cn } from '@/lib/cn';

const BOX_W = 232;
const HEAD_H = 34;
const ROW_H = 24;
const GAP_X = 96;
const GAP_Y = 36;
const PAD = 32;

interface Pos { x: number; y: number }

function autoLayout(ids: string[], heights: Record<string, number>): Record<string, Pos> {
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(ids.length))));
  const colY = Array(cols).fill(PAD);
  const out: Record<string, Pos> = {};
  ids.forEach((id, i) => {
    const c = i % cols;
    out[id] = { x: PAD + c * (BOX_W + GAP_X), y: colY[c] };
    colY[c] += heights[id] + GAP_Y;
  });
  return out;
}

/** Схема данных: разделы, поля и связи (как ER-диаграмма в СУБД). Блоки можно перетаскивать. */
export function SchemaDiagram() {
  const t = useT();
  const schema = useClubStore((s) => s.schema);
  const selection = useWorkbench((s) => s.selection);
  const select = useWorkbench((s) => s.select);
  const heights = useMemo(
    () => Object.fromEntries(schema.entities.map((e) => [e.id, HEAD_H + Math.max(1, e.fields.length + resolveRelations(e, schema).filter((r) => !e.fields.some((f) => f.id === r.name)).length) * ROW_H + 8])),
    [schema],
  );
  const ids = schema.entities.map((e) => e.id);
  const [pos, setPos] = useState<Record<string, Pos>>(() => autoLayout(ids, heights));
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);

  // Новые разделы получают место автоматически; удалённые — забываются.
  useEffect(() => {
    setPos((prev) => {
      const missing = ids.filter((id) => !prev[id]);
      if (!missing.length && Object.keys(prev).every((id) => ids.includes(id))) return prev;
      const layout = autoLayout(ids, heights);
      const next: Record<string, Pos> = {};
      for (const id of ids) next[id] = prev[id] ?? layout[id];
      return next;
    });
  }, [ids.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const width = Math.max(...ids.map((id) => (pos[id]?.x ?? 0) + BOX_W), 600) + PAD;
  const height = Math.max(...ids.map((id) => (pos[id]?.y ?? 0) + heights[id]), 400) + PAD;

  const edges = schema.entities.flatMap((e) =>
    resolveRelations(e, schema).map((r) => {
      const fieldIndex = e.fields.findIndex((f) => f.id === r.name);
      const extraIndex = resolveRelations(e, schema).filter((x) => !e.fields.some((f) => f.id === x.name)).findIndex((x) => x.name === r.name);
      const row = fieldIndex >= 0 ? fieldIndex : e.fields.length + extraIndex;
      return { from: e.id, to: r.targetEntityId, row, multiple: r.multiple, name: r.name };
    }),
  );

  const onPointerDown = (id: string) => (ev: React.PointerEvent) => {
    const p = pos[id];
    drag.current = { id, dx: ev.clientX - p.x, dy: ev.clientY - p.y, moved: false };
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const x = Math.max(8, ev.clientX - d.dx);
    const y = Math.max(8, ev.clientY - d.dy);
    if (!d.moved && Math.abs(x - pos[d.id].x) + Math.abs(y - pos[d.id].y) < 4) return;
    d.moved = true;
    setPos((prev) => ({ ...prev, [d.id]: { x, y } }));
  };
  const onPointerUp = (id: string) => () => {
    if (drag.current && !drag.current.moved) select({ kind: 'entity', id });
    drag.current = null;
  };

  if (!schema.entities.length) {
    return <div className="grid h-full place-items-center text-sm text-fg-subtle">{t('diagram.empty')}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line bg-panel px-3 text-xs text-fg-muted">
        <span>{t('diagram.hint')}</span>
        <Button size="xs" variant="ghost" onClick={() => setPos(autoLayout(ids, heights))}><Maximize2 className="h-3 w-3" /> {t('diagram.arrange')}</Button>
      </div>
      <div
        ref={canvas}
        className="min-h-0 flex-1 overflow-auto"
        style={{ backgroundImage: 'radial-gradient(rgb(var(--c-line-strong)) 1px, transparent 1px)', backgroundSize: '16px 16px' }}
        data-testid="schema-diagram"
      >
        <div className="relative" style={{ width, height }} onPointerMove={onPointerMove}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">
            <defs>
              <marker id="fx-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="rgb(var(--c-accent))" />
              </marker>
            </defs>
            {edges.map((edge, i) => {
              const a = pos[edge.from];
              const b = pos[edge.to];
              if (!a || !b) return null;
              const y1 = a.y + HEAD_H + edge.row * ROW_H + ROW_H / 2 + 4;
              const y2 = b.y + HEAD_H / 2;
              const self = edge.from === edge.to;
              const rightToLeft = b.x >= a.x + BOX_W / 2;
              const x1 = rightToLeft || self ? a.x + BOX_W : a.x;
              const x2 = self ? b.x + BOX_W : rightToLeft ? b.x : b.x + BOX_W;
              const bend = self ? 48 : Math.max(40, Math.abs(x2 - x1) / 2);
              const c1 = x1 + (rightToLeft || self ? bend : -bend);
              const c2 = x2 + (self ? bend : rightToLeft ? -bend : bend);
              const d = `M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}`;
              const midX = (x1 + x2) / 2 + (self ? bend * 0.75 : 0);
              const midY = (y1 + y2) / 2;
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="rgb(var(--c-accent))" strokeOpacity="0.55" strokeWidth="1.5" markerEnd="url(#fx-arrow)" />
                  <rect x={midX - 14} y={midY - 9} width="28" height="18" rx="4" fill="rgb(var(--c-panel))" stroke="rgb(var(--c-line-strong))" />
                  <text x={midX} y={midY + 4} textAnchor="middle" fontSize="10" fontWeight="600" fill="rgb(var(--c-fg-muted))">{edge.multiple ? 'N:N' : 'N:1'}</text>
                </g>
              );
            })}
          </svg>
          {schema.entities.map((e) => {
            const p = pos[e.id];
            if (!p) return null;
            const Icon = getEntityIcon(e.icon);
            const active = selection.kind === 'entity' && selection.id === e.id;
            const extra = resolveRelations(e, schema).filter((r) => !e.fields.some((f) => f.id === r.name));
            return (
              <div
                key={e.id}
                role="button"
                tabIndex={0}
                aria-label={e.pluralName}
                onKeyDown={(ev) => ev.key === 'Enter' && select({ kind: 'entity', id: e.id })}
                onPointerDown={onPointerDown(e.id)}
                onPointerUp={onPointerUp(e.id)}
                className={cn(
                  'absolute cursor-grab touch-none select-none overflow-hidden rounded-md border bg-panel shadow-panel active:cursor-grabbing',
                  active ? 'border-accent ring-2 ring-accent/25' : 'border-line-strong hover:border-fg-subtle',
                )}
                style={{ left: p.x, top: p.y, width: BOX_W }}
              >
                <div className={cn('flex items-center gap-2 border-b px-2.5', active ? 'border-accent/40 bg-accent-soft' : 'border-line bg-sunken')} style={{ height: HEAD_H }}>
                  <Icon className="h-3.5 w-3.5 text-accent" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{e.pluralName}</span>
                  <span className="font-mono text-2xs text-fg-subtle">{e.id}</span>
                </div>
                <div className="py-1">
                  {e.fields.map((f) => {
                    const FIcon = FIELD_ICONS[f.type];
                    const target = f.type === 'relation' ? schema.entities.find((x) => x.id === f.targetEntityId) : null;
                    return (
                      <div key={f.id} className="flex items-center gap-2 px-2.5 text-xs" style={{ height: ROW_H }}>
                        <FIcon className="h-3 w-3 shrink-0 text-fg-subtle" />
                        <span className="min-w-0 flex-1 truncate text-fg">{f.name}{f.required && <span className="text-danger"> *</span>}</span>
                        <span className="shrink-0 text-2xs text-fg-subtle">{target ? `→ ${target.pluralName}` : t(`fieldType.${f.type}` as TKey)}</span>
                      </div>
                    );
                  })}
                  {extra.map((r) => {
                    const target = schema.entities.find((x) => x.id === r.targetEntityId);
                    return (
                      <div key={r.name} className="flex items-center gap-2 px-2.5 text-xs" style={{ height: ROW_H }}>
                        <Link2 className="h-3 w-3 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1 truncate text-fg-muted">{target?.pluralName}</span>
                        <span className="shrink-0 text-2xs text-fg-subtle">{r.multiple ? t('relations.many') : t('relations.one')}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
