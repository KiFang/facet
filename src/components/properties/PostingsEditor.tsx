import { Plus, Trash2 } from 'lucide-react';
import { useClubStore, NONE } from '@/store/useClubStore';
import { useWorkbench } from '@/store/useWorkbench';
import { useT } from '@/i18n';
import type { ClubEntity, Posting, PostingDirection } from '@/types/schema';
import { Button } from '../ui/Button';
import { Select } from '../ui/Input';
import { Segmented } from '../ui/Segmented';

type DirMode = 'in' | 'out' | 'field';

/** Правила проведения операции: в какой регистр, приход или расход, какие поля — измерения и ресурсы. */
export function PostingsEditor({ entity }: { entity: ClubEntity }) {
  const t = useT();
  const registers = useClubStore((s) => s.schema.registers ?? NONE);
  const updateEntity = useClubStore((s) => s.updateEntity);
  const open = useWorkbench((s) => s.open);
  const postings = entity.postings ?? [];
  const set = (next: Posting[]) => updateEntity(entity.id, { postings: next });
  const patch = (i: number, p: Partial<Posting>) => set(postings.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const numberFields = entity.fields.filter((f) => f.type === 'number');
  const choiceFields = entity.fields.filter((f) => f.type === 'select' || f.type === 'status');
  const dateFields = entity.fields.filter((f) => f.type === 'date');

  const add = () => {
    const reg = registers.find((r) => !postings.some((p) => p.register === r.id)) ?? registers[0];
    if (!reg) return;
    set([...postings, {
      register: reg.id,
      direction: 'in',
      dimensions: Object.fromEntries(reg.dimensions.map((d) => [d.id, entity.fields.find((f) => f.type === 'relation' && f.targetEntityId === d.target)?.id ?? ''])),
      resources: Object.fromEntries(reg.resources.map((r) => [r.id, numberFields[0]?.id ?? '1'])),
      dateField: dateFields[0]?.id,
    }]);
  };

  if (!registers.length) {
    return (
      <div className="rounded-md border border-dashed border-line-strong p-3 text-xs text-fg-muted">
        {t('posting.noRegisters')}
        <div className="mt-2"><Button size="sm" onClick={() => open('newModule', 'accounting')}>{t('nav.addAccounting')}</Button></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {postings.map((p, i) => {
        const reg = registers.find((r) => r.id === p.register);
        const mode: DirMode = typeof p.direction === 'object' ? 'field' : p.direction;
        const dirField = typeof p.direction === 'object' ? entity.fields.find((f) => f.id === (p.direction as { field: string }).field) : undefined;
        const setMode = (m: DirMode) => {
          if (m === 'field') {
            const f = choiceFields[0];
            const opts = f?.options ?? [];
            patch(i, { direction: { field: f?.id ?? '', in: opts.slice(0, 1), out: opts.slice(1, 2) } });
          } else patch(i, { direction: m });
        };
        const optionSide = (opt: string): 'in' | 'out' | 'none' => {
          const d = p.direction as Exclude<PostingDirection, string>;
          return d.in.includes(opt) ? 'in' : d.out.includes(opt) ? 'out' : 'none';
        };
        const setOptionSide = (opt: string, side: 'in' | 'out' | 'none') => {
          const d = p.direction as Exclude<PostingDirection, string>;
          patch(i, { direction: { field: d.field, in: [...d.in.filter((x) => x !== opt), ...(side === 'in' ? [opt] : [])], out: [...d.out.filter((x) => x !== opt), ...(side === 'out' ? [opt] : [])] } });
        };
        return (
          <div key={i} className="space-y-2 rounded-md border border-line bg-panel p-2.5" data-testid={`posting-${i}`}>
            <div className="flex items-center gap-1.5">
              <span className="text-2xs font-medium text-fg-muted">{t('posting.register')}</span>
              <Select value={p.register} aria-label={t('posting.register')} className="h-7 min-w-0 flex-1 text-xs" onChange={(e) => patch(i, { register: e.target.value })}>
                {registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
              <Button size="icon-sm" variant="danger" aria-label={t('common.delete')} onClick={() => set(postings.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>

            <div className="space-y-1">
              <div className="text-2xs font-medium text-fg-muted">{t('posting.direction')}</div>
              <Segmented size="sm" ariaLabel={t('posting.direction')} value={mode} onChange={setMode}
                options={[{ value: 'in', label: t('posting.in') }, { value: 'out', label: t('posting.out') }, { value: 'field', label: t('posting.byField'), ariaLabel: t('posting.byField') }]} />
              {mode === 'field' && (
                <div className="space-y-1 pt-1">
                  <Select value={dirField?.id ?? ''} aria-label={t('posting.dirField')} className="h-7 text-xs"
                    onChange={(e) => {
                      const f = entity.fields.find((x) => x.id === e.target.value);
                      patch(i, { direction: { field: e.target.value, in: f?.options?.slice(0, 1) ?? [], out: f?.options?.slice(1, 2) ?? [] } });
                    }}>
                    <option value="">{t('posting.chooseField')}</option>
                    {choiceFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </Select>
                  {(dirField?.options ?? []).map((opt) => (
                    <div key={opt} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-fg">{opt}</span>
                      <Select value={optionSide(opt)} aria-label={opt} className="h-7 w-32 text-xs" onChange={(e) => setOptionSide(opt, e.target.value as 'in' | 'out' | 'none')}>
                        <option value="in">{t('posting.in')}</option>
                        <option value="out">{t('posting.out')}</option>
                        <option value="none">{t('posting.skip')}</option>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {reg && (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-1.5 text-xs">
                {reg.dimensions.map((d) => (
                  <Row key={d.id} label={d.name}>
                    <Select value={p.dimensions[d.id] ?? ''} aria-label={d.name} className="h-7 text-xs" onChange={(e) => patch(i, { dimensions: { ...p.dimensions, [d.id]: e.target.value } })}>
                      <option value="">{t('posting.chooseField')}</option>
                      {entity.fields
                        .filter((f) => (d.target ? f.type === 'relation' && f.targetEntityId === d.target : f.type !== 'relation' && f.type !== 'file'))
                        .map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </Select>
                  </Row>
                ))}
                {reg.resources.map((r) => (
                  <Row key={r.id} label={r.name}>
                    <Select value={p.resources[r.id] ?? ''} aria-label={r.name} className="h-7 text-xs" onChange={(e) => patch(i, { resources: { ...p.resources, [r.id]: e.target.value } })}>
                      <option value="">{t('posting.chooseField')}</option>
                      {numberFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      <option value="1">{t('posting.one')}</option>
                    </Select>
                  </Row>
                ))}
                <Row label={t('posting.date')}>
                  <Select value={p.dateField ?? ''} aria-label={t('posting.date')} className="h-7 text-xs" onChange={(e) => patch(i, { dateField: e.target.value || undefined })}>
                    <option value="">{t('posting.created')}</option>
                    {dateFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </Select>
                </Row>
              </div>
            )}
          </div>
        );
      })}
      <Button size="sm" variant="ghost" onClick={add} data-testid="posting-add"><Plus className="h-3.5 w-3.5" /> {t('posting.add')}</Button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="truncate text-fg-muted" title={label}>{label}</span>
      {children}
    </>
  );
}
