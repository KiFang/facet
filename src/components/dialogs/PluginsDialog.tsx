import { useMemo, useRef, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { AlertTriangle, Code2, Eye, EyeOff, FileUp, Layers, Palette, Plug, Server, ShieldAlert, Trash2, Wand2 } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useWorkbench } from '@/store/useWorkbench';
import { useT, useUiLocale, type TKey } from '@/i18n';
import { getEntityIcon } from '@/lib/icons';
import { cn } from '@/lib/cn';
import { BUILTIN_PLUGINS } from '@/plugins/catalog';
import { isBuiltin, manifestOf, pluginCapabilities, secretEnvName, settingsProblems, tr, validateManifest } from '@/plugins/runtime';
import type { InstalledPlugin, PluginManifest, PluginSetting } from '@/plugins/types';
import { DialogContent, DialogFooter } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Input';
import { Switch } from '../ui/Switch';
import { Section } from '../ui/Section';
import { toast } from '../ui/Toast';

const CAP_ICONS = { server: Server, script: Code2, css: Palette, entities: Layers, templates: Wand2, palettes: Palette } as const;

function Capabilities({ manifest }: { manifest: PluginManifest }) {
  const t = useT();
  const caps = pluginCapabilities(manifest);
  if (!caps.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {caps.map((c) => {
        const Icon = CAP_ICONS[c];
        return (
          <span key={c} className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-2xs', c === 'server' || c === 'script' ? 'border-warning/40 bg-warning-soft text-warning' : 'border-line bg-sunken text-fg-muted')}>
            <Icon className="h-3 w-3" /> {t(`plugins.cap.${c}` as TKey)}
          </span>
        );
      })}
    </div>
  );
}

