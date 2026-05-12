import type { Slot, SlotStatus } from '../gytennis/types';

/**
 * Parse the slot grid out of a /daily/{courtId} HTML page.
 *
 * Layout (single <table class="wholeTable">):
 *   <tr>
 *     <td>  [time labels: 06:00~08:00, 08:00~10:00, ..., 20:00~22:00]
 *     <td>  ["1 코트" or "9 코트" header] + 8 td.resTag cells
 *     <td>  next court column
 *     ...
 *
 * Classification per cell:
 *   - yxjorg has `disabled` attribute        → blocked (예약불가)
 *   - has `<input name="isvkrr[]">` sibling  → blocked (soft-blocked; no UI hint on
 *                                              the gytennis site, not pickable)
 *   - ctooltip-trigger data-ctooltip="0|.."  → available
 *   - ctooltip-trigger data-ctooltip="1|.."  → reserved (by another user)
 *   - otherwise                              → blocked (defensive default)
 *
 * The displayed court number comes from the column header text (e.g. "9 코트"),
 * NOT from the yxjorg `value` 3rd token (which is a site-internal id).
 */
export function parseSlots(html: string): Slot[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const wholeTable = doc.querySelector<HTMLElement>('table.wholeTable');
  if (!wholeTable) return [];

  // First top-level TR holds 1 time-label TD + N court column TDs.
  const topRow = wholeTable.querySelector<HTMLTableRowElement>(':scope > tbody > tr, :scope > tr');
  if (!topRow) return [];
  const columns = Array.from(topRow.children).filter(
    (el) => el.tagName === 'TD',
  ) as HTMLElement[];

  const out: Slot[] = [];
  // Skip column 0 (time labels). Columns 1..N are court columns.
  for (let i = 1; i < columns.length; i++) {
    const col = columns[i];
    const displayedCourtNo = parseDisplayedCourtNo(col);
    if (displayedCourtNo == null) continue;

    const cells = col.querySelectorAll<HTMLElement>('td.resTag');
    cells.forEach((cell) => {
      const slot = parseCell(cell, displayedCourtNo);
      if (slot) out.push(slot);
    });
  }
  return out;
}

/**
 * Extract the user-visible court number from a column TD by reading the FIRST
 * text token of the column header. Handles "1 코트", "9 코트", etc.
 *
 * If the column does not start with a number, returns null (defensive).
 */
function parseDisplayedCourtNo(columnTd: HTMLElement): number | null {
  // The header is rendered as `<table class="custom"><tr><td>9 코트</td>...</table>`
  // or sometimes directly as text. Grab the first text-bearing element.
  // Use textContent then take the first number that appears BEFORE the first resTag.
  // Safest: clone, remove resTag descendants, then read text.
  const clone = columnTd.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('td.resTag').forEach((n) => n.remove());
  const text = (clone.textContent || '').trim();
  const m = text.match(/(\d+)\s*코트/);
  if (m) return Number(m[1]);
  // Fallback: any leading number.
  const m2 = text.match(/^\s*(\d+)/);
  return m2 ? Number(m2[1]) : null;
}

function parseCell(cell: HTMLElement, displayedCourtNo: number): Slot | null {
  const yxjorg = cell.querySelector<HTMLInputElement>('input[name="yxjorg[]"]');
  if (!yxjorg) return null;
  const raw = yxjorg.getAttribute('value') ?? '';
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

  const status = classifyCell(cell, yxjorg);

  return {
    date,
    courtId,
    courtNo: displayedCourtNo,
    internalCourtId,
    hour,
    priceFlag,
    status,
    raw,
  };
}

function classifyCell(cell: HTMLElement, yxjorg: HTMLInputElement): SlotStatus {
  // Hard-blocked: yxjorg is disabled
  if (yxjorg.hasAttribute('disabled')) return 'blocked';

  // Soft-blocked: isvkrr present (regardless of disabled) means the slot
  // is not pickable. On the gytennis site these render with no visual
  // indicator (empty cell). The user cannot click them.
  const isvkrr = cell.querySelector<HTMLInputElement>('input[name="isvkrr[]"]');
  if (isvkrr) return 'blocked';

  const tip = cell.querySelector<HTMLElement>('.ctooltip-trigger[data-ctooltip]');
  const flag = tip?.getAttribute('data-ctooltip')?.charAt(0);
  if (flag === '0') return 'available';
  if (flag === '1') return 'reserved';
  return 'blocked';
}

/**
 * Group slots by displayed courtNo (== gytennis website column).
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
