import { useEffect, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, Asterisk, Calendar, CircleDot, File, Hash, Link2, ListChecks,
  Plus, Trash2, Type, type LucideIcon,
} from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import type { ClubEntity, EditorMode, EntityField, FieldType, RelationType } from '@/types/schema';
import { FIELD_TYPE_LABELS, RELATION_TYPE_LABELS } from '@/types/schema';
import { ICON_NAMES, getEntityIcon } from '@/lib/icons';
import { slugify, uniqueId } from '@/lib/id';
import { cn } from '@/lib/cn';
import { Button } from './ui/Button';
import { Input, Label, Select } from './ui/Input';
import { Switch } from './ui/Switch';
import { Segmented } from './ui/Segmented';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/Accordion';

const FIELD_ICONS: Record<FieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  date: Calendar,
  select: ListChecks,
  status: CircleDot,
  file: File,
  relation: Link2,
};

const RESERVED_IDS = ['users'];

interface Template {
  label: string;
  build: () => Omit<ClubEntity, 'id'>;
}

const TEMPLATES: Template[] = [
  {
    label: 'Пустой модуль',
    build: () => ({ name: 'Запись', pluralName: 'Новый модуль', icon: 'Box', relations: [], fields: [{ id: 'title', name: 'Название', type: 'text', required: true }] }),
  },
  {
    label: 'Мероприятия',
    build: () => ({
      name: 'Мероприятие', pluralName: 'Мероприятия', icon: 'Calendar', relations: [],
      fields: [
        { id: 'title', name: 'Название', type: 'text', required: true },
        { id: 'starts_at', name: 'Дата', type: 'date', required: true },
        { id: 'status', name: 'Статус', type: 'status', required: true, options: ['Запланировано', 'Идёт', 'Завершено'] },
      ],
    }),
  },
  {
    label: 'Достижения',
    build: () => ({
      name: 'Достижение', pluralName: 'Достижения', icon: 'Award', relations: [],
      fields: [
        { id: 'title', name: 'Награда', type: 'text', required: true },
        { id: 'received_at', name: 'Получено', type: 'date', required: false },
        { id: 'level', name: 'Уровень', type: 'select', required: false, options: ['Кампус', 'Город', 'Страна', 'Мир'] },
        { id: 'proof', name: 'Диплом', type: 'file', required: false },
      ],
    }),
  },
  {
    label: 'Документы',
    build: () => ({
      name: 'Документ', pluralName: 'Документы', icon: 'FileText', relations: [],
      fields: [
        { id: 'title', name: 'Название', type: 'text', required: true },
        { id: 'kind', name: 'Тип', type: 'select', required: true, options: ['Устав', 'Протокол', 'Отчёт', 'Шаблон'] },
        { id: 'file', name: 'Файл', type: 'file', required: true },
      ],
    }),
  },
  {
    label: 'Фотоальбомы',
    build: () => ({
      name: 'Альбом', pluralName: 'Фотоальбомы', icon: 'Image', relations: [],
      fields: [
        { id: 'title', name: 'Альбом', type: 'text', required: true },
        { id: 'shot_at', name: 'Дата съёмки', type: 'date', required: false },
        { id: 'cover', name: 'Обложка', type: 'file', required: false },
      ],
    }),
  },
  {
    label: 'Заявки на вступление',
    build: () => ({
      name: 'Заявка', pluralName: 'Заявки', icon: 'Ticket', relations: [],
      fields: [
        { id: 'full_name', name: 'Имя', type: 'text', required: true },
        { id: 'contact', name: 'Контакт', type: 'text', required: true },
        { id: 'status', name: 'Статус', type: 'status', required: true, options: ['Новая', 'Собеседование', 'Принят', 'Отказ'] },
      ],
    }),
  },
];

/* ---------------------------------- helpers ---------------------------------- */

function OptionsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState(value.join(', '));
  useEffect(() => setDraft(value.join(', ')), [value]);
  return (
    <Input
      value={draft}
      placeholder="Вариант 1, Вариант 2"
      className="h-8 text-xs"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const opts = draft.split(',').map((s) => s.trim()).filter(Boolean);
        onChange(opts.length ? Array.from(new Set(opts)) : value);
      }}
    />
  );
}

function IdInput({ value, taken, onCommit }: { value: string; taken: string[]; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      spellCheck={false}
      aria-label="Системный идентификатор"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const slug = slugify(draft);
        const next = slug === value ? value : uniqueId(slug, taken.filter((t) => t !== value));
        setDraft(next);
        if (next !== value) onCommit(next);
      }}
      className="w-full rounded bg-transparent px-1 font-mono text-[11px] text-zinc-500 hover:bg-zinc-800 focus:bg-zinc-800 focus:text-zinc-200 focus:outline-none"
    />
  );
}

/* ----------------------------------- field ----------------------------------- */

