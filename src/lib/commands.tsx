import { useMemo } from 'react';
import {
  Blocks, BookOpen, Braces, Database, Download, FileJson, FileSpreadsheet, FolderOpen, Info, Keyboard, LayoutTemplate,
  Landmark, Link2, Monitor, Moon, Network, PackagePlus, Plug, Redo2, RefreshCcw, Rocket, Search, Settings, Sun, Trash2, Undo2, Upload,
  type LucideIcon,
} from 'lucide-react';
import { useClubStore, useHistory } from '@/store/useClubStore';
import { useSettings } from '@/store/useSettings';
import { useWorkbench } from '@/store/useWorkbench';
import { useT, useUiStore, type TKey } from '@/i18n';
import { openDataEditor, openHelp } from '@/lib/windows';
import { encodeShareHash, shareUrl } from '@/utils/share';
import { generateSchemaJson } from '@/utils/schemaJson';
import { validateSchema } from '@/utils/validate';
import { desktop } from '@/desktop';
import { toast } from '@/components/ui/Toast';

export type CommandGroup = 'file' | 'edit' | 'view' | 'data' | 'plugins' | 'help';

export interface Command {
  id: string;
  group: CommandGroup;
  label: string;
  icon?: LucideIcon;
  shortcut?: string;
  run: () => void;
  enabled?: boolean;
  checked?: boolean;
  /** Ключевые слова для палитры команд. */
  keywords?: string;
}

const download = (name: string, text: string, type = 'application/json') => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const pickFile = (accept: string, onText: (text: string, name: string) => void) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = async () => {
    const f = input.files?.[0];
    if (f) onText(await f.text(), f.name);
  };
  input.click();
};

