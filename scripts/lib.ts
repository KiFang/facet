import fs from 'node:fs';
import path from 'node:path';
import type { ExportBundle } from '@/utils/exporter';

/** Записывает архив экспорта на диск (с правами на исполнение для .sh). Возвращает корневую папку. */
export function writeBundle(bundle: ExportBundle, outDir: string): string {
  const root = path.join(outDir, bundle.folder);
  for (const file of bundle.files) {
    const target = path.join(root, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content);
    if (file.executable) fs.chmodSync(target, 0o755);
  }
  return root;
}
