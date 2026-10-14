// Скачивает PocketBase для десктопного установщика: desktop/bin/<os>-<arch>/pocketbase[.exe]
//   node scripts/fetch-pocketbase.mjs linux-x64 [win-x64 mac-arm64 mac-x64 …]
// Имена <os>-<arch> совпадают с макросами electron-builder ${os}-${arch}.
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const VERSION = process.env.PB_VERSION || '0.25.9';
const OS = { win: 'windows', mac: 'darwin', linux: 'linux' };
const ARCH = { x64: 'amd64', arm64: 'arm64' };

for (const target of process.argv.slice(2)) {
  const [os, arch] = target.split('-');
  if (!OS[os] || !ARCH[arch]) throw new Error(`Неизвестная платформа: ${target} (пример: win-x64, mac-arm64, linux-x64)`);
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_${OS[os]}_${ARCH[arch]}.zip`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  const exe = os === 'win' ? 'pocketbase.exe' : 'pocketbase';
  const entry = zip.file(exe);
  if (!entry) throw new Error(`${url}: в архиве нет ${exe}`);
  const dir = path.join('desktop', 'bin', target);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, exe), await entry.async('nodebuffer'), { mode: 0o755 });
  console.log(`✓ ${target}: PocketBase ${VERSION}`);
}
