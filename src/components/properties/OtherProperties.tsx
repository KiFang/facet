import { useEffect, useState } from 'react';
import {
  Landmark, Cloud, FileJson, FolderOpen, Home, LayoutTemplate, Link2, Monitor, PackagePlus, Palette, Plug, RefreshCcw, Rocket, Settings2,
} from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useHubLink } from '@/store/useHubLink';
import { useWorkbench } from '@/store/useWorkbench';
import { useT, useUiLocale } from '@/i18n';
import { manifestOf, settingsProblems, tr } from '@/plugins/runtime';
import { getEntityIcon } from '@/lib/icons';
import { desktop, type LocalServerInfo } from '@/desktop';
import type { Command } from '@/lib/commands';
import { Button } from '../ui/Button';
import { Section } from '../ui/Section';
import { Switch } from '../ui/Switch';
import { ClubInfo, DashboardSettings } from '../ClubSettings';
import { QuickStyle, ThemeCustomizer } from '../ThemeCustomizer';
import { PropertyPage } from './PropertyPage';

export function ClubProperties({ commands }: { commands: Command[] }) {
  const t = useT();
  const name = useClubStore((s) => s.schema.clubName);
  const run = (id: string) => commands.find((c) => c.id === id)?.run();
  return (
    <PropertyPage icon={<Settings2 className="h-4 w-4" />} title={name || t('nav.club')} subtitle={t('props.clubSubtitle')} help="club">
      <ClubInfo />
      <Section title={t('props.templates')} icon={<LayoutTemplate className="h-3 w-3" />}>
        <p className="text-xs text-fg-muted">{t('props.templatesHint')}</p>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => run('file.templates')}><LayoutTemplate className="h-3.5 w-3.5" /> {t('cmd.templates')}</Button>
          <Button size="sm" variant="subtle" onClick={() => run('file.open')}><FolderOpen className="h-3.5 w-3.5" /> {t('cmd.openSchema')}</Button>
        </div>
      </Section>
    </PropertyPage>
  );
}

export function AppearanceProperties() {
  const t = useT();
  const mode = useClubStore((s) => s.schema.editorMode);
  return (
    <PropertyPage icon={<Palette className="h-4 w-4" />} title={t('nav.appearance')} subtitle={t('props.appearanceSubtitle')} help="appearance">
      {mode === 'easy' ? <QuickStyle /> : <ThemeCustomizer />}
    </PropertyPage>
  );
}

export function HomeProperties() {
  const t = useT();
  return (
    <PropertyPage icon={<Home className="h-4 w-4" />} title={t('nav.home')} subtitle={t('props.homeSubtitle')} help="dashboard">
      <DashboardSettings />
    </PropertyPage>
  );
}

export function PluginsProperties() {
  const t = useT();
  const locale = useUiLocale();
  const schema = useClubStore((s) => s.schema);
  const secrets = useClubStore((s) => s.pluginSecrets);
  const setPluginEnabled = useClubStore((s) => s.setPluginEnabled);
  const open = useWorkbench((s) => s.open);
  const plugins = schema.plugins ?? [];
  return (
    <PropertyPage
      icon={<Plug className="h-4 w-4" />}
      title={t('nav.plugins')}
      subtitle={t('props.pluginsSubtitle', { n: plugins.filter((p) => p.enabled).length })}
      help="plugins"
      actions={<Button size="sm" onClick={() => open('plugins')}>{t('props.manage')}</Button>}
    >
      {plugins.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong p-4 text-center text-xs text-fg-muted">
          {t('plugins.none')}
          <div className="mt-2"><Button size="sm" variant="primary" onClick={() => open('plugins')}><Plug className="h-3.5 w-3.5" /> {t('plugins.openCatalog')}</Button></div>
        </div>
      ) : (
        <div className="rounded-md border border-line bg-panel">
          {plugins.map((p) => {
            const m = manifestOf(p);
            const Icon = getEntityIcon(m?.icon ?? 'Box');
            const problems = m ? settingsProblems(schema, m, p, secrets[p.id]) : ['manifest'];
            return (
              <div key={p.id} className="flex items-center gap-2.5 border-b border-line px-2.5 py-2 last:border-b-0">
                <Icon className="h-4 w-4 shrink-0 text-fg-subtle" />
                <button type="button" onClick={() => open('plugins', p.id)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm text-fg hover:underline">{m ? tr(m.name, locale) : p.id}</span>
                  <span className={problems.length && p.enabled ? 'text-2xs text-warning' : 'text-2xs text-fg-subtle'}>
                    {problems.length && p.enabled ? t('plugins.needsSetup') : `v${m?.version ?? '?'}`}
                  </span>
                </button>
                <Switch checked={p.enabled} label={t('plugins.enabled')} onChange={(v) => setPluginEnabled(p.id, v)} />
              </div>
            );
          })}
        </div>
      )}
    </PropertyPage>
  );
}

