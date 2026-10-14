import { useEffect } from 'react';
import { MenuBar } from '@/components/shell/MenuBar';
import { Toolbar } from '@/components/shell/Toolbar';
import { Navigator } from '@/components/shell/Navigator';
import { Workspace } from '@/components/shell/Workspace';
import { StatusBar } from '@/components/shell/StatusBar';
import { Resizer } from '@/components/shell/Resizer';
import { PropertiesPanel } from '@/components/properties/PropertiesPanel';
import { DialogHost } from '@/components/dialogs/DialogHost';
import { Toaster, toast } from '@/components/ui/Toast';
import { useClubStore } from '@/store/useClubStore';
import { useSettings } from '@/store/useSettings';
import { useWorkbench } from '@/store/useWorkbench';
import { useCommands, matchesShortcut, type Command } from '@/lib/commands';
import { decodeShareHash } from '@/utils/share';
import { translate, useT, useUiStore } from '@/i18n';

/** Открытие схемы по ссылке «Поделиться» (#s=…). Текущую схему можно вернуть через «Отменить». */
function useShareLink() {
  useEffect(() => {
    const open = async () => {
      if (!location.hash.startsWith('#s=')) return;
      const locale = useUiStore.getState().locale;
      const schema = await decodeShareHash(location.hash);
      history.replaceState(null, '', location.pathname + location.search);
      if (!schema) {
        toast('error', translate(locale, 'share.invalid'));
        return;
      }
      const { replaceSchema, schema: current, clearSeeds } = useClubStore.getState();
      replaceSchema({ ...schema, editorMode: current.editorMode, theme: { ...schema.theme, logo: current.theme.logo } });
      clearSeeds();
      toast('info', translate(locale, 'share.opened', { name: schema.clubName }), {
        label: translate(locale, 'history.undo'),
        run: () => useClubStore.temporal.getState().undo(),
      });
    };
    void open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
}

/** Горячие клавиши из реестра команд. В полях ввода работают только сочетания с Ctrl, кроме отмены (там — отмена браузера). */
function useHotkeys(commands: Command[]) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useWorkbench.getState().dialog && e.key !== 'F1') return;
      const inField = !!(e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]');
      for (const c of commands) {
        if (!c.shortcut || c.enabled === false || !matchesShortcut(e, c.shortcut)) continue;
        if (inField && (!c.shortcut.includes('Ctrl') || c.id === 'edit.undo' || c.id === 'edit.redo')) return;
        e.preventDefault();
        c.run();
        return;
      }
      // Ctrl+Y — альтернативный «Повторить»
      if (!inField && (e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
        e.preventDefault();
        useClubStore.temporal.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commands]);
}

export default function App() {
  const t = useT();
  const commands = useCommands();
  const showNavigator = useSettings((s) => s.showNavigator);
  const showProperties = useSettings((s) => s.showProperties);
  const navWidth = useSettings((s) => s.navWidth);
  const propsWidth = useSettings((s) => s.propsWidth);
  const setSettings = useSettings((s) => s.set);
  const clubName = useClubStore((s) => s.schema.clubName);
  useShareLink();
  useHotkeys(commands);

  useEffect(() => {
    document.title = clubName ? `${clubName} — Facet OS` : 'Facet OS';
  }, [clubName]);

  useEffect(() => {
    if (!useSettings.getState().welcomeSeen && !location.hash.startsWith('#s=')) useWorkbench.getState().open('welcome');
  }, []);

  return (
    <div className="flex h-screen flex-col bg-app text-fg">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-panel px-2">
        <div className="flex items-center gap-2 pr-1">
          <img src="/facet.svg" alt="" className="h-5 w-5" />
          <span className="text-sm font-semibold tracking-tight text-fg">Facet OS</span>
        </div>
        <MenuBar commands={commands} />
        <span className="ml-auto hidden truncate text-xs text-fg-subtle md:block">{clubName}</span>
      </header>
      <Toolbar commands={commands} />
      <main className="flex min-h-0 flex-1">
        {showNavigator && (
          <>
            <aside className="shrink-0 overflow-hidden" style={{ width: navWidth }}>
              <Navigator />
            </aside>
            <Resizer side="left" width={navWidth} min={180} max={380} label={t('nav.resize')} onChange={(w) => setSettings({ navWidth: w })} />
          </>
        )}
        <section className="min-w-0 flex-1">
          <Workspace />
        </section>
        {showProperties && (
          <>
            <Resizer side="right" width={propsWidth} min={340} max={620} label={t('props.resize')} onChange={(w) => setSettings({ propsWidth: w })} />
            <aside className="shrink-0 overflow-hidden border-l-0 bg-panel" style={{ width: propsWidth }} aria-label={t('props.aria')}>
              <PropertiesPanel commands={commands} />
            </aside>
          </>
        )}
      </main>
      <StatusBar />
      <DialogHost commands={commands} />
      <Toaster />
    </div>
  );
}
