import { getSite } from './registry';
import type { SiteId } from './types';

/** Formats a Date to YYYY-MM-DD in KST (UTC+9). */
function fmtKST(date: Date): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns a new Date offset by `days` days, aligned to KST midnight. */
function addDaysKST(now: Date, days: number): Date {
  // Convert now → KST date components
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // Build KST midnight of that date
  const kstMidnight = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate() + days,
  );
  // Convert back to UTC-based Date (subtract KST offset)
  return new Date(kstMidnight - 9 * 60 * 60 * 1000);
}

/**
 * Returns {min, max} date strings (YYYY-MM-DD, KST) for the given site's
 * bookable date range based on SitePolicy.advanceMinDays and bookableDays.
 *
 * @param siteId  - 'gy' | 'pj'
 * @param now     - current time (injectable for testing, defaults to new Date())
 */
export function getDateBounds(
  siteId: SiteId,
  now: Date = new Date(),
): { min: string; max: string } {
  const policy = getSite(siteId).config.policy;
  const minDate = addDaysKST(now, policy.advanceMinDays);
  const maxDate = addDaysKST(now, policy.bookableDays);
  return { min: fmtKST(minDate), max: fmtKST(maxDate) };
}
