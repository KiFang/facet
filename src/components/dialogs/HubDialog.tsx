import { useEffect, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { CircleAlert, ExternalLink, KeyRound, Landmark, Loader2, RefreshCcw, ShieldCheck, Unlink } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useHubLink } from '@/store/useHubLink';
import { useWorkbench } from '@/store/useWorkbench';
import { useT, useUiLocale } from '@/i18n';
import { slugify } from '@/lib/id';
import { cn } from '@/lib/cn';
import { HubError, hubInfo, joinHub, linkByToken, normalizeHubUrl, updateInHub, type HubChange, type HubInfo, type HubUpdateResult } from '@/hub/client';
import { DialogContent, DialogFooter } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Input';
import { Segmented } from '../ui/Segmented';
import { toast } from '../ui/Toast';

function useErrorText() {
  const t = useT();
  return (err: unknown) => {
    if (err instanceof HubError && err.status === 0) return t(err.message === 'not-a-hub' ? 'hub.notHub' : 'hub.unreachable');
    return err instanceof Error ? err.message : String(err);
  };
}

function Changes({ changes }: { changes: HubChange[] }) {
  return (
    <ul className="max-h-48 space-y-1 overflow-auto rounded-md border border-line bg-sunken p-2 text-xs">
      {changes.map((c, i) => (
        <li key={i} className={cn('flex gap-2', c.severity === 'danger' ? 'text-danger' : c.severity === 'warning' ? 'text-warning' : 'text-fg')}>
          <span className="w-3 shrink-0 font-mono">{c.severity === 'danger' ? '✗' : c.severity === 'warning' ? '!' : '+'}</span>
          <span>{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Подключение клуба к хабу вуза и обновление системы в хабе. */
export function HubDialog() {
  const t = useT();
  const close = useWorkbench((s) => s.close);
  const link = useHubLink((s) => s.link);
  return (
    <RadixDialog.Root open onOpenChange={(o) => !o && close()}>
      <DialogContent title={t('hub.title')} description={t('hub.desc')} icon={<Landmark className="h-4 w-4" />} className="w-[min(560px,calc(100vw-32px))]">
        {link ? <Linked /> : <Connect />}
      </DialogContent>
    </RadixDialog.Root>
  );
}

function Connect() {
  const t = useT();
  const errorText = useErrorText();
  const schema = useClubStore((s) => s.schema);
  const seeds = useClubStore((s) => s.seeds);
  const secrets = useClubStore((s) => s.pluginSecrets);
  const setLink = useHubLink((s) => s.setLink);
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState<HubInfo | null>(null);
  const [mode, setMode] = useState<'new' | 'key'>('new');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ invite: '', slug: slugify(schema.clubName).replace(/_/g, '-'), name: '', email: '', password: '', token: '', withSeeds: true });
  const seedCount = Object.values(seeds).reduce((n, b) => n + b.rows.length, 0);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const hub = normalizeHubUrl(url);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const check = () => run(async () => setInfo(await hubInfo(hub)));
  const join = () => run(async () => {
    const res = await joinHub(hub, {
      invite: form.invite.trim(),
      slug: form.slug.trim(),
      schema,
      seeds: form.withSeeds ? seeds : {},
      secrets,
      chair: { name: form.name.trim(), email: form.email.trim(), password: form.password },
    });
    setLink(res);
    toast('success', t(res.status === 'pending' ? 'hub.requested' : 'hub.joined'));
  });
  const useKey = () => run(async () => {
    const { schema: _remote, ...res } = await linkByToken(hub, form.token.trim());
    setLink(res);
    toast('success', t('hub.joined'));
  });

  const canJoin = info?.allowEditorUpload && form.slug.length >= 3 && /\S+@\S+/.test(form.email) && form.password.length >= 8 && (info.joinMode !== 'invite' || form.invite.trim());

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-5">
        <div>
          <Label htmlFor="hub-url" hint={t('hub.addressHint')}>{t('hub.address')}</Label>
          <div className="flex gap-2">
            <Input id="hub-url" data-testid="hub-url" value={url} onChange={(e) => { setUrl(e.target.value); setInfo(null); }} onKeyDown={(e) => e.key === 'Enter' && hub && void check()} placeholder="https://clubs.univer.ru" autoFocus />
            <Button onClick={check} disabled={!hub || busy} data-testid="hub-check">{busy && !info ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{t('hub.check')}</Button>
          </div>
        </div>

        {info && (
          <>
            <div className="rounded-md border border-line bg-sunken p-3 text-xs">
              <div className="text-sm font-semibold text-fg">{info.name}</div>
              {info.university && <div className="text-fg-muted">{info.university}</div>}
              <p className="mt-2 flex gap-1.5 text-fg-muted"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" /> {t(info.universityAccess === 'full' ? 'hub.policyFull' : 'hub.policyReports')}</p>
            </div>
            <Segmented
              ariaLabel={t('hub.title')}
              value={mode}
              onChange={(v) => setMode(v as 'new' | 'key')}
              options={[{ value: 'new', label: t('hub.modeNew') }, { value: 'key', label: t('hub.modeKey') }]}
            />
            {mode === 'new' ? (
              info.allowEditorUpload ? (
                <div className="grid grid-cols-2 gap-3">
                  {info.joinMode === 'invite' && (
                    <div className="col-span-2">
                      <Label htmlFor="hub-invite">{t('hub.invite')}</Label>
                      <Input id="hub-invite" data-testid="hub-invite" value={form.invite} onChange={(e) => set({ invite: e.target.value })} placeholder="inv_…" />
                    </div>
                  )}
                  <div className="col-span-2">
                    <Label htmlFor="hub-slug" hint={`${hub}/c/${form.slug || '…'}/`}>{t('hub.slug')}</Label>
                    <Input id="hub-slug" data-testid="hub-slug" value={form.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
                  </div>
                  <div>
                    <Label htmlFor="hub-name">{t('hub.chairName')}</Label>
                    <Input id="hub-name" value={form.name} onChange={(e) => set({ name: e.target.value })} autoComplete="name" />
                  </div>
                  <div>
                    <Label htmlFor="hub-email" hint={info.allowedEmailDomains.length ? `@${info.allowedEmailDomains.join(', @')}` : undefined}>{t('hub.chairEmail')}</Label>
                    <Input id="hub-email" data-testid="hub-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="hub-password">{t('hub.chairPassword')}</Label>
                    <Input id="hub-password" data-testid="hub-password" type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" minLength={8} />
                  </div>
                  {seedCount > 0 && (
                    <label className="col-span-2 flex items-center gap-2 text-xs text-fg">
                      <input type="checkbox" checked={form.withSeeds} onChange={(e) => set({ withSeeds: e.target.checked })} /> {t('hub.withSeeds', { n: seedCount })}
                    </label>
                  )}
                </div>
              ) : (
                <p className="text-xs text-fg-muted">{t('hub.noUpload')}</p>
              )
            ) : (
              <div>
                <Label htmlFor="hub-token" hint={t('hub.tokenHint')}>{t('hub.token')}</Label>
                <Input id="hub-token" data-testid="hub-token" value={form.token} onChange={(e) => set({ token: e.target.value })} placeholder="fct_…" />
              </div>
            )}
          </>
        )}
        {error && <p role="alert" className="flex gap-1.5 text-xs text-danger"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}</p>}
      </div>
      <DialogFooter>
        <span className="text-2xs text-fg-subtle">{t('hub.keyNote')}</span>
        {info && (mode === 'new' ? (
          <Button variant="primary" onClick={join} disabled={!canJoin || busy} data-testid="hub-join">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {t(info.joinMode === 'approve' ? 'hub.sendRequest' : 'hub.join')}
          </Button>
        ) : (
          <Button variant="primary" onClick={useKey} disabled={!form.token.trim() || busy} data-testid="hub-use-key"><KeyRound className="h-3.5 w-3.5" /> {t('hub.useKey')}</Button>
        ))}
      </DialogFooter>
    </>
  );
}

function Linked() {
  const t = useT();
  const locale = useUiLocale();
  const errorText = useErrorText();
  const schema = useClubStore((s) => s.schema);
  const secrets = useClubStore((s) => s.pluginSecrets);
  const link = useHubLink((s) => s.link)!;
  const setLink = useHubLink((s) => s.setLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<HubUpdateResult | null>(null);
  const [accept, setAccept] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  // Статус клуба (одобрена ли заявка) и актуальное имя.
  useEffect(() => {
    void linkByToken(link.hub, link.token)
      .then(({ schema: _s, ...fresh }) => setLink({ ...link, ...fresh }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Схема поменялась — прежний список изменений устарел.
  useEffect(() => setPreview(null), [schema]);

  const check = () => run(async () => {
    setAccept(false);
    setPreview(await updateInHub(link, { schema, secrets, dryRun: true, locale }));
  });
  const apply = () => run(async () => {
    const res = await updateInHub(link, { schema, secrets, dryRun: false, accept, locale });
    setPreview(res);
    if (res.applied) toast('success', t('hub.updated'));
  });

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-5">
        <div className="rounded-md border border-line bg-sunken p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-fg">
            {link.name}
            <span className={cn('rounded-full border px-1.5 text-2xs font-normal', link.status === 'active' ? 'border-success text-success' : 'border-warning text-warning')} data-testid="hub-status">
              {t(`hub.status.${link.status}` as 'hub.status.active')}
            </span>
          </div>
          <a href={link.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-accent-text hover:underline">{link.url} <ExternalLink className="h-3 w-3" /></a>
          {link.status === 'pending' && <p className="mt-2 text-xs text-fg-muted">{t('hub.pendingNote')}</p>}
        </div>

        {preview && (preview.same || !preview.changes.length ? (
          <p className="text-xs text-fg-muted" data-testid="hub-same">{preview.applied ? t('hub.updated') : t(preview.same ? 'hub.noChanges' : 'hub.onlyPortal')}</p>
        ) : (
          <div className="space-y-2" data-testid="hub-changes">
            <div className="text-xs font-medium text-fg-muted">{preview.applied ? t('hub.updated') : t('hub.changes')}</div>
            <Changes changes={preview.changes} />
            {preview.danger && !preview.applied && (
              <label className="flex items-start gap-2 text-xs text-danger">
                <input type="checkbox" className="mt-0.5" checked={accept} onChange={(e) => setAccept(e.target.checked)} /> {t('hub.dangerAccept')}
              </label>
            )}
          </div>
        ))}
        {error && <p role="alert" className="flex gap-1.5 text-xs text-danger"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}</p>}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={() => window.confirm(t('hub.unlinkConfirm')) && setLink(null)}><Unlink className="h-3.5 w-3.5" /> {t('hub.unlink')}</Button>
        <div className="flex gap-2">
          <Button onClick={check} disabled={busy || link.status !== 'active'} data-testid="hub-preview">{t('hub.preview')}</Button>
          <Button
            variant="primary"
            onClick={apply}
            disabled={busy || link.status !== 'active' || !preview || preview.applied || preview.same || (preview.danger && !accept)}
            data-testid="hub-apply"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} {t('hub.apply')}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
