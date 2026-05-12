import { create } from 'zustand';
import { loadFavorites, saveFavorites, migrateLegacyFavorites, type Favorite } from '@/lib/storage/favorites';
import type { SiteId } from '@/lib/sites/types';

type FavoritesState = {
  lists: Partial<Record<SiteId, Favorite[]>>;
  hydrate: () => void;
  toggle: (siteId: SiteId, f: Favorite) => void;
  has: (siteId: SiteId, f: Favorite) => boolean;
  getList: (siteId: SiteId) => Favorite[];
};

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  lists: {},

  hydrate: () => {
    // One-time legacy key migration
    migrateLegacyFavorites();

    const lists: Partial<Record<SiteId, Favorite[]>> = {};
    for (const siteId of ['gy', 'pj'] as SiteId[]) {
      const favs = loadFavorites(siteId);
      if (favs.length > 0) lists[siteId] = favs;
    }
    set({ lists });
  },

  toggle: (siteId, f) => {
    const current = get().lists[siteId] ?? [];
    const list = [...current];
    const idx = list.findIndex((x) => x.courtId === f.courtId && x.courtNo === f.courtNo);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(f);
    saveFavorites(siteId, list);
    set((state) => ({ lists: { ...state.lists, [siteId]: list } }));
  },

  has: (siteId, f) =>
    (get().lists[siteId] ?? []).some(
      (x) => x.courtId === f.courtId && x.courtNo === f.courtNo,
    ),

  getList: (siteId) => get().lists[siteId] ?? [],
}));
