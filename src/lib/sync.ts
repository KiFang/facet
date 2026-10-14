import { useEffect } from 'react';
import { useClubStore } from '@/store/useClubStore';
import { useSettings } from '@/store/useSettings';
import { useUiStore } from '@/i18n';

/**
 * Синхронизация окон: все окна Facet OS работают с одним localStorage.
 * Когда другое окно что-то сохранило, перечитываем состояние (история отмены
 * при этом не пополняется — изменения сделаны не в этом окне).
 */
export function useCrossWindowSync() {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage || !e.key) return;
      if (e.key === 'facet-os:schema') {
        const temporal = useClubStore.temporal.getState();
        temporal.pause();
        void Promise.resolve(useClubStore.persist.rehydrate()).finally(() => temporal.resume());
      } else if (e.key === 'facet-os:settings') {
        void useSettings.persist.rehydrate();
      } else if (e.key === 'facet-os:ui') {
        void useUiStore.persist.rehydrate();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}
