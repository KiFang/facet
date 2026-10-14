import * as ContextMenu from '@radix-ui/react-context-menu';
import { ArrowDown, ArrowUp, Database, FileSpreadsheet, Home, Palette, Plug, Plus, Rocket, Settings2, ShieldCheck, Trash2 } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useSettings } from '@/store/useSettings';
import { useWorkbench, type Selection } from '@/store/useWorkbench';
import { useT } from '@/i18n';
import { getEntityIcon } from '@/lib/icons';
import { openDataEditor } from '@/lib/windows';
import { cn } from '@/lib/cn';
import { MenuItemBody, menuContentClass, menuItemClass, menuSeparatorClass } from '../ui/Menu';
import { Tip } from '../ui/Tooltip';
import { toast } from '../ui/Toast';

function same(a: Selection, b: Selection) {
  return a.kind === b.kind && (a.kind !== 'entity' || (b.kind === 'entity' && a.id === b.id));
}

function Row({ selection, icon, label, meta, depth = 0, testId }: { selection: Selection; icon: React.ReactNode; label: React.ReactNode; meta?: React.ReactNode; depth?: number; testId?: string }) {
  const current = useWorkbench((s) => s.selection);
  const select = useWorkbench((s) => s.select);
  const active = same(current, selection);
  return (
    <button
      type="button"
      data-testid={testId}
      aria-current={active ? 'true' : undefined}
      onClick={() => select(selection)}
      className={cn(
        'flex h-7 w-full items-center gap-2 rounded px-2 text-left text-sm transition-colors',
        active ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-hover',
      )}
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <span className={cn('flex w-4 shrink-0 justify-center', active ? 'text-accent-fg' : 'text-fg-muted')}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className={cn('shrink-0 text-2xs', active ? 'text-accent-fg/80' : 'text-fg-subtle')}>{meta}</span>}
    </button>
  );
}

function GroupHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between px-2 pt-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
      <span>{children}</span>
      {action}
    </div>
  );
}

export function Navigator() {
  const t = useT();
  const schema = useClubStore((s) => s.schema);
  const seeds = useClubStore((s) => s.seeds);
  const moveEntity = useClubStore((s) => s.moveEntity);
  const removeEntity = useClubStore((s) => s.removeEntity);
  const open = useWorkbench((s) => s.open);
  const select = useWorkbench((s) => s.select);
  const plugins = (schema.plugins ?? []).filter((p) => p.enabled).length;
  const roles = schema.roles?.length ?? 0;

  const remove = (id: string, name: string) => {
    if (useSettings.getState().confirmDeletes && !window.confirm(t('confirm.deleteModule', { name }))) return;
    removeEntity(id);
    select({ kind: 'club' });
    toast('info', t('entity.removed', { name }), { label: t('history.undo'), run: () => useClubStore.temporal.getState().undo() });
  };

  return (
    <nav className="flex h-full flex-col bg-panel" aria-label={t('nav.aria')}>
      <div className="flex h-8 shrink-0 items-center border-b border-line px-3 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
        {t('nav.title')}
      </div>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-1.5">
        <GroupHeader>{t('nav.general')}</GroupHeader>
        <Row selection={{ kind: 'club' }} icon={<Settings2 className="h-3.5 w-3.5" />} label={schema.clubName || t('nav.club')} testId="nav-club" />
        <Row selection={{ kind: 'appearance' }} icon={<Palette className="h-3.5 w-3.5" />} label={t('nav.appearance')} testId="nav-appearance" />
        <Row selection={{ kind: 'home' }} icon={<Home className="h-3.5 w-3.5" />} label={t('nav.home')} meta={schema.dashboard?.enabled === false ? t('nav.off') : undefined} testId="nav-home" />

        <GroupHeader
          action={
            <Tip content={t('cmd.newModule')} shortcut="Ctrl+Shift+M">
              <button type="button" onClick={() => open('newModule')} className="rounded p-0.5 text-fg-subtle hover:bg-hover hover:text-fg" aria-label={t('cmd.newModule')}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            </Tip>
          }
        >
          {t('nav.modules')} ({schema.entities.length})
        </GroupHeader>
        {schema.entities.map((e, i) => {
          const Icon = getEntityIcon(e.icon);
          return (
            <ContextMenu.Root key={e.id}>
              <ContextMenu.Trigger asChild>
                <div>
                  <Row
                    selection={{ kind: 'entity', id: e.id }}
                    icon={<Icon className="h-3.5 w-3.5" />}
                    label={e.pluralName}
                    meta={seeds[e.id] ? <Database className="h-3 w-3" /> : t('nav.fields', { n: e.fields.length })}
                    depth={1}
                    testId={`nav-entity-${e.id}`}
                  />
                </div>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className={menuContentClass}>
                  <ContextMenu.Item className={cn('group', menuItemClass)} onSelect={() => openDataEditor(e.id)}>
                    <MenuItemBody icon={<Database className="h-3.5 w-3.5" />} label={t('cmd.dataEditor')} />
                  </ContextMenu.Item>
                  <ContextMenu.Item className={cn('group', menuItemClass)} onSelect={() => open('import', e.id)}>
                    <MenuItemBody icon={<FileSpreadsheet className="h-3.5 w-3.5" />} label={t('cmd.importData')} />
                  </ContextMenu.Item>
                  <ContextMenu.Separator className={menuSeparatorClass} />
                  <ContextMenu.Item className={cn('group', menuItemClass)} disabled={i === 0} onSelect={() => moveEntity(e.id, -1)}>
                    <MenuItemBody icon={<ArrowUp className="h-3.5 w-3.5" />} label={t('common.up')} />
                  </ContextMenu.Item>
                  <ContextMenu.Item className={cn('group', menuItemClass)} disabled={i === schema.entities.length - 1} onSelect={() => moveEntity(e.id, 1)}>
                    <MenuItemBody icon={<ArrowDown className="h-3.5 w-3.5" />} label={t('common.down')} />
                  </ContextMenu.Item>
                  <ContextMenu.Separator className={menuSeparatorClass} />
                  <ContextMenu.Item className={cn('group', menuItemClass, 'text-danger data-[highlighted]:bg-danger')} onSelect={() => remove(e.id, e.pluralName)}>
                    <MenuItemBody icon={<Trash2 className="h-3.5 w-3.5" />} label={t('cmd.deleteModule')} />
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          );
        })}
        {schema.entities.length === 0 && (
          <button type="button" onClick={() => open('newModule')} className="ml-6 py-1 text-xs text-accent-text hover:underline">{t('nav.addFirst')}</button>
        )}

        <GroupHeader>{t('nav.system')}</GroupHeader>
        <Row selection={{ kind: 'roles' }} icon={<ShieldCheck className="h-3.5 w-3.5" />} label={t('nav.roles')} meta={roles || undefined} testId="nav-roles" />
        <Row selection={{ kind: 'plugins' }} icon={<Plug className="h-3.5 w-3.5" />} label={t('nav.plugins')} meta={plugins || undefined} testId="nav-plugins" />
        <Row selection={{ kind: 'publish' }} icon={<Rocket className="h-3.5 w-3.5" />} label={t('nav.publish')} testId="nav-publish" />
      </div>
    </nav>
  );
}
