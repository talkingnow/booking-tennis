import type { SiteId } from '@/lib/sites/types';

// Legacy key (pre-multisite, always assumed 'gy')
const LEGACY_KEY = 'bt:favorites';

function key(siteId: SiteId): string {
  return `bt:favorites:${siteId}`;
}

export type Favorite = {
  courtId: number;
  /** undefined = whole complex; number = specific court face */
  courtNo?: number;
};

export function loadFavorites(siteId: SiteId): Favorite[] {
  try {
    const raw = localStorage.getItem(key(siteId));
    if (!raw) return [];
    return JSON.parse(raw) as Favorite[];
  } catch {
    return [];
  }
}

export function saveFavorites(siteId: SiteId, list: Favorite[]): void {
  localStorage.setItem(key(siteId), JSON.stringify(list));
}

export function toggleFavorite(siteId: SiteId, f: Favorite): Favorite[] {
  const list = loadFavorites(siteId);
  const idx = list.findIndex((x) => x.courtId === f.courtId && x.courtNo === f.courtNo);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(f);
  saveFavorites(siteId, list);
  return list;
}

/**
 * One-time migration: if legacy 'bt:favorites' key exists, move it to 'bt:favorites:gy'.
 */
export function migrateLegacyFavorites(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    if (!localStorage.getItem(key('gy'))) {
      localStorage.setItem(key('gy'), raw);
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch {}
}
