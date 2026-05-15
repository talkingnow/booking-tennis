export const config = { runtime: 'edge', regions: ['icn1'] };

export default async function handler(req: Request): Promise<Response> {
  const reqUrl = new URL(req.url);

  // KCP가 POST(form-urlencoded)할지 GET할지 미확정 → 양쪽 처리
  let kcpParams: URLSearchParams;
  if (req.method === 'POST') {
    kcpParams = new URLSearchParams(await req.text());
  } else {
    kcpParams = reqUrl.searchParams;
  }

  // 우리가 m_redirect_url 에 박은 쿼리는 항상 URL 에서 읽음
  const ourOrderId = reqUrl.searchParams.get('order_id') ?? '';
  const ourSite    = reqUrl.searchParams.get('site') ?? '';

  // KCP 필드 전부 통과 + 우리 쿼리(order_id, site) 우선 머지
  const qs = new URLSearchParams();
  for (const [k, v] of kcpParams.entries()) qs.set(k, v);
  if (ourOrderId) qs.set('order_id', ourOrderId);
  else if (kcpParams.get('ordr_idxx')) qs.set('order_id', kcpParams.get('ordr_idxx')!);
  if (ourSite) qs.set('site', ourSite);

  const redirectUrl = new URL('/payment-result', reqUrl.origin);
  redirectUrl.search = qs.toString();

  // R6: enc_data 가 길면 URL 길이 경고 (필드명만 로그, 값은 미기록)
  // 1차는 302 유지 — QA 라이브 검증에서 실제 초과 확인 시 보강
  const qsLen = redirectUrl.search.length;
  if (qsLen > 1800) {
    console.warn(`kcp-return: query length ${qsLen} > 1800 (fields: ${[...qs.keys()].join(',')})`);
  }

  return Response.redirect(redirectUrl.toString(), 302);
}
