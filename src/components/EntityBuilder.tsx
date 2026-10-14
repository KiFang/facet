import { useEffect, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, Asterisk, Calendar, CalendarDays, CircleDot, Columns3, Database, File, FileSpreadsheet,
  Hash, LayoutGrid, Link2, ListChecks, Plus, Table, Trash2, Type, X, type LucideIcon,
} from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import type { ClubEntity, EditorMode, EntityField, FieldType, RelationType, ViewType } from '@/types/schema';
import { ICON_NAMES, getEntityIcon } from '@/lib/icons';
import { slugify, uniqueId } from '@/lib/id';
import { cn } from '@/lib/cn';
import { useT, type TKey } from '@/i18n';
import { RESERVED_COLLECTIONS, RESERVED_FIELDS } from '@/utils/validate';
import { availableViews, dateFieldOf, groupFieldOf } from '@/portal/model';
import { Button } from './ui/Button';
import { Input, Label, Select } from './ui/Input';
import { Switch } from './ui/Switch';
import { Segmented } from './ui/Segmented';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/Accordion';
import { ImportDialog } from './ImportDialog';
import { toast } from './ui/Toast';

const FIELD_ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  date: Calendar,
  select: ListChecks,
  status: CircleDot,
  file: File,
  relation: Link2,
};
const FIELD_TYPES = Object.keys(FIELD_ICONS) as FieldType[];
const VIEW_ICONS: Record<ViewType, LucideIcon> = { cards: LayoutGrid, table: Table, kanban: Columns3, calendar: CalendarDays };

interface Template {
  id: string;
  build: (t: (k: TKey) => string) => Omit<ClubEntity, 'id'>;
}

/** Заготовки модулей. Названия полей — на языке интерфейса. */
const TEMPLATES: Template[] = [
  {
    id: 'blank',
    build: (t) => ({ name: t('tpl.blank.one'), pluralName: t('tpl.blank.many'), icon: 'Box', relations: [], fields: [{ id: 'title', name: t('f.title'), type: 'text', required: true }] }),
  },
  {
    id: 'events',
    build: (t) => ({
      name: t('tpl.events.one'), pluralName: t('tpl.events.many'), icon: 'Calendar', relations: [], view: { type: 'calendar' },
      fields: [
        { id: 'title', name: t('f.title'), type: 'text', required: true },
        { id: 'starts_at', name: t('f.date'), type: 'date', required: true },
        { id: 'status', name: t('f.status'), type: 'status', required: true, options: [t('opt.planned'), t('opt.inProgress'), t('opt.done')] },
      ],
    }),
  },
  {
    id: 'tasks',
    build: (t) => ({
      name: t('tpl.tasks.one'), pluralName: t('tpl.tasks.many'), icon: 'Flag', relations: [], view: { type: 'kanban' },
      fields: [
        { id: 'title', name: t('f.task'), type: 'text', required: true },
        { id: 'status', name: t('f.status'), type: 'status', required: true, options: [t('opt.new'), t('opt.inProgress'), t('opt.review'), t('opt.done')] },
        { id: 'deadline', name: t('f.deadline'), type: 'date', required: false },
      ],
    }),
  },
  {
    id: 'awards',
    build: (t) => ({
      name: t('tpl.awards.one'), pluralName: t('tpl.awards.many'), icon: 'Award', relations: [],
      fields: [
        { id: 'title', name: t('f.award'), type: 'text', required: true },
        { id: 'received_at', name: t('f.received'), type: 'date', required: false },
        { id: 'level', name: t('f.level'), type: 'select', required: false, options: [t('opt.campus'), t('opt.city'), t('opt.country'), t('opt.world')] },
        { id: 'proof', name: t('f.diploma'), type: 'file', required: false },
      ],
    }),
  },
  {
    id: 'docs',
    build: (t) => ({
      name: t('tpl.docs.one'), pluralName: t('tpl.docs.many'), icon: 'FileText', relations: [], view: { type: 'table' },
      fields: [
        { id: 'title', name: t('f.title'), type: 'text', required: true },
        { id: 'kind', name: t('f.kind'), type: 'select', required: true, options: [t('opt.charter'), t('opt.minutes'), t('opt.report'), t('opt.template')] },
        { id: 'file', name: t('f.file'), type: 'file', required: true },
      ],
    }),
  },
  {
    id: 'budget',
    build: (t) => ({
      name: t('tpl.budget.one'), pluralName: t('tpl.budget.many'), icon: 'Archive', relations: [], view: { type: 'table' },
      fields: [
        { id: 'item', name: t('f.item'), type: 'text', required: true },
        { id: 'amount', name: t('f.amount'), type: 'number', required: true },
        { id: 'kind', name: t('f.kind'), type: 'select', required: true, options: [t('opt.income'), t('opt.expense')] },
        { id: 'date', name: t('f.date'), type: 'date', required: false },
      ],
    }),
  },
  {
    id: 'applications',
    build: (t) => ({
      name: t('tpl.applications.one'), pluralName: t('tpl.applications.many'), icon: 'Ticket', relations: [], view: { type: 'kanban' },
      fields: [
        { id: 'full_name', name: t('f.name'), type: 'text', required: true },
        { id: 'contact', name: t('f.contact'), type: 'text', required: true },
        { id: 'status', name: t('f.status'), type: 'status', required: true, options: [t('opt.new'), t('opt.interview'), t('opt.accepted'), t('opt.rejected')] },
      ],
    }),
  },
];