/** Все команды редактора: меню, панель инструментов, палитра (Ctrl+K) и горячие клавиши. */
export function useCommands(): Command[] {
  const t = useT();
  const canUndo = useHistory((h) => h.pastStates.length > 0);
  const canRedo = useHistory((h) => h.futureStates.length > 0);
  const mode = useClubStore((s) => s.schema.editorMode);
  const activeEntityId = useClubStore((s) => s.activeEntityId);
  const entities = useClubStore((s) => s.schema.entities);
  const theme = useSettings((s) => s.theme);
  const viewport = useSettings((s) => s.viewport);
  const tab = useWorkbench((s) => s.tab);
  const locale = useUiStore((s) => s.locale);

  return useMemo(() => {
    const wb = useWorkbench.getState();
    const club = () => useClubStore.getState();
    const settings = useSettings.getState();
    const active = entities.find((e) => e.id === activeEntityId);
    const c = (id: string, group: CommandGroup, label: TKey, run: () => void, extra: Partial<Command> = {}): Command => ({ id, group, label: t(label), run, ...extra });

    return [
      // Файл
      c('file.templates', 'file', 'cmd.templates', () => wb.open('templates'), { icon: LayoutTemplate }),
      c('file.open', 'file', 'cmd.openSchema', () =>
        pickFile('application/json,.json', (text) => {
          try {
            const raw = JSON.parse(text);
            const result = validateSchema({ editorMode: club().schema.editorMode, ...(raw.schema && raw.meta ? raw.schema : raw) });
            if (!result.ok || !result.schema) throw new Error(result.errors.slice(0, 3).join('; '));
            club().replaceSchema({ ...result.schema, editorMode: club().schema.editorMode });
            toast('success', t('templates.imported', { name: result.schema.clubName }), { label: t('history.undo'), run: () => useClubStore.temporal.getState().undo() });
          } catch (err) {
            toast('error', `${t('templates.importFailed')}: ${(err as Error).message}`);
          }
        }), { icon: FolderOpen, shortcut: 'Ctrl+O' }),
      c('file.save', 'file', 'cmd.saveSchema', () => download('club-schema.json', generateSchemaJson(club().schema)), { icon: FileJson, shortcut: 'Ctrl+S' }),
      c('file.share', 'file', 'cmd.share', async () => {
        try {
          await navigator.clipboard.writeText(shareUrl(await encodeShareHash(club().schema)));
          toast('success', t('share.copied'));
        } catch {
          toast('error', t('share.failed'));
        }
      }, { icon: Link2 }),
      c('file.exportInstall', 'file', 'cmd.exportInstall', () => wb.open('export', 'install'), { icon: PackagePlus, shortcut: 'Ctrl+E' }),
      c('file.exportUpdate', 'file', 'cmd.exportUpdate', () => wb.open('export', 'update'), { icon: RefreshCcw }),
      c('file.hub', 'file', 'cmd.hub', () => wb.open('hub'), { icon: Landmark, keywords: 'вуз университет колледж hub university' }),
      ...(desktop() ? [c('file.exportLocal', 'file', 'cmd.exportLocal', () => wb.open('export', 'local'), { icon: Monitor })] : []),
      c('file.backup', 'file', 'cmd.backup', () => {
        const s = club();
        download(`facet-os-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ facetBackup: 1, schema: s.schema, seeds: s.seeds, baseline: s.baseline }, null, 2));
      }, { icon: Download }),
      c('file.restore', 'file', 'cmd.restore', () =>
        pickFile('application/json,.json', (text) => {
          try {
            const data = JSON.parse(text);
            if (data.facetBackup !== 1) throw new Error('not a backup');
            const result = validateSchema(data.schema);
            if (!result.ok || !result.schema) throw new Error(result.errors[0]);
            const s = club();
            s.replaceSchema(result.schema);
            Object.values(data.seeds ?? {}).forEach((b) => s.setSeeds(b as never));
            if (data.baseline) s.setBaseline(data.baseline);
            toast('success', t('cmd.restored'));
          } catch (err) {
            toast('error', `${t('cmd.restoreFailed')}: ${(err as Error).message}`);
          }
        }), { icon: Upload }),
      c('file.settings', 'file', 'cmd.settings', () => wb.open('settings'), { icon: Settings, shortcut: 'Ctrl+,' }),

      // Правка
      c('edit.undo', 'edit', 'history.undo', () => useClubStore.temporal.getState().undo(), { icon: Undo2, shortcut: 'Ctrl+Z', enabled: canUndo }),
      c('edit.redo', 'edit', 'history.redo', () => useClubStore.temporal.getState().redo(), { icon: Redo2, shortcut: 'Ctrl+Shift+Z', enabled: canRedo }),
      c('edit.newModule', 'edit', 'cmd.newModule', () => wb.open('newModule'), { icon: Blocks, shortcut: 'Ctrl+Shift+M' }),
      c('edit.deleteModule', 'edit', 'cmd.deleteModule', () => {
        if (!active) return;
        if (settings.confirmDeletes && !window.confirm(t('confirm.deleteModule', { name: active.pluralName }))) return;
        club().removeEntity(active.id);
        wb.select({ kind: 'club' });
        toast('info', t('entity.removed', { name: active.pluralName }), { label: t('history.undo'), run: () => useClubStore.temporal.getState().undo() });
      }, { icon: Trash2, enabled: !!active }),
      c('edit.commands', 'edit', 'cmd.palette', () => wb.open('commands'), { icon: Search, shortcut: 'Ctrl+K' }),

      // Вид
      c('view.portal', 'view', 'workspace.portal', () => wb.setTab('portal'), { icon: Monitor, shortcut: 'Ctrl+1', checked: tab === 'portal' }),
      c('view.diagram', 'view', 'workspace.diagram', () => wb.setTab('diagram'), { icon: Network, shortcut: 'Ctrl+2', checked: tab === 'diagram' }),
      ...(mode === 'pro' ? [c('view.json', 'view', 'workspace.json', () => wb.setTab('json'), { icon: Braces, shortcut: 'Ctrl+3', checked: tab === 'json' })] : []),
      c('view.desktop', 'view', 'preview.desktop', () => settings.set({ viewport: 'desktop' }), { checked: viewport === 'desktop' }),
      c('view.tablet', 'view', 'preview.tablet', () => settings.set({ viewport: 'tablet' }), { checked: viewport === 'tablet' }),
      c('view.mobile', 'view', 'preview.mobile', () => settings.set({ viewport: 'mobile' }), { checked: viewport === 'mobile' }),
      c('view.light', 'view', 'theme.light', () => settings.set({ theme: 'light' }), { icon: Sun, checked: theme === 'light' }),
      c('view.dark', 'view', 'theme.dark', () => settings.set({ theme: 'dark' }), { icon: Moon, checked: theme === 'dark' }),
      c('view.system', 'view', 'theme.system', () => settings.set({ theme: 'system' }), { checked: theme === 'system' }),
      c('view.easy', 'view', 'mode.easyLabel', () => club().setEditorMode('easy'), { checked: mode === 'easy' }),
      c('view.advanced', 'view', 'mode.advancedLabel', () => club().setEditorMode('advanced'), { checked: mode === 'advanced' }),
      c('view.pro', 'view', 'mode.proLabel', () => club().setEditorMode('pro'), { checked: mode === 'pro' }),
      c('view.language', 'view', 'cmd.language', () => useUiStore.getState().setLocale(locale === 'ru' ? 'en' : 'ru'), { keywords: 'language язык english русский' }),

      // Данные
      c('data.editor', 'data', 'cmd.dataEditor', () => openDataEditor(activeEntityId ?? undefined), { icon: Database, shortcut: 'Ctrl+Shift+D' }),
      c('data.import', 'data', 'cmd.importData', () => wb.open('import', activeEntityId ?? undefined), { icon: FileSpreadsheet, shortcut: 'Ctrl+Shift+I', enabled: !!activeEntityId }),
      c('data.newFromSheet', 'data', 'modules.fromSheet', () => wb.open('import'), { icon: FileSpreadsheet }),

      // Плагины
      c('plugins.manage', 'plugins', 'cmd.plugins', () => wb.open('plugins'), { icon: Plug, shortcut: 'Ctrl+Shift+P' }),

      // Справка
      c('help.guide', 'help', 'cmd.help', () => openHelp('start'), { icon: BookOpen, shortcut: 'F1' }),
      c('help.shortcuts', 'help', 'cmd.shortcuts', () => wb.open('shortcuts'), { icon: Keyboard }),
      c('help.welcome', 'help', 'cmd.welcome', () => wb.open('welcome'), { icon: Rocket }),
      c('help.about', 'help', 'cmd.about', () => wb.open('about'), { icon: Info }),
    ];
  }, [t, canUndo, canRedo, mode, activeEntityId, entities, theme, viewport, tab, locale]);
}

/** Сочетание клавиш из строки вида «Ctrl+Shift+D» совпадает с событием (Ctrl = Ctrl или ⌘). */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.split('+');
  const key = parts.pop()!.toLowerCase();
  const need = { ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt') };
  if (need.ctrl !== (e.ctrlKey || e.metaKey) || need.shift !== e.shiftKey || need.alt !== e.altKey) return false;
  const pressed = e.key.toLowerCase();
  if (key === ',') return pressed === ',' || e.code === 'Comma';
  if (/^[0-9]$/.test(key)) return e.code === `Digit${key}`;
  if (/^[a-z]$/.test(key)) return e.code === `Key${key.toUpperCase()}`;
  return pressed === key;
}
