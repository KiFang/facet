import { useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Sidebar } from '@/components/Sidebar';
import { LivePreview } from '@/components/LivePreview';
import { Toaster, toast } from '@/components/ui/Toast';
import { useClubStore } from '@/store/useClubStore';
import { decodeShareHash } from '@/utils/share';
import { translate, useUiStore } from '@/i18n';

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

/** Ctrl/⌘+Z — отменить, Ctrl/⌘+Shift+Z или Ctrl+Y — повторить (кроме полей ввода: там работает отмена браузера). */
function useHistoryHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      const { undo, redo } = useClubStore.temporal.getState();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  useShareLink();
  useHistoryHotkeys();
  const locale = useUiStore((s) => s.locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <Navbar />
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="max-h-[50vh] shrink-0 overflow-y-auto border-b border-zinc-800 lg:max-h-none lg:w-[440px] lg:border-b-0 lg:border-r">
          <Sidebar />
        </aside>
        <section className="min-h-0 min-w-0 flex-1 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.10),transparent_60%)] pt-1">
          <LivePreview />
        </section>
      </main>
      <Toaster />
    </div>
  );
}
