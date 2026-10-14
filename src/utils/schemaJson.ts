import type { ClubSchema } from '@/types/schema';

/** Канонический текст club-schema.json (по нему считается контрольная сумма версии на сервере). */
export function generateSchemaJson(schema: ClubSchema): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}
