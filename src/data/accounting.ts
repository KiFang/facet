import type { ClubEntity, ClubRegister, ClubSchema, Locale } from '@/types/schema';
import { uniqueId } from '@/lib/id';

/** Готовые решения учёта: регистр остатков + операции, которые в него пишут. */
export type AccountingPackId = 'cash' | 'equipment';

export interface AccountingPackMeta {
  id: AccountingPackId;
  icon: string;
  title: Record<Locale, string>;
  description: Record<Locale, string>;
}

export const ACCOUNTING_PACKS: AccountingPackMeta[] = [
  {
    id: 'cash',
    icon: 'Wallet',
    title: { ru: 'Касса клуба', en: 'Club cash' },
    description: {
      ru: 'Поступления и расходы по статьям, остаток денег в любой момент',
      en: 'Income and expenses by category, cash balance at any time',
    },
  },
  {
    id: 'equipment',
    icon: 'ArrowRightLeft',
    title: { ru: 'Выдача инвентаря', en: 'Equipment loans' },
    description: {
      ru: 'Кто что взял и сколько, возвраты; нельзя вернуть больше, чем выдано',
      en: 'Who has what and how many, returns; cannot return more than was issued',
    },
  },
];

const f = (id: string, name: string, type: ClubEntity['fields'][number]['type'], required = false, extra: Partial<ClubEntity['fields'][number]> = {}) => ({ id, name, type, required, ...extra });

/** Ищет раздел по смыслу (инвентарь, участники) — или создаёт минимальный. */
function findOrCreate(schema: ClubSchema, re: RegExp, make: (id: string) => ClubEntity): { entity: ClubEntity; created: boolean } {
  const found = schema.entities.find((e) => re.test(`${e.id} ${e.name} ${e.pluralName}`) && e.kind !== 'operation');
  if (found) return { entity: found, created: false };
  const id = uniqueId(make('x').id, schema.entities.map((e) => e.id));
  return { entity: make(id), created: true };
}

/** Что добавить в схему для готового решения. */
export function buildAccountingPack(schema: ClubSchema, pack: AccountingPackId): { entities: ClubEntity[]; registers: ClubRegister[] } {
  const en = schema.locale === 'en';
  const takenEntities = schema.entities.map((e) => e.id);
  const takenRegs = (schema.registers ?? []).map((r) => r.id);

  if (pack === 'cash') {
    const regId = uniqueId('cash', takenRegs);
    const opId = uniqueId('cash_ops', takenEntities);
    const inc = en ? 'Income' : 'Поступление';
    const out = en ? 'Expense' : 'Расход';
    return {
      registers: [{
        id: regId, name: en ? 'Cash' : 'Касса', icon: 'Wallet',
        dimensions: [{ id: 'article', name: en ? 'Category' : 'Статья' }],
        resources: [{ id: 'amount', name: en ? 'Amount' : 'Сумма', money: true }],
      }],
      entities: [{
        id: opId, name: en ? 'Cash entry' : 'Движение денег', pluralName: en ? 'Cash entries' : 'Движения денег', icon: 'Wallet',
        kind: 'operation',
        fields: [
          f('title', en ? 'Description' : 'Основание', 'text', true),
          f('date', en ? 'Date' : 'Дата', 'date', true),
          f('type', en ? 'Type' : 'Вид', 'select', true, { options: [inc, out] }),
          f('amount', en ? 'Amount' : 'Сумма', 'number', true),
          f('article', en ? 'Category' : 'Статья', 'select', true, {
            options: en ? ['Fees', 'Sponsors', 'Events', 'Purchases', 'Other'] : ['Взносы', 'Спонсоры', 'Мероприятия', 'Закупки', 'Прочее'],
          }),
        ],
        relations: [],
        view: { type: 'table' },
        postings: [{ register: regId, direction: { field: 'type', in: [inc], out: [out] }, dimensions: { article: 'article' }, resources: { amount: 'amount' }, dateField: 'date' }],
      }],
    };
  }

  // equipment
  const items = findOrCreate(schema, /invent|equip|item|gear|инвент|реквиз|техник|оборуд/i, (id) => ({
    id: id === 'x' ? 'inventory' : id, name: en ? 'Item' : 'Предмет', pluralName: en ? 'Equipment' : 'Инвентарь', icon: 'Package',
    fields: [f('item', en ? 'Item' : 'Предмет', 'text', true)], relations: [], view: { type: 'table' },
  }));
  const people = findOrCreate({ ...schema, entities: [...schema.entities, ...(items.created ? [items.entity] : [])] }, /member|people|person|участ|актив|состав/i, (id) => ({
    id: id === 'x' ? 'members' : id, name: en ? 'Member' : 'Участник', pluralName: en ? 'Members' : 'Участники', icon: 'Users',
    fields: [f('full_name', en ? 'Full name' : 'Имя и фамилия', 'text', true)], relations: [], view: { type: 'table' },
  }));
  const regId = uniqueId('on_hand', takenRegs);
  const opId = uniqueId('issues', [...takenEntities, items.entity.id, people.entity.id]);
  const give = en ? 'Issue' : 'Выдача';
  const back = en ? 'Return' : 'Возврат';
  return {
    registers: [{
      id: regId, name: en ? 'Equipment on loan' : 'Инвентарь на руках', icon: 'ArrowRightLeft', noNegative: true,
      dimensions: [
        { id: 'item', name: en ? 'Item' : 'Предмет', target: items.entity.id },
        { id: 'holder', name: en ? 'Holder' : 'У кого', target: people.entity.id },
      ],
      resources: [{ id: 'qty', name: en ? 'Quantity' : 'Количество' }],
    }],
    entities: [
      ...(items.created ? [items.entity] : []),
      ...(people.created ? [people.entity] : []),
      {
        id: opId, name: en ? 'Issue or return' : 'Выдача или возврат', pluralName: en ? 'Issues and returns' : 'Выдачи и возвраты', icon: 'ArrowRightLeft',
        kind: 'operation',
        fields: [
          f('title', en ? 'Comment' : 'Комментарий', 'text'),
          f('date', en ? 'Date' : 'Дата', 'date', true),
          f('type', en ? 'Type' : 'Вид', 'select', true, { options: [give, back] }),
          f('item', en ? 'Item' : 'Предмет', 'relation', true, { targetEntityId: items.entity.id }),
          f('holder', en ? 'Holder' : 'Кому / от кого', 'relation', true, { targetEntityId: people.entity.id }),
          f('qty', en ? 'Quantity' : 'Количество', 'number', true),
        ],
        relations: [],
        view: { type: 'table' },
        postings: [{ register: regId, direction: { field: 'type', in: [give], out: [back] }, dimensions: { item: 'item', holder: 'holder' }, resources: { qty: 'qty' }, dateField: 'date' }],
      },
    ],
  };
}
