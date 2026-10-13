import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileJson, RotateCcw, Upload, XCircle } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { validateSchema } from '@/utils/validate';
import { generateSchemaJson } from '@/utils/exporter';
import { Button } from './ui/Button';
import { Textarea } from './ui/Input';

/** Pro Mode: прямое редактирование club-schema.json с валидацией. */
export function SchemaEditor() {
  const schema = useClubStore((s) => s.schema);
  const replaceSchema = useClubStore((s) => s.replaceSchema);
  const setActiveEntity = useClubStore((s) => s.setActiveEntity);
  const activeEntityId = useClubStore((s) => s.activeEntityId);
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
      setErrors([`Синтаксис JSON: ${(e as Error).message}`]);
      return;
    }
    const result = validateSchema(parsed);
    if (!result.ok || !result.schema) {
      setErrors(result.errors);
      return;
    }
    const keep = activeEntityId;
    replaceSchema(result.schema);
    if (keep && result.schema.entities.some((e) => e.id === keep)) setActiveEntity(keep);
    setErrors([]);
    setDirty(false);
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    setDraft(text);
    setDirty(true);
    apply(text);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-xs text-zinc-400">
          <FileJson className="h-3.5 w-3.5 text-violet-400" /> club-schema.json
        </span>
        <div className="flex gap-1">
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = ''; }} />
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Импорт
          </Button>
          <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => { setDraft(serialized); setDirty(false); setErrors([]); }}>
            <RotateCcw className="h-3.5 w-3.5" /> Сброс
          </Button>
          <Button size="sm" variant="primary" disabled={!dirty} onClick={() => apply(draft)}>
            Применить
          </Button>
        </div>
      </div>
      <Textarea
        value={draft}
        spellCheck={false}
        aria-label="JSON схемы клуба"
        onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); apply(draft); }
        }}
        className="min-h-[420px] flex-1 resize-none font-mono text-[12px] leading-relaxed"
      />
      {errors.length > 0 ? (
        <div className="max-h-40 overflow-auto rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><XCircle className="h-3.5 w-3.5" /> Схема не применена</div>
          <ul className="list-disc space-y-0.5 pl-5 font-mono">
            {errors.map((err) => <li key={err}>{err}</li>)}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          {dirty ? 'Есть несохранённые правки — Ctrl/⌘ + Enter, чтобы применить' : 'Схема синхронизирована с визуальным редактором'}
        </p>
      )}
    </div>
  );
}
