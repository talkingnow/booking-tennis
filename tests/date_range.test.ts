import { describe, it, expect, vi } from 'vitest';

// Mock the registry so getDateBounds doesn't need a real fetch
vi.mock('../src/lib/sites/registry', () => ({
  getSite: (id: string) => ({
    config: {
      policy: id === 'gy'
        ? { advanceMinDays: 0, bookableDays: 21 }
        : { advanceMinDays: 0, bookableDays: 7 },
    },
  }),
}));

import { getDateBounds } from '../src/lib/sites/dateRange';

function kstDate(y: number, m: number, d: number): Date {
  // Returns a UTC Date whose KST representation is y-m-d at midnight
  return new Date(Date.UTC(y, m - 1, d) - 9 * 60 * 60 * 1000);
}

describe('getDateBounds', () => {
  describe('gy (advanceMinDays=0, bookableDays=21)', () => {
    it('min = today (KST), max = today+21', () => {
      const now = kstDate(2026, 5, 16); // KST 2026-05-16 midnight
      const { min, max } = getDateBounds('gy', now);
      expect(min).toBe('2026-05-16');
      expect(max).toBe('2026-06-06');
    });

    it('end of month wraps correctly (May 31 + 21 = June 21)', () => {
      const now = kstDate(2026, 5, 31);
      const { min, max } = getDateBounds('gy', now);
      expect(min).toBe('2026-05-31');
      expect(max).toBe('2026-06-21');
    });

    it('leap year: Feb 28 + 21 = March 21', () => {
      const now = kstDate(2028, 2, 28); // 2028 is a leap year
      const { min, max } = getDateBounds('gy', now);
      expect(min).toBe('2028-02-28');
      expect(max).toBe('2028-03-20');
    });
  });

  describe('pj (advanceMinDays=0, bookableDays=7)', () => {
    it('min = today (KST), max = today+7', () => {
      const now = kstDate(2026, 5, 16);
      const { min, max } = getDateBounds('pj', now);
      expect(min).toBe('2026-05-16');
      expect(max).toBe('2026-05-23');
    });
  });

  describe('KST boundary: UTC+9 midnight', () => {
    it('23:59 UTC = 08:59 KST next day → KST date is still previous day', () => {
      // 2026-05-15 23:59 UTC = 2026-05-16 08:59 KST
      // KST date is 2026-05-16
      const nowUTC = new Date('2026-05-15T23:59:00Z');
      const { min } = getDateBounds('gy', nowUTC);
      expect(min).toBe('2026-05-16');
    });

    it('00:00 UTC = 09:00 KST same day', () => {
      // 2026-05-16 00:00 UTC = 2026-05-16 09:00 KST
      const nowUTC = new Date('2026-05-16T00:00:00Z');
      const { min } = getDateBounds('gy', nowUTC);
      expect(min).toBe('2026-05-16');
    });

    it('14:59 UTC = 23:59 KST → KST date is still same UTC day', () => {
      // 2026-05-16 14:59 UTC = 2026-05-16 23:59 KST → KST date is 2026-05-16
      const nowUTC = new Date('2026-05-16T14:59:00Z');
      const { min } = getDateBounds('gy', nowUTC);
      expect(min).toBe('2026-05-16');
    });

    it('15:00 UTC = 00:00 KST next day → KST date advances', () => {
      // 2026-05-16 15:00 UTC = 2026-05-17 00:00 KST
      const nowUTC = new Date('2026-05-16T15:00:00Z');
      const { min } = getDateBounds('gy', nowUTC);
      expect(min).toBe('2026-05-17');
    });
  });

  describe('year boundary', () => {
    it('Dec 31 + 21 = Jan 21 next year', () => {
      const now = kstDate(2026, 12, 31);
      const { min, max } = getDateBounds('gy', now);
      expect(min).toBe('2026-12-31');
      expect(max).toBe('2027-01-21');
    });
  });
});
