import { useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Code2, Database, Info, Monitor, Moon, MousePointerClick, Server, Settings, SlidersHorizontal, Sparkles, Sun, Trash2 } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useSettings, type ThemePref } from '@/store/useSettings';
import { useWorkbench } from '@/store/useWorkbench';
import { useT, useUiStore } from '@/i18n';
import type { EditorMode } from '@/types/schema';
import { FACET_VERSION } from '@/version';
import { desktop } from '@/desktop';
import { cn } from '@/lib/cn';
import type { Command } from '@/lib/commands';
import { DialogContent, DialogFooter } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Input';
import { Segmented } from '../ui/Segmented';
import { Switch } from '../ui/Switch';
import { Section } from '../ui/Section';

type Page = 'interface' | 'editor' | 'connection' | 'data' | 'about';

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-1">
      <span>
        <span className="block text-sm text-fg">{label}</span>
        {description && <span className="block text-2xs text-fg-subtle">{description}</span>}
      </span>
      <Switch checked={checked} label={label} onChange={onChange} />
    </label>
  );
}

function ThemeCard({ value, current, onPick, label, icon }: { value: ThemePref; current: ThemePref; onPick: (v: ThemePref) => void; label: string; icon: React.ReactNode }) {
  const dark = value === 'dark';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={current === value}
      onClick={() => onPick(value)}
      className={cn('rounded-md border p-1.5 text-left transition-colors', current === value ? 'border-accent ring-2 ring-accent/20' : 'border-line hover:border-line-strong')}
    >
      <div className={cn('flex h-16 overflow-hidden rounded border', dark ? 'border-[#2c2f37] bg-[#111215]' : value === 'light' ? 'border-[#e0e3e8] bg-[#f0f1f4]' : 'border-line bg-linear-to-r from-[#f0f1f4] from-50% to-[#111215] to-50%')}>
        <div className={cn('w-1/4 border-r', dark ? 'border-[#2c2f37] bg-[#18191d]' : 'border-[#e0e3e8] bg-white')} />
        <div className="flex-1 p-1.5">
          <div className="h-1.5 w-2/3 rounded bg-[#2457d6]" />
          <div className={cn('mt-1 h-1.5 w-1/2 rounded', dark ? 'bg-[#2c2f37]' : 'bg-[#e0e3e8]')} />
        </div>
      </div>
      <span className="mt-1.5 flex items-center gap-1.5 px-0.5 text-xs font-medium text-fg">{icon}{label}</span>
    </button>
  );
}

