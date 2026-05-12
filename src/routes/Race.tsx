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
import { COURTS, getCourt } from '@/lib/courts';
import { formatRemaining, startCountdown, type CountdownHandle } from '@/lib/scheduler/countdown';
import { measureServerOffsetMs } from '@/lib/scheduler/timeSync';
import { openKcpPayment } from '@/lib/payment/handoff';
import { useUiStore } from '@/stores/uiStore';

// ─── types ────────────────────────────────────────────────────────────────────

type Phase = 'setup' | 'armed' | 'firing' | 'success' | 'failed' | 'cascade-done';
type FireMode = 'normal' | 'open-day';

/** A single targeted slot entry in the open-day priority list. */
export type PriorityEntry = {
  id: string;
  courtId: number;
  courtNo: number;
  date: string;   // YYYY-MM-DD
  hour: number;   // slot start hour (gytennis uses even hours: 6,8,...,20)
};

type CascadeResult = {
  entry: PriorityEntry;
  status: 'success' | 'failed' | 'no_slot';
  orderId?: string;
};

// ─── constants ────────────────────────────────────────────────────────────────

/** Gytennis 2-hour slot start hours. */
const SLOT_HOURS = [6, 8, 10, 12, 14, 16, 18, 20];
const PRIORITY_KEY = 'gyt:priorities';

// ─── storage helpers ──────────────────────────────────────────────────────────

function loadPriorities(): PriorityEntry[] {
  try {
    const raw = localStorage.getItem(PRIORITY_KEY);
    return raw ? (JSON.parse(raw) as PriorityEntry[]) : [];
  } catch { return []; }
}

function savePriorities(list: PriorityEntry[]) {
  try { localStorage.setItem(PRIORITY_KEY, JSON.stringify(list)); } catch {}
}

// ─── date helpers ─────────────────────────────────────────────────────────────

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultTarget(): string {
  const d = new Date();
  if (d.getHours() >= 22) d.setDate(d.getDate() + 1);
  d.setHours(22, 0, 0, 0);
  return toLocalInput(d);
}

/**
 * Next-month date for the same day (clamped to last day).
 * Exported for unit testing.
 */
export function defaultDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const nextMonth = m + 1 > 11 ? 0 : m + 1;
  const nextYear  = m + 1 > 11 ? y + 1 : y;
  const lastDay   = new Date(nextYear, nextMonth + 1, 0).getDate();
  const day       = Math.min(now.getDate(), lastDay);
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Next 25th-at-22:00 in datetime-local format. */
function defaultOpenDate(): string {
  const now = new Date();
  const candidate = new Date(now.getFullYear(), now.getMonth(), 25, 22, 0, 0, 0);
  if (candidate.getTime() <= now.getTime()) candidate.setMonth(candidate.getMonth() + 1);
  return toLocalInput(candidate);
}

// ─── component ────────────────────────────────────────────────────────────────

