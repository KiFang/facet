import { useEffect, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, Calendar, CalendarDays, CircleDot, Columns3, Database, File, FileSpreadsheet, Hash,
  LayoutGrid, Link2, ListChecks, Plus, Table, Trash2, Type, X, type LucideIcon,
} from 'lucide-react';
import { useClubStore, NONE } from '@/store/useClubStore';
import { useSettings } from '@/store/useSettings';
import { useWorkbench } from '@/store/useWorkbench';
import type { ClubEntity, EntityField, FieldType, RelationType, ViewType } from '@/types/schema';
import { ICON_NAMES, getEntityIcon } from '@/lib/icons';
import { slugify, uniqueId } from '@/lib/id';
import { cn } from '@/lib/cn';
import { useT, type TKey } from '@/i18n';
import { RESERVED_COLLECTIONS, RESERVED_FIELDS } from '@/utils/validate';
import { availableViews, dateFieldOf, groupFieldOf } from '@/portal/model';
import { openDataEditor } from '@/lib/windows';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Input';
import { Switch } from '../ui/Switch';
import { Segmented } from '../ui/Segmented';
import { Section } from '../ui/Section';
import { Tip } from '../ui/Tooltip';
import { toast } from '../ui/Toast';
import { PropertyPage } from './PropertyPage';
import { AccessCell } from './RolesProperties';
import { PostingsEditor } from './PostingsEditor';
import { BasisEditor } from './BasisEditor';
import { PrintFormsEditor } from './PrintFormsEditor';
import { accessOf, CHAIR_ROLE } from '@/utils/access';

export const FIELD_ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  date: Calendar,
  select: ListChecks,
  status: CircleDot,
  file: File,
  relation: Link2,
};
const FIELD_TYPES = Object.keys(FIELD_ICONS) as FieldType[];
export const VIEW_ICONS: Record<ViewType, LucideIcon> = { cards: LayoutGrid, table: Table, kanban: Columns3, calendar: CalendarDays };

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
      className="h-7 text-xs"
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
      className="h-6 w-full rounded border border-transparent bg-transparent px-1.5 font-mono text-2xs text-fg-subtle hover:border-line focus:border-accent focus:bg-panel focus:text-fg focus:outline-hidden"
    />
  );
}

/* ----------------------------------- field ----------------------------------- */

