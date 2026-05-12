import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { SlotPicker } from '@/components/SlotPicker';
import { PaymentCountdown } from '@/components/PaymentCountdown';
import { useAuthStore } from '@/stores/authStore';
import { getDaily } from '@/lib/gytennis/slots';
import { submitReservation, cancelReservation } from '@/lib/gytennis/reserve';
import { isSessionValid } from '@/lib/gytennis/auth';
import type { DailyView, Slot } from '@/lib/gytennis/types';
import { COURTS } from '@/lib/courts';
import { formatRemaining, startCountdown, type CountdownHandle } from '@/lib/scheduler/countdown';
import { measureServerOffsetMs } from '@/lib/scheduler/timeSync';
import { openKcpPayment } from '@/lib/payment/handoff';
import { useUiStore } from '@/stores/uiStore';

type Phase = 'setup' | 'armed' | 'firing' | 'success' | 'failed';

function defaultTarget(): string {
  // Default: next 22:00 (monthly racing opening time)
  const d = new Date();
  d.setSeconds(0, 0);
  if (d.getHours() >= 22) d.setDate(d.getDate() + 1);
  d.setHours(22, 0, 0, 0);
  return toLocalInput(d);
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Compute the next-month date for the same day, clamping to the last day of
 * the target month to avoid JS date overflow (e.g. Jan 31 → Feb 28, not Mar 3).
 * Exported for unit testing.
 */
export function defaultDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const nextMonth = m + 1 > 11 ? 0 : m + 1;
  const nextYear = m + 1 > 11 ? y + 1 : y;
  // Last day of nextMonth (month+1 day 0 = last day of month)
  const lastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
  const day = Math.min(now.getDate(), lastDay);
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Returns the next 25th-at-22:00 datetime-local string.
 *  If today is before the 25th (or exactly 25th before 22:00), returns this month's 25th.
 *  Otherwise returns next month's 25th. */
function defaultOpenDate(): string {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), 25, 22, 0, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    // Already past this month's opening — go to next month
    candidate.setMonth(candidate.getMonth() + 1);
  }
  return toLocalInput(candidate);
}

