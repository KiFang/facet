import type { ClubEntity, ClubSchema, EntityField } from '@/types/schema';

const TITLES: Record<string, string[]> = {
  default: ['Осенний кикофф', 'Ночь проектов', 'Выездной слёт', 'Мастер-класс', 'Квиз-вечер', 'Финал сезона'],
  people: ['Аня Морозова', 'Тимур Галиев', 'Лиза Ким', 'Денис Орлов', 'Варя Соколова', 'Марк Беляев'],
  items: ['Проектор Epson', 'Колонка JBL', 'Флаги клуба', 'Камера Sony A7', 'Набор маркеров', 'Шатёр 3×3'],
  games: ['Каркассон', 'Кодовые имена', 'Ужас Аркхэма', 'Каскадия', 'Билет на поезд', 'Мафия'],
};

function pool(entity: ClubEntity, field: EntityField): string[] {
  const hay = `${entity.id} ${field.id} ${field.name}`.toLowerCase();
  if (/name|имя|nick|автор|member|player|author/.test(hay)) return TITLES.people;
  if (/item|предмет|девайс|gear|equip|inventor|устрой/.test(hay)) return TITLES.items;
  if (/game|игр|настол/.test(hay)) return TITLES.games;
  return TITLES.default;
}

/** Детерминированное значение-пример для поля — используется в живом превью. */
export function sampleValue(
  schema: ClubSchema,
  entity: ClubEntity,
  field: EntityField,
  row: number,
): string {
  switch (field.type) {
    case 'text': {
      const p = pool(entity, field);
      if (/telegram/.test(field.id)) return `@${['anya', 'timur', 'liza', 'den', 'varya', 'mark'][row % 6]}_club`;
      return p[(row + field.id.length) % p.length];
    }
    case 'number':
      return String(((row + 1) * 7 + field.id.length * 3) % 48 + 2);
    case 'date': {
      const d = new Date(2026, 9, 14 + row * 5, 18, 30);
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    }
    case 'select':
    case 'status': {
      const opts = field.options?.length ? field.options : ['Вариант A', 'Вариант B'];
      return opts[row % opts.length];
    }
    case 'file':
      return `${field.id}_${row + 1}.jpg`;
    case 'relation': {
      const target = schema.entities.find((e) => e.id === field.targetEntityId);
      const titleField = target?.fields.find((f) => f.type === 'text');
      return target && titleField ? sampleValue(schema, target, titleField, row + 2) : '—';
    }
  }
}
