import type { ClubSchema } from '@/types/schema';
import { validateSchema } from '@/utils/validate';
import { buildPresetSchema, PRESET_META } from './presets';
import type { PresetId } from '@/types/schema';

export interface TemplateMeta {
  title: string;
  description: string;
  icon: string;
  author?: string;
}

export interface ClubTemplate {
  id: string;
  meta: TemplateMeta;
  build: () => Omit<ClubSchema, 'editorMode'>;
  community: boolean;
}

interface TemplateFile {
  meta: TemplateMeta;
  schema: Omit<ClubSchema, 'editorMode'>;
}

/** Шаблоны сообщества: любой JSON в src/data/templates/ (см. README → «Как добавить шаблон»). */
const files = import.meta.glob<TemplateFile>('./templates/*.json', { eager: true, import: 'default' });

const community: ClubTemplate[] = Object.entries(files)
  .filter(([, file]) => validateSchema({ ...file.schema, editorMode: 'easy' }).ok)
  .map(([path, file]) => ({
    id: path.replace(/^.*\/|\.json$/g, ''),
    meta: file.meta,
    build: () => structuredClone(file.schema),
    community: true,
  }))
  .sort((a, b) => a.meta.title.localeCompare(b.meta.title));

const builtIn: ClubTemplate[] = (Object.keys(PRESET_META) as PresetId[]).map((id) => ({
  id,
  meta: PRESET_META[id],
  build: () => buildPresetSchema(id),
  community: false,
}));

export const TEMPLATES: ClubTemplate[] = [...builtIn, ...community];