function FieldRow({ entity, field, mode, entities }: { entity: ClubEntity; field: EntityField; mode: EditorMode; entities: ClubEntity[] }) {
  const updateField = useClubStore((s) => s.updateField);
  const removeField = useClubStore((s) => s.removeField);
  const renameFieldId = useClubStore((s) => s.renameFieldId);
  const Icon = FIELD_ICONS[field.type];

  const changeType = (type: FieldType) => {
    const updates: Partial<EntityField> = { type };
    if ((type === 'select' || type === 'status') && !field.options?.length)
      updates.options = type === 'status' ? ['Новое', 'В работе', 'Готово'] : ['Вариант A', 'Вариант B'];
    if (type === 'relation') updates.targetEntityId = field.targetEntityId ?? entities.find((e) => e.id !== entity.id)?.id ?? entity.id;
    updateField(entity.id, field.id, updates);
  };

  return (
    <div className="group rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-400" title={FIELD_TYPE_LABELS[field.type]}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <Input
          value={field.name}
          aria-label="Название поля"
          className="h-8 min-w-0 flex-1 text-xs"
          onChange={(e) => updateField(entity.id, field.id, { name: e.target.value })}
        />
        <Select value={field.type} aria-label="Тип поля" className="h-8 w-[108px] text-xs" onChange={(e) => changeType(e.target.value as FieldType)}>
          {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((t) => (
            <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
          ))}
        </Select>
        <div className="flex items-center" title="Обязательное поле">
          <Switch checked={field.required} label="Обязательное" onChange={(v) => updateField(entity.id, field.id, { required: v })} />
        </div>
        <Button
          size="icon"
          variant="danger"
          aria-label="Удалить поле"
          disabled={entity.fields.length <= 1}
          onClick={() => removeField(entity.id, field.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {(mode === 'pro' || field.type === 'select' || field.type === 'status' || field.type === 'relation') && (
        <div className="mt-2 space-y-2 pl-10">
          {mode === 'pro' && (
            <IdInput value={field.id} taken={entity.fields.map((f) => f.id)} onCommit={(next) => renameFieldId(entity.id, field.id, next)} />
          )}
          {(field.type === 'select' || field.type === 'status') && (
            <OptionsInput value={field.options ?? []} onChange={(options) => updateField(entity.id, field.id, { options })} />
          )}
          {field.type === 'relation' && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <ArrowRight className="h-3.5 w-3.5" />
              <Select
                value={field.targetEntityId}
                aria-label="Связанная сущность"
                className="h-8 text-xs"
                onChange={(e) => updateField(entity.id, field.id, { targetEntityId: e.target.value })}
              >
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>{e.pluralName}</option>
                ))}
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
      <Label>Связи с другими модулями</Label>
      {entity.relations.map((rel, i) => {
        const target = entities.find((e) => e.id === rel.targetEntityId);
        const TargetIcon = getEntityIcon(target?.icon ?? '');
        return (
          <div key={rel.targetEntityId} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
            <TargetIcon className="ml-1 h-3.5 w-3.5 shrink-0 text-violet-400" />
            <Select
              value={rel.targetEntityId}
              aria-label="Цель связи"
              className="h-8 min-w-0 flex-1 text-xs"
              onChange={(e) => setRelations(entity.relations.map((r, j) => (j === i ? { ...r, targetEntityId: e.target.value } : r)))}
            >
              {[target, ...free].filter(Boolean).map((c) => (
                <option key={c!.id} value={c!.id}>{c!.pluralName}</option>
              ))}
            </Select>
            <Segmented
              size="sm"
              ariaLabel="Тип связи"
              className="w-auto"
              value={rel.type}
              options={(Object.keys(RELATION_TYPE_LABELS) as RelationType[]).map((t) => ({
                value: t,
                label: t === 'one-to-many' ? '1→N' : 'N↔N',
                title: t === 'one-to-many'
                  ? `Каждая запись «${entity.name}» ссылается на одну запись «${target?.name ?? ''}»`
                  : `Запись «${entity.name}» может ссылаться на несколько записей «${target?.name ?? ''}»`,
              }))}
              onChange={(type) => setRelations(entity.relations.map((r, j) => (j === i ? { ...r, type } : r)))}
            />
            <Button size="icon" variant="danger" aria-label="Удалить связь" onClick={() => setRelations(entity.relations.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
      {free.length > 0 ? (
        <Button size="sm" variant="ghost" className="w-full justify-center border border-dashed border-zinc-700"
          onClick={() => setRelations([...entity.relations, { targetEntityId: free[0].id, type: 'many-to-many' }])}>
          <Link2 className="h-3.5 w-3.5" /> Связать с модулем
        </Button>
      ) : (
        candidates.length === 0 && <p className="text-xs text-zinc-500">Добавьте второй модуль, чтобы создавать связи.</p>
      )}
      {incoming.length > 0 && (
        <p className="text-xs text-zinc-500">
          Ссылаются сюда: {incoming.map((e) => e.pluralName).join(', ')}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------- entity ----------------------------------- */

function EntityEditor({ entity, mode, entities }: { entity: ClubEntity; mode: EditorMode; entities: ClubEntity[] }) {
  const updateEntity = useClubStore((s) => s.updateEntity);
  const addField = useClubStore((s) => s.addField);
  const [iconsOpen, setIconsOpen] = useState(false);
  const Icon = getEntityIcon(entity.icon);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIconsOpen((v) => !v)}
          className={cn('mt-[22px] flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
            iconsOpen ? 'border-violet-500 bg-violet-500/15 text-violet-300' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500')}
          aria-label="Выбрать иконку"
          aria-expanded={iconsOpen}
        >
          <Icon className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${entity.id}-plural`}>Название раздела</Label>
          <Input id={`${entity.id}-plural`} value={entity.pluralName} onChange={(e) => updateEntity(entity.id, { pluralName: e.target.value })} />
        </div>
        <div className="min-w-0 flex-1">
          <Label htmlFor={`${entity.id}-name`}>Одна запись</Label>
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
        <p className="font-mono text-[11px] text-zinc-500">
          collection: <span className="text-zinc-300">{entity.id}</span>
        </p>
      )}

      <div className="space-y-2">
        <Label hint={<span className="flex items-center gap-1"><Asterisk className="h-3 w-3" />— обязательное</span>}>Поля</Label>
        {entity.fields.map((field) => (
          <FieldRow key={field.id} entity={entity} field={field} mode={mode} entities={entities} />
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-center border border-dashed border-zinc-700"
          onClick={() =>
            addField(entity.id, {
              id: uniqueId('field', entity.fields.map((f) => f.id)),
              name: 'Новое поле',
              type: 'text',
              required: false,
            })
          }
        >
          <Plus className="h-3.5 w-3.5" /> Добавить поле
        </Button>
      </div>

      <RelationsEditor entity={entity} entities={entities} />
    </div>
  );
}

/* ---------------------------------- builder ---------------------------------- */

export function EntityBuilder({ mode }: { mode: EditorMode }) {
  const entities = useClubStore((s) => s.schema.entities);
  const activeEntityId = useClubStore((s) => s.activeEntityId);
  const setActiveEntity = useClubStore((s) => s.setActiveEntity);
  const addEntity = useClubStore((s) => s.addEntity);
  const removeEntity = useClubStore((s) => s.removeEntity);
  const moveEntity = useClubStore((s) => s.moveEntity);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const createFromTemplate = (tpl: Template) => {
    const base = tpl.build();
    const id = uniqueId(base.pluralName, [...entities.map((e) => e.id), ...RESERVED_IDS]);
    addEntity({ id, ...base });
    setTemplatesOpen(false);
  };

  return (
    <div className="space-y-3">
      <Accordion
        type="single"
        collapsible
        value={mode === 'easy' ? '' : activeEntityId ?? ''}
        onValueChange={(v) => v && setActiveEntity(v)}
      >
        {entities.map((entity, index) => {
          const Icon = getEntityIcon(entity.icon);
          const relCount = entity.relations.length + entity.fields.filter((f) => f.type === 'relation').length;
          const header = (
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate">{entity.pluralName}</span>
                <span className="block text-xs font-normal text-zinc-500">
                  {entity.fields.length} полей{relCount ? ` · ${relCount} связ.` : ''}
                </span>
              </span>
            </span>
          );
          return (
            <AccordionItem key={entity.id} value={entity.id}>
              <div className="flex items-center gap-1">
                {mode === 'easy' ? (
                  <button type="button" onClick={() => setActiveEntity(entity.id)}
                    className={cn('flex flex-1 py-3 text-left text-sm font-semibold', activeEntityId === entity.id ? 'text-white' : 'text-zinc-300')}>
                    {header}
                  </button>
                ) : (
                  <AccordionTrigger className="min-w-0">{header}</AccordionTrigger>
                )}
                {mode !== 'easy' && (
                  <>
                    <Button size="icon" variant="ghost" aria-label="Выше" disabled={index === 0} onClick={() => moveEntity(entity.id, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Ниже" disabled={index === entities.length - 1} onClick={() => moveEntity(entity.id, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <Button
                  size="icon"
                  variant="danger"
                  aria-label={`Удалить модуль ${entity.pluralName}`}
                  onClick={() => {
                    if (window.confirm(`Удалить модуль «${entity.pluralName}» и все связи с ним?`)) removeEntity(entity.id);
                  }}
                >
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
          <p className="px-1 pb-1 text-xs text-zinc-500">Выберите основу модуля</p>
          {TEMPLATES.map((tpl) => {
            const preview = tpl.build();
            const I = getEntityIcon(preview.icon);
            return (
              <button
                key={tpl.label}
                type="button"
                onClick={() => createFromTemplate(tpl)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                <I className="h-4 w-4 text-violet-400" />
                <span className="flex-1">{tpl.label}</span>
                <span className="text-xs text-zinc-500">{preview.fields.length} полей</span>
              </button>
            );
          })}
          <Button size="sm" variant="ghost" className="w-full justify-center" onClick={() => setTemplatesOpen(false)}>Отмена</Button>
        </div>
      ) : (
        <Button variant="primary" className="w-full justify-center" onClick={() => setTemplatesOpen(true)}>
          <Plus className="h-4 w-4" /> Новый модуль
        </Button>
      )}
    </div>
  );
}
