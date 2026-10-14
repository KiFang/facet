import { Blocks, Braces, Info, Paintbrush, Settings2 } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useT } from '@/i18n';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/Tabs';
import { Section } from './ui/Section';
import { QuickStyle, ThemeCustomizer } from './ThemeCustomizer';
import { EntityBuilder } from './EntityBuilder';
import { ClubInfo, DashboardSettings, TemplateGallery } from './ClubSettings';
import { SchemaEditor } from './SchemaEditor';

function EasyPanel() {
  const t = useT();
  const setEditorMode = useClubStore((s) => s.setEditorMode);
  return (
    <div className="space-y-6 p-4">
      <ClubInfo />
      <TemplateGallery />
      <QuickStyle />
      <Section title={t('modules.section')} icon={<Blocks className="h-3.5 w-3.5" />}>
        <EntityBuilder mode="easy" />
        <button
          type="button"
          onClick={() => setEditorMode('advanced')}
          className="flex w-full items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-left text-xs text-zinc-400 transition-colors hover:border-violet-500/50 hover:text-zinc-200"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
          {t('modules.easyHint')}
        </button>
      </Section>
    </div>
  );
}

export function Sidebar() {
  const t = useT();
  const mode = useClubStore((s) => s.schema.editorMode);

  if (mode === 'easy') return <EasyPanel />;

  return (
    <Tabs defaultValue="modules" className="flex h-full flex-col">
      <TabsList className="sticky top-0 z-10 bg-zinc-950">
        <TabsTrigger value="modules"><Blocks className="h-3.5 w-3.5" /> {t('tabs.modules')}</TabsTrigger>
        <TabsTrigger value="style"><Paintbrush className="h-3.5 w-3.5" /> {t('tabs.style')}</TabsTrigger>
        <TabsTrigger value="club"><Settings2 className="h-3.5 w-3.5" /> {t('tabs.club')}</TabsTrigger>
        {mode === 'pro' && <TabsTrigger value="code"><Braces className="h-3.5 w-3.5" /> JSON</TabsTrigger>}
      </TabsList>
      <TabsContent value="modules" className="p-4">
        <EntityBuilder mode={mode} />
      </TabsContent>
      <TabsContent value="style" className="p-4">
        <ThemeCustomizer />
      </TabsContent>
      <TabsContent value="club" className="space-y-6 p-4">
        <ClubInfo />
        <DashboardSettings />
        <TemplateGallery />
      </TabsContent>
      {mode === 'pro' && (
        <TabsContent value="code" className="flex-1 p-4">
          <SchemaEditor />
        </TabsContent>
      )}
    </Tabs>
  );
}
