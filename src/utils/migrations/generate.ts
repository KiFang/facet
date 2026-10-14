import runtime from '@/export-templates/migration-runtime.js?raw';
import type { ClubSchema } from '@/types/schema';
import { diffPhysical, type MigrationOp, type SchemaDiff } from './diff';
import { toPhysical } from './physical';
import type { SeedOp } from './seeds';

/** Разница между развёрнутой схемой (null — пустая база) и новой. */
export function planMigration(before: ClubSchema | null, after: ClubSchema): SchemaDiff {
  return diffPhysical(before ? toPhysical(before) : [], toPhysical(after));
}

export function renderMigrationFile(opts: { title: string; ops: (MigrationOp | SeedOp)[] }): string {
  return `/// <reference path="../pb_data/types.d.ts" />
// Facet OS: ${opts.title}
// Сгенерировано автоматически — не редактируйте вручную. PocketBase применит миграцию при запуске один раз.
// Чтение записей — публичное (портал), запись — только через панель управления /_/.

${runtime}
const OPS = ${JSON.stringify(opts.ops, null, 2)};

migrate((app) => {
  facetApply(app, OPS);
}, (app) => {
  // Откат структуры выполняется восстановлением резервной копии: ./restore.sh backups/update-…
});
`;
}
