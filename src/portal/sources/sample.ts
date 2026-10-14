import type { ClubEntity, ClubSchema, EntityField } from '@/types/schema';
import { resolveRelations } from '@/utils/relations';
import { parseDateValue, parseNumberValue, splitLinks } from '@/utils/migrations/seeds';
import { titleFieldOf } from '../model';
import type { DataSource, PortalRecord, RecordPayload } from '../types';

export const SAMPLE_ROWS = 6;

const TITLES: Record<string, string[]> = {
  default: ['Осенний кикофф', 'Ночь проектов', 'Выездной слёт', 'Мастер-класс', 'Квиз-вечер', 'Финал сезона'],
  people: ['Аня Морозова', 'Тимур Галиев', 'Лиза Ким', 'Денис Орлов', 'Варя Соколова', 'Марк Беляев'],
  items: ['Проектор Epson', 'Колонка JBL', 'Флаги клуба', 'Камера Sony A7', 'Набор маркеров', 'Шатёр 3×3'],
  games: ['Каркассон', 'Кодовые имена', 'Ужас Аркхэма', 'Каскадия', 'Билет на поезд', 'Мафия'],
};
const TITLES_EN: Record<string, string[]> = {
  default: ['Autumn kickoff', 'Project night', 'Weekend retreat', 'Workshop', 'Quiz night', 'Season finale'],
  people: ['Anna Moroz', 'Tim Galiev', 'Liza Kim', 'Dan Orlov', 'Vera Sokol', 'Mark Bell'],
  items: ['Epson projector', 'JBL speaker', 'Club flags', 'Sony A7 camera', 'Marker set', '3×3 tent'],
  games: ['Carcassonne', 'Codenames', 'Arkham Horror', 'Cascadia', 'Ticket to Ride', 'Mafia'],
};

function pool(locale: string, entity: ClubEntity, field: EntityField): string[] {
  const t = locale === 'en' ? TITLES_EN : TITLES;
  const hay = `${entity.id} ${field.id} ${field.name}`.toLowerCase();
  if (/name|имя|nick|автор|member|player|author|участ|актив/.test(hay)) return t.people;
  if (/item|предмет|девайс|gear|equip|inventor|устрой|реквиз/.test(hay)) return t.items;
  if (/game|игр|настол/.test(hay)) return t.games;
  return t.default;
}

