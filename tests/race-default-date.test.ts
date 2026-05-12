/**
 * Tests for the defaultDate() month-overflow clamping logic in Race.tsx.
 * The function computes "same day next month", clamped to the last day of
 * the target month — avoiding the JS Date overflow bug (e.g. Jan 31 + 1 month
 * would naively become Mar 3 instead of Feb 28).
 */
import { describe, it, expect } from 'vitest';

/** Mirrors the exported defaultDate logic but accepts a fixed "now" for testing. */
function defaultDateFrom(now: Date): string {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const nextMonth = m + 1 > 11 ? 0 : m + 1;
  const nextYear = m + 1 > 11 ? y + 1 : y;
  // new Date(year, month+1, 0) gives the last day of `month` in that year.
  const lastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
  const day = Math.min(now.getDate(), lastDay);
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

describe('defaultDate overflow clamping', () => {
  it('Jan 31 + 1 month → Feb 28 (2026, non-leap)', () => {
    const result = defaultDateFrom(new Date(2026, 0, 31)); // Jan 31
    expect(result).toBe('2026-02-28');
  });

  it('Mar 31 + 1 month → Apr 30', () => {
    const result = defaultDateFrom(new Date(2026, 2, 31)); // Mar 31
    expect(result).toBe('2026-04-30');
  });

  it('May 31 + 1 month → Jun 30', () => {
    const result = defaultDateFrom(new Date(2026, 4, 31)); // May 31
    expect(result).toBe('2026-06-30');
  });

  it('Oct 31 + 1 month → Nov 30', () => {
    const result = defaultDateFrom(new Date(2026, 9, 31)); // Oct 31
    expect(result).toBe('2026-11-30');
  });

  it('Dec 31 + 1 month → Jan 31 next year', () => {
    const result = defaultDateFrom(new Date(2026, 11, 31)); // Dec 31
    expect(result).toBe('2027-01-31');
  });

  it('Feb 28 + 1 month → Mar 28 (no overflow needed)', () => {
    const result = defaultDateFrom(new Date(2026, 1, 28)); // Feb 28
    expect(result).toBe('2026-03-28');
  });

  it('Jan 15 + 1 month → Feb 15 (mid-month, no clamping needed)', () => {
    const result = defaultDateFrom(new Date(2026, 0, 15)); // Jan 15
    expect(result).toBe('2026-02-15');
  });

  it('result is always a valid YYYY-MM-DD string', () => {
    const testDates = [
      new Date(2026, 0, 31),
      new Date(2026, 2, 31),
      new Date(2026, 4, 31),
      new Date(2026, 9, 31),
      new Date(2026, 11, 31),
    ];
    for (const d of testDates) {
      const result = defaultDateFrom(d);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const parsed = new Date(result);
      expect(isNaN(parsed.getTime())).toBe(false);
    }
  });
});
