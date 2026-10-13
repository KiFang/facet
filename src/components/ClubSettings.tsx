import { Flag, LayoutTemplate } from 'lucide-react';
import { useClubStore } from '@/store/useClubStore';
import { PRESET_META } from '@/data/presets';
import type { PresetId } from '@/types/schema';
import { getEntityIcon } from '@/lib/icons';
import { Input, Label } from './ui/Input';
import { Section } from './ui/Section';

export function ClubInfo() {
  const clubName = useClubStore((s) => s.schema.clubName);
  const motto = useClubStore((s) => s.schema.motto);
  const setClubInfo = useClubStore((s) => s.setClubInfo);
  return (
    <Section title="Клуб" icon={<Flag className="h-3.5 w-3.5" />}>
      <div>
        <Label htmlFor="club-name" hint={`${clubName.length}/60`}>Название</Label>
        <Input id="club-name" maxLength={60} value={clubName} onChange={(e) => setClubInfo({ clubName: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="club-motto" hint={`${motto.length}/120`}>Девиз</Label>
        <Input id="club-motto" maxLength={120} value={motto} onChange={(e) => setClubInfo({ motto: e.target.value })} />
      </div>
    </Section>
  );
}

export function PresetGallery() {
  const loadPreset = useClubStore((s) => s.loadPreset);
  return (
    <Section title="Шаблон клуба" icon={<LayoutTemplate className="h-3.5 w-3.5" />}>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(PRESET_META) as PresetId[]).map((id) => {
          const meta = PRESET_META[id];
          const Icon = getEntityIcon(meta.icon);
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (window.confirm(`Применить шаблон «${meta.title}»? Текущие модули и тема будут заменены.`)) loadPreset(id);
              }}
              className="group flex flex-col items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-left transition-colors hover:border-violet-500/60 hover:bg-violet-500/5"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 transition-colors group-hover:bg-violet-600 group-hover:text-white">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-zinc-100">{meta.title}</span>
                <span className="block text-xs leading-snug text-zinc-500">{meta.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
