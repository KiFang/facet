import { Plus, Trash2 } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useT } from '@/i18n';
import type { BasisRule, ClubEntity } from '@/types/schema';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';

/** Правила «ввода на основании»: из записи какого раздела создаётся запись этого и что в ней заполнить. */
export function BasisEditor({ entity }: { entity: ClubEntity }) {
  const t = useT();
  const entities = useClubStore((s) => s.schema.entities);
  const updateEntity = useClubStore((s) => s.updateEntity);
  const rules = entity.basedOn ?? [];
  const set = (next: BasisRule[]) => updateEntity(entity.id, { basedOn: next.length ? next : undefined });
  const patch = (i: number, p: Partial<BasisRule>) => set(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const choice = entity.fields.filter((f) => f.type === 'select' || f.type === 'status');

  return (
    <div className="space-y-2">
      <p className="text-2xs text-fg-subtle">{t('basis.hint')}</p>
      {rules.map((r, i) => {
        const [field, value] = Object.entries(r.set ?? {})[0] ?? ['', ''];
        const options = choice.find((f) => f.id === field)?.options ?? [];
        return (
          <div key={i} className="space-y-1.5 rounded-md border border-line bg-panel p-2.5" data-testid={`basis-${i}`}>
            <div className="flex items-center gap-1.5">
              <span className="w-20 shrink-0 text-2xs text-fg-muted">{t('basis.from')}</span>
              <Select value={r.from} aria-label={t('basis.from')} className="h-7 min-w-0 flex-1 text-xs" onChange={(e) => patch(i, { from: e.target.value })}>
                {entities.map((e) => <option key={e.id} value={e.id}>{e.pluralName}</option>)}
              </Select>
              <Button size="icon-sm" variant="danger" aria-label={t('common.delete')} onClick={() => set(rules.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-20 shrink-0 text-2xs text-fg-muted">{t('basis.label')}</span>
              <Input value={r.label} aria-label={t('basis.label')} className="h-7 min-w-0 flex-1 text-xs" onChange={(e) => patch(i, { label: e.target.value })} />
            </div>
            {choice.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="w-20 shrink-0 text-2xs text-fg-muted">{t('basis.set')}</span>
                <Select value={field} aria-label={t('basis.set')} className="h-7 min-w-0 flex-1 text-xs"
                  onChange={(e) => {
                    const f = choice.find((x) => x.id === e.target.value);
                    patch(i, { set: f ? { [f.id]: f.options?.[0] ?? '' } : undefined });
                  }}>
                  <option value="">{t('basis.nothing')}</option>
                  {choice.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
                {field && (
                  <Select value={value} aria-label={t('basis.value')} className="h-7 w-32 text-xs" onChange={(e) => patch(i, { set: { [field]: e.target.value } })}>
                    {options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                )}
              </div>
            )}
          </div>
        );
      })}
      <Button size="sm" variant="ghost" onClick={() => set([...rules, { from: entity.id, label: t('basis.newLabel') }])}><Plus className="h-3.5 w-3.5" /> {t('basis.add')}</Button>
    </div>
  );
}
