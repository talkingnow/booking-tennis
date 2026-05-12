import type { SiteId } from '@/lib/sites/types';

// Legacy key (pre-multisite, always assumed 'gy')
const LEGACY_KEY = 'bt:account';

function key(siteId: SiteId): string {
  return `bt:account:${siteId}`;
}

export type StoredAccount = {
  id: string;
  pw: string;
  remember: boolean;
  savedAt: number;
};

export function loadAccount(siteId: SiteId): StoredAccount | null {
  try {
    const raw = localStorage.getItem(key(siteId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredAccount;
  } catch {
    return null;
  }
}

export function saveAccount(siteId: SiteId, account: StoredAccount): void {
  localStorage.setItem(key(siteId), JSON.stringify(account));
}

export function clearAccount(siteId: SiteId): void {
  localStorage.removeItem(key(siteId));
}

/**
 * One-time migration: if legacy 'bt:account' key exists, move it to 'bt:account:gy'
 * and remove the legacy key.
 */
export function migrateLegacyAccount(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    // Only migrate if 'bt:account:gy' doesn't already exist
    if (!localStorage.getItem(key('gy'))) {
      localStorage.setItem(key('gy'), raw);
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch {}
}
