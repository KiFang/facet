import { ArrowRightLeft, Plus, Trash2, Wallet } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useSettings } from '@/store/useSettings';
import { useWorkbench } from '@/store/useWorkbench';
import { useT } from '@/i18n';
import { getEntityIcon } from '@/lib/icons';
import { slugify, uniqueId } from '@/lib/id';
import { postingProblems } from '@/utils/registers';
import type { ClubRegister } from '@/types/schema';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Input';
import { Section } from '../ui/Section';
import { Switch } from '../ui/Switch';
import { PropertyPage } from './PropertyPage';

export const registerIcon = (name?: string) => (name === 'ArrowRightLeft' ? ArrowRightLeft : Wallet);

export function RegisterProperties({ register }: { register: ClubRegister }) {
  const t = useT();
  const schema = useClubStore((s) => s.schema);
  const updateRegister = useClubStore((s) => s.updateRegister);
  const removeRegister = useClubStore((s) => s.removeRegister);
  const renameRegisterId = useClubStore((s) => s.renameRegisterId);
  const select = useWorkbench((s) => s.select);
  const mode = schema.editorMode;
  const Icon = registerIcon(register.icon);
  const ops = schema.entities.filter((e) => e.postings?.some((p) => p.register === register.id));
  const problems = postingProblems(schema).filter((p) => p.includes(register.name));

  const patchDim = (i: number, patch: Partial<ClubRegister['dimensions'][number]>) =>
    updateRegister(register.id, { dimensions: register.dimensions.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const patchRes = (i: number, patch: Partial<ClubRegister['resources'][number]>) =>
    updateRegister(register.id, { resources: register.resources.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const remove = () => {
    if (useSettings.getState().confirmDeletes && !window.confirm(t('reg.confirmRemove', { name: register.name }))) return;
    removeRegister(register.id);
    select({ kind: 'club' });
  };

  return (
    <PropertyPage
      icon={<Icon className="h-4 w-4" />}
      title={register.name}
      subtitle={t('reg.subtitle')}
      help="accounting"
      actions={<Button size="icon-sm" variant="danger" aria-label={t('reg.remove', { name: register.name })} onClick={remove}><Trash2 className="h-3.5 w-3.5" /></Button>}
    >
      <Section title={t('props.general')}>
        <Field label={t('reg.name')} htmlFor="reg-name">
          <Input id="reg-name" value={register.name} onChange={(e) => updateRegister(register.id, { name: e.target.value })} />
        </Field>
        {mode === 'pro' && (
          <Field label={t('entity.systemId')} htmlFor="reg-id" description={t('reg.idHint')}>
            <Input id="reg-id" value={register.id} onChange={(e) => {
              const next = slugify(e.target.value);
              if (next) renameRegisterId(register.id, next);
            }} />
          </Field>
        )}
        <label className="flex items-center justify-between gap-3 rounded-md border border-line px-2.5 py-2">
          <span>
            <span className="block text-xs text-fg">{t('reg.noNegative')}</span>
            <span className="block text-2xs text-fg-subtle">{t('reg.noNegativeHint')}</span>
          </span>
          <Switch checked={!!register.noNegative} label={t('reg.noNegative')} onChange={(v) => updateRegister(register.id, { noNegative: v || undefined })} />
        </label>
      </Section>

      <Section
        title={t('reg.dimensions')}
        action={<Button size="xs" variant="ghost" onClick={() => updateRegister(register.id, { dimensions: [...register.dimensions, { id: uniqueId('dim', register.dimensions.map((d) => d.id)), name: t('reg.newDimension') }] })}><Plus className="h-3.5 w-3.5" /> {t('reg.add')}</Button>}
      >
        <p className="text-2xs text-fg-subtle">{t('reg.dimensionsHint')}</p>
        <div className="space-y-1.5">
          {register.dimensions.map((d, i) => (
            <div key={d.id} className="flex items-center gap-1.5">
              <Input value={d.name} aria-label={t('reg.dimName')} className="h-7 min-w-0 flex-1 text-xs" onChange={(e) => patchDim(i, { name: e.target.value })} />
              <Select value={d.target ?? ''} aria-label={t('reg.dimTarget')} className="h-7 w-40 text-xs" onChange={(e) => patchDim(i, { target: e.target.value || undefined })}>
                <option value="">{t('reg.dimText')}</option>
                {schema.entities.filter((e) => e.kind !== 'operation').map((e) => <option key={e.id} value={e.id}>{e.pluralName}</option>)}
              </Select>
              <Button size="icon-sm" variant="danger" disabled={register.dimensions.length <= 1} aria-label={t('common.delete')} onClick={() => updateRegister(register.id, { dimensions: register.dimensions.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title={t('reg.resources')}
        action={<Button size="xs" variant="ghost" onClick={() => updateRegister(register.id, { resources: [...register.resources, { id: uniqueId('res', register.resources.map((r) => r.id)), name: t('reg.newResource') }] })}><Plus className="h-3.5 w-3.5" /> {t('reg.add')}</Button>}
      >
        <p className="text-2xs text-fg-subtle">{t('reg.resourcesHint')}</p>
        <div className="space-y-1.5">
          {register.resources.map((r, i) => (
            <div key={r.id} className="flex items-center gap-1.5">
              <Input value={r.name} aria-label={t('reg.resName')} className="h-7 min-w-0 flex-1 text-xs" onChange={(e) => patchRes(i, { name: e.target.value })} />
              <label className="flex items-center gap-1.5 text-2xs text-fg-muted">
                <Switch checked={!!r.money} label={t('reg.money')} onChange={(v) => patchRes(i, { money: v || undefined })} />
                {t('reg.money')}
              </label>
              <Button size="icon-sm" variant="danger" disabled={register.resources.length <= 1} aria-label={t('common.delete')} onClick={() => updateRegister(register.id, { resources: register.resources.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('reg.operations')}>
        {ops.length ? (
          <div className="rounded-md border border-line bg-panel">
            {ops.map((e) => {
              const EIcon = getEntityIcon(e.icon);
              return (
                <button key={e.id} type="button" onClick={() => select({ kind: 'entity', id: e.id })} className="flex w-full items-center gap-2 border-b border-line px-2.5 py-2 text-left text-sm last:border-b-0 hover:bg-hover">
                  <EIcon className="h-3.5 w-3.5 text-fg-subtle" /> {e.pluralName}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-line-strong p-3 text-xs text-fg-muted">{t('reg.noOperations')}</p>
        )}
        {problems.map((p) => <p key={p} className="text-2xs text-warning">{p}</p>)}
      </Section>
    </PropertyPage>
  );
}
