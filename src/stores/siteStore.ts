import { create } from 'zustand';
import type { SiteId } from '@/lib/sites/types';
import { loadActiveSite, saveActiveSite } from '@/lib/storage/activeSite';

type SiteState = {
  activeSiteId: SiteId;
  hydrate: () => void;
  setActiveSite: (id: SiteId) => void;
};

export const useSiteStore = create<SiteState>((set) => ({
  activeSiteId: 'gy',

  hydrate: () => {
    set({ activeSiteId: loadActiveSite() });
  },

  setActiveSite: (id) => {
    saveActiveSite(id);
    set({ activeSiteId: id });
  },
}));