export function SettingsDialog({ commands }: { commands: Command[] }) {
  const t = useT();
  const close = useWorkbench((s) => s.close);
  const settings = useSettings();
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const mode = useClubStore((s) => s.schema.editorMode);
  const setEditorMode = useClubStore((s) => s.setEditorMode);
  const seeds = useClubStore((s) => s.seeds);
  const clearSeeds = useClubStore((s) => s.clearSeeds);
  const [page, setPage] = useState<Page>('interface');
  const run = (id: string) => commands.find((c) => c.id === id)?.run();

  const pages: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'interface', label: t('settings.interface'), icon: <Monitor className="h-3.5 w-3.5" /> },
    { id: 'editor', label: t('settings.editor'), icon: <MousePointerClick className="h-3.5 w-3.5" /> },
    { id: 'connection', label: t('settings.connection'), icon: <Server className="h-3.5 w-3.5" /> },
    { id: 'data', label: t('settings.data'), icon: <Database className="h-3.5 w-3.5" /> },
    { id: 'about', label: t('settings.about'), icon: <Info className="h-3.5 w-3.5" /> },
  ];

  const resetAll = () => {
    if (!window.confirm(t('settings.resetConfirm'))) return;
    for (const key of Object.keys(localStorage)) if (key.startsWith('facet-os:')) localStorage.removeItem(key);
    location.reload();
  };

  const modes: { value: EditorMode; icon: typeof Sparkles; label: string; text: string }[] = [
    { value: 'easy', icon: Sparkles, label: t('mode.easyLabel'), text: t('mode.easy') },
    { value: 'advanced', icon: SlidersHorizontal, label: t('mode.advancedLabel'), text: t('mode.advanced') },
    { value: 'pro', icon: Code2, label: t('mode.proLabel'), text: t('mode.pro') },
  ];

  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && close()}>
      <DialogContent title={t('cmd.settings')} description={t('settings.desc')} icon={<Settings className="h-4 w-4" />} className="h-[min(620px,90vh)] w-[min(820px,calc(100vw-32px))]">
        <div className="flex min-h-0 flex-1">
          <nav className="w-48 shrink-0 space-y-0.5 border-r border-line bg-sunken p-2" aria-label={t('cmd.settings')}>
            {pages.map((p) => (
              <button key={p.id} type="button" onClick={() => setPage(p.id)} aria-current={page === p.id ? 'page' : undefined}
                className={cn('flex h-8 w-full items-center gap-2 rounded px-2.5 text-left text-sm', page === p.id ? 'bg-accent text-accent-fg' : 'text-fg hover:bg-hover')}>
                {p.icon}{p.label}
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1 space-y-6 overflow-auto p-5">
            {page === 'interface' && (
              <>
                <Section title={t('settings.theme')}>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('settings.theme')}>
                    <ThemeCard value="light" current={settings.theme} onPick={(theme) => settings.set({ theme })} label={t('theme.light')} icon={<Sun className="h-3.5 w-3.5" />} />
                    <ThemeCard value="dark" current={settings.theme} onPick={(theme) => settings.set({ theme })} label={t('theme.dark')} icon={<Moon className="h-3.5 w-3.5" />} />
                    <ThemeCard value="system" current={settings.theme} onPick={(theme) => settings.set({ theme })} label={t('theme.system')} icon={<Monitor className="h-3.5 w-3.5" />} />
                  </div>
                </Section>
                <Section title={t('settings.language')}>
                  <Segmented ariaLabel={t('settings.language')} className="w-64" value={locale} onChange={setLocale}
                    options={[{ value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }]} />
                  <p className="text-2xs text-fg-subtle">{t('settings.languageHint')}</p>
                </Section>
                <Section title={t('mode.label')}>
                  <div className="space-y-1.5" role="radiogroup" aria-label={t('mode.label')}>
                    {modes.map((m) => (
                      <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} onClick={() => setEditorMode(m.value)}
                        className={cn('flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left', mode === m.value ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong')}>
                        <m.icon className={cn('h-4 w-4', mode === m.value ? 'text-accent' : 'text-fg-subtle')} />
                        <span>
                          <span className="block text-sm font-medium text-fg">{m.label}</span>
                          <span className="block text-2xs text-fg-muted">{m.text}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </Section>
              </>
            )}
            {page === 'editor' && (
              <Section title={t('settings.behaviour')}>
                <Toggle label={t('settings.confirmDeletes')} description={t('settings.confirmDeletesHint')} checked={settings.confirmDeletes} onChange={(v) => settings.set({ confirmDeletes: v })} />
                <Toggle label={t('settings.showNavigator')} checked={settings.showNavigator} onChange={(v) => settings.set({ showNavigator: v })} />
                <Toggle label={t('settings.showProperties')} checked={settings.showProperties} onChange={(v) => settings.set({ showProperties: v })} />
                <Toggle label={t('settings.welcome')} description={t('settings.welcomeHint')} checked={!settings.welcomeSeen} onChange={(v) => settings.set({ welcomeSeen: !v })} />
              </Section>
            )}
            {page === 'connection' && (
              <Section title={t('settings.server')}>
                <p className="text-xs text-fg-muted">{t('settings.serverHint')}</p>
                <Field label={t('settings.serverUrl')} htmlFor="set-url" description={t('settings.serverUrlHint')}>
                  <Input id="set-url" value={settings.server.url} placeholder="https://club.example.ru"
                    onChange={(e) => settings.set({ server: { ...settings.server, url: e.target.value.trim() } })} />
                </Field>
                <Field label={t('settings.serverEmail')} htmlFor="set-email">
                  <Input id="set-email" type="email" value={settings.server.email} placeholder="admin@club.example.ru"
                    onChange={(e) => settings.set({ server: { ...settings.server, email: e.target.value.trim() } })} />
                </Field>
                {desktop() && <p className="rounded-md border border-line bg-sunken p-2.5 text-2xs text-fg-muted">{t('settings.desktopHint')}</p>}
              </Section>
            )}
            {page === 'data' && (
              <>
                <Section title={t('settings.backup')}>
                  <p className="text-xs text-fg-muted">{t('settings.backupHint')}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => run('file.backup')}>{t('cmd.backup')}</Button>
                    <Button size="sm" variant="subtle" onClick={() => run('file.restore')}>{t('cmd.restore')}</Button>
                  </div>
                </Section>
                <Section title={t('settings.drafts')}>
                  <p className="text-xs text-fg-muted">{t('settings.draftsHint', { n: Object.values(seeds).reduce((n, b) => n + b.rows.length, 0) })}</p>
                  <Button size="sm" variant="subtle" disabled={!Object.keys(seeds).length} onClick={() => clearSeeds()}>{t('settings.clearDrafts')}</Button>
                </Section>
                <Section title={t('settings.reset')}>
                  <p className="text-xs text-fg-muted">{t('settings.resetHint')}</p>
                  <Button size="sm" variant="danger" className="border-danger/40" onClick={resetAll}><Trash2 className="h-3.5 w-3.5" /> {t('settings.resetButton')}</Button>
                </Section>
              </>
            )}
            {page === 'about' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <img src="/facet.svg" alt="" className="h-12 w-12" />
                  <div>
                    <div className="text-base font-semibold text-fg">Facet OS {FACET_VERSION}</div>
                    <div className="text-xs text-fg-muted">{t('app.tagline')}</div>
                  </div>
                </div>
                <p className="text-sm text-fg-muted">{t('about.text')}</p>
                <div className="text-xs text-fg-subtle">{t('about.stack')}</div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => window.open('https://github.com/KiFang/facet', '_blank', 'noopener')}>GitHub</Button>
                  <Button size="sm" variant="subtle" onClick={() => run('help.guide')}>{t('cmd.help')}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <span className="text-2xs text-fg-subtle">{t('settings.autosave')}</span>
          <Button variant="primary" onClick={close}>{t('common.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </RadixDialog.Root>
  );
}
