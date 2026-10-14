import { BookOpen, Code2, Database, FileSpreadsheet, Link2, Plug, Plus, Redo2, Rocket, Settings, SlidersHorizontal, Sparkles, Undo2 } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import type { EditorMode } from '@/types/schema';
import { useT } from '@/i18n';
import type { Command } from '@/lib/commands';
import { desktop } from '@/desktop';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { Tip } from '../ui/Tooltip';
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from '../ui/Menu';

function ToolButton({ command, icon: Icon, label }: { command?: Command; icon: typeof Undo2; label?: string }) {
  if (!command) return null;
  return (
    <Tip content={command.label} shortcut={command.shortcut}>
      <Button
        size={label ? 'sm' : 'icon-sm'}
        variant="ghost"
        onClick={command.run}
        disabled={command.enabled === false}
        aria-label={command.label}
        className={label ? 'text-fg' : undefined}
      >
        <Icon className="h-4 w-4" />
        {label && <span className="hidden xl:inline">{label}</span>}
      </Button>
    </Tip>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-line" />;

export function Toolbar({ commands }: { commands: Command[] }) {
  const t = useT();
  const mode = useClubStore((s) => s.schema.editorMode);
  const setEditorMode = useClubStore((s) => s.setEditorMode);
  const by = (id: string) => commands.find((c) => c.id === id);
  const modes: { value: EditorMode; label: React.ReactNode; title: string; ariaLabel: string }[] = [
    { value: 'easy', label: <><Sparkles className="h-3.5 w-3.5" /><span className="hidden lg:inline">{t('mode.easyLabel')}</span></>, title: t('mode.easy'), ariaLabel: t('mode.easyLabel') },
    { value: 'advanced', label: <><SlidersHorizontal className="h-3.5 w-3.5" /><span className="hidden lg:inline">{t('mode.advancedLabel')}</span></>, title: t('mode.advanced'), ariaLabel: t('mode.advancedLabel') },
    { value: 'pro', label: <><Code2 className="h-3.5 w-3.5" /><span className="hidden lg:inline">{t('mode.proLabel')}</span></>, title: t('mode.pro'), ariaLabel: t('mode.proLabel') },
  ];

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line bg-panel px-2" role="toolbar" aria-label={t('toolbar.aria')}>
      <ToolButton command={by('edit.undo')} icon={Undo2} />
      <ToolButton command={by('edit.redo')} icon={Redo2} />
      <Divider />
      <ToolButton command={by('edit.newModule')} icon={Plus} label={t('toolbar.newModule')} />
      <ToolButton command={by('data.import')} icon={FileSpreadsheet} label={t('toolbar.import')} />
      <ToolButton command={by('data.editor')} icon={Database} label={t('toolbar.data')} />
      <Divider />
      <ToolButton command={by('plugins.manage')} icon={Plug} label={t('toolbar.plugins')} />
      <ToolButton command={by('file.share')} icon={Link2} />

      <div className="mx-2">
        <Segmented ariaLabel={t('mode.label')} className="w-auto" size="sm" value={mode} options={modes} onChange={setEditorMode} />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ToolButton command={by('help.guide')} icon={BookOpen} label={t('toolbar.help')} />
        <ToolButton command={by('file.settings')} icon={Settings} />
        <DropdownMenu>
          <DropdownTrigger asChild>
            <Button variant="primary" size="sm" className="ml-1">
              <Rocket className="h-3.5 w-3.5" /> {t('export.button')}
            </Button>
          </DropdownTrigger>
          <DropdownContent align="end">
            {desktop() && <DropdownItem icon={<Rocket className="h-3.5 w-3.5" />} label={t('cmd.exportLocal')} onSelect={() => by('file.exportLocal')?.run()} />}
            <DropdownItem label={t('cmd.exportInstall')} shortcut="Ctrl+E" onSelect={() => by('file.exportInstall')?.run()} />
            <DropdownItem label={t('cmd.exportUpdate')} onSelect={() => by('file.exportUpdate')?.run()} />
            <DropdownSeparator />
            <DropdownItem label={t('cmd.saveSchema')} shortcut="Ctrl+S" onSelect={() => by('file.save')?.run()} />
          </DropdownContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