/* ---------------------------------- helpers ---------------------------------- */

function OptionsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(value.join(', '));
  useEffect(() => setDraft(value.join(', ')), [value]);
  return (
    <Input
      value={draft}
      placeholder={t('field.optionsPlaceholder')}
      aria-label={t('field.options')}
      className="h-8 text-xs"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const opts = draft.split(',').map((s) => s.trim()).filter(Boolean);
        onChange(opts.length ? Array.from(new Set(opts)) : value);
      }}
    />
  );
}

function IdInput({ value, taken, onCommit, label }: { value: string; taken: string[]; onCommit: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      spellCheck={false}
      aria-label={label}
      title={label}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      onBlur={() => {
        const slug = slugify(draft);
        const next = slug === value ? value : uniqueId(slug, taken.filter((x) => x !== value));
        setDraft(next);
        if (next !== value) onCommit(next);
      }}
      className="w-full rounded bg-transparent px-1 font-mono text-[11px] text-zinc-500 hover:bg-zinc-800 focus:bg-zinc-800 focus:text-zinc-200 focus:outline-none"
    />
  );
}

/* ----------------------------------- field ----------------------------------- */

function FieldRow({ entity, field, mode, entities }: { entity: ClubEntity; field: EntityField; mode: EditorMode; entities: ClubEntity[] }) {
  const t = useT();
  const updateField = useClubStore((s) => s.updateField);
  const removeField = useClubStore((s) => s.removeField);
  const renameFieldId = useClubStore((s) => s.renameFieldId);
  const Icon = FIELD_ICONS[field.type];

  const changeType = (type: FieldType) => {
    const updates: Partial<EntityField> = { type };
    if ((type === 'select' || type === 'status') && !field.options?.length)
      updates.options = type === 'status' ? [t('opt.new'), t('opt.inProgress'), t('opt.done')] : [t('opt.a'), t('opt.b')];
    if (type === 'relation') updates.targetEntityId = field.targetEntityId ?? entities.find((e) => e.id !== entity.id)?.id ?? entity.id;
    updateField(entity.id, field.id, updates);
  };

  return (
    <div className="group rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-400" title={t(`fieldType.${field.type}` as TKey)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <Input
          value={field.name}
          aria-label={t('field.name')}
          className="h-8 min-w-0 flex-1 text-xs"
          onChange={(e) => updateField(entity.id, field.id, { name: e.target.value })}
        />
        <Select value={field.type} aria-label={t('field.type')} className="h-8 w-[108px] text-xs" onChange={(e) => changeType(e.target.value as FieldType)}>
          {FIELD_TYPES.map((type) => (
            <option key={type} value={type}>{t(`fieldType.${type}` as TKey)}</option>
          ))}
        </Select>
        <div className="flex items-center" title={t('field.required')}>
          <Switch checked={field.required} label={t('field.required')} onChange={(v) => updateField(entity.id, field.id, { required: v })} />
        </div>
        <Button size="icon" variant="danger" aria-label={t('field.remove')} title={t('field.remove')} disabled={entity.fields.length <= 1} onClick={() => removeField(entity.id, field.id)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {(mode === 'pro' || field.type === 'select' || field.type === 'status' || field.type === 'relation') && (
        <div className="mt-2 space-y-2 pl-10">
          {mode === 'pro' && (
            <IdInput
              value={field.id}
              label={t('field.systemId')}
              taken={[...entity.fields.map((f) => f.id), ...RESERVED_FIELDS]}
              onCommit={(next) => renameFieldId(entity.id, field.id, next)}
            />
          )}
          {(field.type === 'select' || field.type === 'status') && (
            <OptionsInput value={field.options ?? []} onChange={(options) => updateField(entity.id, field.id, { options })} />
          )}
          {field.type === 'relation' && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <ArrowRight className="h-3.5 w-3.5" />
              <Select value={field.targetEntityId} aria-label={t('field.target')} className="h-8 text-xs"
                onChange={(e) => updateField(entity.id, field.id, { targetEntityId: e.target.value })}>
                {entities.map((e) => <option key={e.id} value={e.id}>{e.pluralName}</option>)}
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- relations --------------------------------- */

function RelationsEditor({ entity, entities }: { entity: ClubEntity; entities: ClubEntity[] }) {
  const t = useT();
  const updateEntity = useClubStore((s) => s.updateEntity);
  const candidates = entities.filter((e) => e.id !== entity.id);
  const incoming = entities.filter(
    (e) => e.id !== entity.id &&
      (e.relations.some((r) => r.targetEntityId === entity.id) || e.fields.some((f) => f.type === 'relation' && f.targetEntityId === entity.id)),
  );
  const free = candidates.filter((c) => !entity.relations.some((r) => r.targetEntityId === c.id));
  const setRelations = (relations: ClubEntity['relations']) => updateEntity(entity.id, { relations });

  return (
    <div className="space-y-2">
      <Label>{t('relations.title')}</Label>
      {entity.relations.map((rel, i) => {
        const target = entities.find((e) => e.id === rel.targetEntityId);
        const TargetIcon = getEntityIcon(target?.icon ?? '');
        return (
          <div key={rel.targetEntityId} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
            <TargetIcon className="ml-1 h-3.5 w-3.5 shrink-0 text-violet-400" />
            <Select value={rel.targetEntityId} aria-label={t('relations.target')} className="h-8 min-w-0 flex-1 text-xs"
              onChange={(e) => setRelations(entity.relations.map((r, j) => (j === i ? { ...r, targetEntityId: e.target.value } : r)))}>
              {[target, ...free].filter(Boolean).map((c) => <option key={c!.id} value={c!.id}>{c!.pluralName}</option>)}
            </Select>
            <Segmented<RelationType>
              size="sm"
              ariaLabel={t('relations.type')}
              className="w-auto"
              value={rel.type}
              options={[
                { value: 'one-to-many', label: '1→N', title: t('relations.single', { a: entity.name, b: target?.name ?? '' }) },
                { value: 'many-to-many', label: 'N↔N', title: t('relations.multiple', { a: entity.name, b: target?.name ?? '' }) },
              ]}
              onChange={(type) => setRelations(entity.relations.map((r, j) => (j === i ? { ...r, type } : r)))}
            />
            <Button size="icon" variant="danger" aria-label={t('relations.remove')} onClick={() => setRelations(entity.relations.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
      {free.length > 0 ? (
        <Button size="sm" variant="ghost" className="w-full justify-center border border-dashed border-zinc-700"
          onClick={() => setRelations([...entity.relations, { targetEntityId: free[0].id, type: 'many-to-many' }])}>
          <Link2 className="h-3.5 w-3.5" /> {t('relations.add')}
        </Button>
      ) : (
        candidates.length === 0 && <p className="text-xs text-zinc-500">{t('relations.needSecond')}</p>
      )}
      {incoming.length > 0 && <p className="text-xs text-zinc-500">{t('relations.incoming')}: {incoming.map((e) => e.pluralName).join(', ')}</p>}
    </div>
  );
}

/* ----------------------------------- view ------------------------------------ */

function ViewEditor({ entity }: { entity: ClubEntity }) {
  const t = useT();
  const setView = useClubStore((s) => s.setView);
  const views = availableViews(entity);
  const view = entity.view ?? { type: 'cards' as const };
  const groupable = entity.fields.filter((f) => f.type === 'status' || f.type === 'select');
  const dated = entity.fields.filter((f) => f.type === 'date');

  return (
    <div className="space-y-2">
      <Label hint={t('view.hint')}>{t('view.title')}</Label>
      <div className="grid grid-cols-4 gap-1.5">
        {(['cards', 'table', 'kanban', 'calendar'] as ViewType[]).map((type) => {
          const Icon = VIEW_ICONS[type];
          const enabled = views.includes(type);
          return (
            <button
              key={type}
              type="button"
              disabled={!enabled}
              title={enabled ? t(`view.${type}` as TKey) : t(type === 'kanban' ? 'view.needStatus' : 'view.needDate')}
              onClick={() => setView(entity.id, { ...view, type })}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-35',
                view.type === type ? 'border-violet-500 bg-violet-500/10 text-white' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600',
              )}
            >
              <Icon className="h-4 w-4" />
              {t(`view.${type}` as TKey)}
            </button>
          );
        })}
      </div>
      {view.type === 'kanban' && groupable.length > 1 && (
        <Select value={groupFieldOf(entity)?.id} aria-label={t('view.groupBy')} className="h-8 text-xs" onChange={(e) => setView(entity.id, { ...view, groupBy: e.target.value })}>
          {groupable.map((f) => <option key={f.id} value={f.id}>{t('view.groupBy')}: {f.name}</option>)}
        </Select>
      )}
      {view.type === 'calendar' && dated.length > 1 && (
        <Select value={dateFieldOf(entity)?.id} aria-label={t('view.dateField')} className="h-8 text-xs" onChange={(e) => setView(entity.id, { ...view, dateField: e.target.value })}>
          {dated.map((f) => <option key={f.id} value={f.id}>{t('view.dateField')}: {f.name}</option>)}
        </Select>
      )}
    </div>
  );
}

/* ----------------------------------- data ------------------------------------ */

function DataRow({ entity }: { entity: ClubEntity }) {
  const t = useT();
  const seeds = useClubStore((s) => s.seeds[entity.id]);
  const clearSeeds = useClubStore((s) => s.clearSeeds);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <Label>{t('data.title')}</Label>
      {seeds ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          <Database className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{t('data.ready', { n: seeds.rows.length, source: seeds.source })}</span>
          <Button size="icon" variant="ghost" aria-label={t('data.clear')} title={t('data.clear')} onClick={() => clearSeeds(entity.id)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">{t('data.hint')}</p>
      )}
      <Button size="sm" variant="ghost" className="w-full justify-center border border-dashed border-zinc-700" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="h-3.5 w-3.5" /> {seeds ? t('data.replace') : t('data.import')}
      </Button>
      {open && <ImportDialog entityId={entity.id} onClose={() => setOpen(false)} />}
    </div>
  );
}

/* ---------------------------------- entity ----------------------------------- */

function EntityEditor({ entity, mode, entities }: { entity: ClubEntity; mode: EditorMode; entities: ClubEntity[] }) {
  const t = useT();
  const updateEntity = useClubStore((s) => s.updateEntity);
  const renameEntityId = useClubStore((s) => s.renameEntityId);
  const addField = useClubStore((s) => s.addField);
  const [iconsOpen, setIconsOpen] = useState(false);
  const Icon = getEntityIcon(entity.icon);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIconsOpen((v) => !v)}
          className={cn('mt-[22px] flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
            iconsOpen ? 'border-violet-500 bg-violet-500/15 text-violet-300' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500')}
          aria-label={t('entity.icon')}
          aria-expanded={iconsOpen}
        >
          <Icon className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${entity.id}-plural`}>{t('entity.plural')}</Label>
          <Input id={`${entity.id}-plural`} value={entity.pluralName} onChange={(e) => updateEntity(entity.id, { pluralName: e.target.value })} />
        </div>
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${entity.id}-name`}>{t('entity.single')}</Label>
          <Input id={`${entity.id}-name`} value={entity.name} onChange={(e) => updateEntity(entity.id, { name: e.target.value })} />
        </div>
      </div>

      {iconsOpen && (
        <div className="grid grid-cols-10 gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-2">
          {ICON_NAMES.map((name) => {
            const I = getEntityIcon(name);
            return (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                onClick={() => { updateEntity(entity.id, { icon: name }); setIconsOpen(false); }}
                className={cn('flex aspect-square items-center justify-center rounded-md transition-colors',
                  entity.icon === name ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white')}
              >
                <I className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      )}

      {mode === 'pro' && (
        <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
          <span className="shrink-0">collection:</span>
          <IdInput
            value={entity.id}
            label={t('entity.systemId')}
            taken={[...entities.map((e) => e.id), ...RESERVED_COLLECTIONS]}
            onCommit={(next) => renameEntityId(entity.id, next)}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label hint={<span className="flex items-center gap-1"><Asterisk className="h-3 w-3" />— {t('field.requiredHint')}</span>}>{t('fields.title')}</Label>
        {entity.fields.map((field) => <FieldRow key={field.id} entity={entity} field={field} mode={mode} entities={entities} />)}
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-center border border-dashed border-zinc-700"
          onClick={() => addField(entity.id, { id: uniqueId('field', [...entity.fields.map((f) => f.id), ...RESERVED_FIELDS]), name: t('field.new'), type: 'text', required: false })}
        >
          <Plus className="h-3.5 w-3.5" /> {t('fields.add')}
        </Button>
      </div>

      <RelationsEditor entity={entity} entities={entities} />
      <ViewEditor entity={entity} />
      <DataRow entity={entity} />
    </div>
  );
}

/* ---------------------------------- builder ---------------------------------- */

export function EntityBuilder({ mode }: { mode: EditorMode }) {
  const t = useT();
  const entities = useClubStore((s) => s.schema.entities);
  const seeds = useClubStore((s) => s.seeds);
  const activeEntityId = useClubStore((s) => s.activeEntityId);
  const setActiveEntity = useClubStore((s) => s.setActiveEntity);
  const addEntity = useClubStore((s) => s.addEntity);
  const removeEntity = useClubStore((s) => s.removeEntity);
  const moveEntity = useClubStore((s) => s.moveEntity);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);

  const createFromTemplate = (tpl: Template) => {
    const base = tpl.build(t);
    const id = uniqueId(base.pluralName, [...entities.map((e) => e.id), ...RESERVED_COLLECTIONS]);
    addEntity({ id, ...base });
    setTemplatesOpen(false);
  };

  return (
    <div className="space-y-3">
      <Accordion type="single" collapsible value={mode === 'easy' ? '' : (activeEntityId ?? '')} onValueChange={(v) => v && setActiveEntity(v)}>
        {entities.map((entity, index) => {
          const Icon = getEntityIcon(entity.icon);
          const relCount = entity.relations.length + entity.fields.filter((f) => f.type === 'relation').length;
          const ViewIcon = VIEW_ICONS[entity.view?.type ?? 'cards'];
          const header = (
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate">{entity.pluralName}</span>
                <span className="flex items-center gap-1.5 text-xs font-normal text-zinc-500">
                  {t('entity.summary', { fields: entity.fields.length })}
                  {relCount ? ` · ${t('entity.links', { n: relCount })}` : ''}
                  <ViewIcon className="h-3 w-3" />
                  {seeds[entity.id] && <Database className="h-3 w-3 text-emerald-400" />}
                </span>
              </span>
            </span>
          );
          return (
            <AccordionItem key={entity.id} value={entity.id}>
              <div className="flex items-center gap-1">
                {mode === 'easy' ? (
                  <button type="button" onClick={() => setActiveEntity(entity.id)}
                    className={cn('flex min-w-0 flex-1 py-3 text-left text-sm font-semibold', activeEntityId === entity.id ? 'text-white' : 'text-zinc-300')}>
                    {header}
                  </button>
                ) : (
                  <AccordionTrigger className="min-w-0">{header}</AccordionTrigger>
                )}
                {mode !== 'easy' && (
                  <>
                    <Button size="icon" variant="ghost" aria-label={t('common.up')} disabled={index === 0} onClick={() => moveEntity(entity.id, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={t('common.down')} disabled={index === entities.length - 1} onClick={() => moveEntity(entity.id, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <Button size="icon" variant="danger" aria-label={t('entity.remove', { name: entity.pluralName })} title={t('entity.remove', { name: entity.pluralName })}
                  onClick={() => {
                    removeEntity(entity.id);
                    toast('info', t('entity.removed', { name: entity.pluralName }), { label: t('history.undo'), run: () => useClubStore.temporal.getState().undo() });
                  }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {mode !== 'easy' && (
                <AccordionContent>
                  <EntityEditor entity={entity} mode={mode} entities={entities} />
                </AccordionContent>
              )}
            </AccordionItem>
          );
        })}
      </Accordion>

      {templatesOpen ? (
        <div className="space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2">
          <p className="px-1 pb-1 text-xs text-zinc-500">{t('modules.pickBase')}</p>
          {TEMPLATES.map((tpl) => {
            const preview = tpl.build(t);
            const I = getEntityIcon(preview.icon);
            return (
              <button key={tpl.id} type="button" onClick={() => createFromTemplate(tpl)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800">
                <I className="h-4 w-4 text-violet-400" />
                <span className="flex-1">{preview.pluralName}</span>
                <span className="text-xs text-zinc-500">{t('entity.summary', { fields: preview.fields.length })}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => { setTemplatesOpen(false); setCsvOpen(true); }}
            className="flex w-full items-center gap-3 rounded-lg border-t border-zinc-800 px-2 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800">
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            <span className="flex-1">{t('modules.fromSheet')}</span>
            <span className="text-xs text-zinc-500">CSV · Google</span>
          </button>
          <Button size="sm" variant="ghost" className="w-full justify-center" onClick={() => setTemplatesOpen(false)}>{t('common.cancel')}</Button>
        </div>
      ) : (
        <Button variant="primary" className="w-full justify-center" onClick={() => setTemplatesOpen(true)}>
          <Plus className="h-4 w-4" /> {t('modules.new')}
        </Button>
      )}
      {csvOpen && <ImportDialog onClose={() => setCsvOpen(false)} />}
    </div>
  );
}
