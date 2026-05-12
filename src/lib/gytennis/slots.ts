import { gyFetch } from './proxyClient';
import { parseSlots } from '../parsers/slotParser';
import { parseCalendar, parseCourtMeta, parseFormHints } from '../parsers/metaParser';
import type { DailyView } from './types';

/**
 * GET /daily/{courtId}[/{date}] and parse the slot grid + metadata.
 * Returns null when the response is not a valid daily page (e.g. expired session).
 */
export async function getDaily(
  courtId: number,
  cookie: string,
  date?: string,
): Promise<DailyView | null> {
  const path = date ? `/daily/${courtId}/${date}` : `/daily/${courtId}`;
  const res = await gyFetch(path, { cookie });
  if (res.status !== 200) return null;
  const html = await res.text();
  if (!/wholeTable/.test(html)) return null;
  const meta = parseCourtMeta(html, courtId);
  const slots = parseSlots(html);
  const calendar = parseCalendar(html);
  const hints = parseFormHints(html);
  return { meta, slots, calendar, ...hints };
}

/**
 * Fetch daily views for several courts in parallel.
 * Failed fetches are returned as null entries in the result map.
 */
export async function getDailyBatch(
  courtIds: number[],
  cookie: string,
  date?: string,
): Promise<Map<number, DailyView | null>> {
  const out = new Map<number, DailyView | null>();
  const results = await Promise.all(courtIds.map((id) => getDaily(id, cookie, date).catch(() => null)));
  courtIds.forEach((id, i) => out.set(id, results[i]));
  return out;
}