export default function Race() {
  const { cookie, hydrate, doLogin, account, busy } = useAuthStore();
  const setArmed = useUiStore((s) => s.setArmed);

  // mode
  const [fireMode, setFireMode] = useState<FireMode>('normal');

  // normal mode
  const [courtId, setCourtId] = useState(1);
  const [date, setDate]       = useState(defaultDate());
  const [daily, setDaily]     = useState<DailyView | null>(null);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [picked, setPicked]   = useState<Slot[]>([]);

  // open-day mode — priorities
  const [priorities, setPriorities] = useState<PriorityEntry[]>(() => loadPriorities());
  // add-form state
  const [newCourtId, setNewCourtId] = useState(1);
  const [newCourtNo, setNewCourtNo] = useState(1);
  const [newDate, setNewDate]       = useState(defaultDate());
  const [newHour, setNewHour]       = useState(12);

  // phase / scheduler
  const [target, setTarget]     = useState(defaultTarget());
  const [phase, setPhase]       = useState<Phase>('setup');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const handleRef               = useRef<CountdownHandle | null>(null);

  // payment
  const [kcpReady, setKcpReady]   = useState<null | { orderId: string; kcp: import('@/lib/gytennis/types').KcpForm }>(null);
  const [deadline, setDeadline]   = useState<number | null>(null);
  const [windowClosed, setWindowClosed] = useState(false);

  // cascade (open-day mode)
  const [cascadeIdx, setCascadeIdx]         = useState(0);
  const [cascadeResults, setCascadeResults] = useState<CascadeResult[]>([]);

  // refs for stable access inside async callbacks
  const fireModeRef        = useRef(fireMode);
  const prioritiesRef      = useRef(priorities);
  const cascadeIdxRef      = useRef(0);
  const cascadeResultsRef  = useRef<CascadeResult[]>([]);
  useEffect(() => { fireModeRef.current = fireMode; },    [fireMode]);
  useEffect(() => { prioritiesRef.current = priorities; savePriorities(priorities); }, [priorities]);

  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { if (!cookie && account) doLogin(); }, [cookie, account, doLogin]);

  // Auto-set target when switching modes
  useEffect(() => {
    setTarget(fireMode === 'open-day' ? defaultOpenDate() : defaultTarget());
    setDaily(null);
    setPicked([]);
    setError(null);
  }, [fireMode]);

  const targetMs = useMemo(() => new Date(target).getTime(), [target]);

  // ── slot loading (normal mode) ─────────────────────────────────────────────

  const loadSlots = async () => {
    const c = useAuthStore.getState().cookie;
    if (!c) return;
    setLoadingDaily(true);
    setError(null);
    const valid = await isSessionValid(c);
    let activeCookie = c;
    if (!valid) {
      if (!account) { setError('세션 만료. 계정 설정에서 다시 로그인해 주세요.'); setLoadingDaily(false); return; }
      const ok = await doLogin();
      if (!ok) { setError('재로그인 실패.'); setLoadingDaily(false); return; }
      activeCookie = useAuthStore.getState().cookie!;
    }
    const view = await getDaily(courtId, activeCookie, date);
    if (!view) setError('슬롯을 불러오지 못했습니다. 날짜/코트장을 확인하세요.');
    else setDaily(view);
    setLoadingDaily(false);
  };

  // ── priority list helpers ──────────────────────────────────────────────────

  const addPriority = () => {
    const entry: PriorityEntry = {
      id: `${Date.now()}-${Math.random()}`,
      courtId: newCourtId, courtNo: newCourtNo, date: newDate, hour: newHour,
    };
    setPriorities((p) => [...p, entry]);
  };

  const removePriority = (id: string) => setPriorities((p) => p.filter((e) => e.id !== id));

  const movePriority = (idx: number, dir: -1 | 1) => {
    const arr = [...priorities];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    setPriorities(arr);
  };

  // ── cascade advance helper ─────────────────────────────────────────────────

  const pushCascadeResult = (result: CascadeResult) => {
    const next = [...cascadeResultsRef.current, result];
    cascadeResultsRef.current = next;
    setCascadeResults(next);
  };

  // ── arm ────────────────────────────────────────────────────────────────────

  const arm = async () => {
    if (fireModeRef.current === 'normal' && !picked.length)
      return setError('슬롯을 1개 이상 선택하세요.');
    if (fireModeRef.current === 'open-day' && !prioritiesRef.current.length)
      return setError('우선순위를 1개 이상 입력하세요.');
    if (targetMs - Date.now() < 1_000)
      return setError('발사 시각이 너무 가깝거나 이미 지났습니다.');
    setError(null);
    // Reset cascade
    cascadeIdxRef.current = 0;
    cascadeResultsRef.current = [];
    setCascadeIdx(0);
    setCascadeResults([]);
    setPhase('armed');
    setArmed(true);
    const offsetMs = await measureServerOffsetMs(3);
    handleRef.current = startCountdown({
      targetMs, leadMs: 50, offsetMs,
      onTick: (ms) => setRemaining(ms),
      onFire: () => fire(),
    });
  };

  const cancelArm = () => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setArmed(false);
    setPhase('setup');
    setRemaining(null);
  };

  // ── fire (core) ────────────────────────────────────────────────────────────
  // Called on countdown fire AND on "다음 시도" button.
  // In open-day mode: loops through priorities starting at cascadeIdxRef.current,
  // pauses on each booking success, resumes when called again.

  const fire = async () => {
    setArmed(false);
    setPhase('firing');
    const c = useAuthStore.getState().cookie;
    if (!c) { setError('세션이 없습니다.'); setPhase('failed'); return; }

    if (fireModeRef.current === 'open-day') {
      const pList = prioritiesRef.current;
      let idx = cascadeIdxRef.current;

      while (idx < pList.length) {
        const entry = pList[idx];
        const view = await getDaily(entry.courtId, c, entry.date);
        const slot = view?.slots.find(
          (s) => s.courtNo === entry.courtNo && s.hour === entry.hour && s.status === 'available',
        );

        if (!slot) {
          pushCascadeResult({ entry, status: 'no_slot' });
          idx++;
          cascadeIdxRef.current = idx;
          setCascadeIdx(idx);
          continue;
        }

        const result = await submitReservation([slot], c);

        if (result.ok && result.kcp) {
          pushCascadeResult({ entry, status: 'success', orderId: result.orderId });
          idx++;
          cascadeIdxRef.current = idx;
          setCascadeIdx(idx);
          setKcpReady({ orderId: result.orderId!, kcp: result.kcp });
          setDeadline(Date.now() + 8 * 60 * 1_000);
          setWindowClosed(false);
          setPhase('success');
          return; // pause — user pays, then calls tryNext
        }

        // Booking failed → continue cascade immediately
        pushCascadeResult({ entry, status: 'failed' });
        idx++;
        cascadeIdxRef.current = idx;
        setCascadeIdx(idx);
      }

      // All priorities tried
      setPhase('cascade-done');
    } else {
      // Normal mode
      const result = await submitReservation(picked, c);
      if (result.ok && result.kcp) {
        setKcpReady({ orderId: result.orderId!, kcp: result.kcp });
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
    }
  };

  /** Try the next priority after payment done (or window closed). */
  const tryNext = async () => {
    setKcpReady(null);
    setDeadline(null);
    await fire();
  };

  /** Timer expired → cancel current slot, try next (open-day) or fail (normal). */
  const handleExpire = async () => {
    if (!kcpReady) return;
    const c = useAuthStore.getState().cookie;
    if (c) await cancelReservation(kcpReady.orderId, c);
    setKcpReady(null);
    setDeadline(null);
    if (fireModeRef.current === 'open-day') {
      await fire();
    } else {
      setError('결제 시간(8분)이 만료되어 슬롯이 취소되었습니다.');
      setPhase('failed');
    }
  };

  /** Manual cancel button. */
  const handleManualCancel = async () => {
    if (!kcpReady) return;
    const c = useAuthStore.getState().cookie;
    if (c) await cancelReservation(kcpReady.orderId, c);
    setKcpReady(null);
    setDeadline(null);
    setError(null);
    // Reset and go back to setup
    cascadeIdxRef.current = 0;
    cascadeResultsRef.current = [];
    setCascadeIdx(0);
    setCascadeResults([]);
    setPhase('setup');
  };

  // ── early return: no account ───────────────────────────────────────────────

  if (!account) {
    return (
      <Card>
        <CardTitle>계정 필요</CardTitle>
        <p className="text-sm text-slate-400 mb-3">먼저 계정을 등록해 주세요.</p>
        <Link to="/account"><Button>계정 설정으로</Button></Link>
      </Card>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  // Court No options for the add-form (dynamic based on newCourtId)
  const newCourtNos = getCourt(newCourtId)?.courtNos ?? [1, 2, 3, 4];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">🚀 빠른 예약</h1>

      {/* ── SETUP ──────────────────────────────────────────────────────────── */}
      {phase === 'setup' && (
        <>
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            {(['normal', 'open-day'] as FireMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setFireMode(m)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  fireMode === m
                    ? 'bg-accent text-bg'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {m === 'normal' ? '⏱ 일반 발사' : '📅 오픈일 발사'}
              </button>
            ))}
          </div>

          {/* Step 1: court + date (normal) */}
          {fireMode === 'normal' && (
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
                    {COURTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">예약일</label>
                  <input
                    type="date" value={date}
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
          )}

          {/* Step 2: slot picker (normal) */}
          {fireMode === 'normal' && daily && (
            <Card>
              <CardTitle>2. 슬롯 선택 ({picked.length}/{daily.meta.dailyLimit || 2})</CardTitle>
              <SlotPicker
                slots={daily.slots}
                selected={picked}
                onToggle={(s) =>
                  setPicked((cur) =>
                    cur.some((x) => x.raw === s.raw)
                      ? cur.filter((x) => x.raw !== s.raw)
                      : [...cur, s],
                  )
                }
              />
              <p className="text-xs text-slate-500 mt-2">
                일일 한도 {daily.meta.dailyLimit} · 코트당 {daily.meta.perCourtLimit}
              </p>
            </Card>
          )}

          {/* Step 1+2 merged: priority list (open-day) */}
          {fireMode === 'open-day' && (
            <Card>
              <CardTitle>우선순위 목록</CardTitle>
              <p className="text-xs text-slate-400 mb-3">
                발사 시각에 슬롯을 조회하여 위 순서대로 예약합니다. 결제 완료 또는 예약 실패 시 다음 순위로 자동 진행합니다.
              </p>

              {/* Current list */}
              {priorities.length === 0 && (
                <p className="text-xs text-slate-500 mb-3">우선순위가 없습니다. 아래에서 추가하세요.</p>
              )}
              <div className="space-y-1 mb-4">
                {priorities.map((e, i) => {
                  const court = getCourt(e.courtId);
                  return (
                    <div key={e.id} className="flex items-center gap-1 bg-slate-800 rounded-lg px-3 py-2">
                      <span className="text-xs text-slate-500 w-5 shrink-0 text-center">{i + 1}</span>
                      <span className="flex-1 text-xs">
                        <span className="text-slate-200">{court?.name ?? `코트${e.courtId}`}</span>
                        <span className="text-slate-400 ml-1">{e.courtNo}번면</span>
                        <span className="text-slate-400 ml-1">·</span>
                        <span className="text-slate-400 ml-1">{e.date}</span>
                        <span className="text-accent ml-1 font-mono">{String(e.hour).padStart(2,'0')}:00</span>
                      </span>
                      <button onClick={() => movePriority(i, -1)} disabled={i === 0}
                        className="text-slate-400 hover:text-slate-200 disabled:opacity-25 min-w-[28px] min-h-[36px] text-center">▲</button>
                      <button onClick={() => movePriority(i, 1)} disabled={i === priorities.length - 1}
                        className="text-slate-400 hover:text-slate-200 disabled:opacity-25 min-w-[28px] min-h-[36px] text-center">▼</button>
                      <button onClick={() => removePriority(e.id)}
                        className="text-red-400 hover:text-red-300 min-w-[28px] min-h-[36px] text-center">✕</button>
                    </div>
                  );
                })}
              </div>

              {/* Add entry form */}
              <div className="border-t border-slate-700 pt-3">
                <p className="text-xs text-slate-400 mb-2">새 항목 추가</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">코트장</label>
                    <select value={newCourtId}
                      onChange={(e) => { setNewCourtId(Number(e.target.value)); setNewCourtNo(1); }}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs"
                    >
                      {COURTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">코트면</label>
                    <select value={newCourtNo}
                      onChange={(e) => setNewCourtNo(Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs"
                    >
                      {newCourtNos.map((n) => <option key={n} value={n}>{n}번</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">날짜</label>
                    <div className="flex gap-1">
                      <input type="date" value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setNewDate(defaultDate())}
                        className="text-xs px-2 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 shrink-0"
                        title="다음달 오늘"
                      >+1달</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">시간</label>
                    <select value={newHour}
                      onChange={(e) => setNewHour(Number(e.target.value))}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs"
                    >
                      {SLOT_HOURS.map((h) => (
                        <option key={h} value={h}>{String(h).padStart(2,'0')}:00</option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button variant="secondary" onClick={addPriority} className="w-full">
                  + 추가
                </Button>
              </div>
            </Card>
          )}

          {/* Step 3: fire time */}
          <Card>
            <CardTitle>{fireMode === 'normal' ? '3' : '2'}. 발사 시각</CardTitle>
            <input
              type="datetime-local" value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
            />
            {fireMode === 'normal' && (
              <div className="mt-2">
                <button type="button" onClick={() => setTarget(defaultOpenDate())}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300">
                  📅 오픈일 25일 22:00
                </button>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">
              {fireMode === 'open-day'
                ? '매달 25일 22:00에 다음달 예약이 오픈됩니다.'
                : '본인 폰 시계 기준 정각±100ms 발사.'}
            </p>
          </Card>

          {error && (
            <Card className="border border-red-700">
              <p className="text-sm text-red-300">{error}</p>
            </Card>
          )}

          <Button
            onClick={arm}
            disabled={
              !cookie ||
              (fireMode === 'normal' && !picked.length) ||
              (fireMode === 'open-day' && !priorities.length)
            }
          >
            ⏱ 발사 대기
          </Button>
        </>
      )}

      {/* ── ARMED ──────────────────────────────────────────────────────────── */}
      {phase === 'armed' && (
        <Card className="text-center py-12">
          <p className="text-sm text-slate-400 mb-2">발사까지</p>
          <p className="text-5xl font-mono tabular-nums text-accent">
            {remaining != null ? formatRemaining(remaining) : '--:--.---'}
          </p>
          {fireMode === 'open-day' && (
            <p className="text-xs text-yellow-400 mt-3">
              발사 시 슬롯 조회 → 우선순위 순 자동 예약 ({priorities.length}개)
            </p>
          )}
          <p className="text-xs text-slate-500 mt-4">앱을 닫지 마세요. 화면 자동 꺼짐 방지 권장.</p>
          <div className="mt-6">
            <Button variant="danger" onClick={cancelArm}>취소</Button>
          </div>
        </Card>
      )}

      {/* ── FIRING ─────────────────────────────────────────────────────────── */}
      {phase === 'firing' && (
        <Card className="text-center py-12">
          <p className="text-xl font-bold text-accent animate-pulse">
            {fireMode === 'open-day'
              ? `${cascadeIdx + 1}순위 시도 중…`
              : '발사 중…'}
          </p>
          <p className="text-xs text-slate-500 mt-2">서버 응답 대기</p>
        </Card>
      )}

      {/* ── SUCCESS ────────────────────────────────────────────────────────── */}
      {phase === 'success' && kcpReady && (
        <Card>
          <CardTitle>✅ 예약 성공</CardTitle>
          {fireMode === 'open-day' && cascadeResults.length > 0 && (
            <p className="text-xs text-slate-400 mb-2">
              {cascadeIdx}순위 성공 (주문번호: {kcpReady.orderId})
            </p>
          )}
          {fireMode === 'normal' && (
            <p className="text-sm text-slate-300 mb-2">주문번호: {kcpReady.orderId}</p>
          )}
          <p className="text-xs text-slate-500 mb-4">8분 이내에 결제를 완료해야 슬롯이 확정됩니다.</p>
          {windowClosed && (
            <p className="text-xs text-yellow-400 mb-3">
              결제창이 닫혔습니다.
            </p>
          )}
          <div className="space-y-2">
            <Button
              onClick={() => openKcpPayment(kcpReady.kcp, { onWindowClosed: () => setWindowClosed(true) })}
              className="w-full"
            >
              결제창 열기 →
            </Button>
            {fireMode === 'open-day' && cascadeIdx < priorities.length && (
              <Button variant="secondary" onClick={tryNext} className="w-full">
                결제 완료, {cascadeIdx + 1}순위 시도 →
              </Button>
            )}
            {fireMode === 'open-day' && cascadeIdx >= priorities.length && (
              <Button variant="secondary" onClick={tryNext} className="w-full">
                모든 우선순위 완료 — 결과 확인
              </Button>
            )}
          </div>
          {deadline && (
            <PaymentCountdown deadline={deadline} onExpire={handleExpire} onCancel={handleManualCancel} />
          )}

          {/* Cascade progress */}
          {fireMode === 'open-day' && cascadeResults.length > 0 && (
            <div className="mt-4 border-t border-slate-700 pt-3">
              <p className="text-xs text-slate-400 mb-2">진행 현황</p>
              {cascadeResults.map((r, i) => {
                const court = getCourt(r.entry.courtId);
                return (
                  <div key={r.entry.id} className="flex items-center gap-2 text-xs mb-1">
                    <span className="text-slate-500 w-4">{i + 1}</span>
                    <span className={r.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                      {r.status === 'success' ? '✓' : r.status === 'failed' ? '✗' : '–'}
                    </span>
                    <span className="text-slate-300">{court?.name} {r.entry.courtNo}번 {r.entry.hour}:00</span>
                    {r.status !== 'success' && (
                      <span className="text-slate-500">
                        {r.status === 'failed' ? '예약실패' : '슬롯없음'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── CASCADE DONE ───────────────────────────────────────────────────── */}
      {phase === 'cascade-done' && (
        <Card>
          <CardTitle>📋 발사 완료</CardTitle>
          <div className="space-y-1 mb-4">
            {cascadeResults.map((r, i) => {
              const court = getCourt(r.entry.courtId);
              return (
                <div key={r.entry.id} className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500 w-5 text-center">{i + 1}</span>
                  <span className={
                    r.status === 'success' ? 'text-green-400' :
                    r.status === 'failed'  ? 'text-red-400'   : 'text-slate-500'
                  }>
                    {r.status === 'success' ? '✓ 성공' : r.status === 'failed' ? '✗ 실패' : '– 슬롯없음'}
                  </span>
                  <span className="text-slate-300 text-xs">
                    {court?.name} {r.entry.courtNo}번면 {r.entry.hour}:00 ({r.entry.date})
                  </span>
                </div>
              );
            })}
            {cascadeResults.length === 0 && (
              <p className="text-sm text-slate-400">시도한 우선순위가 없습니다.</p>
            )}
          </div>
          <Button variant="secondary" onClick={() => { setCascadeResults([]); cascadeResultsRef.current = []; setPhase('setup'); }}>
            처음으로
          </Button>
        </Card>
      )}

      {/* ── FAILED ─────────────────────────────────────────────────────────── */}
      {phase === 'failed' && (
        <Card className="border border-red-700">
          <CardTitle>❌ 실패</CardTitle>
          <p className="text-sm text-red-300 mb-3">{error}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPhase('setup')}>다시 시도</Button>
            {fireMode === 'normal' && (
              <Button variant="secondary"
                onClick={async () => { setPhase('setup'); await loadSlots(); }}
                disabled={!cookie || loadingDaily}
              >
                슬롯 재조회
              </Button>
            )}
          </div>
        </Card>
      )}

      <p className="text-center text-xs text-slate-600">
        세션 상태: {cookie ? '✓ 로그인됨' : busy ? '로그인 중…' : '미로그인'}
      </p>
    </div>
  );
}

function reasonText(reason: string): string {
  switch (reason) {
    case 'not_logged_in': return '세션이 만료되었습니다. 다시 로그인해 주세요.';
    case 'already_taken': return '이미 다른 사용자가 선점했습니다.';
    case 'daily_limit':   return '일일 예약 한도를 초과했습니다.';
    case 'per_court_limit': return '동일 코트 예약 한도를 초과했습니다.';
    default:              return '예약에 실패했습니다.';
  }
}
