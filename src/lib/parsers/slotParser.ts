import type { Slot, SlotStatus } from '../gytennis/types';

// GY uses yxjorg[]/isvkrr[]/.ctooltip-trigger
// PJ uses rjelnu[]/edhtqe[]/i.fa-user-clock + td[title="예약됨"]
// The primary input name is auto-detected from the wholeTable data-srv attribute
// or by probing the first resTag cell.

type SiteScheme = 'gy' | 'pj';

function detectScheme(wholeTable: HTMLElement): SiteScheme {
  // PJ sets data-srv="edhtqe" on the wholeTable element
  const srv = wholeTable.getAttribute('data-srv');
  if (srv === 'edhtqe') return 'pj';
  // Fallback: probe the first primary input name
  const firstInput = wholeTable.querySelector<HTMLInputElement>('input[name="rjelnu[]"]');
  if (firstInput) return 'pj';
  return 'gy';
}

/**
 * Parse the slot grid out of a /daily/{courtId} HTML page.
 *
 * Supports two site schemes (auto-detected from wholeTable):
 *   GY (gytennis): primary=yxjorg[], price=isvkrr[], reserved=.ctooltip-trigger
 *   PJ (pjtennis): primary=rjelnu[], price=edhtqe[], reserved=i.fa-solid.fa-user-clock
 *                  or td[title="예약됨"]
 */
export function parseSlots(html: string): Slot[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const wholeTable = doc.querySelector<HTMLElement>('table.wholeTable');
  if (!wholeTable) return [];

  const scheme = detectScheme(wholeTable);

  const topRow = wholeTable.querySelector<HTMLTableRowElement>(':scope > tbody > tr, :scope > tr');
  if (!topRow) return [];
  const columns = Array.from(topRow.children).filter(
    (el) => el.tagName === 'TD',
  ) as HTMLElement[];

  const out: Slot[] = [];
  for (let i = 1; i < columns.length; i++) {
    const col = columns[i];
    const displayedCourtNo = parseDisplayedCourtNo(col);
    if (displayedCourtNo == null) continue;

    const cells = col.querySelectorAll<HTMLElement>('td.resTag');
    cells.forEach((cell) => {
      const slot = parseCell(cell, displayedCourtNo, scheme);
      if (slot) out.push(slot);
    });
  }
  return out;
}

function parseDisplayedCourtNo(columnTd: HTMLElement): number | null {
  const clone = columnTd.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('td.resTag').forEach((n) => n.remove());
  const text = (clone.textContent || '').trim();
  const m = text.match(/(\d+)\s*코트/);
  if (m) return Number(m[1]);
  const m2 = text.match(/^\s*(\d+)/);
  return m2 ? Number(m2[1]) : null;
}

function parseCell(cell: HTMLElement, displayedCourtNo: number, scheme: SiteScheme): Slot | null {
  const primaryName = scheme === 'pj' ? 'rjelnu[]' : 'yxjorg[]';
  const priceName = scheme === 'pj' ? 'edhtqe[]' : 'isvkrr[]';

  const primaryInput = cell.querySelector<HTMLInputElement>(`input[name="${primaryName}"]`);
  if (!primaryInput) return null;
  const raw = primaryInput.getAttribute('value') ?? '';
  const parts = raw.split('|');
  if (parts.length < 5) return null;
  const date = parts[0];
  const courtId = Number(parts[1]);
  const internalCourtId = Number(parts[2]);
  const hour = Number(parts[3]);
  const priceFlag = Number(parts[4]);
  if (!Number.isFinite(courtId) || !Number.isFinite(internalCourtId) || !Number.isFinite(hour)) {
    return null;
  }

  const status = classifyCell(cell, primaryInput, priceName, scheme);

  const priceInput = cell.querySelector<HTMLInputElement>(`input[name="${priceName}"]`);
  const isvkrrRaw = priceInput?.getAttribute('value') ?? '';

  return {
    date,
    courtId,
    courtNo: displayedCourtNo,
    internalCourtId,
    hour,
    priceFlag,
    status,
    raw,
    isvkrrRaw,
  };
}

function classifyCell(
  cell: HTMLElement,
  primaryInput: HTMLInputElement,
  priceName: string,
  scheme: SiteScheme,
): SlotStatus {
  // Blocked: primary input is disabled (예약불가 on both GY and PJ)
  if (primaryInput.hasAttribute('disabled')) return 'blocked';

  if (scheme === 'pj') {
    // PJ reserved: fa-user-clock icon present or parent td has title="예약됨"
    const hasUserClock = cell.querySelector('i.fa-user-clock, i.fa-solid.fa-user-clock');
    if (hasUserClock) return 'reserved';
    if (cell.getAttribute('title') === '예약됨') return 'reserved';
  } else {
    // GY reserved: ctooltip-trigger div present
    if (cell.querySelector('.ctooltip-trigger')) return 'reserved';
  }

  // Available: price input present and not disabled
  const priceInput = cell.querySelector<HTMLInputElement>(`input[name="${priceName}"]`);
  if (priceInput && !priceInput.hasAttribute('disabled')) return 'available';

  return 'blocked';
}

/**
 * Group slots by displayed courtNo.
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