const pad = (n: number) => String(n).padStart(2, '0');
const pbDate = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00.000Z`;

function sampleScalar(schema: ClubSchema, entity: ClubEntity, field: EntityField, row: number, now: Date): unknown {
  switch (field.type) {
    case 'text': {
      if (/telegram/.test(field.id)) return `@${['anya', 'timur', 'liza', 'den', 'varya', 'mark'][row % 6]}_club`;
      const p = pool(schema.locale ?? 'ru', entity, field);
      return p[(row + field.id.length) % p.length];
    }
    case 'number':
      return (((row + 1) * 7 + field.id.length * 3) % 48) + 2;
    case 'date': {
      // «В клубе с», «Получено», «Дата съёмки» — события прошлого; остальные даты разбрасываем вокруг сегодня.
      const past = /joined|received|shot|born|since|получ|клубе|съём|рожд/i.test(`${field.id} ${field.name}`);
      const offset = past ? -30 * (row + 1) : row * 4 - 6;
      return pbDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 18, 30));
    }
    case 'select':
    case 'status': {
      const opts = field.options?.length ? field.options : ['—'];
      return opts[row % opts.length];
    }
    case 'file':
      return '';
    default:
      return '';
  }
}

interface Built {
  byEntity: Map<string, PortalRecord[]>;
}

function seedRecords(schema: ClubSchema, entity: ClubEntity, rows: Record<string, string>[], now: Date): PortalRecord[] {
  return rows.map((row, i) => {
    const rec: PortalRecord = {
      id: `${entity.id}-seed-${i}`,
      created: pbDate(new Date(now.getTime() - i * 3600_000)),
      updated: pbDate(new Date(now.getTime() - i * 3600_000)),
    };
    for (const f of entity.fields) {
      const raw = (row[f.id] ?? '').trim();
      if (!raw || f.type === 'relation' || f.type === 'file') continue;
      if (f.type === 'number') rec[f.id] = parseNumberValue(raw) ?? '';
      else if (f.type === 'date') rec[f.id] = parseDateValue(raw) ?? '';
      else rec[f.id] = raw;
    }
    rec.__links = Object.fromEntries(
      resolveRelations(entity, schema).map((r) => [r.name, splitLinks(row[r.name] ?? '')]),
    );
    return rec;
  });
}

/** Детерминированные примеры (или импортированные строки) со связями — для живого превью. */
export function buildSampleData(
  schema: ClubSchema,
  seeds: Record<string, { rows: Record<string, string>[] }> = {},
  now = new Date(),
): Built {
  const byEntity = new Map<string, PortalRecord[]>();
  for (const entity of schema.entities) {
    const seeded = seeds[entity.id]?.rows;
    if (seeded?.length) {
      byEntity.set(entity.id, seedRecords(schema, entity, seeded, now));
      continue;
    }
    const records: PortalRecord[] = [];
    for (let i = 0; i < SAMPLE_ROWS; i++) {
      const rec: PortalRecord = {
        id: `${entity.id}-${i}`,
        created: pbDate(new Date(now.getTime() - i * 5 * 3600_000)),
        updated: pbDate(new Date(now.getTime() - i * 3 * 3600_000)),
      };
      for (const f of entity.fields) if (f.type !== 'relation') rec[f.id] = sampleScalar(schema, entity, f, i, now);
      records.push(rec);
    }
    byEntity.set(entity.id, records);
  }

  // Второй проход: связи и expand.
  for (const entity of schema.entities) {
    const rels = resolveRelations(entity, schema);
    const records = byEntity.get(entity.id)!;
    records.forEach((rec, i) => {
      const expand: NonNullable<PortalRecord['expand']> = {};
      const links = rec.__links as Record<string, string[]> | undefined;
      for (const r of rels) {
        const targets = byEntity.get(r.targetEntityId) ?? [];
        const target = schema.entities.find((e) => e.id === r.targetEntityId)!;
        const tf = titleFieldOf(target);
        let picked: PortalRecord[];
        if (links) {
          picked = (links[r.name] ?? [])
            .map((label) => targets.find((t) => tf && String(t[tf.id] ?? '').toLowerCase() === label.toLowerCase()))
            .filter((x): x is PortalRecord => !!x);
        } else {
          const count = r.multiple ? 1 + (i % 3) : 1;
          picked = Array.from({ length: Math.min(count, targets.length) }, (_, k) => targets[(i + k * 2 + 1) % targets.length])
            .filter((x, idx, arr) => x.id !== rec.id && arr.indexOf(x) === idx);
        }
        rec[r.name] = r.multiple ? picked.map((p) => p.id) : (picked[0]?.id ?? '');
        if (picked.length) expand[r.name] = r.multiple ? picked : picked[0];
      }
      delete rec.__links;
      rec.expand = expand;
    });
  }
  return { byEntity };
}

export function sampleSource(
  schema: ClubSchema,
  seeds: Record<string, { rows: Record<string, string>[] }> = {},
  now = new Date(),
): DataSource {
  const { byEntity } = buildSampleData(schema, seeds, now);
  // Примеры можно менять в превью рабочего места — изменения живут до перезагрузки.
  const withExpand = (entity: ClubEntity, rec: PortalRecord): PortalRecord => {
    const expand: NonNullable<PortalRecord['expand']> = {};
    for (const r of resolveRelations(entity, schema)) {
      const targets = byEntity.get(r.targetEntityId) ?? [];
      const ids = Array.isArray(rec[r.name]) ? (rec[r.name] as string[]) : rec[r.name] ? [String(rec[r.name])] : [];
      const picked = ids.map((id) => targets.find((t) => t.id === id)).filter((x): x is PortalRecord => !!x);
      if (picked.length) expand[r.name] = r.multiple ? picked : picked[0];
    }
    return { ...rec, expand };
  };
  const apply = (rec: PortalRecord, payload: RecordPayload) => {
    Object.assign(rec, payload.values);
    for (const [k, f] of Object.entries(payload.files)) rec[k] = f ? f.name : '';
    rec.updated = pbDate(new Date());
  };
  let seq = 0;
  return {
    list: async (entity) => byEntity.get(entity.id) ?? [],
    fileUrl: () => null,
    editUrl: () => null,
    async create(entity, payload) {
      const rec: PortalRecord = { id: `${entity.id}-new-${++seq}`, created: pbDate(new Date()) };
      apply(rec, payload);
      const full = withExpand(entity, rec);
      byEntity.set(entity.id, [full, ...(byEntity.get(entity.id) ?? [])]);
      return full;
    },
    async update(entity, id, payload) {
      const list = byEntity.get(entity.id) ?? [];
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error('404');
      const rec = { ...list[idx] };
      apply(rec, payload);
      const full = withExpand(entity, rec);
      byEntity.set(entity.id, list.map((r, i) => (i === idx ? full : r)));
      return full;
    },
    async remove(entity, id) {
      byEntity.set(entity.id, (byEntity.get(entity.id) ?? []).filter((r) => r.id !== id));
    },
  };
}