function SecretInput({ value, onChange, placeholder, id }: { value: string; onChange: (v: string) => void; placeholder?: string; id: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={shown ? 'text' : 'password'} value={value} placeholder={placeholder} autoComplete="off" spellCheck={false} className="pr-8 font-mono text-xs" onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => setShown((v) => !v)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle hover:text-fg" aria-label="show">
        {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function SettingInput({ plugin, setting }: { plugin: InstalledPlugin; setting: PluginSetting }) {
  const t = useT();
  const locale = useUiLocale();
  const schema = useClubStore((s) => s.schema);
  const secret = useClubStore((s) => s.pluginSecrets[plugin.id]?.[setting.key] ?? '');
  const setPluginSettings = useClubStore((s) => s.setPluginSettings);
  const setPluginSecret = useClubStore((s) => s.setPluginSecret);
  const value = plugin.settings[setting.key];
  const set = (v: InstalledPlugin['settings'][string]) => setPluginSettings(plugin.id, { [setting.key]: v });
  const id = `plg-${plugin.id}-${setting.key}`;
  const label = <>{tr(setting.label, locale)}{setting.required && <span className="text-danger"> *</span>}</>;
  const description = setting.type === 'secret'
    ? <>{tr(setting.description, locale)} <span className="font-mono">{secretEnvName(plugin.id, setting.key)}</span></>
    : tr(setting.description, locale);

  switch (setting.type) {
    case 'boolean':
      return (
        <label className="flex cursor-pointer items-center justify-between gap-3 py-0.5">
          <span className="text-sm text-fg">{label}</span>
          <Switch checked={!!value} label={tr(setting.label, locale)} onChange={set} />
        </label>
      );
    case 'secret':
      return (
        <Field label={label} htmlFor={id} description={description}>
          <SecretInput id={id} value={secret} placeholder={setting.placeholder} onChange={(v) => setPluginSecret(plugin.id, setting.key, v)} />
        </Field>
      );
    case 'textarea':
      return (
        <Field label={label} htmlFor={id} description={description}>
          <Textarea id={id} value={String(value ?? '')} placeholder={setting.placeholder} className="min-h-[120px] font-mono text-xs" onChange={(e) => set(e.target.value)} />
        </Field>
      );
    case 'number':
      return (
        <Field label={label} htmlFor={id} description={description}>
          <Input id={id} type="number" value={String(value ?? '')} className="w-32" onChange={(e) => set(e.target.value === '' ? '' : Number(e.target.value))} />
        </Field>
      );
    case 'select':
      return (
        <Field label={label} htmlFor={id} description={description}>
          <Select id={id} value={String(value ?? '')} onChange={(e) => set(e.target.value)}>
            <option value="">—</option>
            {(setting.options ?? []).map((o) => <option key={o.value} value={o.value}>{tr(o.label, locale)}</option>)}
          </Select>
        </Field>
      );
    case 'entity':
      return (
        <Field label={label} htmlFor={id} description={description}>
          <Select id={id} value={String(value ?? '')} onChange={(e) => set(e.target.value)}>
            <option value="">{t('plugins.chooseSection')}</option>
            {schema.entities.map((e) => <option key={e.id} value={e.id}>{e.pluralName}</option>)}
          </Select>
        </Field>
      );
    case 'field': {
      const entity = schema.entities.find((e) => e.id === plugin.settings[setting.fieldOf ?? '']);
      const fields = (entity?.fields ?? []).filter((f) => !setting.fieldTypes || setting.fieldTypes.includes(f.type));
      return (
        <Field label={label} htmlFor={id} description={description}>
          <Select id={id} value={String(value ?? '')} disabled={!entity} onChange={(e) => set(e.target.value)}>
            <option value="">{entity ? t('plugins.chooseField') : t('plugins.chooseSectionFirst')}</option>
            {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </Field>
      );
    }
    case 'entities': {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Field label={label} description={description}>
          <div className="max-h-44 overflow-auto rounded-md border border-line bg-panel">
            {schema.entities.map((e) => {
              const Icon = getEntityIcon(e.icon);
              return (
                <label key={e.id} className="flex h-7 cursor-pointer items-center gap-2 border-b border-line px-2.5 text-sm last:border-b-0 hover:bg-hover">
                  <input type="checkbox" className="accent-[rgb(var(--c-accent))]" checked={chosen.includes(e.id)}
                    onChange={(ev) => set(ev.target.checked ? [...chosen, e.id] : chosen.filter((x) => x !== e.id))} />
                  <Icon className="h-3.5 w-3.5 text-fg-subtle" /> {e.pluralName}
                </label>
              );
            })}
          </div>
        </Field>
      );
    }
    default:
      return (
        <Field label={label} htmlFor={id} description={description}>
          <Input id={id} value={String(value ?? '')} placeholder={setting.placeholder} onChange={(e) => set(e.target.value)} />
        </Field>
      );
  }
}

function PluginDetails({ manifest, installed }: { manifest: PluginManifest; installed?: InstalledPlugin }) {
  const t = useT();
  const locale = useUiLocale();
  const schema = useClubStore((s) => s.schema);
  const secrets = useClubStore((s) => s.pluginSecrets[manifest.id]);
  const installPlugin = useClubStore((s) => s.installPlugin);
  const setPluginEnabled = useClubStore((s) => s.setPluginEnabled);
  const removePlugin = useClubStore((s) => s.removePlugin);
  const Icon = getEntityIcon(manifest.icon ?? 'Box');
  const problems = installed ? settingsProblems(schema, manifest, installed, secrets) : [];
  const contributed = manifest.contributes?.entities ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-accent"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-fg">{tr(manifest.name, locale)}</h3>
          <p className="text-2xs text-fg-subtle">
            v{manifest.version}{manifest.author ? ` · ${manifest.author}` : ''} · {isBuiltin(manifest.id) ? t('plugins.builtin') : t('plugins.thirdParty')}
          </p>
        </div>
        {installed ? (
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            {installed.enabled ? t('plugins.on') : t('plugins.off')}
            <Switch checked={installed.enabled} label={t('plugins.enabled')} onChange={(v) => setPluginEnabled(manifest.id, v)} />
          </label>
        ) : (
          <Button variant="primary" size="sm" onClick={() => installPlugin(manifest.id)}><Plug className="h-3.5 w-3.5" /> {t('plugins.install')}</Button>
        )}
      </div>
      <p className="text-sm leading-relaxed text-fg-muted">{tr(manifest.description, locale)}</p>
      <Capabilities manifest={manifest} />
      {contributed.length > 0 && (
        <p className="rounded-md border border-line bg-sunken p-2.5 text-xs text-fg-muted">
          {t('plugins.addsSections', { names: contributed.map((e) => e.pluralName).join(', ') })}
        </p>
      )}
      {installed && (manifest.settings?.length ?? 0) > 0 && (
        <Section title={t('plugins.settings')}>
          {problems.length > 0 && installed.enabled && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft p-2.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('plugins.fill')}
            </div>
          )}
          <div className="space-y-3">
            {manifest.settings!.map((s) => <SettingInput key={s.key} plugin={installed} setting={s} />)}
          </div>
        </Section>
      )}
      {installed && (
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-2xs text-fg-subtle">{t('plugins.appliesOnExport')}</span>
          <Button size="sm" variant="danger" onClick={() => removePlugin(manifest.id)}><Trash2 className="h-3.5 w-3.5" /> {t('plugins.remove')}</Button>
        </div>
      )}
    </div>
  );
}

