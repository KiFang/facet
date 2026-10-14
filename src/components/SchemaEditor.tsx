import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileJson, RotateCcw, Upload, XCircle } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { validateSchema } from '@/utils/validate';
import { generateSchemaJson } from '@/utils/schemaJson';
import { useT } from '@/i18n';
import { Button } from './ui/Button';
import { Textarea } from './ui/Input';

/** Pro Mode: прямое редактирование club-schema.json с валидацией. */
export function SchemaEditor() {
  const t = useT();
  const schema = useClubStore((s) => s.schema);
  const replaceSchema = useClubStore((s) => s.replaceSchema);
  const serialized = generateSchemaJson(schema);
  const [draft, setDraft] = useState(serialized);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dirty) setDraft(serialized);
  }, [serialized, dirty]);

  const apply = (text: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setErrors([`JSON: ${(e as Error).message}`]);
      return;
    }
    const result = validateSchema(parsed);
    if (!result.ok || !result.schema) {
      setErrors(result.errors);
      return;
    }
    replaceSchema(result.schema);
    setErrors([]);
    setDirty(false);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-xs text-fg-muted">
          <FileJson className="h-3.5 w-3.5 text-accent" /> club-schema.json
        </span>
        <div className="flex gap-1">
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const text = await f.text();
              setDraft(text);
              setDirty(true);
              apply(text);
            }} />
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> {t('json.import')}
          </Button>
          <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => { setDraft(serialized); setDirty(false); setErrors([]); }}>
            <RotateCcw className="h-3.5 w-3.5" /> {t('json.reset')}
          </Button>
          <Button size="sm" variant="primary" disabled={!dirty} onClick={() => apply(draft)}>{t('json.apply')}</Button>
        </div>
      </div>
      <Textarea
        value={draft}
        spellCheck={false}
        aria-label={t('json.label')}
        onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); apply(draft); }
        }}
        className="min-h-[420px] flex-1 resize-none font-mono text-[12px] leading-relaxed"
      />
      {errors.length > 0 ? (
        <div className="max-h-40 overflow-auto rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><XCircle className="h-3.5 w-3.5" /> {t('json.notApplied')}</div>
          <ul className="list-disc space-y-0.5 pl-5 font-mono">{errors.map((err) => <li key={err}>{err}</li>)}</ul>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          {dirty ? t('json.dirty') : t('json.synced')}
        </p>
      )}
    </div>
  );
}
