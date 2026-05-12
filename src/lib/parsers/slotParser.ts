import type { Slot, SlotStatus } from '../gytennis/types';

/**
 * Parse the slot grid out of a /daily/{courtId} HTML page.
 * Returns an empty array if the page contains no recognizable cells
 * (e.g. session expired, redirected to /Login).
 */
export function parseSlots(html: string): Slot[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cells = doc.querySelectorAll<HTMLElement>('td.resTag');
  const out: Slot[] = [];

  cells.forEach((cell) => {
    const yxjorg = cell.querySelector<HTMLInputElement>('input[name="yxjorg[]"]');
    if (!yxjorg) return;
    const raw = yxjorg.getAttribute('value') ?? '';
    const parts = raw.split('|');
    if (parts.length < 5) return;

    const date = parts[0];
    const courtId = Number(parts[1]);
    const courtNo = Number(parts[2]);
    const hour = Number(parts[3]);
    const priceFlag = Number(parts[4]);
    if (!Number.isFinite(courtId) || !Number.isFinite(courtNo) || !Number.isFinite(hour)) return;

    let status: SlotStatus;
    if (yxjorg.hasAttribute('disabled')) {
      status = 'blocked';
    } else {
      const tip = cell.querySelector<HTMLElement>('.ctooltip-trigger[data-ctooltip]');
      const flag = tip?.getAttribute('data-ctooltip')?.charAt(0);
      if (flag === '0') status = 'available';
      else if (flag === '1') status = 'reserved';
      else status = 'blocked';
    }

    out.push({ date, courtId, courtNo, hour, priceFlag, status, raw });
  });

  return out;
}

/**
 * Group slots by court face number (courtNo).
 * Useful for the favorites/quick-reserve grid UI.
 */
export function groupByCourtNo(slots: Slot[]): Map<number, Slot[]> {
  const m = new Map<number, Slot[]>();
  for (const s of slots) {
    const arr = m.get(s.courtNo);
    if (arr) arr.push(s);
    else m.set(s.courtNo, [s]);
  }
  for (const [, arr] of m) arr.sort((a, b) => a.hour - b.hour);
  return m;
}
