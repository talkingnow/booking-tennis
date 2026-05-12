import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuthStore } from '@/stores/authStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { getDailyBatch } from '@/lib/gytennis/slots';
import { submitReservation } from '@/lib/gytennis/reserve';
import { isSessionValid } from '@/lib/gytennis/auth';
import { openKcpPayment } from '@/lib/payment/handoff';
import { COURTS, courtName } from '@/lib/courts';
import type { DailyView, Slot } from '@/lib/gytennis/types';

export default function Quick() {
  const { cookie, hydrate, doLogin, account, busy } = useAuthStore();
  const fav = useFavoritesStore();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Map<number, DailyView | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Slots marked pending (payment in progress) — local UI state only */
  const [pendingSlots, setPendingSlots] = useState<Set<string>>(new Set());
  /** Dialog state */
  const [confirmSlot, setConfirmSlot] = useState<Slot | null>(null);

  useEffect(() => {
    hydrate();
    fav.hydrate();
  }, [hydrate, fav]);

  // Auto-login when session is missing but credentials are stored
  useEffect(() => {
    if (!cookie && account) {
      doLogin();
    }
  }, [cookie, account, doLogin]);

  const courtIds = fav.list.length
    ? Array.from(new Set(fav.list.map((f) => f.courtId)))
    : COURTS.map((c) => c.id);

  const refresh = async () => {
    const currentCookie = useAuthStore.getState().cookie;
    if (!currentCookie) return;
    setLoading(true);
    setError(null);

    // Proactively validate session before fetching.
    // gytennis returns 200 HTML even for expired sessions (public page),
    // but with isvkrr price=0 — leading to silent rsvConfirm failures.
    const valid = await isSessionValid(currentCookie);
    let activeCookie = currentCookie;
    if (!valid && account) {
      const ok = await doLogin();
      if (!ok) {
        setError('세션 만료. 계정 설정에서 다시 로그인해 주세요.');
        setLoading(false);
        return;
      }
      activeCookie = useAuthStore.getState().cookie!;
    }

    const map = await getDailyBatch(courtIds, activeCookie, date);
    setData(map);
    setLoading(false);
  };

  useEffect(() => {
    if (cookie) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookie, date, fav.list.length]);

  /** Called after user confirms via ConfirmDialog */
  const reserve = async (s: Slot) => {
    let activeCookie = useAuthStore.getState().cookie;
    if (!activeCookie) return;
    setBusySlot(s.raw);
    setError(null);

    let result = await submitReservation([s], activeCookie);

    // Last-resort: session expired mid-session → re-login, re-fetch, retry once
    if (!result.ok && result.reason === 'not_logged_in' && account) {
      const ok = await doLogin();
      if (ok) {
        activeCookie = useAuthStore.getState().cookie!;
        // Re-fetch daily to get correct isvkrr price values
        const map = await getDailyBatch(courtIds, activeCookie, date);
        setData(map);
        // Find updated slot (same courtId + hour + courtNo)
        const allSlots = Array.from(map.values()).flatMap((v) => v?.slots ?? []);
        const fresh = allSlots.find(
          (t) => t.courtId === s.courtId && t.courtNo === s.courtNo && t.hour === s.hour,
        );
        if (fresh && fresh.status === 'available') {
          result = await submitReservation([fresh], activeCookie);
        }
      }
    }

    setBusySlot(null);

    if (result.ok && result.kcp) {
      openKcpPayment(result.kcp);
    } else if (!result.ok) {
      // If the server says "결제 진행 중" (payment already in progress), mark as pending
      const isPending =
        result.reason === 'already_taken' ||
        (result.reason === 'unknown' && result.detail === '결제 진행 중');
      if (isPending) {
        setPendingSlots((prev) => new Set([...prev, s.raw]));
        setError(`슬롯이 결제 진행 중 상태입니다.`);
      } else {
        setError(`예약 실패: ${result.reason}`);
      }
    } else {
      setError('예약 응답에서 결제 폼을 찾지 못했습니다.');
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
      <h1 className="text-xl font-bold">⚡ 간편 예약</h1>

      <Card>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">조회 날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
            />
          </div>
          <Button
            variant="secondary"
            className="w-auto px-4"
            onClick={refresh}
            disabled={loading || !cookie || busy}
          >
            {loading || busy ? '…' : '↻'}
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {fav.list.length ? `즐겨찾기 ${courtIds.length}곳` : '즐겨찾기 비어있음 → 전체 코트 표시'}
        </p>
      </Card>

      {error && (
        <Card className="border border-red-700">
          <p className="text-sm text-red-300">{error}</p>
        </Card>
      )}

      {courtIds.map((id) => {
        const view = data.get(id);
        const isFav = fav.has({ courtId: id });
        return (
          <Card key={id}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{courtName(id)}</h3>
              <button
                onClick={() => fav.toggle({ courtId: id })}
                className="text-xs text-slate-400 hover:text-yellow-400 min-h-[44px] px-2"
                aria-label={isFav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
              >
                {isFav ? '★ 즐겨찾기' : '☆ 즐겨찾기'}
              </button>
            </div>
            {!view ? (
              <p className="text-xs text-slate-500">조회 중…</p>
            ) : view.slots.filter((s) => s.status === 'available').length === 0 &&
              pendingSlots.size === 0 ? (
              <p className="text-xs text-slate-500">예약 가능 슬롯 없음</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {view.slots
                  .filter((s) => s.status === 'available' || pendingSlots.has(s.raw))
                  .map((s) => {
                    const isPending = pendingSlots.has(s.raw);
                    const isbusy = busySlot === s.raw;
                    return (
                      <button
                        key={s.raw}
                        onClick={() => {
                          if (!isPending && !isbusy) setConfirmSlot(s);
                        }}
                        disabled={isbusy || isPending}
                        aria-label={`${s.courtNo}번 코트 ${s.hour}시 예약`}
                        className={`min-h-[44px] px-3 py-2 rounded-lg text-xs disabled:opacity-70 transition-colors ${
                          isPending
                            ? 'bg-yellow-200 text-yellow-900 cursor-not-allowed'
                            : 'bg-slate-700 hover:bg-accent hover:text-bg cursor-pointer'
                        }`}
                      >
                        {isbusy ? (
                          '...'
                        ) : isPending ? (
                          <>⏳ {s.courtNo}번 {s.hour}시 결제중</>
                        ) : (
                          `${s.courtNo}번 ${s.hour}시`
                        )}
                      </button>
                    );
                  })}
              </div>
            )}
          </Card>
        );
      })}

      {/* Confirm dialog — shown when user taps a slot */}
      <ConfirmDialog
        open={confirmSlot !== null}
        message={
          confirmSlot
            ? `${courtName(confirmSlot.courtId)} ${confirmSlot.courtNo}번 코트 ${confirmSlot.hour}시 슬롯을 예약하시겠습니까?`
            : ''
        }
        onConfirm={() => {
          const s = confirmSlot;
          setConfirmSlot(null);
          if (s) reserve(s);
        }}
        onCancel={() => setConfirmSlot(null)}
      />
    </div>
  );
}
