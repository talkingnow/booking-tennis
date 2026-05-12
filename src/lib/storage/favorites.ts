const KEY = 'bt:favorites';

export type Favorite = {
  courtId: number;
  /** undefined = whole complex; number = specific court face */
  courtNo?: number;
};

export function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Favorite[];
  } catch {
    return [];
  }
}

export function saveFavorites(list: Favorite[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function toggleFavorite(f: Favorite): Favorite[] {
  const list = loadFavorites();
  const idx = list.findIndex((x) => x.courtId === f.courtId && x.courtNo === f.courtNo);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(f);
  saveFavorites(list);
  return list;
}
