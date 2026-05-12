import { gyFetch } from './proxyClient';
import { extractOrderId, parseKcpForm } from '../parsers/kcpParser';
import type { ReservationResult, Slot } from './types';

/**
 * Submit one or more slots to /rsvConfirm.
 * The slot.raw strings are used directly as `isvkrr[]` values.
 * All slots must share the same cvalue (courtId) and cdate (date).
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
  for (const s of slots) body.append('isvkrr[]', s.raw);
  body.set('van_code', options.vanCode ?? '');

  const res = await gyFetch('/rsvConfirm', { method: 'POST', body, cookie });
  const html = await res.text();

  if (res.status === 307 || /login/i.test(res.location ?? '')) {
    return { ok: false, reason: 'not_logged_in' };
  }

  const orderId = extractOrderId(html);
  const kcp = parseKcpForm(html);

  if (orderId) {
    return { ok: true, orderId, html, kcp };
  }

  // No order id → server rejected. Classify by error keywords found in the page.
  return { ok: false, reason: classifyError(html) };
}

/** Verify a reservation right after /rsvConfirm. (gytennis XHR pre-payment) */
export async function verifyReservation(orderId: string, cookie: string): Promise<boolean> {
  const body = new URLSearchParams({ id: orderId });
  const res = await gyFetch('/rsvVf', { method: 'POST', body, cookie });
  return res.status === 200;
}

/** Release a reserved-but-unpaid slot. Called when the user cancels payment. */
export async function cancelReservation(orderId: string, cookie: string): Promise<boolean> {
  const body = new URLSearchParams({ id: orderId });
  const res = await gyFetch('/rsvCls', { method: 'POST', body, cookie });
  return res.status === 200;
}

function classifyError(html: string): ReservationResult extends { ok: false; reason: infer R } ? R : never {
  // Heuristic keyword matching against the server-rendered SweetAlert text.
  if (/일일\s*\d+\s*시간\s*이내/.test(html)) return 'daily_limit' as never;
  if (/예약\s*\d+\s*코트\s*이내/.test(html)) return 'per_court_limit' as never;
  if (/이미\s*예약|선점|마감/.test(html)) return 'already_taken' as never;
  return 'unknown' as never;
}
