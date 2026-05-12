import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/Button';

type Props = {
  /** ms-epoch deadline (Date.now() + 8 * 60 * 1000 at mount time) */
  deadline: number;
  /** Called once when the countdown reaches 0 */
  onExpire: () => void;
  /** Called when the user clicks the manual-cancel button */
  onCancel: () => void;
};

/**
 * 8-minute payment countdown.
 * - Displays MM:SS remaining.
 * - Turns red when < 60 s remain.
 * - Fires onExpire() automatically at expiry.
 * - Provides a "지금 취소" button → onCancel().
 * - Does NOT call cancelReservation internally (R-E B안).
 */
export function PaymentCountdown({ deadline, onExpire, onCancel }: Props) {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Date.now()));
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;

    const tick = () => {
      const r = Math.max(0, deadline - Date.now());
      setRemaining(r);
      if (r <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    };

    tick(); // initial paint
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [deadline, onExpire]);

  const mm = String(Math.floor(remaining / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60_000) / 1_000)).padStart(2, '0');
  const urgent = remaining < 60_000;

  return (
    <div className="mt-4 space-y-3 text-center">
      <p className="text-sm text-slate-400">결제 만료까지</p>
      <p className={`text-4xl font-mono tabular-nums ${urgent ? 'text-red-400' : 'text-yellow-400'}`}>
        {mm}:{ss}
      </p>
      <p className="text-xs text-slate-500">
        8분 이내 결제 완료 필요. 만료 시 슬롯이 자동 취소됩니다.
      </p>
      <Button variant="danger" onClick={onCancel}>
        지금 취소
      </Button>
    </div>
  );
}
