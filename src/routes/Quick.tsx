import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuthStore } from '@/stores/authStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { getDailyBatch } from '@/lib/gytennis/slots';
import { submitReservation, cancelReservation } from '@/lib/gytennis/reserve';
import { isSessionValid } from '@/lib/gytennis/auth';
import { openKcpPayment } from '@/lib/payment/handoff';
import { COURTS, courtName } from '@/lib/courts';
import { SlotGrid } from '@/components/SlotGrid';
import type { DailyView, Slot, KcpForm } from '@/lib/gytennis/types';

export default function Quick() {
  const { cookie, hydrate, doLogin, account, busy } = useAuthStore();
  const fav = useFavoritesStore();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<Map<number, DailyView | null>>(new Map());
  const [loading, setLoading] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingSlots, setPendingSlots] = useState<Set<string>>(new Set());
  const [confirmSlot, setConfirmSlot] = useState<Slot | null>(null);
  const [favOpen, setFavOpen] = useState(false);
  const [kcpReady, setKcpReady] = useState<{ orderId: string; kcp: KcpForm; slotRaw: string } | null>(null);
  const payConfirmedRef = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { hydrate(); fav.hydrate(); }, []);

  useEffect(() => {
    if (!cookie && account) {
      doLogin();
    }
  }, [cookie, account, doLogin]);

  // Open favorites panel automatically when no favorites registered yet
  useEffect(() => {
    if (fav.list.length === 0) setFavOpen(true);
  }, [fav.list.length]);

  const favCourtIds = Array.from(new Set(fav.list.map((f) => f.courtId)));
  const courtIds = favCourtIds.length ? favCourtIds : COURTS.map((c) => c.id);
  const hasFavs = favCourtIds.length > 0;

  const refresh = async () => {
    const currentCookie = useAuthStore.getState().cookie;
    if (!currentCookie) return;
    setLoading(true);
    setError(null);

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
  }, [cookie, date, favCourtIds.join(',')]);

  const reserve = async (s: Slot) => {
    let activeCookie = useAuthStore.getState().cookie;
    if (!activeCookie) return;
    setBusySlot(s.raw);
    setError(null);

    let result = await submitReservation([s], activeCookie);

    if (!result.ok && result.reason === 'not_logged_in' && account) {
      const ok = await doLogin();
      if (ok) {
        activeCookie = useAuthStore.getState().cookie!;
        const map = await getDailyBatch(courtIds, activeCookie, date);
        setData(map);
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
      const orderId = result.orderId!;
      payConfirmedRef.current = false;
      setKcpReady({ orderId, kcp: result.kcp, slotRaw: s.raw });
      setPendingSlots((prev) => new Set([...prev, s.raw]));
      openKcpPayment(result.kcp, {
        onWindowClosed: async () => {
          if (!payConfirmedRef.current) {
            const c = useAuthStore.getState().cookie;
            if (c) await cancelReservation(orderId, c);
            setKcpReady(null);
            setPendingSlots((prev) => { const n = new Set(prev); n.delete(s.raw); return n; });
            setError('결제창이 닫혔습니다. 예약이 취소되었습니다.');
          } else {
            setKcpReady(null);
          }
        },
      });
    } else if (!result.ok) {
      const isPending =
        result.reason === 'already_taken' ||
        (result.reason === 'unknown' && result.detail === '결제 진행 중');
      if (isPending) {
        setPendingSlots((prev) => new Set([...prev, s.raw]));
        setError('슬롯이 결제 진행 중 상태입니다.');
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
      <h1 className="text-xl font-bold">⚡ 즉시 예약</h1>

      {/* Legend card */}
      <Card className="py-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span><span className="text-accent font-bold mr-1">○</span>예약 가능</span>
          <span><span className="text-slate-500 font-bold mr-1">×</span>예약됨</span>
          <span><span className="text-yellow-300 font-bold mr-1">⏳</span>결제중</span>
          <span><span className="text-slate-700 font-bold mr-1">–</span>불가</span>
        </div>
      </Card>

      {/* Favorites management panel */}
      <Card>
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setFavOpen((o) => !o)}
          aria-expanded={favOpen}
        >
          <span className="font-semibold text-sm">
            즐겨찾기 코트
            {hasFavs && (
              <span className="ml-2 text-xs text-yellow-400 font-normal">
                {favCourtIds.map((id) => courtName(id)).join(' · ')}
              </span>
            )}
          </span>
          <span className="text-slate-400 text-xs">{favOpen ? '▲ 닫기' : '▼ 편집'}</span>
        </button>

        {favOpen && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-slate-400 mb-2">
              즐겨찾기한 코트만 슬롯 조회에 표시됩니다. 없으면 전체 코트를 표시합니다.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {COURTS.map((c) => {
                const checked = fav.has({ courtId: c.id });
                return (
                  <button
                    key={c.id}
                    onClick={() => fav.toggle({ courtId: c.id })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                      checked
                        ? 'bg-yellow-400/20 border border-yellow-400/60 text-yellow-300'
                        : 'bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                    aria-pressed={checked}
                  >
                    <span>{checked ? '★' : '☆'}</span>
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto text-xs text-slate-500 shrink-0">
                      {c.kind === 'indoor' ? '실내' : '실외'}
                    </span>
                  </button>
                );
              })}
            </div>
            {hasFavs && (
              <button
                className="mt-2 text-xs text-slate-500 hover:text-red-400 underline"
                onClick={() => favCourtIds.forEach((id) => fav.toggle({ courtId: id }))}
              >
                전체 해제
              </button>
            )}
          </div>
        )}

        {!favOpen && !hasFavs && (
          <p className="text-xs text-slate-500 mt-1">
            코트를 등록하면 해당 코트만 조회합니다. ▼ 편집을 눌러 추가하세요.
          </p>
        )}
      </Card>

      {/* Date + refresh */}
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
          {hasFavs
            ? `즐겨찾기 ${courtIds.length}곳 조회 중`
            : '즐겨찾기 없음 → 전체 10곳 표시'}
        </p>
      </Card>

      {error && (
        <Card className="border border-red-700">
          <p className="text-sm text-red-300">{error}</p>
        </Card>
      )}

      {/* Payment confirmation card */}
      {kcpReady && (
        <Card className="border border-green-700">
          <CardTitle>💳 결제 진행 중</CardTitle>
          <p className="text-xs text-slate-400 mb-1">주문번호: {kcpReady.orderId}</p>
          <p className="text-xs text-slate-400 mb-3">결제창에서 완료하셨으면 아래 버튼을 눌러주세요.</p>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                payConfirmedRef.current = true;
                setKcpReady(null);
                setPendingSlots((prev) => { const n = new Set(prev); n.delete(kcpReady.slotRaw); return n; });
              }}
              className="flex-1"
            >
              결제 완료 ✓
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                payConfirmedRef.current = false;
                const { orderId, kcp, slotRaw } = kcpReady;
                openKcpPayment(kcp, {
                  onWindowClosed: async () => {
                    if (!payConfirmedRef.current) {
                      const c = useAuthStore.getState().cookie;
                      if (c) await cancelReservation(orderId, c);
                      setKcpReady(null);
                      setPendingSlots((prev) => { const n = new Set(prev); n.delete(slotRaw); return n; });
                      setError('결제창이 닫혔습니다. 예약이 취소되었습니다.');
                    } else {
                      setKcpReady(null);
                    }
                  },
                });
              }}
            >
              결제창 다시 열기
            </Button>
          </div>
        </Card>
      )}

      {/* Slot grid cards */}
      {courtIds.map((id) => {
        const view = data.get(id);
        return (
          <Card key={id}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{courtName(id)}</h3>
              {loading && !view && (
                <span className="text-xs text-slate-500">조회 중…</span>
              )}
            </div>
            {!view ? (
              <p className="text-xs text-slate-500">{loading ? '조회 중…' : '데이터 없음'}</p>
            ) : (
              <SlotGrid
                courtId={id}
                slots={view.slots}
                pendingSlots={pendingSlots}
                loading={loading && !view}
                onSlotClick={(s) => {
                  if (busySlot !== s.raw) setConfirmSlot(s);
                }}
              />
            )}
          </Card>
        );
      })}

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
