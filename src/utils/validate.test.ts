import { describe, expect, it } from 'vitest';
import { buildPresetSchema } from '@/data/presets';
import { TEMPLATES } from '@/data/templates';
import { validateSchema } from './validate';

const valid = () => ({ ...buildPresetSchema('general'), editorMode: 'easy' });

describe('validateSchema', () => {
  it('все шаблоны валидны', () => {
    for (const tpl of TEMPLATES) expect(validateSchema({ ...tpl.build(), editorMode: 'easy' }).errors, tpl.id).toEqual([]);
    expect(TEMPLATES.filter((t) => t.community).length).toBeGreaterThanOrEqual(3);
  });

  it('нормализует старую схему без новых полей', () => {
    const r = validateSchema(valid());
    expect(r.ok).toBe(true);
    expect(r.schema!.locale).toBe('ru');
    expect(r.schema!.dashboard?.enabled).toBe(true);
    expect(r.schema!.entities[0].view).toEqual({ type: 'cards', groupBy: 'status', dateField: 'starts_at' });
  });

  it('ловит зарезервированные и повторяющиеся имена', () => {
    const s = valid();
    s.entities[0].id = 'users';
    s.entities[1].fields[0].id = 'created';
    s.entities[2].fields[1].id = s.entities[2].fields[0].id;
    const errors = validateSchema(s).errors.join('\n');
    expect(errors).toMatch(/«users» зарезервировано/);
    expect(errors).toMatch(/«created» зарезервировано/);
    expect(errors).toMatch(/дубликат/);
  });

  it('ловит битые ссылки, токены и логотип', () => {
    const s = valid() as any;
    s.entities[0].relations.push({ targetEntityId: 'ghost', type: 'many-to-many' });
    s.theme.borderRadius = 99;
    s.theme.font = 'comic-sans';
    s.theme.logo = 'https://example.com/logo.png';
    const errors = validateSchema(s).errors.join('\n');
    expect(errors).toMatch(/targetEntityId/);
    expect(errors).toMatch(/borderRadius/);
    expect(errors).toMatch(/theme.font/);
    expect(errors).toMatch(/theme.logo/);
  });
});
