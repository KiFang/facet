import type { AccessLevel, ClubEntity, ClubRole, ClubSchema } from '@/types/schema';

/** Коллекция учётных записей актива в PocketBase. */
export const STAFF_COLLECTION = 'staff';
/** Роль председателя: всегда есть, управляет сотрудниками. */
export const CHAIR_ROLE = 'chair';

const LEVELS: AccessLevel[] = ['none', 'read', 'write'];
export const isAccessLevel = (v: unknown): v is AccessLevel => LEVELS.includes(v as AccessLevel);

/** Какие разделы по смыслу ведёт каждая роль (для начальной раздачи прав). */
const ROLE_HINTS: Record<string, RegExp> = {
  treasurer: /financ|money|cash|budget|fee|payment|expense|income|касс|финанс|взнос|бюджет|расход|доход|оплат|смет/i,
  storekeeper: /invent|equip|gear|item|stock|warehouse|merch|инвент|реквиз|склад|техник|оборуд|мерч|девайс/i,
  organizer: /event|tournament|meeting|project|task|мероприят|турнир|встреч|игротек|проект|задач|публикац/i,
};

export function defaultRoles(schema: Pick<ClubSchema, 'entities' | 'locale'>): ClubRole[] {
  const en = schema.locale === 'en';
  const hinted = (role: string) =>
    Object.fromEntries(
      schema.entities.filter((e) => ROLE_HINTS[role].test(`${e.id} ${e.name} ${e.pluralName}`)).map((e) => [e.id, 'write' as AccessLevel]),
    );
  return [
    { id: CHAIR_ROLE, name: en ? 'Chair' : 'Председатель', default: 'write', manageStaff: true },
    { id: 'treasurer', name: en ? 'Treasurer' : 'Казначей', default: 'read', access: hinted('treasurer') },
    { id: 'storekeeper', name: en ? 'Storekeeper' : 'Завхоз', default: 'read', access: hinted('storekeeper') },
    { id: 'organizer', name: en ? 'Organizer' : 'Организатор', default: 'read', access: hinted('organizer') },
  ];
}

/**
 * Включает роли и доступ по логину для схемы, где их ещё нет (новая схема, старый файл, ссылка).
 * Версии на сервере (baseline) этим не трогаются — у них остаётся прежняя модель доступа.
 */
export function withRoles<T extends ClubSchema>(schema: T): T {
  if (schema.roles?.length) return schema;
  return { ...schema, roles: defaultRoles(schema) };
}

export function accessOf(role: ClubRole, entityId: string): AccessLevel {
  return role.access?.[entityId] ?? role.default;
}

/** Роли, которые видят (или меняют) раздел. Председатель — всегда всё. */
export function rolesWith(schema: ClubSchema, entityId: string, level: 'read' | 'write'): ClubRole[] {
  return (schema.roles ?? []).filter((r) => {
    if (r.id === CHAIR_ROLE) return true;
    const a = accessOf(r, entityId);
    return level === 'read' ? a !== 'none' : a === 'write';
  });
}

export interface CollectionRules {
  listRule: string | null;
  viewRule: string | null;
  createRule: string | null;
  updateRule: string | null;
  deleteRule: string | null;
}

const staffCond = (roles: ClubRole[]): string | null => {
  if (!roles.length) return null;
  const any = roles.map((r) => `@request.auth.role = ${JSON.stringify(r.id)}`).join(' || ');
  return `@request.auth.collectionName = "${STAFF_COLLECTION}" && (${any})`;
};

/** Старая модель: чтение публичное, запись — только суперпользователь (панель /_/). */
export const LEGACY_RULES: CollectionRules = { listRule: '', viewRule: '', createRule: null, updateRule: null, deleteRule: null };

/** Правила API PocketBase для раздела по ролям актива. */
export function entityRules(schema: ClubSchema, entity: ClubEntity): CollectionRules {
  if (!schema.roles?.length) return LEGACY_RULES;
  const read = entity.public ? '' : staffCond(rolesWith(schema, entity.id, 'read'));
  const write = staffCond(rolesWith(schema, entity.id, 'write'));
  return { listRule: read, viewRule: read, createRule: write, updateRule: write, deleteRule: write };
}

/** Правила коллекции сотрудников: видят все из актива, роли назначает тот, кто управляет составом. */
export function staffRules(schema: ClubSchema): CollectionRules {
  const managers = (schema.roles ?? []).filter((r) => r.manageStaff || r.id === CHAIR_ROLE);
  const manage = staffCond(managers)!;
  const member = `@request.auth.collectionName = "${STAFF_COLLECTION}"`;
  return {
    listRule: member,
    viewRule: member,
    createRule: manage,
    // Сам себе можно сменить имя и пароль, но не роль.
    updateRule: `(id = @request.auth.id && @request.body.role:isset = false) || (${manage})`,
    deleteRule: manage,
  };
}
