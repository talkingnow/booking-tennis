import type { CalendarEntry, CourtMeta } from '../gytennis/types';

/** Parse the `<div class="gtitle" data-sot=".." data-grp=".." data-soc="..">` element. */
export function parseCourtMeta(html: string, fallbackId: number): CourtMeta {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const el = doc.querySelector<HTMLElement>('.gtitle[data-grp]');
  if (!el) {
    return { id: fallbackId, dailyLimit: 0, perCourtLimit: 0 };
  }
  return {
    id: Number(el.getAttribute('data-grp') ?? fallbackId),
    dailyLimit: Number(el.getAttribute('data-sot') ?? 0),
    perCourtLimit: Number(el.getAttribute('data-soc') ?? 0),
  };
}

/** Parse the 21-day reservation summary JSON from `<input id="ensdat" value='[...]'>`. */
export function parseCalendar(html: string): CalendarEntry[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const el = doc.getElementById('ensdat') as HTMLInputElement | null;
  if (!el) return [];
  const raw = el.value;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Array<{ date: string; reserved: string | number; total_cnt: string | number }>;
    return arr.map((it) => ({
      date: it.date,
      reserved: Number(it.reserved),
      totalCnt: Number(it.total_cnt),
    }));
  } catch {
    return [];
  }
}

/** Extract the hidden cvalue / cdate / data-ssb to know the submit endpoint. */
export function parseFormHints(html: string): { cvalue: number; cdate: string; submitPath: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const cvalueEl = doc.querySelector<HTMLInputElement>('input[name="cvalue"]');
  const cdateEl = doc.querySelector<HTMLInputElement>('input[name="cdate"]');
  const table = doc.querySelector<HTMLElement>('table.wholeTable[data-ssb]');
  return {
    cvalue: Number(cvalueEl?.value ?? 0),
    cdate: cdateEl?.value ?? '',
    submitPath: table?.getAttribute('data-ssb') ?? 'rsvConfirm',
  };
}
