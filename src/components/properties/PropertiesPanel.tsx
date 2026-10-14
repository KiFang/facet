import { useClubStore } from '@/store/useClubStore';
import { useWorkbench } from '@/store/useWorkbench';
import type { Command } from '@/lib/commands';
import { EntityProperties } from './EntityProperties';
import { AppearanceProperties, ClubProperties, HomeProperties, PluginsProperties, PublishProperties } from './OtherProperties';

/** Правая панель: свойства выбранного в навигаторе объекта. */
export function PropertiesPanel({ commands }: { commands: Command[] }) {
  const selection = useWorkbench((s) => s.selection);
  const entities = useClubStore((s) => s.schema.entities);
  switch (selection.kind) {
    case 'entity': {
      const entity = entities.find((e) => e.id === selection.id);
      return entity ? <EntityProperties key={entity.id} entity={entity} /> : <ClubProperties commands={commands} />;
    }
    case 'appearance':
      return <AppearanceProperties />;
    case 'home':
      return <HomeProperties />;
    case 'plugins':
      return <PluginsProperties />;
    case 'publish':
      return <PublishProperties commands={commands} />;
    default:
      return <ClubProperties commands={commands} />;
  }
}
