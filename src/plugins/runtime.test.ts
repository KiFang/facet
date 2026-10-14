import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildPresetSchema } from '@/data/presets';
import { normalizeSchema } from '@/utils/normalize';
import type { ClubSchema } from '@/types/schema';
import { pluginEnvLines, pluginFiles, pluginCss, portalFeatures, secretEnvName, settingsProblems, validateManifest, manifestOf } from './runtime';
import type { InstalledPlugin } from './types';

const base = (): ClubSchema => normalizeSchema({ ...buildPresetSchema('general'), editorMode: 'pro' });
const example = JSON.parse(fs.readFileSync('examples/plugins/deadline-badge.json', 'utf8'));

describe('plugins runtime', () => {
  it('accepts the example manifest and rejects bad ones', () => {
    expect(validateManifest(example).ok).toBe(true);
    expect(validateManifest({ ...example, id: 'Bad Id' }).ok).toBe(false);
    expect(validateManifest({ ...example, id: 'telegram' }).errors.join()).toMatch(/встроен/);
    expect(validateManifest({ ...example, version: 'x' }).ok).toBe(false);
    expect(validateManifest({ ...example, settings: [{ key: 'a', type: 'nope', label: 'A' }] }).ok).toBe(false);
    expect(validateManifest(null).ok).toBe(false);
  });

  it('names secrets for the environment', () => {
    expect(secretEnvName('my-bot', 'token')).toBe('FACET_PLUGIN_MY_BOT_TOKEN');
  });

  it('inlines settings into server hooks and ships portal scripts', () => {
    const plugin: InstalledPlugin = { id: example.id, enabled: true, settings: { entity: 'events', dateField: 'starts_at', days: 5 }, manifest: example };
    const schema = { ...base(), plugins: [plugin] };
    const files = pluginFiles(schema);
    const hook = files.find((f) => f.path === 'pocketbase/pb_hooks/plugin-deadline-badge.pb.js')!;
    expect(hook.content).not.toContain('__FACET_SETTINGS__');
    expect(hook.content).toContain('"days":5');
    expect(files.some((f) => f.path === 'web/plugins/deadline-badge.js')).toBe(true);
    expect(pluginCss(schema)).toContain('.fx-soon');
    expect(pluginFiles({ ...schema, plugins: [{ ...plugin, enabled: false }] })).toEqual([]);
  });

  it('reports missing required settings', () => {
    const plugin: InstalledPlugin = { id: example.id, enabled: true, settings: {}, manifest: example };
    expect(settingsProblems(base(), example, plugin).length).toBeGreaterThan(0);
    expect(settingsProblems(base(), example, { ...plugin, settings: { entity: 'events', dateField: 'starts_at' } })).toEqual([]);
  });

  it('keeps secrets out of hooks and puts them in .env', () => {
    const tg = manifestOf({ id: 'telegram', enabled: true, settings: {} })!;
    const schema = { ...base(), plugins: [{ id: 'telegram', enabled: true, settings: { chatId: '1', entities: ['events'] } }] };
    const hook = pluginFiles(schema)[0].content;
    expect(hook).not.toContain('s3cret');
    expect(pluginEnvLines(schema, { telegram: { bot_token: 's3cret' } }, { includeEmpty: true }).join('\n')).toContain('FACET_PLUGIN_TELEGRAM_BOT_TOKEN=s3cret');
    expect(pluginEnvLines(schema, {}, { includeEmpty: false }).join('\n')).not.toContain('BOT_TOKEN');
    expect(tg.settings?.some((s) => s.type === 'secret')).toBe(true);
  });

  it('collects portal features', () => {
    const schema = { ...base(), plugins: [{ id: 'portal-tools', enabled: true, settings: {} }] };
    expect([...portalFeatures(schema)].sort()).toEqual(['csv', 'print']);
  });
});
