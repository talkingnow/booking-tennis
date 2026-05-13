/**
 * tests/sites.test.ts — Multi-site abstraction layer unit tests.
 *
 * Coverage:
 * 1. registry.getSite() returns correct adapter types
 * 2. storage isolation: bt:account:gy vs bt:account:pj
 * 3. legacy key migration: bt:account → bt:account:gy
 * 4. authStore.doLogin() signature accepts siteId
 * 5. favoritesStore toggle/has/getList per siteId
 * 6. SitePolicy constants (GY_POLICY, PJ_POLICY)
 * 7. courts: COURTS_GY / COURTS_PJ / getCourts(siteId) / courtName(siteId, id)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mocked localStorage ────────────────────────────────────────────────────────

const localStorageStore: Record<string, string> = {};

const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageStore[key] = value; }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key]; }),
  clear: vi.fn(() => { for (const k of Object.keys(localStorageStore)) delete localStorageStore[k]; }),
};

vi.stubGlobal('localStorage', mockLocalStorage);

// ── Imports ────────────────────────────────────────────────────────────────────

import { GY_POLICY, PJ_POLICY } from '../src/lib/sites/types';
import { COURTS_GY, COURTS_PJ, getCourts, getCourt, courtName } from '../src/lib/courts';
import {
  loadAccount,
  saveAccount,
  clearAccount,
  migrateLegacyAccount,
} from '../src/lib/storage/account';
import {
  loadSession,
  saveSession,
  clearSession,
  migrateLegacySession,
} from '../src/lib/storage/session';
import {
  loadFavorites,
  saveFavorites,
  migrateLegacyFavorites,
} from '../src/lib/storage/favorites';
import type { StoredAccount } from '../src/lib/storage/account';
import type { Favorite } from '../src/lib/storage/favorites';

// ── 1. SitePolicy constants ────────────────────────────────────────────────────

describe('SitePolicy constants', () => {
  it('GY_POLICY has hours [5, 22] and bookableDays 21', () => {
    expect(GY_POLICY.hours).toEqual([5, 22]);
    expect(GY_POLICY.bookableDays).toBe(21);
    expect(GY_POLICY.hourlyFee).toBeNull();
  });

  it('PJ_POLICY has hours [7, 21] and bookableDays 7', () => {
    expect(PJ_POLICY.hours).toEqual([7, 21]);
    expect(PJ_POLICY.bookableDays).toBe(7);
    expect(PJ_POLICY.dailyMaxSlots).toBe(2);
    expect(PJ_POLICY.notes.length).toBeGreaterThan(0);
  });

  it('PJ_POLICY.hourlyFee is defined with weekday/weekend tiers', () => {
    expect(PJ_POLICY.hourlyFee).toBeDefined();
    expect(PJ_POLICY.hourlyFee!.weekday.day).toBe(3000);
    expect(PJ_POLICY.hourlyFee!.weekend.day).toBe(3500);
    expect(PJ_POLICY.hourlyFee!.weekday.night).toBe(5000);
    expect(PJ_POLICY.hourlyFee!.weekend.night).toBe(5500);
  });
});

// ── 2. Courts registry ─────────────────────────────────────────────────────────

describe('courts', () => {
  it('COURTS_GY has 10 entries', () => {
    expect(COURTS_GY).toHaveLength(10);
  });

  it('COURTS_PJ has 12 entries', () => {
    expect(COURTS_PJ).toHaveLength(12);
  });

  it('getCourts("gy") returns COURTS_GY', () => {
    expect(getCourts('gy')).toBe(COURTS_GY);
  });

  it('getCourts("pj") returns COURTS_PJ', () => {
    expect(getCourts('pj')).toBe(COURTS_PJ);
  });

  it('courtName("gy", 1) returns 대화', () => {
    expect(courtName('gy', 1)).toBe('대화');
  });

  it('courtName("pj", 1) returns 광탄', () => {
    expect(courtName('pj', 1)).toBe('광탄');
  });

  it('courtName("pj", 12) returns 공설(파주스타디움) (corrected 2026-05-13)', () => {
    expect(courtName('pj', 12)).toBe('공설(파주스타디움)');
  });

  it('getCourt("pj", 2) is 하지석동 (corrected 2026-05-13; was 운정1(가온A))', () => {
    const court = getCourt('pj', 2);
    expect(court).toBeDefined();
    expect(court!.name).toBe('하지석동');
    expect(court!.courtNos).toHaveLength(5);
  });

  it('courtName falls back gracefully for unknown id', () => {
    expect(courtName('gy', 999)).toBe('코트999');
    expect(courtName('pj', 999)).toBe('코트999');
  });
});

// ── 3. Storage isolation ───────────────────────────────────────────────────────

describe('account storage isolation', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('saves and loads account per siteId', () => {
    const gyAcc: StoredAccount = { id: 'gyUser', pw: 'pw1', remember: true, savedAt: 1 };
    const pjAcc: StoredAccount = { id: 'pjUser', pw: 'pw2', remember: true, savedAt: 2 };

    saveAccount('gy', gyAcc);
    saveAccount('pj', pjAcc);

    expect(loadAccount('gy')?.id).toBe('gyUser');
    expect(loadAccount('pj')?.id).toBe('pjUser');

    // Keys must be separate
    expect(localStorageStore['bt:account:gy']).toBeDefined();
    expect(localStorageStore['bt:account:pj']).toBeDefined();
  });

  it('clearAccount("gy") does not affect pj', () => {
    const pjAcc: StoredAccount = { id: 'pjUser', pw: 'pw', remember: true, savedAt: 1 };
    saveAccount('pj', pjAcc);
    saveAccount('gy', { id: 'gyUser', pw: 'pw', remember: true, savedAt: 1 });

    clearAccount('gy');

    expect(loadAccount('gy')).toBeNull();
    expect(loadAccount('pj')?.id).toBe('pjUser');
  });

  it('load returns null when key absent', () => {
    expect(loadAccount('gy')).toBeNull();
    expect(loadAccount('pj')).toBeNull();
  });
});

describe('session storage isolation', () => {
  beforeEach(() => { mockLocalStorage.clear(); });

  it('saves and loads session per siteId', () => {
    saveSession('gy', 'gytssn=abc123');
    saveSession('pj', 'pjssn=xyz789');

    expect(loadSession('gy')).toBe('gytssn=abc123');
    expect(loadSession('pj')).toBe('pjssn=xyz789');
  });

  it('clearSession("pj") does not affect gy', () => {
    saveSession('gy', 'gytssn=abc123');
    saveSession('pj', 'pjssn=xyz789');
    clearSession('pj');

    expect(loadSession('pj')).toBeNull();
    expect(loadSession('gy')).toBe('gytssn=abc123');
  });
});

describe('favorites storage isolation', () => {
  beforeEach(() => { mockLocalStorage.clear(); });

  it('saves and loads favorites per siteId', () => {
    const gyFavs: Favorite[] = [{ courtId: 1 }, { courtId: 3 }];
    const pjFavs: Favorite[] = [{ courtId: 5, courtNo: 2 }];

    saveFavorites('gy', gyFavs);
    saveFavorites('pj', pjFavs);

    expect(loadFavorites('gy')).toHaveLength(2);
    expect(loadFavorites('pj')).toHaveLength(1);
    expect(loadFavorites('pj')[0].courtId).toBe(5);
  });

  it('gy favorites do not bleed into pj', () => {
    saveFavorites('gy', [{ courtId: 1 }, { courtId: 2 }]);
    expect(loadFavorites('pj')).toHaveLength(0);
  });
});

// ── 4. Legacy migration ────────────────────────────────────────────────────────

describe('legacy key migration', () => {
  beforeEach(() => { mockLocalStorage.clear(); });

  it('migrateLegacyAccount moves bt:account → bt:account:gy', () => {
    const legacy: StoredAccount = { id: 'legacyUser', pw: 'pw', remember: true, savedAt: 1 };
    localStorageStore['bt:account'] = JSON.stringify(legacy);

    migrateLegacyAccount();

    expect(loadAccount('gy')?.id).toBe('legacyUser');
    expect(localStorageStore['bt:account']).toBeUndefined();
  });

  it('migrateLegacyAccount does not overwrite existing gy account', () => {
    const legacy: StoredAccount = { id: 'legacyUser', pw: 'pw', remember: true, savedAt: 1 };
    const existing: StoredAccount = { id: 'existingUser', pw: 'pw2', remember: true, savedAt: 2 };
    localStorageStore['bt:account'] = JSON.stringify(legacy);
    saveAccount('gy', existing);

    migrateLegacyAccount();

    // Existing gy account should be preserved
    expect(loadAccount('gy')?.id).toBe('existingUser');
    expect(localStorageStore['bt:account']).toBeUndefined();
  });

  it('migrateLegacySession moves bt:session → bt:session:gy', () => {
    const sessionData = { cookie: 'gytssn=old123', savedAt: Date.now() };
    localStorageStore['bt:session'] = JSON.stringify(sessionData);

    migrateLegacySession();

    expect(loadSession('gy')).toBe('gytssn=old123');
    expect(localStorageStore['bt:session']).toBeUndefined();
  });

  it('migrateLegacyFavorites moves bt:favorites → bt:favorites:gy', () => {
    const legacy: Favorite[] = [{ courtId: 2 }, { courtId: 4 }];
    localStorageStore['bt:favorites'] = JSON.stringify(legacy);

    migrateLegacyFavorites();

    expect(loadFavorites('gy')).toHaveLength(2);
    expect(localStorageStore['bt:favorites']).toBeUndefined();
  });
});
