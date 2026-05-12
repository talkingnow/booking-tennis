import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Card, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAuthStore } from '@/stores/authStore';
import { isRegistered, getSite } from '@/lib/sites/registry';
import { useSiteStore } from '@/stores/siteStore';
import type { SiteId } from '@/lib/sites/types';

type ResultState = 'pending' | 'success' | 'failure' | 'cancelled' | 'invalid';

export default function PaymentResult() {
  const [params] = useSearchParams();
  const resCd = params.get('res_cd') ?? '';
  const resMsg = params.get('res_msg') ?? '';
  const orderId = params.get('order_id') ?? '';
  // site query param — set by handoff.ts in mobile redirect URL
  const siteParam = params.get('site') ?? '';

  const [state, setState] = useState<ResultState>('pending');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const ranRef = useRef(false);

  const { activeSiteId } = useSiteStore();

  // Determine which site adapter to use for cancellation
  const resolvedSiteId: SiteId =
    siteParam === 'gy' || siteParam === 'pj'
      ? siteParam
      : activeSiteId;

  // Determine site display name
  const siteName = resolvedSiteId === 'pj' ? '파주시' : '고양시';

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!orderId) {
      setState('invalid');
      return;
    }

    if (resCd === '0000') {
      setState('success');
      return;
    }

    // Payment failed — cancel the reserved slot
    useAuthStore.getState().hydrate();
    const cookie = useAuthStore.getState().cookies[resolvedSiteId];

    if (cookie && isRegistered(resolvedSiteId)) {
      const adapter = getSite(resolvedSiteId);
      adapter.cancelReservation(orderId, cookie)
        .then((ok) => {
          if (!ok) setCancelError('예약 취소 요청에 실패했습니다. 직접 취소해 주세요.');
        })
        .catch(() => {
          setCancelError('예약 취소 중 오류가 발생했습니다. 직접 취소해 주세요.');
        })
        .finally(() => setState('cancelled'));
    } else {
      setState('failure');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'pending') {
    return (
      <Card>
        <p className="text-sm text-slate-400">처리 중…</p>
      </Card>
    );
  }

  if (state === 'invalid') {
    return (
      <Card className="border border-yellow-700">
        <CardTitle>잘못된 접근</CardTitle>
        <p className="text-sm text-slate-400 mb-4">주문번호가 없거나 잘못된 URL입니다.</p>
        <Link to="/">
          <Button>홈으로</Button>
        </Link>
      </Card>
    );
  }

  if (state === 'success') {
    return (
      <Card className="border border-green-700">
        <CardTitle>✅ 결제 완료</CardTitle>
        {orderId && (
          <p className="text-xs text-slate-400 mb-1">주문번호: {orderId}</p>
        )}
        <p className="text-sm text-green-300 mb-1">{siteName} 예약이 성공적으로 완료되었습니다.</p>
        <p className="text-xs text-slate-400 mb-4">예약 확인은 {siteName} 사이트에서 확인해 주세요.</p>
        <Link to="/">
          <Button>홈으로</Button>
        </Link>
      </Card>
    );
  }

  // failure or cancelled
  return (
    <Card className="border border-red-700">
      <CardTitle>❌ 결제 실패</CardTitle>
      {orderId && (
        <p className="text-xs text-slate-400 mb-1">주문번호: {orderId}</p>
      )}
      {resMsg && (
        <p className="text-sm text-red-300 mb-2">{resMsg}</p>
      )}
      {state === 'cancelled' && !cancelError && (
        <p className="text-xs text-slate-400 mb-2">예약이 자동으로 취소되었습니다.</p>
      )}
      {cancelError && (
        <p className="text-xs text-yellow-400 mb-2">{cancelError}</p>
      )}
      <div className="mt-4">
        <Link to="/quick">
          <Button>다시 예약하기</Button>
        </Link>
      </div>
    </Card>
  );
}
