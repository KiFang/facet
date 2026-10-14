import type { ClubSchema } from '@/types/schema';
import { validateSchema } from '@/utils/validate';

const PREFIX = 's=';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/**
 * Схема → фрагмент ссылки `#s=…` (deflate + base64url). Логотип не передаётся — ссылка должна оставаться короткой.
 * Данные клуба в ссылку не попадают: только структура и тема.
 */
export async function encodeShareHash(schema: ClubSchema): Promise<string> {
  const { logo: _logo, ...theme } = schema.theme;
  const json = JSON.stringify({ ...schema, theme });
  const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return `${PREFIX}${toBase64Url(packed)}`;
}

export async function decodeShareHash(hash: string): Promise<ClubSchema | null> {
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith(PREFIX)) return null;
  try {
    const bytes = await pipe(fromBase64Url(raw.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
    const result = validateSchema(JSON.parse(new TextDecoder().decode(bytes)));
    return result.ok ? result.schema! : null;
  } catch {
    return null;
  }
}

export function shareUrl(hash: string): string {
  return `${location.origin}${location.pathname}#${hash}`;
}
