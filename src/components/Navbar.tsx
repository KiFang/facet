import { lazy, Suspense, useState } from 'react';
import { Code2, Languages, Link2, Loader2, Redo2, Rocket, Sparkles, SlidersHorizontal, Undo2 } from 'lucide-react';
import { useClubStore, useHistory } from '@/store/useClubStore';
import type { EditorMode } from '@/types/schema';
import { useT, useUiStore } from '@/i18n';
import { encodeShareHash, shareUrl } from '@/utils/share';
import { Button } from './ui/Button';
import { Segmented } from './ui/Segmented';
import { Dialog, DialogTrigger } from './ui/Dialog';
import { toast } from './ui/Toast';

// Диалог экспорта (и сборка архива) грузится только при открытии — стартовый бандл легче.
const ExportDialogContent = lazy(() => import('./ExportDialog').then((m) => ({ default: m.ExportDialogContent })));

export function Navbar() {
  const t = useT();
  const mode = useClubStore((s) => s.schema.editorMode);
  const setEditorMode = useClubStore((s) => s.setEditorMode);
  const undo = useHistory((h) => h.undo);
  const redo = useHistory((h) => h.redo);
  const canUndo = useHistory((h) => h.pastStates.length > 0);
  const canRedo = useHistory((h) => h.futureStates.length > 0);
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const [open, setOpen] = useState(false);

  const modes: { value: EditorMode; label: React.ReactNode; title: string }[] = [
    { value: 'easy', label: <><Sparkles className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Easy</span></>, title: t('mode.easy') },
    { value: 'advanced', label: <><SlidersHorizontal className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Advanced</span></>, title: t('mode.advanced') },
    { value: 'pro', label: <><Code2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Pro</span></>, title: t('mode.pro') },
  ];

  const share = async () => {
    try {
      const url = shareUrl(await encodeShareHash(useClubStore.getState().schema));
      await navigator.clipboard.writeText(url);
      toast('success', t('share.copied'));
    } catch {
      toast('error', t('share.failed'));
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950/80 px-3 backdrop-blur sm:gap-4 sm:px-4">
      <div className="flex items-center gap-3">
        <img src="/facet.svg" alt="" className="h-7 w-7" />
        <div className="hidden leading-tight sm:block">
          <div className="text-sm font-bold tracking-tight text-white">Facet OS</div>
          <div className="hidden text-[11px] text-zinc-500 xl:block">{t('app.tagline')}</div>
        </div>
        <div className="ml-1 flex items-center">
          <Button size="icon" variant="ghost" onClick={() => undo()} disabled={!canUndo} title={`${t('history.undo')} (Ctrl+Z)`} aria-label={t('history.undo')}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => redo()} disabled={!canRedo} title={`${t('history.redo')} (Ctrl+Shift+Z)`} aria-label={t('history.redo')}>
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Segmented ariaLabel={t('mode.label')} className="w-auto" value={mode} options={modes} onChange={setEditorMode} />

      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" onClick={() => setLocale(locale === 'ru' ? 'en' : 'ru')} title={t('lang.switch')} aria-label={t('lang.switch')}>
          <Languages className="h-4 w-4" />
          <span className="sr-only">{locale.toUpperCase()}</span>
        </Button>
        <Button size="icon" variant="ghost" onClick={() => void share()} title={t('share.title')} aria-label={t('share.title')}>
          <Link2 className="h-4 w-4" />
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="primary" className="ml-1">
              <Rocket className="h-4 w-4" />
              <span className="hidden md:inline">{t('export.button')}</span>
            </Button>
          </DialogTrigger>
          {open && (
            <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-black/60"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>}>
              <ExportDialogContent onDone={() => setOpen(false)} />
            </Suspense>
          )}
        </Dialog>
      </div>
    </header>
  );
}
