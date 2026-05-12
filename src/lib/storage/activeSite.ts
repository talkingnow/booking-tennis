import type { SiteId } from '@/lib/sites/types';

const KEY = 'bt:activeSite';
const DEFAULT: SiteId = 'gy';

export function loadActiveSite(): SiteId {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === 'gy' || raw === 'pj') return raw;
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function saveActiveSite(id: SiteId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
}

export function clearActiveSite(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
