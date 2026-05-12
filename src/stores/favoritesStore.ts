import { create } from 'zustand';
import { loadFavorites, saveFavorites, type Favorite } from '@/lib/storage/favorites';

type FavoritesState = {
  list: Favorite[];
  hydrate: () => void;
  toggle: (f: Favorite) => void;
  has: (f: Favorite) => boolean;
};

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  list: [],
  hydrate: () => set({ list: loadFavorites() }),
  toggle: (f) => {
    const list = [...get().list];
    const idx = list.findIndex((x) => x.courtId === f.courtId && x.courtNo === f.courtNo);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(f);
    saveFavorites(list);
    set({ list });
  },
  has: (f) =>
    get().list.some((x) => x.courtId === f.courtId && x.courtNo === f.courtNo),
}));
