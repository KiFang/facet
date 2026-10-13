import { useState } from 'react';
import { Code2, Rocket, Sparkles, SlidersHorizontal } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import type { EditorMode } from '@/types/schema';
import { Button } from './ui/Button';
import { Segmented } from './ui/Segmented';
import { Dialog, DialogTrigger } from './ui/Dialog';
import { ExportDialogContent } from './ExportDialog';

const MODES: { value: EditorMode; label: React.ReactNode; title: string }[] = [
  { value: 'easy', label: <><Sparkles className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Easy</span></>, title: 'Шаблоны и быстрые настройки' },
  { value: 'advanced', label: <><SlidersHorizontal className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Advanced</span></>, title: 'Токены темы и конструктор модулей' },
  { value: 'pro', label: <><Code2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Pro</span></>, title: 'Системные id и прямое редактирование JSON' },
];

export function Navbar() {
  const mode = useClubStore((s) => s.schema.editorMode);
  const setEditorMode = useClubStore((s) => s.setEditorMode);
  const [open, setOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/80 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <img src="/facet.svg" alt="" className="h-7 w-7" />
        <div className="hidden leading-tight sm:block">
          <div className="text-sm font-bold tracking-tight text-white">Facet OS</div>
          <div className="hidden text-[11px] text-zinc-500 lg:block">No-code билдер порталов для клубов и гильдий</div>
        </div>
      </div>

      <Segmented ariaLabel="Режим редактора" className="w-auto" value={mode} options={MODES} onChange={setEditorMode} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="primary">
            <Rocket className="h-4 w-4" />
            <span className="hidden md:inline">Экспорт в Self-Host</span>
          </Button>
        </DialogTrigger>
        {open && <ExportDialogContent />}
      </Dialog>
    </header>
  );
}
