import { pjFetch } from './proxyClient';
import { parseSlots } from '../parsers/slotParser';
import { parseCalendar, parseCourtMeta, parseFormHints } from '../parsers/metaParser';
import type { DailyView } from './types';

/**
 * GET /daily/{courtId}[/{date}] from pjtennis and parse the slot grid + metadata.
 *
 * R1 확정 (M0 curl 2026-05-12): /daily/1 에서 wholeTable, ensdat, data-sot,
 * data-soc, data-grp, rsvConfirm, van_code 키워드 모두 확인 → 동일 구조.
 * isvkrr/yxjorg/ctooltip 은 로그인 후 슬롯 선택 시 DOM 주입 — 파서 재사용 가능.
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
  // R1 확정: gytennis와 동일한 wholeTable 마커 사용 확인됨.
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
