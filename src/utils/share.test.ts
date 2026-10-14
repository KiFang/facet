import { describe, expect, it, vi } from 'vitest';
import { buildPresetSchema } from '@/data/presets';
import { normalizeSchema } from './normalize';
import { decodeShareHash, encodeShareHash } from './share';

describe('share link', () => {
  it('туда и обратно, без логотипа, компактно', async () => {
    const schema = normalizeSchema({ ...buildPresetSchema('boardgames'), editorMode: 'advanced' });
    schema.theme.logo = `data:image/png;base64,${'A'.repeat(1000)}`;
    const hash = await encodeShareHash(schema);
    expect(hash.startsWith('s=')).toBe(true);
    expect(hash.length).toBeLessThan(JSON.stringify(schema).length / 2);
    const back = await decodeShareHash(`#${hash}`);
    const { logo: _logo, ...theme } = schema.theme;
    expect(back).toEqual({ ...schema, theme });
  });

  it('битая ссылка — null, а не исключение', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await decodeShareHash('#s=AAAA')).toBeNull();
    expect(await decodeShareHash('#other')).toBeNull();
  });
});
