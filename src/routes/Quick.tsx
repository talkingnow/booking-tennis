import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAuthStore } from '@/stores/authStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { getDailyBatch } from '@/lib/gytennis/slots';
import { submitReservation } from '@/lib/gytennis/reserve';
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
    if (!cookie) return;
    setLoading(true);
    setError(null);
    const map = await getDailyBatch(courtIds, cookie, date);
    // Check for session expiry — all entries null usually means expired
    const allNull = Array.from(map.values()).every((v) => v == null);
    if (allNull && account) {
      const ok = await doLogin();
      if (ok) {
        const m2 = await getDailyBatch(courtIds, useAuthStore.getState().cookie!, date);
        setData(m2);
      } else {
        setError('세션 만료. 계정 설정에서 다시 로그인해 주세요.');
      }
    } else {
      setData(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (cookie) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookie, date, fav.list.length]);

  const reserve = async (s: Slot) => {
    if (!cookie) return;
    setBusySlot(s.raw);
    setError(null);
    const result = await submitReservation([s], cookie);
    setBusySlot(null);
    if (result.ok && result.kcp) {
      openKcpPayment(result.kcp);
    } else if (!result.ok) {
      setError(`예약 실패: ${result.reason}`);
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
          <Button variant="secondary" className="w-auto px-4" onClick={refresh} disabled={loading || !cookie || busy}>
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
                className="text-xs text-slate-400 hover:text-yellow-400"
              >
                {isFav ? '★ 즐겨찾기' : '☆ 즐겨찾기'}
              </button>
            </div>
            {!view ? (
              <p className="text-xs text-slate-500">조회 중…</p>
            ) : view.slots.filter((s) => s.status === 'available').length === 0 ? (
              <p className="text-xs text-slate-500">예약 가능 슬롯 없음</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {view.slots
                  .filter((s) => s.status === 'available')
                  .map((s) => (
                    <button
                      key={s.raw}
                      onClick={() => reserve(s)}
                      disabled={busySlot === s.raw}
                      className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-accent hover:text-bg text-xs disabled:opacity-50"
                    >
                      {busySlot === s.raw ? '...' : `${s.courtNo}번 ${s.hour}시`}
                    </button>
                  ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