export function PublishProperties({ commands }: { commands: Command[] }) {
  const t = useT();
  const locale = useUiLocale();
  const baseline = useClubStore((s) => s.baseline);
  const hubLink = useHubLink((s) => s.link);
  const run = (id: string) => commands.find((c) => c.id === id)?.run();
  const [local, setLocal] = useState<LocalServerInfo | null>(null);
  useEffect(() => {
    void desktop()?.localServer.info().then(setLocal).catch(() => setLocal(null));
  }, []);

  const card = (icon: React.ReactNode, title: string, text: string, actions: React.ReactNode) => (
    <div className="rounded-md border border-line bg-panel p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-accent">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">{title}</div>
          <p className="mt-0.5 text-xs text-fg-muted">{text}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{actions}</div>
        </div>
      </div>
    </div>
  );

  return (
    <PropertyPage icon={<Rocket className="h-4 w-4" />} title={t('nav.publish')} subtitle={t('props.publishSubtitle')} help="publish">
      {desktop() && card(
        <Monitor className="h-4 w-4" />,
        t('local.tab'),
        local ? t(local.running ? 'status.localRunning' : local.installed ? 'status.localStopped' : 'status.localNone') : t('local.desc'),
        <Button size="sm" variant="primary" onClick={() => run('file.exportLocal')}><Monitor className="h-3.5 w-3.5" /> {t('props.openLocal')}</Button>,
      )}
      {card(
        <Cloud className="h-4 w-4" />,
        t('props.server'),
        baseline
          ? t('props.serverVersion', { date: new Date(baseline.at).toLocaleString(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })
          : t('props.serverNone'),
        <>
          <Button size="sm" variant={baseline ? 'secondary' : 'primary'} onClick={() => run('file.exportInstall')}><PackagePlus className="h-3.5 w-3.5" /> {t('export.install')}</Button>
          <Button size="sm" variant={baseline ? 'primary' : 'secondary'} onClick={() => run('file.exportUpdate')}><RefreshCcw className="h-3.5 w-3.5" /> {t('export.update')}</Button>
        </>,
      )}
      {card(
        <Landmark className="h-4 w-4" />,
        t('hub.title'),
        hubLink ? `${t('hub.linked', { name: hubLink.name, hub: hubLink.hub.replace(/^https?:\/\//, '') })}${hubLink.status === 'pending' ? ` ${t('hub.pendingNote')}` : ''}` : t('hub.cardText'),
        <Button size="sm" variant={hubLink ? 'primary' : 'secondary'} onClick={() => run('file.hub')} data-testid="publish-hub">
          {hubLink ? <RefreshCcw className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />} {t(hubLink ? 'hub.manage' : 'hub.connect')}
        </Button>,
      )}
      {card(
        <FileJson className="h-4 w-4" />,
        t('props.schemaFile'),
        t('props.schemaFileHint'),
        <>
          <Button size="sm" onClick={() => run('file.save')}>{t('cmd.saveSchema')}</Button>
          <Button size="sm" variant="subtle" onClick={() => run('file.open')}>{t('cmd.openSchema')}</Button>
        </>,
      )}
      {card(
        <Link2 className="h-4 w-4" />,
        t('cmd.share'),
        t('props.shareHint'),
        <Button size="sm" onClick={() => run('file.share')}><Link2 className="h-3.5 w-3.5" /> {t('props.copyLink')}</Button>,
      )}
    </PropertyPage>
  );
}
