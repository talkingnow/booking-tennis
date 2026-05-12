import type { SiteId } from '@/lib/sites/types';

// Legacy key (pre-multisite, always assumed 'gy')
const LEGACY_KEY = 'bt:session';
const TTL_MS = 2 * 60 * 60 * 1000 - 5 * 60 * 1000; // 2h - 5min safety margin

type StoredSession = {
  cookie: string;
  savedAt: number;
};

function key(siteId: SiteId): string {
  return `bt:session:${siteId}`;
}

export function loadSession(siteId: SiteId): string | null {
  try {
    const raw = localStorage.getItem(key(siteId));
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (Date.now() - s.savedAt > TTL_MS) {
      localStorage.removeItem(key(siteId));
      return null;
    }
    return s.cookie;
  } catch {
    return null;
  }
}

export function saveSession(siteId: SiteId, cookie: string): void {
  const s: StoredSession = { cookie, savedAt: Date.now() };
  localStorage.setItem(key(siteId), JSON.stringify(s));
}

export function clearSession(siteId: SiteId): void {
  localStorage.removeItem(key(siteId));
}

export function sessionAge(siteId: SiteId): number | null {
  try {
    const raw = localStorage.getItem(key(siteId));
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    return Date.now() - s.savedAt;
  } catch {
    return null;
  }
}

/**
 * One-time migration: if legacy 'bt:session' key exists, move it to 'bt:session:gy'.
 */
export function migrateLegacySession(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    if (!localStorage.getItem(key('gy'))) {
      localStorage.setItem(key('gy'), raw);
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch {}
}
