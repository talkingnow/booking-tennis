import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Card, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';
import { useAuthStore } from '@/stores/authStore';
import { isRegistered, getSite } from '@/lib/sites/registry';
import { useSiteStore } from '@/stores/siteStore';
import type { SiteId } from '@/lib/sites/types';

type ResultState = 'pending' | 'success' | 'failure' | 'cancelled' | 'invalid' | 'no_response';

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

    // No KCP params at all — KCP never redirected back (e.g. ordrErr before KCP entry)
    if (!resCd && !params.get('pay_method') && !params.get('enc_info')) {
      setState('no_response');
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

  if (state === 'no_response') {
    return (
      <Card className="border border-yellow-700">
        <CardTitle>결제창 진입 실패</CardTitle>
        <p className="text-sm text-yellow-300 mb-3">
          결제창이 열리지 않고 만료 페이지로 이동했을 수 있습니다.
        </p>
        <p className="text-xs text-slate-400 mb-4">
          모바일에서 '결제 정보가 만료되었습니다' 화면이 보이면, <strong className="text-slate-200">PC 브라우저</strong>에서 동일 계정으로 로그인 후 같은 즐겨찾기로 재시도해 주세요. KCP 측 모바일 결제 정책에 따라 일부 환경에서 결제창이 정상 표시되지 않을 수 있습니다.
        </p>
        <div className="flex gap-2">
          <Link to="/quick">
            <Button>즐겨찾기로</Button>
          </Link>
          <Link to="/">
            <Button variant="secondary">홈으로</Button>
          </Link>
        </div>
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
