import { lazy, Suspense } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Loader2 } from 'lucide-react';
import { useWorkbench, type ExportKind } from '@/store/useWorkbench';
import type { Command } from '@/lib/commands';
import { ImportDialog } from '../ImportDialog';
import { SettingsDialog } from './SettingsDialog';
import { PluginsDialog } from './PluginsDialog';
import { NewModuleDialog } from './NewModuleDialog';
import { AboutDialog, CommandPalette, ShortcutsDialog, TemplatesDialog, WelcomeDialog } from './MiscDialogs';

// Экспорт (сборка архивов, JSZip) грузится только при открытии.
const ExportDialogContent = lazy(() => import('../ExportDialog').then((m) => ({ default: m.ExportDialogContent })));

/** Показывает диалог, открытый в рабочей области (useWorkbench.dialog). */
export function DialogHost({ commands }: { commands: Command[] }) {
  const dialog = useWorkbench((s) => s.dialog);
  const arg = useWorkbench((s) => s.dialogArg);
  const close = useWorkbench((s) => s.close);
  switch (dialog) {
    case 'export':
      return (
        <RadixDialog.Root open onOpenChange={(o) => !o && close()}>
          <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-black/30"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>}>
            <ExportDialogContent onDone={close} initialKind={(arg as ExportKind | null) ?? undefined} />
          </Suspense>
        </RadixDialog.Root>
      );
    case 'settings':
      return <SettingsDialog commands={commands} />;
    case 'plugins':
      return <PluginsDialog />;
    case 'newModule':
      return <NewModuleDialog />;
    case 'templates':
      return <TemplatesDialog />;
    case 'commands':
      return <CommandPalette commands={commands} />;
    case 'welcome':
      return <WelcomeDialog />;
    case 'shortcuts':
      return <ShortcutsDialog commands={commands} />;
    case 'about':
      return <AboutDialog />;
    case 'import':
      return <ImportDialog entityId={arg ?? undefined} onClose={close} />;
    default:
      return null;
  }
}
