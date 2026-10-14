import { create } from 'zustand';
import { useClubStore } from './useClubStore';

/** Что выбрано в навигаторе — от этого зависит панель свойств. */
export type Selection =
  | { kind: 'club' }
  | { kind: 'appearance' }
  | { kind: 'home' }
  | { kind: 'entity'; id: string }
  | { kind: 'plugins' }
  | { kind: 'publish' };

export type WorkspaceTab = 'portal' | 'diagram' | 'json';

export type DialogId =
  | 'export' | 'settings' | 'plugins' | 'templates' | 'commands' | 'welcome'
  | 'shortcuts' | 'about' | 'newModule' | 'import';

export type ExportKind = 'install' | 'update' | 'local';

interface Workbench {
  selection: Selection;
  tab: WorkspaceTab;
  dialog: DialogId | null;
  /** Параметр диалога: раздел для импорта, тип экспорта и т. п. */
  dialogArg: string | null;
  select: (selection: Selection) => void;
  setTab: (tab: WorkspaceTab) => void;
  open: (dialog: DialogId, arg?: string) => void;
  close: () => void;
}

export const useWorkbench = create<Workbench>((set) => ({
  selection: { kind: 'club' },
  tab: 'portal',
  dialog: null,
  dialogArg: null,
  select: (selection) => {
    if (selection.kind === 'entity') useClubStore.getState().setActiveEntity(selection.id);
    set({ selection });
  },
  setTab: (tab) => set({ tab }),
  open: (dialog, arg) => set({ dialog, dialogArg: arg ?? null }),
  close: () => set({ dialog: null, dialogArg: null }),
}));
