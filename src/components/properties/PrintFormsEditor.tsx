import { useRef } from 'react';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { useT, useUiLocale } from '@/i18n';
import { uniqueId } from '@/lib/id';
import type { ClubEntity, PrintForm } from '@/types/schema';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';

const SPECIAL = { ru: ['клуб', 'сегодня', 'сотрудник', 'номер'], en: ['club', 'today', 'user', 'number'] } as const;

/** Печатные формы раздела: шаблон с подстановками {{поле}}. */
export function PrintFormsEditor({ entity }: { entity: ClubEntity }) {
  const t = useT();
  const locale = useUiLocale();
  const updateEntity = useClubStore((s) => s.updateEntity);
  const forms = entity.printForms ?? [];
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const set = (next: PrintForm[]) => updateEntity(entity.id, { printForms: next.length ? next : undefined });
  const patch = (id: string, p: Partial<PrintForm>) => set(forms.map((f) => (f.id === id ? { ...f, ...p } : f)));

  const insert = (form: PrintForm, token: string) => {
    const el = areas.current[form.id];
    const text = `{{${token}}}`;
    const at = el ? el.selectionStart : form.body.length;
    const next = form.body.slice(0, at) + text + form.body.slice(el ? el.selectionEnd : at);
    patch(form.id, { body: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + text.length, at + text.length);
    });
  };

  const add = () => {
    const title = entity.fields[0]?.name ?? 'title';
    set([...forms, {
      id: uniqueId('form', forms.map((f) => f.id)),
      name: t('pf.newName'),
      body: `# ${entity.name} № {{${SPECIAL[locale][3]}}}\n{{${SPECIAL[locale][0]}}}, {{${SPECIAL[locale][1]}}}\n\n**{{${title}}}**\n\n---\n\n${t('pf.signature')}: ______________________`,
    }]);
  };

  return (
    <div className="space-y-3">
      <p className="text-2xs text-fg-subtle">{t('pf.hint')}</p>
      {forms.map((f) => (
        <div key={f.id} className="space-y-1.5 rounded-md border border-line bg-panel p-2.5" data-testid={`pf-${f.id}`}>
          <div className="flex items-center gap-1.5">
            <Printer className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
            <Input value={f.name} aria-label={t('pf.name')} className="h-7 min-w-0 flex-1 text-xs" onChange={(e) => patch(f.id, { name: e.target.value })} />
            <Button size="icon-sm" variant="danger" aria-label={t('common.delete')} onClick={() => set(forms.filter((x) => x.id !== f.id))}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
          <Textarea
            ref={(el) => { areas.current[f.id] = el; }}
            value={f.body}
            rows={8}
            aria-label={t('pf.body')}
            className="font-mono text-2xs"
            onChange={(e) => patch(f.id, { body: e.target.value })}
          />
          <div className="flex flex-wrap gap-1">
            {[...entity.fields.map((x) => x.name), ...SPECIAL[locale]].map((token) => (
              <button key={token} type="button" onClick={() => insert(f, token)} className="rounded border border-line bg-sunken px-1.5 py-0.5 text-2xs text-fg-muted hover:border-accent hover:text-accent-text">
                {`{{${token}}}`}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={add} data-testid="pf-add"><Plus className="h-3.5 w-3.5" /> {t('pf.add')}</Button>
    </div>
  );
}
