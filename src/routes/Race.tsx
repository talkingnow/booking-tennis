import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { SlotPicker } from '@/components/SlotPicker';
import { useAuthStore } from '@/stores/authStore';
import { getDaily } from '@/lib/gytennis/slots';
import { submitReservation } from '@/lib/gytennis/reserve';
import type { DailyView, Slot } from '@/lib/gytennis/types';
import { COURTS } from '@/lib/courts';
import { formatRemaining, startCountdown, type CountdownHandle } from '@/lib/scheduler/countdown';
import { openKcpPayment } from '@/lib/payment/handoff';

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

function defaultDate(): string {
  // For racing, the targeted reservation date is usually next month's matching day
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function Race() {
  const { cookie, hydrate, doLogin, account, busy } = useAuthStore();
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
    if (!cookie) return;
    setLoadingDaily(true);
    setError(null);
    const view = await getDaily(courtId, cookie, date);
    if (!view) {
      setError('슬롯을 불러오지 못했습니다. 세션이 만료되었을 수 있어 재로그인을 시도합니다.');
      const ok = await doLogin();
      if (ok) {
        const v2 = await getDaily(courtId, useAuthStore.getState().cookie!, date);
        setDaily(v2);
      }
    } else {
      setDaily(view);
    }
    setLoadingDaily(false);
  };

  const arm = () => {
    if (!picked.length) return setError('슬롯을 1개 이상 선택하세요.');
    if (targetMs - Date.now() < 1_000) return setError('타겟 시각이 너무 가깝거나 지났습니다.');
    setError(null);
    setPhase('armed');
    handleRef.current = startCountdown({
      targetMs,
      leadMs: 50,
      onTick: (ms) => setRemaining(ms),
      onFire: () => fire(),
    });
  };

  const cancelArm = () => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setPhase('setup');
    setRemaining(null);
  };

  const fire = async () => {
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
      setPhase('success');
    } else if (result.ok) {
      setError('예약은 성공했지만 결제 폼을 찾지 못했습니다. /myPage 에서 확인하세요.');
      setPhase('failed');
    } else {
      setError(reasonText(result.reason));
      setPhase('failed');
    }
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
            <p className="text-xs text-slate-500 mt-2">
              월 25일 22:00 (시민 예약 오픈) 가 기본값. 본인 폰 시계 기준 정각±100ms 발사.
            </p>
          </Card>

          {error && (
            <Card className="border border-red-700">
              <p className="text-sm text-red-300">{error}</p>
            </Card>
          )}

          <Button onClick={arm} disabled={!picked.length || !cookie}>
            발사 대기
          </Button>
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
          <Button onClick={() => openKcpPayment(kcpReady.kcp)}>결제창 열기 →</Button>
        </Card>
      )}

      {phase === 'failed' && (
        <Card className="border border-red-700">
          <CardTitle>❌ 실패</CardTitle>
          <p className="text-sm text-red-300 mb-3">{error}</p>
          <Button variant="secondary" onClick={() => setPhase('setup')}>
            다시 시도
          </Button>
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
