import * as RadixDialog from '@radix-ui/react-dialog';
import { Blocks, FileSpreadsheet } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useWorkbench } from '@/store/useWorkbench';
import type { ClubEntity } from '@/types/schema';
import { useT, useUiLocale, type TKey } from '@/i18n';
import { getEntityIcon } from '@/lib/icons';
import { uniqueId } from '@/lib/id';
import { RESERVED_COLLECTIONS } from '@/utils/validate';
import { manifestOf, pluginTemplates, tr } from '@/plugins/runtime';
import { DialogContent, DialogFooter } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { VIEW_ICONS } from '../properties/EntityProperties';

export interface Template {
  id: string;
  build: (t: (k: TKey) => string) => Omit<ClubEntity, 'id'>;
}

/** Заготовки модулей. Названия полей — на языке интерфейса. */
export const MODULE_TEMPLATES: Template[] = [
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


function Card({ icon, title, meta, view, onClick, testId }: { icon: string; title: string; meta: string; view?: ClubEntity['view']; onClick: () => void; testId?: string }) {
  const Icon = getEntityIcon(icon);
  const ViewIcon = VIEW_ICONS[view?.type ?? 'cards'];
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="group flex items-start gap-3 rounded-md border border-line bg-panel p-3 text-left transition-colors hover:border-accent hover:bg-accent-soft focus-visible:border-accent"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-fg-muted group-hover:border-accent group-hover:text-accent">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{title}</span>
        <span className="flex items-center gap-1.5 text-2xs text-fg-subtle"><ViewIcon className="h-3 w-3" /> {meta}</span>
      </span>
    </button>
  );
}

/** «Новый модуль»: заготовки (встроенные и из плагинов) или раздел из таблицы. */
export function NewModuleDialog() {
  const t = useT();
  const locale = useUiLocale();
  const schema = useClubStore((s) => s.schema);
  const close = useWorkbench((s) => s.close);
  const open = useWorkbench((s) => s.open);
  const select = useWorkbench((s) => s.select);

  const create = (base: Omit<ClubEntity, 'id'>) => {
    const { addEntity, schema: current } = useClubStore.getState();
    const id = uniqueId(base.pluralName, [...current.entities.map((e) => e.id), ...RESERVED_COLLECTIONS]);
    addEntity({ id, ...structuredClone(base) });
    close();
    select({ kind: 'entity', id });
  };

  const fromPlugins = pluginTemplates(schema);

  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && close()}>
      <DialogContent title={t('cmd.newModule')} description={t('newModule.desc')} icon={<Blocks className="h-4 w-4" />} className="w-[min(760px,calc(100vw-32px))]">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {MODULE_TEMPLATES.map((tpl) => {
              const base = tpl.build((k: TKey) => t(k));
              return (
                <Card key={tpl.id} testId={`tpl-${tpl.id}`} icon={base.icon} title={base.pluralName} view={base.view}
                  meta={`${t('entity.summary', { fields: base.fields.length })} · ${t(`view.${base.view?.type ?? 'cards'}` as TKey)}`}
                  onClick={() => create(base)} />
              );
            })}
          </div>
          {fromPlugins.length > 0 && (
            <div>
              <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{t('newModule.fromPlugins')}</div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {fromPlugins.map(({ plugin, template }, i) => {
                  const p = (schema.plugins ?? []).find((x) => x.id === plugin);
                  const m = p && manifestOf(p);
                  return (
                    <Card key={`${plugin}-${i}`} icon={template.icon} title={template.pluralName} view={template.view}
                      meta={m ? tr(m.name, locale) : plugin} onClick={() => create(template)} />
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="subtle" onClick={() => open('import')}><FileSpreadsheet className="h-3.5 w-3.5" /> {t('modules.fromSheet')}</Button>
          <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
        </DialogFooter>
      </DialogContent>
    </RadixDialog.Root>
  );
}
