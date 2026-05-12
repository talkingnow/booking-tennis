/**
 * High-precision countdown to a target wall-clock instant.
 *
 * Strategy:
 * - Use Date.now() + offsetMs as the authoritative time source.
 * - `offsetMs` compensates for measured server↔client clock skew (from timeSync).
 * - Tick via setTimeout with adaptive interval (250ms when >5s remain, 25ms when ≤1s).
 * - When `remaining <= leadMs`, invoke onFire() and stop.
 * - Re-syncs automatically when the page becomes visible again (tab/app switch).
 */

export type CountdownHandle = {
  /** Cancel the timer. Idempotent. */
  cancel: () => void;
  /** True if onFire() has been invoked (or the timer was cancelled). */
  isDone: () => boolean;
};

export type CountdownOptions = {
  /** Wall-clock instant when onFire should run (ms since epoch). */
  targetMs: number;
  /** Fire this many ms BEFORE targetMs to absorb network RTT. Default 0. */
  leadMs?: number;
  /**
   * Clock offset to apply: effectiveNow = Date.now() + offsetMs.
   * Obtained from measureServerOffsetMs(). Default 0 (no correction).
   */
  offsetMs?: number;
  /** Called every tick with the remaining ms until target. */
  onTick?: (remainingMs: number) => void;
  /** Called once at fire time. */
  onFire: () => void;
};

export function startCountdown(opts: CountdownOptions): CountdownHandle {
  const { targetMs, leadMs = 0, offsetMs = 0, onTick, onFire } = opts;
  let cancelled = false;
  let fired = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const now = () => Date.now() + offsetMs;

  const tick = () => {
    if (cancelled || fired) return;
    const remaining = targetMs - now();
    onTick?.(remaining);
    if (remaining <= leadMs) {
      fired = true;
      try {
        onFire();
      } finally {
        // no rearm
      }
      return;
    }
    // Adaptive cadence
    let next: number;
    if (remaining > 5_000) next = Math.min(1_000, remaining - 5_000);
    else if (remaining > 500) next = 50;
    else next = 5;
    timer = setTimeout(tick, next);
  };

  // Force an immediate re-tick when the page becomes visible again
  // (user switched tabs or the screen was locked on mobile).
  const onVisibilityChange = () => {
    if (!document.hidden && !cancelled && !fired) {
      if (timer) clearTimeout(timer);
      tick();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  // Kick off immediately so onTick fires with the initial value.
  timer = setTimeout(tick, 0);

  return {
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
    isDone: () => fired || cancelled,
  };
}

/** Format milliseconds as "MM:SS.ms" for UI display. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00.000';
  const totalMs = Math.floor(ms);
  const m = Math.floor(totalMs / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1_000);
  const ms3 = totalMs % 1_000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0')}`;
}

/** Parse a "HH:MM" or "HH:MM:SS" wall-clock today/tomorrow into ms-epoch. */
export function nextOccurrence(hhmm: string, base: Date = new Date()): number {
  const [h, m, s] = hhmm.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m ?? 0, s ?? 0, 0);
  if (d.getTime() <= base.getTime()) d.setDate(d.getDate() + 1);
  return d.getTime();
}
