import { pjFetch } from './proxyClient';
import { parseSlots } from '../parsers/slotParser';
import { parseCalendar, parseCourtMeta, parseFormHints } from '../parsers/metaParser';
import type { DailyView } from './types';

/**
 * GET /daily/{courtId}[/{date}] from pjtennis and parse the slot grid + metadata.
 *
 * TODO(M0/R1): pjtennis HTML structure is assumed identical to gytennis
 * (same vendor codebase). If M0 curl shows different class names / attributes,
 * add a pjSlotParser and switch here.
 *
 * Returns null when the response is not a valid daily page (e.g. expired session).
 */
export async function getDaily(
  courtId: number,
  cookie: string,
  date?: string,
): Promise<DailyView | null> {
  const path = date ? `/daily/${courtId}/${date}` : `/daily/${courtId}`;
  const res = await pjFetch(path, { cookie });
  if (res.status !== 200) return null;
  const html = await res.text();
  // TODO(M0/R1): If pjtennis uses different structural marker, update this check.
  if (!/wholeTable/.test(html)) return null;
  const meta = parseCourtMeta(html, courtId);
  const slots = parseSlots(html);
  const calendar = parseCalendar(html);
  const hints = parseFormHints(html);
  return { meta, slots, calendar, ...hints };
}

/**
 * Fetch daily views for several courts in parallel.
 */
export async function getDailyBatch(
  courtIds: number[],
  cookie: string,
  date?: string,
): Promise<Map<number, DailyView | null>> {
  const out = new Map<number, DailyView | null>();
  const results = await Promise.all(
    courtIds.map((id) => getDaily(id, cookie, date).catch(() => null)),
  );
  courtIds.forEach((id, i) => out.set(id, results[i]));
  return out;
}