/** Менеджер плагинов: установленные, каталог, установка из файла. */
export function PluginsDialog() {
  const t = useT();
  const locale = useUiLocale();
  const close = useWorkbench((s) => s.close);
  const initial = useWorkbench((s) => s.dialogArg);
  const plugins = useClubStore((s) => s.schema.plugins ?? []);
  const installPlugin = useClubStore((s) => s.installPlugin);
  const [selected, setSelected] = useState<string | null>(initial ?? plugins[0]?.id ?? BUILTIN_PLUGINS[0].manifest.id);
  const [pending, setPending] = useState<PluginManifest | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const catalog = useMemo(() => BUILTIN_PLUGINS.map((p) => p.manifest).filter((m) => !plugins.some((p) => p.id === m.id)), [plugins]);
  const installed = plugins.map((p) => ({ plugin: p, manifest: manifestOf(p) })).filter((x): x is { plugin: InstalledPlugin; manifest: PluginManifest } => !!x.manifest);
  const current = installed.find((x) => x.manifest.id === selected) ?? null;
  const currentCatalog = catalog.find((m) => m.id === selected) ?? null;

  const readFile = async (file: File) => {
    try {
      const result = validateManifest(JSON.parse(await file.text()));
      if (!result.ok || !result.manifest) throw new Error(result.errors.slice(0, 3).join('; '));
      setPending(result.manifest);
    } catch (err) {
      toast('error', `${t('plugins.badFile')}: ${(err as Error).message}`);
    }
  };

  const row = (id: string, manifest: PluginManifest, meta: React.ReactNode) => {
    const Icon = getEntityIcon(manifest.icon ?? 'Box');
    return (
      <button key={id} type="button" onClick={() => setSelected(id)} data-testid={`plugin-${id}`}
        className={cn('flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left', selected === id ? 'bg-accent text-accent-fg' : 'hover:bg-hover')}>
        <Icon className={cn('h-4 w-4 shrink-0', selected === id ? 'text-accent-fg' : 'text-fg-subtle')} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{tr(manifest.name, locale)}</span>
          <span className={cn('block text-2xs', selected === id ? 'text-accent-fg/80' : 'text-fg-subtle')}>{meta}</span>
        </span>
      </button>
    );
  };

  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && close()}>
      <DialogContent title={t('cmd.plugins')} description={t('plugins.desc')} icon={<Plug className="h-4 w-4" />} className="h-[min(680px,90vh)] w-[min(960px,calc(100vw-32px))]">
        <div className="flex min-h-0 flex-1">
          <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-sunken">
            <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
              <div className="px-2 pb-1 pt-1 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{t('plugins.installed')} ({installed.length})</div>
              {installed.length === 0 && <p className="px-2 py-1 text-xs text-fg-subtle">{t('plugins.none')}</p>}
              {installed.map(({ plugin, manifest }) => row(plugin.id, manifest, plugin.enabled ? t('plugins.on') : t('plugins.off')))}
              <div className="px-2 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{t('plugins.catalog')}</div>
              {catalog.length === 0 && <p className="px-2 py-1 text-xs text-fg-subtle">{t('plugins.allInstalled')}</p>}
              {catalog.map((m) => row(m.id, m, t('plugins.notInstalled')))}
            </div>
            <div className="border-t border-line p-2">
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f); }} />
              <Button size="sm" variant="secondary" className="w-full justify-center" onClick={() => fileRef.current?.click()}>
                <FileUp className="h-3.5 w-3.5" /> {t('plugins.fromFile')}
              </Button>
            </div>
          </aside>
          <div className="min-w-0 flex-1 overflow-auto p-5">
            {pending ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-semibold">{t('plugins.trustTitle')}</div>
                    <div className="mt-0.5 text-xs">{t('plugins.trustText')}</div>
                  </div>
                </div>
                <h3 className="text-base font-semibold text-fg">{tr(pending.name, locale)} <span className="text-xs font-normal text-fg-subtle">v{pending.version}{pending.author ? ` · ${pending.author}` : ''}</span></h3>
                <p className="text-sm text-fg-muted">{tr(pending.description, locale)}</p>
                <Capabilities manifest={pending} />
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => { installPlugin(pending); setSelected(pending.id); setPending(null); toast('success', t('plugins.installed1', { name: tr(pending.name, locale) })); }}>
                    {t('plugins.install')}
                  </Button>
                  <Button variant="ghost" onClick={() => setPending(null)}>{t('common.cancel')}</Button>
                </div>
              </div>
            ) : current ? (
              <PluginDetails manifest={current.manifest} installed={current.plugin} />
            ) : currentCatalog ? (
              <PluginDetails manifest={currentCatalog} />
            ) : (
              <p className="text-sm text-fg-subtle">{t('plugins.pick')}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <a className="text-2xs text-accent-text hover:underline" href="https://github.com/KiFang/facet/blob/main/docs/PLUGINS.md" target="_blank" rel="noopener noreferrer">{t('plugins.devDocs')}</a>
          <Button variant="primary" onClick={close}>{t('common.done')}</Button>
        </DialogFooter>
      </DialogContent>
    </RadixDialog.Root>
  );
}