function FieldRow({ entity, field, index, editable, pro }: { entity: ClubEntity; field: EntityField; index: number; editable: boolean; pro: boolean }) {
  const t = useT();
  const entities = useClubStore((s) => s.schema.entities);
  const updateField = useClubStore((s) => s.updateField);
  const removeField = useClubStore((s) => s.removeField);
  const renameFieldId = useClubStore((s) => s.renameFieldId);
  const moveField = useClubStore((s) => s.moveField);
  const Icon = FIELD_ICONS[field.type];
  const hasExtra = pro || field.type === 'select' || field.type === 'status' || field.type === 'relation';

  const changeType = (type: FieldType) => {
    const updates: Partial<EntityField> = { type };
    if ((type === 'select' || type === 'status') && !field.options?.length)
      updates.options = type === 'status' ? [t('opt.new'), t('opt.inProgress'), t('opt.done')] : [t('opt.a'), t('opt.b')];
    if (type === 'relation') updates.targetEntityId = field.targetEntityId ?? entities.find((e) => e.id !== entity.id)?.id ?? entity.id;
    updateField(entity.id, field.id, updates);
  };

  const remove = () => {
    if (useSettings.getState().confirmDeletes && !window.confirm(t('confirm.deleteField', { name: field.name }))) return;
    removeField(entity.id, field.id);
  };

  if (!editable) {
    return (
      <div className="flex h-8 items-center gap-2 border-b border-line px-2 text-sm last:border-b-0">
        <Icon className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        <span className="flex-1 truncate">{field.name}{field.required && <span className="text-danger"> *</span>}</span>
        <span className="text-2xs text-fg-subtle">{t(`fieldType.${field.type}` as TKey)}</span>
      </div>
    );
  }

  return (
    <div className="group border-b border-line last:border-b-0" data-testid={`field-${field.id}`}>
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <Tip content={t(`fieldType.${field.type}` as TKey)}>
          <span className="flex h-7 w-6 shrink-0 items-center justify-center text-fg-subtle"><Icon className="h-3.5 w-3.5" /></span>
        </Tip>
        <Input value={field.name} aria-label={t('field.name')} className="h-7 min-w-0 flex-1 text-xs"
          onChange={(e) => updateField(entity.id, field.id, { name: e.target.value })} />
        <Select value={field.type} aria-label={t('field.type')} className="h-7 w-[100px] text-xs" onChange={(e) => changeType(e.target.value as FieldType)}>
          {FIELD_TYPES.map((type) => <option key={type} value={type}>{t(`fieldType.${type}` as TKey)}</option>)}
        </Select>
        <Tip content={t('field.required')}>
          <span className="flex w-9 justify-center">
            <Switch checked={field.required} label={t('field.required')} onChange={(v) => updateField(entity.id, field.id, { required: v })} />
          </span>
        </Tip>
        <div className="flex opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button size="icon-sm" variant="ghost" aria-label={t('common.up')} disabled={index === 0} onClick={() => moveField(entity.id, field.id, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={t('common.down')} disabled={index === entity.fields.length - 1} onClick={() => moveField(entity.id, field.id, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
          <Button size="icon-sm" variant="danger" aria-label={t('field.remove')} title={t('field.remove')} disabled={entity.fields.length <= 1} onClick={remove}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {hasExtra && (
        <div className="space-y-1.5 pb-2 pl-9 pr-2">
          {pro && (
            <IdInput value={field.id} label={t('field.systemId')} taken={[...entity.fields.map((f) => f.id), ...RESERVED_FIELDS]}
              onCommit={(next) => renameFieldId(entity.id, field.id, next)} />
          )}
          {(field.type === 'select' || field.type === 'status') && (
            <OptionsInput value={field.options ?? []} onChange={(options) => updateField(entity.id, field.id, { options })} />
          )}
          {field.type === 'relation' && (
            <div className="flex items-center gap-2 text-xs text-fg-muted">
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              <Select value={field.targetEntityId} aria-label={t('field.target')} className="h-7 text-xs"
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

function RelationsEditor({ entity }: { entity: ClubEntity }) {
  const t = useT();
  const entities = useClubStore((s) => s.schema.entities);
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
      {entity.relations.length > 0 && (
        <div className="rounded-md border border-line bg-panel">
          {entity.relations.map((rel, i) => {
            const target = entities.find((e) => e.id === rel.targetEntityId);
            const TargetIcon = getEntityIcon(target?.icon ?? '');
            return (
              <div key={rel.targetEntityId} className="flex items-center gap-1.5 border-b border-line px-1.5 py-1 last:border-b-0">
                <TargetIcon className="mx-1 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                <Select value={rel.targetEntityId} aria-label={t('relations.target')} className="h-7 min-w-0 flex-1 text-xs"
                  onChange={(e) => setRelations(entity.relations.map((r, j) => (j === i ? { ...r, targetEntityId: e.target.value } : r)))}>
                  {[target, ...free].filter(Boolean).map((c) => <option key={c!.id} value={c!.id}>{c!.pluralName}</option>)}
                </Select>
                <Segmented<RelationType>
                  size="sm"
                  ariaLabel={t('relations.type')}
                  className="w-auto"
                  value={rel.type}
                  options={[
                    { value: 'one-to-many', label: t('relations.one'), title: t('relations.single', { a: entity.name, b: target?.name ?? '' }) },
                    { value: 'many-to-many', label: t('relations.many'), title: t('relations.multiple', { a: entity.name, b: target?.name ?? '' }) },
                  ]}
                  onChange={(type) => setRelations(entity.relations.map((r, j) => (j === i ? { ...r, type } : r)))}
                />
                <Button size="icon-sm" variant="danger" aria-label={t('relations.remove')} onClick={() => setRelations(entity.relations.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {free.length > 0 ? (
        <Button size="sm" variant="subtle" onClick={() => setRelations([...entity.relations, { targetEntityId: free[0].id, type: 'many-to-many' }])}>
          <Link2 className="h-3.5 w-3.5" /> {t('relations.add')}
        </Button>
      ) : (
        candidates.length === 0 && <p className="text-xs text-fg-subtle">{t('relations.needSecond')}</p>
      )}
      {incoming.length > 0 && <p className="text-2xs text-fg-subtle">{t('relations.incoming')}: {incoming.map((e) => e.pluralName).join(', ')}</p>}
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
      <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label={t('view.title')}>
        {(['cards', 'table', 'kanban', 'calendar'] as ViewType[]).map((type) => {
          const Icon = VIEW_ICONS[type];
          const enabled = views.includes(type);
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={view.type === type}
              disabled={!enabled}
              title={enabled ? t(`view.${type}` as TKey) : t(type === 'kanban' ? 'view.needStatus' : 'view.needDate')}
              onClick={() => setView(entity.id, { ...view, type })}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border py-2 text-2xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35',
                view.type === type ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-panel text-fg-muted hover:border-line-strong hover:text-fg',
              )}
            >
              <Icon className="h-4 w-4" />
              {t(`view.${type}` as TKey)}
            </button>
          );
        })}
      </div>
      {view.type === 'kanban' && groupable.length > 1 && (
        <Field label={t('view.groupBy')}>
          <Select value={groupFieldOf(entity)?.id} aria-label={t('view.groupBy')} className="h-7 text-xs" onChange={(e) => setView(entity.id, { ...view, groupBy: e.target.value })}>
            {groupable.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
      )}
      {view.type === 'calendar' && dated.length > 1 && (
        <Field label={t('view.dateField')}>
          <Select value={dateFieldOf(entity)?.id} aria-label={t('view.dateField')} className="h-7 text-xs" onChange={(e) => setView(entity.id, { ...view, dateField: e.target.value })}>
            {dated.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
      )}
    </div>
  );
}

/* ----------------------------------- data ------------------------------------ */

function DataSection({ entity }: { entity: ClubEntity }) {
  const t = useT();
  const seeds = useClubStore((s) => s.seeds[entity.id]);
  const clearSeeds = useClubStore((s) => s.clearSeeds);
  const open = useWorkbench((s) => s.open);
  return (
    <div className="space-y-2">
      {seeds ? (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft px-2.5 py-1.5 text-xs text-success">
          <Database className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{t('data.ready', { n: seeds.rows.length, source: seeds.source })}</span>
          <Button size="icon-sm" variant="ghost" aria-label={t('data.clear')} title={t('data.clear')} onClick={() => clearSeeds(entity.id)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-fg-subtle">{t('data.hint')}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => openDataEditor(entity.id)}><Table className="h-3.5 w-3.5" /> {t('data.openEditor')}</Button>
        <Button size="sm" variant="subtle" onClick={() => open('import', entity.id)}><FileSpreadsheet className="h-3.5 w-3.5" /> {seeds ? t('data.replace') : t('data.import')}</Button>
      </div>
    </div>
  );
}

/* ---------------------------------- page ------------------------------------- */

export function EntityProperties({ entity }: { entity: ClubEntity }) {
  const t = useT();
  const mode = useClubStore((s) => s.schema.editorMode);
  const entities = useClubStore((s) => s.schema.entities);
  const updateEntity = useClubStore((s) => s.updateEntity);
  const renameEntityId = useClubStore((s) => s.renameEntityId);
  const addField = useClubStore((s) => s.addField);
  const removeEntity = useClubStore((s) => s.removeEntity);
  const select = useWorkbench((s) => s.select);
  const [iconsOpen, setIconsOpen] = useState(false);
  const Icon = getEntityIcon(entity.icon);
  const editable = mode !== 'easy';

  const remove = () => {
    if (useSettings.getState().confirmDeletes && !window.confirm(t('confirm.deleteModule', { name: entity.pluralName }))) return;
    removeEntity(entity.id);
    select({ kind: 'club' });
    toast('info', t('entity.removed', { name: entity.pluralName }), { label: t('history.undo'), run: () => useClubStore.temporal.getState().undo() });
  };

  return (
    <PropertyPage
      icon={<Icon className="h-4 w-4" />}
      title={entity.pluralName}
      subtitle={`${t('props.module')} · ${t('entity.summary', { fields: entity.fields.length })}`}
      help="modules"
      actions={
        <Tip content={t('cmd.deleteModule')}>
          <Button size="icon-sm" variant="danger" onClick={remove} aria-label={t('entity.remove', { name: entity.pluralName })}><Trash2 className="h-3.5 w-3.5" /></Button>
        </Tip>
      }
    >
      <Section title={t('props.general')}>
        <div className="flex gap-2">
          <div>
            <span className="mb-1 block text-xs font-medium text-fg-muted">{t('props.icon')}</span>
            <button
              type="button"
              onClick={() => setIconsOpen((v) => !v)}
              className={cn('flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
                iconsOpen ? 'border-accent bg-accent-soft text-accent-text' : 'border-line-strong bg-panel text-fg hover:bg-hover')}
              aria-label={t('entity.icon')}
              aria-expanded={iconsOpen}
            >
              <Icon className="h-4 w-4" />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <Field label={t('entity.plural')} htmlFor={`${entity.id}-plural`}>
              <Input id={`${entity.id}-plural`} value={entity.pluralName} onChange={(e) => updateEntity(entity.id, { pluralName: e.target.value })} />
            </Field>
          </div>
          <div className="min-w-0 flex-1">
            <Field label={t('entity.single')} htmlFor={`${entity.id}-name`}>
              <Input id={`${entity.id}-name`} value={entity.name} onChange={(e) => updateEntity(entity.id, { name: e.target.value })} />
            </Field>
          </div>
        </div>
        {iconsOpen && (
          <div className="grid grid-cols-10 gap-0.5 rounded-md border border-line bg-panel p-1.5">
            {ICON_NAMES.map((name) => {
              const I = getEntityIcon(name);
              return (
                <button key={name} type="button" title={name} aria-label={name}
                  onClick={() => { updateEntity(entity.id, { icon: name }); setIconsOpen(false); }}
                  className={cn('flex aspect-square items-center justify-center rounded transition-colors',
                    entity.icon === name ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-hover hover:text-fg')}>
                  <I className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        )}
        {mode === 'pro' && (
          <Field label={t('entity.systemId')} description={t('props.systemIdHint')}>
            <IdInput value={entity.id} label={t('entity.systemId')} taken={[...entities.map((e) => e.id), ...RESERVED_COLLECTIONS]}
              onCommit={(next) => renameEntityId(entity.id, next)} />
          </Field>
        )}
      </Section>

      <Section
        title={`${t('fields.title')} (${entity.fields.length})`}
        action={<span className="text-2xs text-fg-subtle">{t('props.requiredColumn')}</span>}
      >
        <div className="rounded-md border border-line bg-panel">
          {entity.fields.map((field, i) => (
            <FieldRow key={field.id} entity={entity} field={field} index={i} editable={editable} pro={mode === 'pro'} />
          ))}
        </div>
        {editable ? (
          <Button size="sm" variant="subtle"
            onClick={() => addField(entity.id, { id: uniqueId('field', [...entity.fields.map((f) => f.id), ...RESERVED_FIELDS]), name: t('field.new'), type: 'text', required: false })}>
            <Plus className="h-3.5 w-3.5" /> {t('fields.add')}
          </Button>
        ) : (
          <p className="text-2xs text-fg-subtle">{t('props.easyFields')}</p>
        )}
      </Section>

      {editable && (
        <Section title={t('relations.title')}>
          <RelationsEditor entity={entity} />
        </Section>
      )}

      <Section title={t('kind.title')} action={<span className="text-2xs text-fg-subtle">{t('kind.hint')}</span>}>
        <Segmented
          ariaLabel={t('kind.title')}
          value={entity.kind ?? 'catalog'}
          onChange={(kind) => updateEntity(entity.id, { kind: kind === 'operation' ? 'operation' : undefined })}
          options={[
            { value: 'catalog', label: t('kind.catalog'), title: t('kind.catalogHint') },
            { value: 'operation', label: t('kind.operation'), title: t('kind.operationHint') },
          ]}
        />
        <p className="text-2xs text-fg-subtle">{entity.kind === 'operation' ? t('kind.operationHint') : t('kind.catalogHint')}</p>
        {entity.kind === 'operation' && <PostingsEditor entity={entity} />}
      </Section>

      <Section title={t('pf.title')}>
        <PrintFormsEditor entity={entity} />
      </Section>

      {editable && (
        <Section title={t('basis.title')}>
          <BasisEditor entity={entity} />
        </Section>
      )}

      <Section title={t('view.title')} action={<span className="text-2xs text-fg-subtle">{t('view.hint')}</span>}>
        <ViewEditor entity={entity} />
      </Section>

      <Section title={t('access.title')} action={<Button size="xs" variant="ghost" onClick={() => select({ kind: 'roles' })}>{t('access.allRoles')}</Button>}>
        <EntityAccess entity={entity} />
      </Section>
      <Section title={t('data.title')}>
        <DataSection entity={entity} />
      </Section>
    </PropertyPage>
  );
}

function EntityAccess({ entity }: { entity: ClubEntity }) {
  const t = useT();
  const roles = useClubStore((s) => s.schema.roles ?? NONE);
  const setRoleAccess = useClubStore((s) => s.setRoleAccess);
  const setEntityPublic = useClubStore((s) => s.setEntityPublic);
  return (
    <div className="space-y-2">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, roles.length)}, minmax(0, 1fr))` }}>
        {roles.map((r) => (
          <div key={r.id} className="min-w-0 text-center">
            <div className="mb-1 truncate text-2xs text-fg-muted" title={r.name}>{r.name}</div>
            <AccessCell
              level={r.id === CHAIR_ROLE ? 'write' : accessOf(r, entity.id)}
              disabled={r.id === CHAIR_ROLE}
              label={`${r.name} · ${entity.pluralName}`}
              onChange={(l) => setRoleAccess(r.id, entity.id, l)}
            />
          </div>
        ))}
      </div>
      <label className="flex items-center justify-between gap-3 rounded-md border border-line px-2.5 py-2">
        <span>
          <span className="block text-xs text-fg">{t('access.public')}</span>
          <span className="block text-2xs text-fg-subtle">{t('access.publicHint')}</span>
        </span>
        <Switch checked={!!entity.public} label={t('access.public')} onChange={(v) => setEntityPublic(entity.id, v)} />
      </label>
    </div>
  );
}
