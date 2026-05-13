import { pjFetch } from './proxyClient';
import { extractOrderId, parseKcpForm } from '../parsers/kcpParser';
import type { ReservationResult, Slot } from './types';
import { debugLog } from '@/components/DebugPanel';

/**
 * Submit one or more slots to pjtennis /rsvConfirm.
 *
 * R1 확정 (M0 curl 2026-05-12): rsvConfirm, van_code 모두 존재 확인.
 *   POST body: cvalue, cdate, isvkrr[], van_code — gytennis와 동일.
 *
 * TODO(R3): 결제 PG — KCP 동일 가정. 라이브 예약 1회 테스트로 확정 필요.
 */
export async function submitReservation(
  slots: Slot[],
  cookie: string,
  options: { vanCode?: string } = {},
): Promise<ReservationResult> {
  if (!slots.length) return { ok: false, reason: 'unknown', detail: 'no_slots' };
  const first = slots[0];
  for (const s of slots) {
    if (s.courtId !== first.courtId || s.date !== first.date) {
      return { ok: false, reason: 'unknown', detail: 'mixed_court_or_date' };
    }
  }

  const body = new URLSearchParams();
  body.set('cvalue', String(first.courtId));
  body.set('cdate', first.date);
  for (const s of slots) body.append('isvkrr[]', s.isvkrrRaw || s.raw);
  body.set('van_code', options.vanCode ?? '');

  debugLog('req', `pj rsvConfirm → courtId=${first.courtId} date=${first.date} isvkrr=${slots.map((s) => s.isvkrrRaw || s.raw).join(',')}`);
  const res = await pjFetch('/rsvConfirm', { method: 'POST', body, cookie });
  const html = await res.text();
  debugLog('res', `pj rsvConfirm ← status=${res.status} loc=${res.location || '-'} htmlLen=${html.length}`);

  if (res.status === 307 || /login/i.test(res.location ?? '')) {
    return { ok: false, reason: 'not_logged_in' };
  }

  const orderId = extractOrderId(html);
  const kcp = parseKcpForm(html);
  debugLog('info', `pj orderId=${orderId || 'none'} kcpAction=${kcp?.action || 'none'}`);

  if (orderId) {
    const verified = await verifyReservation(orderId, cookie);
    debugLog('info', `pj rsvVf verified=${verified}`);
    return { ok: true, orderId, html, kcp, verified };
  }

  const reason = classifyError(html);
  debugLog('err', `pj rsvConfirm 실패 reason=${reason} htmlSnippet=${html.slice(0, 200).replace(/\s+/g, ' ')}`);
  return { ok: false, reason };
}

// Both rsvVf and rsvCls might be XHR endpoints.
const XHR_HEADERS = { 'X-Requested-With': 'XMLHttpRequest' };

/** Verify a reservation right after /rsvConfirm. */
export async function verifyReservation(orderId: string, cookie: string): Promise<boolean> {
  const body = new URLSearchParams({ id: orderId });
  const res = await pjFetch('/rsvVf', { method: 'POST', body, cookie, headers: XHR_HEADERS });
  return res.status === 200;
}

/** Release a reserved-but-unpaid slot. */
export async function cancelReservation(orderId: string, cookie: string): Promise<boolean> {
  const body = new URLSearchParams({ id: orderId });
  const res = await pjFetch('/rsvCls', { method: 'POST', body, cookie, headers: XHR_HEADERS });
  return res.status === 200;
}

function classifyError(html: string): ReservationResult extends { ok: false; reason: infer R } ? R : never {
  if (/일일\s*\d+\s*시간\s*이내/.test(html)) return 'daily_limit' as never;
  if (/예약\s*\d+\s*코트\s*이내/.test(html)) return 'per_court_limit' as never;
  if (/이미\s*예약|선점|마감/.test(html)) return 'already_taken' as never;
  if (/결제\s*(진행\s*)?중/.test(html)) return 'payment_in_progress' as never;
  return 'unknown' as never;
}
