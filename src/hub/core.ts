/**
 * Ядро Facet Hub: те же функции, что у редактора, собранные в один CommonJS-модуль (hub/dist/core.cjs).
 * Хаб сам собирает системы клубов из их схем — готовые файлы от клубов он не принимает.
 */
import { buildInstallBundle, buildUpdateBundle, generateSchemaJson, FACET_VERSION, PB_VERSION } from '@/utils/exporter';
import { validateSchema } from '@/utils/validate';
import { normalizeSchema } from '@/utils/normalize';
import { withRoles, STAFF_COLLECTION } from '@/utils/access';
import { describeChange } from '@/utils/migrations/describe';
import { regCollection, resColumn } from '@/utils/registers';
import { enabledPlugins, isBuiltin, tr } from '@/plugins/runtime';
import { TEMPLATES } from '@/data/templates';
import { ACCOUNTING_PACKS, buildAccountingPack, type AccountingPackId } from '@/data/accounting';
import { buildSampleData } from '@/portal/sources/sample';
import { resolveRelations } from '@/utils/relations';
import type { ClubSchema } from '@/types/schema';
import type { SeedBatch } from '@/store/useClubStore';

export { buildInstallBundle, buildUpdateBundle, generateSchemaJson, validateSchema, normalizeSchema, withRoles, describeChange, regCollection, resColumn, FACET_VERSION, PB_VERSION, STAFF_COLLECTION };

/** Схема от клуба → проверенная схема с ролями (или список ошибок). */
export function prepareSchema(input: unknown): { ok: true; schema: ClubSchema } | { ok: false; errors: string[] } {
  const result = validateSchema(input);
  if (!result.ok || !result.schema) return { ok: false, errors: result.errors };
  return { ok: true, schema: withRoles(normalizeSchema(result.schema)) };
}

/** Сторонние (не встроенные) плагины, включённые в схеме: их код хаб по умолчанию не запускает. */
export function customPlugins(schema: ClubSchema): { id: string; name: string; server: boolean; portal: boolean }[] {
  return enabledPlugins(schema)
    .filter(({ plugin }) => !isBuiltin(plugin.id))
    .map(({ plugin, manifest }) => ({
      id: plugin.id,
      name: tr(manifest.name, 'ru'),
      server: !!manifest.contributes?.serverHook,
      portal: !!manifest.contributes?.portalScript,
    }));
}

/** Импортированные данные из запроса: { entityId: rows[] } → пакеты для миграции. */
export function seedsFrom(input: unknown, schema: ClubSchema): Record<string, SeedBatch> {
  const out: Record<string, SeedBatch> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [entityId, value] of Object.entries(input as Record<string, unknown>)) {
    if (!schema.entities.some((e) => e.id === entityId)) continue;
    const rows = Array.isArray(value) ? value : (value as SeedBatch)?.rows;
    if (!Array.isArray(rows)) continue;
    const clean = rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .slice(0, 5000)
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')])));
    out[entityId] = { entityId, rows: clean, source: 'hub', importedAt: new Date().toISOString() };
  }
  return out;
}

/** Описание изменений для ответа API. */
export function describeChanges(changes: { severity: string }[], locale: 'ru' | 'en' = 'ru') {
  return changes.map((c) => ({ severity: c.severity, text: describeChange(c as Parameters<typeof describeChange>[0], locale) }));
}

/* ------------------------- быстрый старт из шаблона ------------------------- */


/** Что можно выбрать на странице «Подключить клуб». */
export function catalog() {
  return {
    templates: TEMPLATES.map((t) => ({ id: t.id, title: t.meta.title, description: t.meta.description, icon: t.meta.icon })),
    packs: ACCOUNTING_PACKS.map((p) => ({ id: p.id, title: p.title.ru, description: p.description.ru })),
  };
}

/** Схема клуба из шаблона + готовые решения учёта. */
export function schemaFromTemplate(templateId: string, clubName: string, packs: string[] = []): ClubSchema {
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  let schema = { ...template.build(), editorMode: 'easy' } as ClubSchema;
  if (clubName.trim()) schema.clubName = clubName.trim();
  for (const pack of packs) {
    if (!ACCOUNTING_PACKS.some((p) => p.id === pack)) continue;
    const add = buildAccountingPack(schema, pack as AccountingPackId);
    schema = { ...schema, entities: [...schema.entities, ...add.entities], registers: [...(schema.registers ?? []), ...add.registers] };
  }
  return withRoles(normalizeSchema(schema));
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Черновые данные (те же примеры, что в превью редактора) как строки импорта.
 * Операции — только приходы, чтобы черновик не упёрся в запрет отрицательных остатков.
 */
export function draftSeeds(schema: ClubSchema, now = new Date()): Record<string, SeedBatch> {
  const { byEntity } = buildSampleData(schema, {}, now);
  const out: Record<string, SeedBatch> = {};
  for (const entity of schema.entities) {
    const records = byEntity.get(entity.id) ?? [];
    const rels = resolveRelations(entity, schema);
    const rows = records.map((rec) => {
      const row: Record<string, string> = {};
      for (const f of entity.fields) {
        if (f.type === 'relation' || f.type === 'file') continue;
        const v = rec[f.id];
        if (v === undefined || v === null || v === '') continue;
        if (f.type === 'date') {
          const d = new Date(String(v).replace(' ', 'T'));
          row[f.id] = Number.isNaN(d.getTime()) ? '' : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
        } else row[f.id] = String(v);
      }
      for (const r of rels) {
        const target = schema.entities.find((e) => e.id === r.targetEntityId);
        const title = target?.fields.find((x) => x.type === 'text') ?? target?.fields[0];
        const ids = ([] as unknown[]).concat(rec[r.name] ?? []).map(String).filter(Boolean);
        const labels = ids.map((id) => String(byEntity.get(r.targetEntityId)?.find((t) => t.id === id)?.[title?.id ?? ''] ?? '')).filter(Boolean);
        if (labels.length) row[r.name] = labels.join('; ');
      }
      if (entity.kind === 'operation') {
        const dir = entity.postings?.[0]?.direction;
        if (dir && typeof dir === 'object' && dir.in[0]) row[dir.field] = dir.in[0];
      }
      return row;
    });
    if (rows.length) out[entity.id] = { entityId: entity.id, rows, source: 'draft', importedAt: now.toISOString() };
  }
  return out;
}
