import { useEffect, useMemo, useRef, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { BookOpen, Database, Info, Keyboard, LayoutTemplate, Plug, Rocket, Search, Sparkles } from 'lucide-react';
import { useWorkbench } from '@/store/useWorkbench';
import { useSettings } from '@/store/useSettings';
import { useT, type TKey } from '@/i18n';
import { openHelp } from '@/lib/windows';
import type { Command, CommandGroup } from '@/lib/commands';
import { FACET_VERSION } from '@/version';
import { cn } from '@/lib/cn';
import { DialogContent, DialogFooter } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { TemplateGallery } from '../ClubSettings';

export function TemplatesDialog() {
  const t = useT();
  const close = useWorkbench((s) => s.close);
  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && close()}>
      <DialogContent title={t('cmd.templates')} description={t('templates.desc')} icon={<LayoutTemplate className="h-4 w-4" />} className="w-[min(720px,calc(100vw-32px))]">
        <div className="min-h-0 flex-1 overflow-auto p-5" onClick={(e) => (e.target as HTMLElement).closest('[data-template]') && close()}>
          <TemplateGallery />
        </div>
      </DialogContent>
    </RadixDialog.Root>
  );
}

const GROUP_LABEL: Record<CommandGroup, TKey> = {
  file: 'menu.file', edit: 'menu.edit', view: 'menu.view', data: 'menu.data', plugins: 'menu.plugins', help: 'menu.help',
};

/** Палитра команд (Ctrl+K): поиск любого действия по названию. */
export function CommandPalette({ commands }: { commands: Command[] }) {
  const t = useT();
  const close = useWorkbench((s) => s.close);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commands
      .filter((c) => c.id !== 'edit.commands' && c.enabled !== false)
      .filter((c) => !q || `${c.label} ${t(GROUP_LABEL[c.group])} ${c.keywords ?? ''}`.toLowerCase().includes(q));
  }, [commands, query, t]);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    close();
    setTimeout(() => c.run(), 0);
  };

  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && close()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <RadixDialog.Content className="fixed left-1/2 top-[14vh] z-50 w-[min(600px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-lg border border-line-strong bg-raised shadow-pop focus:outline-hidden">
          <RadixDialog.Title className="sr-only">{t('cmd.palette')}</RadixDialog.Title>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="h-4 w-4 text-fg-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('palette.placeholder')}
              aria-label={t('cmd.palette')}
              className="h-11 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-hidden"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(items.length - 1, i + 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
                if (e.key === 'Enter') { e.preventDefault(); run(items[index]); }
              }}
            />
            <kbd>Esc</kbd>
          </div>
          <div ref={listRef} className="max-h-[50vh] overflow-auto p-1" role="listbox">
            {items.length === 0 && <div className="px-3 py-6 text-center text-sm text-fg-subtle">{t('palette.empty')}</div>}
            {items.map((c, i) => {
              const Icon = c.icon;
              return (
                <button key={c.id} type="button" role="option" aria-selected={i === index} data-index={i}
                  onMouseMove={() => setIndex(i)} onClick={() => run(c)}
                  className={cn('flex h-8 w-full items-center gap-2.5 rounded px-2.5 text-left text-sm', i === index ? 'bg-accent text-accent-fg' : 'text-fg')}>
                  <span className="flex w-4 justify-center">{Icon && <Icon className="h-3.5 w-3.5" />}</span>
                  <span className="flex-1 truncate">{c.label}</span>
                  <span className={cn('text-2xs', i === index ? 'text-accent-fg/80' : 'text-fg-subtle')}>{t(GROUP_LABEL[c.group])}</span>
                  {c.shortcut && <kbd className={i === index ? 'border-accent-fg/30 bg-transparent text-accent-fg' : ''}>{c.shortcut}</kbd>}
                </button>
              );
            })}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Первый запуск: что это за программа и с чего начать. */
