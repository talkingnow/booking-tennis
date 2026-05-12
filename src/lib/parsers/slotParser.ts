import type { Slot, SlotStatus } from '../gytennis/types';

/**
 * Parse the slot grid out of a /daily/{courtId} HTML page.
 *
 * Layout (single <table class="wholeTable">):
 *   <tr>
 *     <td>  [time labels: 06:00~08:00, ..., 20:00~22:00]
 *     <td>  ["1 코트" header] + 8 td.resTag cells
 *     ...
 *
 * Cell classification (verified against live gytennis site, 2026-05-12):
 *   - yxjorg has `disabled`                  → blocked (truly unavailable)
 *   - has `<div class="ctooltip-trigger">`   → reserved (someone has it; the
 *     (with fa-user-clock icon, regardless    user-clock icon is the visual
 *      of data-ctooltip="0|" or "1|")         hint shown on the site)
 *   - has `<input name="isvkrr[]">` sibling  → available (pickable, no icon
 *     (without `disabled`)                    rendered on the site)
 *   - otherwise                              → blocked (defensive)
 *
 * The displayed court number comes from the column header text (e.g. "9 코트"),
 * NOT from the yxjorg `value` 3rd token (a site-internal id).
 */
export function parseSlots(html: string): Slot[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const wholeTable = doc.querySelector<HTMLElement>('table.wholeTable');
  if (!wholeTable) return [];

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
      const slot = parseCell(cell, displayedCourtNo);
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

  // Read the isvkrr[] value (present only in available cells; differs from yxjorg
  // in the last token which carries the actual price instead of 0).
  const isvkrrInput = cell.querySelector<HTMLInputElement>('input[name="isvkrr[]"]');
  const isvkrrRaw = isvkrrInput?.getAttribute('value') ?? '';

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

function classifyCell(cell: HTMLElement, yxjorg: HTMLInputElement): SlotStatus {
  // Hard-blocked (예약불가): yxjorg explicitly disabled.
  if (yxjorg.hasAttribute('disabled')) return 'blocked';

  // Reserved: ctooltip-trigger element is present. The site renders the
  // fa-user-clock icon and shows reservation info on hover. Both
  // data-ctooltip="0|..." and "1|..." map here — the leading digit
  // distinguishes pending vs paid, not availability.
  const tip = cell.querySelector<HTMLElement>('.ctooltip-trigger');
  if (tip) return 'reserved';

  // Available: a non-disabled isvkrr input is the site's "pickable" marker.
  // The cell renders empty (no icon) on the site, signaling free pickup.
  const isvkrr = cell.querySelector<HTMLInputElement>('input[name="isvkrr[]"]');
  if (isvkrr && !isvkrr.hasAttribute('disabled')) return 'available';

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
