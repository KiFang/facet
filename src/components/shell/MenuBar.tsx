import * as Menubar from '@radix-ui/react-menubar';
import { useClubStore, NONE } from '@/store/useClubStore';
import { useT, type TKey } from '@/i18n';
import { manifestOf, tr } from '@/plugins/runtime';
import { useUiLocale } from '@/i18n';
import { useWorkbench } from '@/store/useWorkbench';
import type { Command, CommandGroup } from '@/lib/commands';
import { MenuItemBody, menuContentClass, menuItemClass, menuLabelClass, menuSeparatorClass } from '../ui/Menu';
import { cn } from '@/lib/cn';

/** Порядок и разделители пунктов в каждом меню. */
const LAYOUT: Record<CommandGroup, (string | '-' | { label: TKey })[]> = {
  file: ['file.templates', 'file.open', 'file.save', '-', 'file.share', '-', { label: 'menu.publish' }, 'file.exportInstall', 'file.exportUpdate', 'file.exportLocal', '-', 'file.backup', 'file.restore', '-', 'file.settings'],
  edit: ['edit.undo', 'edit.redo', '-', 'edit.newModule', 'edit.deleteModule', '-', 'edit.commands'],
  view: ['view.portal', 'view.diagram', 'view.json', '-', { label: 'menu.preview' }, 'view.desktop', 'view.tablet', 'view.mobile', '-', { label: 'menu.mode' }, 'view.easy', 'view.advanced', 'view.pro', '-', { label: 'menu.theme' }, 'view.light', 'view.dark', 'view.system', '-', 'view.language'],
  data: ['data.editor', '-', 'data.import', 'data.newFromSheet'],
  plugins: ['plugins.manage'],
  help: ['help.guide', 'help.shortcuts', 'help.welcome', '-', 'help.about'],
};

const MENUS: { group: CommandGroup; label: TKey }[] = [
  { group: 'file', label: 'menu.file' },
  { group: 'edit', label: 'menu.edit' },
  { group: 'view', label: 'menu.view' },
  { group: 'data', label: 'menu.data' },
  { group: 'plugins', label: 'menu.plugins' },
  { group: 'help', label: 'menu.help' },
];

function Item({ command }: { command: Command }) {
  const Icon = command.icon;
  const isCheck = command.checked !== undefined;
  return (
    <Menubar.Item
      className={cn('group', menuItemClass)}
      disabled={command.enabled === false}
      onSelect={() => command.run()}
    >
      <MenuItemBody icon={Icon && !isCheck ? <Icon className="h-3.5 w-3.5" /> : undefined} label={command.label} shortcut={command.shortcut} checked={command.checked} />
    </Menubar.Item>
  );
}

export function MenuBar({ commands }: { commands: Command[] }) {
  const t = useT();
  const locale = useUiLocale();
  const plugins = useClubStore((s) => s.schema.plugins ?? NONE);
  const byId = new Map(commands.map((c) => [c.id, c]));

  return (
    <Menubar.Root className="flex items-center gap-0.5" aria-label={t('menu.aria')}>
      {MENUS.map(({ group, label }) => (
        <Menubar.Menu key={group}>
          <Menubar.Trigger className="h-7 rounded px-2.5 text-sm text-fg outline-none hover:bg-hover data-[state=open]:bg-hover data-[highlighted]:bg-hover">
            {t(label)}
          </Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content className={menuContentClass} align="start" sideOffset={2}>
              {LAYOUT[group].map((entry, i) => {
                if (entry === '-') return <Menubar.Separator key={i} className={menuSeparatorClass} />;
                if (typeof entry === 'object') return <Menubar.Label key={i} className={menuLabelClass}>{t(entry.label)}</Menubar.Label>;
                const cmd = byId.get(entry);
                return cmd ? <Item key={entry} command={cmd} /> : null;
              })}
              {group === 'plugins' && (
                <>
                  <Menubar.Separator className={menuSeparatorClass} />
                  <Menubar.Label className={menuLabelClass}>{t('menu.installedPlugins')}</Menubar.Label>
                  {plugins.length === 0 && <div className="px-2 py-1 text-xs text-fg-subtle">{t('plugins.none')}</div>}
                  {plugins.map((p) => {
                    const m = manifestOf(p);
                    return (
                      <Menubar.Item
                        key={p.id}
                        className={cn('group', menuItemClass)}
                        onSelect={() => useWorkbench.getState().open('plugins', p.id)}
                      >
                        <MenuItemBody label={m ? tr(m.name, locale) : p.id} checked={p.enabled} />
                      </Menubar.Item>
                    );
                  })}
                </>
              )}
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
      ))}
    </Menubar.Root>
  );
}
