import { useRef } from 'react';
import { ArrowDown, ArrowUp, Flag, LayoutDashboard, LayoutTemplate, Upload, Users } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { TEMPLATES, type ClubTemplate } from '@/data/templates';
import type { DashboardWidget, Locale } from '@/types/schema';
import { getEntityIcon } from '@/lib/icons';
import { useT, type TKey } from '@/i18n';
import { validateSchema } from '@/utils/validate';
import { Input, Label } from './ui/Input';
import { Section } from './ui/Section';
import { Segmented } from './ui/Segmented';
import { Switch } from './ui/Switch';
import { Button } from './ui/Button';
import { toast } from './ui/Toast';

export function ClubInfo() {
  const t = useT();
  const clubName = useClubStore((s) => s.schema.clubName);
  const motto = useClubStore((s) => s.schema.motto);
  const locale = useClubStore((s) => s.schema.locale ?? 'ru');
  const setClubInfo = useClubStore((s) => s.setClubInfo);
  const setLocale = useClubStore((s) => s.setLocale);
  return (
    <Section title={t('club.section')} icon={<Flag className="h-3.5 w-3.5" />}>
      <div>
        <Label htmlFor="club-name" hint={`${clubName.length}/60`}>{t('club.name')}</Label>
        <Input id="club-name" maxLength={60} value={clubName} onChange={(e) => setClubInfo({ clubName: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="club-motto" hint={`${motto.length}/120`}>{t('club.motto')}</Label>
        <Input id="club-motto" maxLength={120} value={motto} onChange={(e) => setClubInfo({ motto: e.target.value })} />
      </div>
      <div>
        <Label>{t('club.portalLanguage')}</Label>
        <Segmented<Locale>
          ariaLabel={t('club.portalLanguage')}
          value={locale}
          onChange={setLocale}
          options={[{ value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }]}
        />
      </div>
    </Section>
  );
}

function applyTemplate(tpl: ClubTemplate) {
  const { schema, replaceSchema, clearSeeds } = useClubStore.getState();
  replaceSchema({ ...tpl.build(), editorMode: schema.editorMode });
  clearSeeds();
}

export function TemplateGallery() {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (tpl: ClubTemplate) => {
    applyTemplate(tpl);
    toast('info', t('templates.applied', { name: tpl.meta.title }), {
      label: t('history.undo'),
      run: () => useClubStore.temporal.getState().undo(),
    });
  };

  const importFile = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      // Принимаем и club-schema.json, и файл шаблона { meta, schema }.
      const raw = json.schema && json.meta ? json.schema : json;
      const result = validateSchema({ editorMode: 'easy', ...raw });
      if (!result.ok || !result.schema) throw new Error(result.errors.slice(0, 3).join('; '));
      const { schema, replaceSchema, clearSeeds } = useClubStore.getState();
      replaceSchema({ ...result.schema, editorMode: schema.editorMode });
      clearSeeds();
      toast('success', t('templates.imported', { name: result.schema.clubName }), {
        label: t('history.undo'),
        run: () => useClubStore.temporal.getState().undo(),
      });
    } catch (err) {
      toast('error', `${t('templates.importFailed')}: ${(err as Error).message}`);
    }
  };

  const card = (tpl: ClubTemplate) => {
    const Icon = getEntityIcon(tpl.meta.icon);
    return (
      <button
        key={tpl.id}
        type="button"
        data-template={tpl.id}
        onClick={() => pick(tpl)}
        className="group flex flex-col items-start gap-2 rounded-lg border border-line bg-sunken p-3 text-left transition-colors hover:border-accent hover:bg-accent-soft"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-hover text-fg transition-colors group-hover:bg-accent group-hover:text-accent-fg">
          <Icon className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-fg">{tpl.meta.title}</span>
          <span className="block text-xs leading-snug text-fg-subtle">{tpl.meta.description}</span>
        </span>
      </button>
    );
  };

  const builtIn = TEMPLATES.filter((x) => !x.community);
  const community = TEMPLATES.filter((x) => x.community);

  return (
    <Section
      title={t('templates.section')}
      icon={<LayoutTemplate className="h-3.5 w-3.5" />}
      action={
        <>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} title={t('templates.fromFileHint')}>
            <Upload className="h-3.5 w-3.5" /> {t('templates.fromFile')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">{builtIn.map(card)}</div>
      {community.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <Users className="h-3 w-3" /> {t('templates.community')}
          </p>
          <div className="grid grid-cols-2 gap-2">{community.map(card)}</div>
        </>
      )}
    </Section>
  );
}

const WIDGETS: { id: DashboardWidget; label: TKey }[] = [
  { id: 'stats', label: 'dashboard.stats' },
  { id: 'upcoming', label: 'dashboard.upcoming' },
  { id: 'statuses', label: 'dashboard.statuses' },
  { id: 'recent', label: 'dashboard.recent' },
];

export function DashboardSettings() {
  const t = useT();
  const dashboard = useClubStore((s) => s.schema.dashboard) ?? { enabled: true, widgets: [] };
  const setDashboard = useClubStore((s) => s.setDashboard);
  const order = [...dashboard.widgets, ...WIDGETS.map((w) => w.id).filter((id) => !dashboard.widgets.includes(id))];

  const toggle = (id: DashboardWidget, on: boolean) =>
    setDashboard({ ...dashboard, widgets: on ? order.filter((w) => w === id || dashboard.widgets.includes(w)) : dashboard.widgets.filter((w) => w !== id) });
  const move = (id: DashboardWidget, dir: -1 | 1) => {
    const list = [...dashboard.widgets];
    const i = list.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setDashboard({ ...dashboard, widgets: list });
  };

  return (
    <Section
      title={t('dashboard.section')}
      icon={<LayoutDashboard className="h-3.5 w-3.5" />}
      action={<Switch checked={dashboard.enabled} label={t('dashboard.enabled')} onChange={(enabled) => setDashboard({ ...dashboard, enabled })} />}
    >
      <p className="text-xs text-fg-subtle">{t('dashboard.hint')}</p>
      {dashboard.enabled && (
        <div className="space-y-1.5">
          {order.map((id) => {
            const on = dashboard.widgets.includes(id);
            const idx = dashboard.widgets.indexOf(id);
            return (
              <div key={id} className="flex items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-1.5">
                <Switch checked={on} label={t(WIDGETS.find((w) => w.id === id)!.label)} onChange={(v) => toggle(id, v)} />
                <span className={on ? 'flex-1 text-sm text-fg' : 'flex-1 text-sm text-fg-subtle'}>{t(WIDGETS.find((w) => w.id === id)!.label)}</span>
                <Button size="icon" variant="ghost" aria-label={t('common.up')} disabled={!on || idx === 0} onClick={() => move(id, -1)}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={t('common.down')} disabled={!on || idx === dashboard.widgets.length - 1} onClick={() => move(id, 1)}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
