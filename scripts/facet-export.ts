/**
 * CLI экспорта Facet OS (для CI и автоматизации).
 *
 *   npx vite-node scripts/facet-export.ts -- --preset general --out ./out
 *   npx vite-node scripts/facet-export.ts -- --schema club-schema.json --out ./out
 *   npx vite-node scripts/facet-export.ts -- --schema new.json --base deployed.json --out ./update
 *   … --seeds seeds.json   (JSON: { "<entityId>": [ { "<fieldId>": "значение" } ] })
 *   … --password secret    (вместо случайного пароля администратора)
 */
import fs from 'node:fs';
import { buildPresetSchema } from '@/data/presets';
import { withRoles } from '@/utils/access';
import { buildInstallBundle, buildUpdateBundle } from '@/utils/exporter';
import { writeBundle } from './lib';
import { validateSchema } from '@/utils/validate';
import { normalizeSchema } from '@/utils/normalize';
import type { ClubSchema, PresetId } from '@/types/schema';
import type { SeedBatch } from '@/store/useClubStore';

function readSchema(file: string): { schema: ClubSchema; raw: string } {
  const raw = fs.readFileSync(file, 'utf8');
  const result = validateSchema(JSON.parse(raw));
  if (!result.ok || !result.schema) throw new Error(`${file}:\n  ${result.errors.join('\n  ')}`);
  return { schema: result.schema, raw };
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? 'true' : argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2).filter((a) => a !== '--'));
  if (!args.out || (!args.preset && !args.schema)) {
    console.error('Использование: facet-export --preset <general|gaming|boardgames|media> | --schema <file> [--base <file>] [--seeds <file>] --out <dir>');
    process.exit(1);
  }
  const schema = args.preset
    ? withRoles(normalizeSchema({ ...buildPresetSchema(args.preset as PresetId), editorMode: 'easy' }))
    : readSchema(args.schema).schema;
  const seeds: Record<string, SeedBatch> = {};
  if (args.seeds) {
    const data = JSON.parse(fs.readFileSync(args.seeds, 'utf8')) as Record<string, Record<string, string>[]>;
    for (const [entityId, rows] of Object.entries(data)) seeds[entityId] = { entityId, rows, source: args.seeds, importedAt: new Date().toISOString() };
  }
  const options = { password: args.password };
  const bundle = args.base
    ? await (async () => {
        const base = readSchema(args.base);
        return buildUpdateBundle({ schema: base.schema, raw: base.raw, source: 'file', at: new Date().toISOString() }, schema, seeds, options);
      })()
    : await buildInstallBundle(schema, seeds, options);
  const root = writeBundle(bundle, args.out);
  console.log(root);
  for (const c of bundle.diff.changes) console.error(`  [${c.severity}] ${c.kind} ${c.collection}${c.field ? `.${c.field}` : ''}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
