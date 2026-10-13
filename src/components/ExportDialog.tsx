import { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, FolderTree, Loader2, Package } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { buildExportFiles, downloadSingleFile, downloadZip, exportFolderName } from '@/utils/exporter';
import { validateSchema } from '@/utils/validate';
import { cn } from '@/lib/cn';
import { Button } from './ui/Button';
import { DialogContent } from './ui/Dialog';

/** Содержимое диалога «Экспорт в Self-Host». Монтируется при открытии — файлы генерируются заново. */
export function ExportDialogContent() {
  const schema = useClubStore((s) => s.schema);
  const files = useMemo(() => buildExportFiles(schema), [schema]);
  const validation = useMemo(() => validateSchema(schema), [schema]);
  const [selected, setSelected] = useState(files[0].path);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const file = files.find((f) => f.path === selected) ?? files[0];
  const folder = exportFolderName(schema);

  const copy = async () => {
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <DialogContent title="Экспорт в Self-Host" description={`Готовый к запуску портал: ${folder}.zip — PocketBase + Nginx в Docker`}>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_1fr]">
        <aside className="min-h-0 overflow-auto border-b border-zinc-800 p-3 md:border-b-0 md:border-r">
          <div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <FolderTree className="h-3.5 w-3.5" /> {folder}/
          </div>
          <ul className="space-y-0.5">
            {files.map((f) => {
              const depth = f.path.split('/').length - 1;
              return (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => setSelected(f.path)}
                    className={cn(
                      'w-full rounded-lg px-2 py-1.5 text-left transition-colors',
                      f.path === selected ? 'bg-violet-500/15 text-white' : 'text-zinc-300 hover:bg-zinc-800',
                    )}
                    style={{ paddingLeft: 8 + depth * 12 }}
                  >
                    <span className="flex items-center gap-2 font-mono text-xs">
                      <FileCode2 className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                      <span className="truncate">{f.path}</span>
                    </span>
                    <span className="mt-0.5 block truncate pl-[22px] text-[11px] text-zinc-500">{f.description}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2">
            <span className="truncate font-mono text-xs text-zinc-400">{file.path}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => void copy()}>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Скопировано' : 'Копировать'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => downloadSingleFile(file)}>
                <Download className="h-3.5 w-3.5" /> Файл
              </Button>
            </div>
          </div>
          <pre className="min-h-[320px] flex-1 overflow-auto bg-zinc-950 p-4 font-mono text-[12px] leading-relaxed text-zinc-300">
            {file.content}
          </pre>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-6 py-4">
        {validation.ok ? (
          <p className="text-sm text-zinc-400">
            <span className="font-mono text-zinc-200">unzip {folder}.zip && cd {folder} && docker compose up -d --build</span>
          </p>
        ) : (
          <p className="text-sm text-rose-300">Исправьте схему перед экспортом: {validation.errors.slice(0, 2).join('; ')}</p>
        )}
        <Button
          variant="primary"
          disabled={busy || !validation.ok}
          onClick={async () => {
            setBusy(true);
            try {
              await downloadZip(schema, files);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
          Скачать .zip ({files.length} файлов)
        </Button>
      </div>
    </DialogContent>
  );
}
