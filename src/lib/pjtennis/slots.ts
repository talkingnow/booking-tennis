import { pjFetch } from './proxyClient';
import { parseSlots } from '../parsers/slotParser';
import { parseCalendar, parseCourtMeta, parseFormHints } from '../parsers/metaParser';
import type { DailyView } from './types';

/**
 * GET /daily/{courtId}[/{date}] from pjtennis and parse the slot grid + metadata.
 *
 * PJ DOM confirmed 2026-05-13: uses rjelnu[]/edhtqe[] input names and
 * fa-user-clock icon for reserved slots — different from GY (yxjorg/isvkrr/ctooltip).
 * parseSlots() auto-detects the scheme via data-srv="edhtqe" on wholeTable.
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
  if (!/wholeTable/.test(html)) return null;
  const meta = parseCourtMeta(html, courtId);
  const slots = parseSlots(html);
  const calendar = parseCalendar(html);
  const hints = parseFormHints(html);
  return { meta, slots, calendar, ...hints };
}

/**
 * Fetch daily views for several courts with staggered start times.
 * Uses allSettled so one 502 court doesn't suppress results from others.
 * stagger (ms) between consecutive request launches reduces rate-limit risk.
 */
export async function getDailyBatch(
  courtIds: number[],
  cookie: string,
  date?: string,
  stagger = 250,
): Promise<Map<number, DailyView | null>> {
  const out = new Map<number, DailyView | null>();
  const results = await Promise.allSettled(
    courtIds.map((id, i) =>
      new Promise<void>((resolve) => setTimeout(resolve, i * stagger)).then(() =>
        getDaily(id, cookie, date),
      ),
    ),
  );
  courtIds.forEach((id, i) => {
    const r = results[i];
    out.set(id, r.status === 'fulfilled' ? r.value : null);
  });
  return out;
}