export default function Race() {
  const { cookie, hydrate, doLogin, account, busy } = useAuthStore();
  const setArmed = useUiStore((s) => s.setArmed);
  const [courtId, setCourtId] = useState(1);
  const [date, setDate] = useState(defaultDate());
  const [target, setTarget] = useState(defaultTarget());
  const [daily, setDaily] = useState<DailyView | null>(null);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [picked, setPicked] = useState<Slot[]>([]);
  const [phase, setPhase] = useState<Phase>('setup');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kcpReady, setKcpReady] = useState<null | ReturnType<typeof submitOk>>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [windowClosed, setWindowClosed] = useState(false);
  const handleRef = useRef<CountdownHandle | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Login on demand
  useEffect(() => {
    if (!cookie && account) {
      doLogin();
    }
  }, [cookie, account, doLogin]);

  const targetMs = useMemo(() => new Date(target).getTime(), [target]);

  const loadSlots = async () => {
    const currentCookie = useAuthStore.getState().cookie;
    if (!currentCookie) return;
    setLoadingDaily(true);
    setError(null);

    // Validate session before fetching — gytennis returns 200 login page for
    // expired sessions so we can't rely on HTTP status alone.
    const valid = await isSessionValid(currentCookie);
    let activeCookie = currentCookie;
    if (!valid) {
      if (!account) {
        setError('세션이 만료되었습니다. 계정 설정에서 다시 로그인해 주세요.');
        setLoadingDaily(false);
        return;
      }
      const ok = await doLogin();
      if (!ok) {
        setError('재로그인 실패. 계정 설정에서 비밀번호를 확인해 주세요.');
        setLoadingDaily(false);
        return;
      }
      activeCookie = useAuthStore.getState().cookie!;
    }

    const view = await getDaily(courtId, activeCookie, date);
    if (!view) {
      setError('슬롯을 불러오지 못했습니다. 해당 날짜/코트장을 확인해 주세요.');
    } else {
      setDaily(view);
    }
    setLoadingDaily(false);
  };

  const arm = async () => {
    if (!picked.length) return setError('슬롯을 1개 이상 선택하세요.');
    if (targetMs - Date.now() < 1_000) return setError('타겟 시각이 너무 가깝거나 지났습니다.');
    setError(null);
    setPhase('armed');
    setArmed(true);
    // Measure server clock offset before arming (3 HEAD samples)
    const offsetMs = await measureServerOffsetMs(3);
    handleRef.current = startCountdown({
      targetMs,
      leadMs: 50,
      offsetMs,
      onTick: (ms) => setRemaining(ms),
      onFire: () => fire(),
    });
  };

  /** Skip countdown and fire immediately. */
  const fireImmediate = async () => {
    if (!picked.length) return setError('슬롯을 1개 이상 선택하세요.');
    setError(null);
    await fire();
  };

  const cancelArm = () => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setArmed(false);
    setPhase('setup');
    setRemaining(null);
  };

  const fire = async () => {
    setArmed(false);
    setPhase('firing');
    const c = useAuthStore.getState().cookie;
    if (!c) {
      setError('세션이 없습니다.');
      setPhase('failed');
      return;
    }
    const result = await submitReservation(picked, c);
    if (result.ok && result.kcp) {
      setKcpReady(submitOk(result.orderId, result.kcp));
      setDeadline(Date.now() + 8 * 60 * 1_000);
      setWindowClosed(false);
      setPhase('success');
    } else if (result.ok) {
      setError('예약은 성공했지만 결제 폼을 찾지 못했습니다. /myPage 에서 확인하세요.');
      setPhase('failed');
    } else {
      setError(reasonText(result.reason));
      setPhase('failed');
    }
  };

  /** Called when 8-min countdown expires → auto cancel. */
  const handleExpire = async () => {
    if (!kcpReady) return;
    const c = useAuthStore.getState().cookie;
    if (c) await cancelReservation(kcpReady.orderId, c);
    setError('결제 시간(8분)이 만료되어 슬롯이 취소되었습니다.');
    setPhase('failed');
  };

  /** Called when user clicks "지금 취소". */
  const handleManualCancel = async () => {
    if (!kcpReady) return;
    const c = useAuthStore.getState().cookie;
    if (c) await cancelReservation(kcpReady.orderId, c);
    setError(null);
    setPhase('setup');
  };

  if (!account) {
    return (
      <Card>
        <CardTitle>계정 필요</CardTitle>
        <p className="text-sm text-slate-400 mb-3">먼저 계정을 등록해 주세요.</p>
        <Link to="/account">
          <Button>계정 설정으로</Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">🚀 빠른 예약</h1>

      {phase === 'setup' && (
        <>
          <Card>
            <CardTitle>1. 코트·날짜</CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">코트장</label>
                <select
                  value={courtId}
                  onChange={(e) => setCourtId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                >
                  {COURTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">예약일</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                />
              </div>
            </div>
            <div className="mt-3">
              <Button variant="secondary" onClick={loadSlots} disabled={!cookie || loadingDaily}>
                {loadingDaily ? '불러오는 중…' : '슬롯 조회'}
              </Button>
            </div>
          </Card>

          {daily && (
            <Card>
              <CardTitle>2. 슬롯 선택 ({picked.length}/{daily.meta.dailyLimit || 2})</CardTitle>
              <SlotPicker
                slots={daily.slots}
                selected={picked}
                onToggle={(s) => {
                  setPicked((cur) =>
                    cur.some((x) => x.raw === s.raw)
                      ? cur.filter((x) => x.raw !== s.raw)
                      : [...cur, s],
                  );
                }}
              />
              <p className="text-xs text-slate-500 mt-2">
                일일 한도 {daily.meta.dailyLimit} · 코트당 {daily.meta.perCourtLimit}
              </p>
            </Card>
          )}

          <Card>
            <CardTitle>3. 발사 시각</CardTitle>
            <input
              type="datetime-local"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setTarget(toLocalInput(new Date()))}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300"
              >
                ⚡ 지금으로 설정
              </button>
              <button
                type="button"
                onClick={() => setTarget(defaultOpenDate())}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300"
              >
                📅 오픈일 25일 22:00
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              본인 폰 시계 기준 정각±100ms 발사.
            </p>
          </Card>

          {error && (
            <Card className="border border-red-700">
              <p className="text-sm text-red-300">{error}</p>
            </Card>
          )}

          <div className="flex gap-2">
            <Button onClick={arm} disabled={!picked.length || !cookie} className="flex-1">
              ⏱ 발사 대기
            </Button>
            <Button
              variant="secondary"
              onClick={fireImmediate}
              disabled={!picked.length || !cookie}
              className="flex-1"
            >
              ⚡ 즉시 발사
            </Button>
          </div>
        </>
      )}

      {phase === 'armed' && (
        <Card className="text-center py-12">
          <p className="text-sm text-slate-400 mb-2">발사까지</p>
          <p className="text-5xl font-mono tabular-nums text-accent">
            {remaining != null ? formatRemaining(remaining) : '--:--.---'}
          </p>
          <p className="text-xs text-slate-500 mt-4">앱을 닫지 마세요. 화면 자동 꺼짐 방지 권장.</p>
          <div className="mt-6">
            <Button variant="danger" onClick={cancelArm}>
              취소
            </Button>
          </div>
        </Card>
      )}

      {phase === 'firing' && (
        <Card className="text-center py-12">
          <p className="text-xl font-bold text-accent animate-pulse">발사 중…</p>
          <p className="text-xs text-slate-500 mt-2">서버 응답 대기</p>
        </Card>
      )}

      {phase === 'success' && kcpReady && (
        <Card>
          <CardTitle>✅ 예약 성공</CardTitle>
          <p className="text-sm text-slate-300 mb-2">주문번호: {kcpReady.orderId}</p>
          <p className="text-xs text-slate-500 mb-4">8분 이내에 결제를 완료해야 슬롯이 확정됩니다.</p>
          {windowClosed && (
            <p className="text-xs text-yellow-400 mb-3">
              결제창이 닫혔습니다. 결제를 완료하셨으면 아래 카운트다운이 만료되기 전에 완료해 주세요.
            </p>
          )}
          <Button
            onClick={() =>
              openKcpPayment(kcpReady.kcp, {
                onWindowClosed: () => setWindowClosed(true),
              })
            }
          >
            결제창 열기 →
          </Button>
          {deadline && (
            <PaymentCountdown
              deadline={deadline}
              onExpire={handleExpire}
              onCancel={handleManualCancel}
            />
          )}
        </Card>
      )}

      {phase === 'failed' && (
        <Card className="border border-red-700">
          <CardTitle>❌ 실패</CardTitle>
          <p className="text-sm text-red-300 mb-3">{error}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPhase('setup')}>
              다시 시도
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                setPhase('setup');
                await loadSlots();
              }}
              disabled={!cookie || loadingDaily}
            >
              슬롯 재조회
            </Button>
          </div>
        </Card>
      )}

      <p className="text-center text-xs text-slate-600">
        세션 상태: {cookie ? '✓ 로그인됨' : busy ? '로그인 중…' : '미로그인'}
      </p>
    </div>
  );
}

function submitOk(orderId: string, kcp: import('@/lib/gytennis/types').KcpForm) {
  return { orderId, kcp };
}

function reasonText(reason: string): string {
  switch (reason) {
    case 'not_logged_in':
      return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    case 'already_taken':
      return '이미 다른 사용자가 선점했습니다.';
    case 'daily_limit':
      return '일일 예약 한도를 초과했습니다.';
    case 'per_court_limit':
      return '동일 코트 예약 한도를 초과했습니다.';
    default:
      return '예약에 실패했습니다.';
  }
}
