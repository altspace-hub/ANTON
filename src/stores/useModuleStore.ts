import { create } from 'zustand';
import { MODULES } from '@/lib/constants';
import type { ModuleDefinition } from '@/lib/types';

interface ModuleState {
  modules: ModuleDefinition[];
  currentModuleId: string | null;
  getCurrentModule: () => ModuleDefinition | undefined;
  setCurrentModule: (id: string) => void;
}

export const useModuleStore = create<ModuleState>((set, get) => ({
  modules: MODULES,
  currentModuleId: null,

  getCurrentModule: () => {
    const { modules, currentModuleId } = get();
    return modules.find((m) => m.id === currentModuleId);
  },

  setCurrentModule: (id) => set({ currentModuleId: id }),
}));