export function WelcomeDialog() {
  const t = useT();
  const close = useWorkbench((s) => s.close);
  const open = useWorkbench((s) => s.open);
  const done = () => {
    useSettings.getState().set({ welcomeSeen: true });
    close();
  };
  const steps: { icon: typeof Sparkles; title: TKey; text: TKey }[] = [
    { icon: LayoutTemplate, title: 'welcome.step1', text: 'welcome.step1Text' },
    { icon: Database, title: 'welcome.step2', text: 'welcome.step2Text' },
    { icon: Rocket, title: 'welcome.step3', text: 'welcome.step3Text' },
  ];
  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && done()}>
      <DialogContent title={t('welcome.title')} description={t('welcome.subtitle')} icon={<Sparkles className="h-4 w-4" />} className="w-[min(640px,calc(100vw-32px))]">
        <div className="space-y-4 p-5">
          <p className="text-sm text-fg-muted">{t('welcome.intro')}</p>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3 rounded-md border border-line bg-sunken p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-fg">{i + 1}</span>
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-fg"><s.icon className="h-3.5 w-3.5 text-accent" /> {t(s.title)}</span>
                  <span className="block text-xs text-fg-muted">{t(s.text)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { done(); openHelp('start'); }}><BookOpen className="h-3.5 w-3.5" /> {t('welcome.guide')}</Button>
          <div className="flex gap-2">
            <Button onClick={() => { done(); open('templates'); }}><LayoutTemplate className="h-3.5 w-3.5" /> {t('welcome.templates')}</Button>
            <Button variant="primary" onClick={done}>{t('welcome.start')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </RadixDialog.Root>
  );
}

export const GRID_SHORTCUTS: { keys: string; label: TKey }[] = [
  { keys: '↑ ↓ ← →', label: 'keys.grid.move' },
  { keys: 'Enter / F2', label: 'keys.grid.edit' },
  { keys: 'Esc', label: 'keys.grid.cancel' },
  { keys: 'Tab', label: 'keys.grid.next' },
  { keys: 'Delete', label: 'keys.grid.clear' },
  { keys: 'Ctrl+C / Ctrl+V', label: 'keys.grid.copy' },
  { keys: 'Insert', label: 'keys.grid.add' },
  { keys: 'Ctrl+S', label: 'keys.grid.save' },
];

export function ShortcutsDialog({ commands }: { commands: Command[] }) {
  const t = useT();
  const close = useWorkbench((s) => s.close);
  const withKeys = commands.filter((c) => c.shortcut);
  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && close()}>
      <DialogContent title={t('cmd.shortcuts')} icon={<Keyboard className="h-4 w-4" />} className="w-[min(720px,calc(100vw-32px))]">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-auto p-5 md:grid-cols-2">
          <div>
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{t('keys.editor')}</div>
            <table className="w-full text-sm">
              <tbody>
                {withKeys.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-b-0">
                    <td className="py-1.5 text-fg">{c.label}</td>
                    <td className="py-1.5 text-right"><kbd>{c.shortcut}</kbd></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{t('keys.grid')}</div>
            <table className="w-full text-sm">
              <tbody>
                {GRID_SHORTCUTS.map((s) => (
                  <tr key={s.keys} className="border-b border-line last:border-b-0">
                    <td className="py-1.5 text-fg">{t(s.label)}</td>
                    <td className="py-1.5 text-right"><kbd>{s.keys}</kbd></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </RadixDialog.Root>
  );
}

export function AboutDialog() {
  const t = useT();
  const close = useWorkbench((s) => s.close);
  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && close()}>
      <DialogContent title={t('cmd.about')} icon={<Info className="h-4 w-4" />} className="w-[min(480px,calc(100vw-32px))]">
        <div className="space-y-3 p-5 text-center">
          <img src="/facet.svg" alt="" className="mx-auto h-16 w-16" />
          <div className="text-lg font-semibold text-fg">Facet OS</div>
          <div className="text-xs text-fg-subtle">{t('about.version', { v: FACET_VERSION })}</div>
          <p className="text-sm text-fg-muted">{t('about.text')}</p>
          <p className="text-2xs text-fg-subtle">{t('about.stack')}</p>
        </div>
        <DialogFooter>
          <span className="flex items-center gap-1.5 text-2xs text-fg-subtle"><Plug className="h-3 w-3" /> MIT</span>
          <Button variant="primary" onClick={close}>{t('common.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </RadixDialog.Root>
  );
}
