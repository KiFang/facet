import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HubLink } from '@/hub/client';

/**
 * Подключение к хабу вуза. Хранится отдельно от схемы: ключ клуба — секрет,
 * он не должен попасть в файл схемы или ссылку «Поделиться».
 */
interface HubLinkState {
  link: HubLink | null;
  setLink: (link: HubLink | null) => void;
}

export const useHubLink = create<HubLinkState>()(
  persist((set) => ({ link: null, setLink: (link) => set({ link }) }), { name: 'facet-os:hub', version: 1 }),
);
