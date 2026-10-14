import type { ExportBundle, ExportFile } from './exporter';

/** Собирает zip-архив в браузере и отдаёт его на скачивание. JSZip грузится только здесь. */
export async function downloadBundle(bundle: ExportBundle): Promise<void> {
  const [{ default: JSZip }, { saveAs }] = await Promise.all([import('jszip'), import('file-saver')]);
  const zip = new JSZip();
  const folder = zip.folder(bundle.folder)!;
  for (const file of bundle.files) {
    folder.file(file.path, file.content, {
      base64: file.encoding === 'base64',
      unixPermissions: file.executable ? 0o755 : 0o644,
    });
  }
  const blob = await zip.generateAsync({
    type: 'blob',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  saveAs(blob, `${bundle.folder}.zip`);
}

export async function downloadSingleFile(file: ExportFile): Promise<void> {
  const { saveAs } = await import('file-saver');
  const name = file.path.split('/').pop() ?? file.path;
  const blob =
    file.encoding === 'base64'
      ? new Blob([Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0))])
      : new Blob([file.content], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, name);
}
