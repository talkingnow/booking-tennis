# booking-tennis — KCP SDK 모바일 결제 흐름 교체 계획서

**작성**: 2026-05-15 / planner / worktree `bundle-a-kcp-mobile`
**기반**: task#1 확정 진단 + 구현 설계 (재정찰·재설계 불필요)

---

## 1. 요구사항 요약

### 문제 (task#1 확정 진단 인용)

> - `/rsvConfirm` → `order_info` 폼 (action `/rsvPy`, enc_info/enc_data 빈값)
> - `/rsvPy` 에 빈 enc 로 POST → `/ordrErr` 로 보내는 "결제 진행 중..." 페이지(2561B) 반환. 2-hop resolveInnerKcpForm 은 원천 불가능. `/rsvPy` 는 결제 후 핸들러.
> - KCP 주문등록은 `KCP_Pay_Execute` SDK 만 가능. SDK 의 KCP 통신은 pay.kcp.co.kr 직접 → gytennis 쿠키 불필요. PC에서 cp_domain=booking-tennis.vercel.app 로도 동작 확인됨.
> - 현재 worktree `src/lib/payment/handoff.ts` 의 모바일 분기(openKcpMobile + resolveInnerKcpForm + isKcpDomain)는 폐기 대상.

### 해석

모바일도 PC 와 동일하게 **blob 페이지 + payplus_web.jsp SDK** 로 `KCP_Pay_Execute` 를 실행해야 한다. SDK 가 KCP 와 직접 통신하므로 gytennis 세션 쿠키는 KCP 진입에 불필요. 차이는 결제 완료 후 흐름:
- **PC**: 팝업 창 + 사용자 수동 "결제 완료 ✓" 클릭 (변경 없음)
- **모바일**: blob 탭 → KCP 가 `m_redirect_url` 로 결과 전송 → 신규 Edge Function `/api/kcp-return` → `/payment-result` 302 → `PaymentResult.tsx` 가 `order_info` 폼 재구성 → `/api/gy/rsvPy` 프록시 POST → gytennis 예약 확정 → 결과 표시

---

## 2. 변경 범위

| 구분 | 파일 | 변경 요지 |
|------|------|----------|
| 신규 | `api/kcp-return.ts` | KCP 결과 수신 Edge Function. POST/GET body → 쿼리스트링 → `/payment-result` 302 |
| 수정 | `src/lib/payment/handoff.ts` | 모바일 분기를 SDK blob 방식으로 교체. `openKcpMobile`/`resolveInnerKcpForm`/`isKcpDomain` 삭제. `KcpHandoffOptions.cookie` 삭제 |
| 수정 | `src/routes/PaymentResult.tsx` | 쿼리에서 KCP 결과 읽어 `order_info` 폼 재구성 → `/api/gy/rsvPy` POST → 확정/실패 판정 |
| 수정 | `src/routes/Quick.tsx` | `openKcpPayment` 호출부 2곳 `cookie` 옵션 제거 |
| 수정 | `src/routes/Race.tsx` | `openKcpPayment` 호출부 1곳 `cookie` 옵션 제거 |
| 수정 | `tests/handoff.test.ts` | 폐기 함수 테스트 제거, SDK 모바일 흐름 신규 테스트 추가. `isMobile`/`toMobileAction`/`isStandalonePwa` 유지 |
| 확인만 | `api/gy/[...path].ts` | `/^\/rsvPy$/` 이미 `ALLOWED_PATHS` 에 존재 (line 9) — 변경 불필요 |
| 확인만 | `vercel.json` | `api/*.ts` 는 Vercel 이 자동 라우팅 — `api/gy/[...path].ts` 가 별도 등록 없이 동작 중이므로 `kcp-return.ts` 도 등록 불필요. **builder: 현 `vercel.json` 에 함수별 라우트가 있는지 먼저 확인 후 패턴 따를 것** |

---

## 3. 모듈별 작업 분해 (담당: builder)

### M1 — `src/lib/payment/handoff.ts` 모바일 분기 교체

**삭제:**
- `resolveInnerKcpForm()` — 전체 삭제
- `openKcpMobile()` — 전체 삭제
- `isKcpDomain()` — 전체 삭제 (내부 전용)
- `KcpHandoffOptions.cookie` 필드 — 삭제

**유지:** `isMobile`, `toMobileAction`, `isStandalonePwa`, `escAttr`, `KCP_SDK_URL`, `GYTENNIS` 상수, `REDIRECT_FIELDS` 셋(모바일 blob 빌드에서 재사용).

**blob HTML 빌더 추출 (테스트 위해 export 권장):**
```ts
// PC/모바일 공통 KCP SDK blob HTML 생성
export function buildKcpBlobHtml(action: string, fields: Record<string, string>): string;
```
현 PC 경로의 `pageHtml` 로직을 이 함수로 추출. `fields` 는 호출 전에 이미 정제된 상태(모바일은 redirect 필드 strip + `m_redirect_url` 주입 완료)로 받는다.

**신규 내부 함수 `openKcpMobileSdk(kcp, siteId): Window | null`:**
```
1. orderId = kcp.fields.ordr_idxx ?? ''
2. fields 정제:
   - REDIRECT_FIELDS 에 해당하는 기존 필드 strip
   - m_redirect_url = `${location.origin}/api/kcp-return?order_id=${enc(orderId)}&site=${enc(siteId ?? '')}` 주입
   - pay_method 없으면 '100000000000' 삽입
3. action = toMobileAction(절대 URL 변환된 action)
4. buildKcpBlobHtml(action, 정제된 fields) → Blob → blobUrl
5. window.open(blobUrl, '_blank')   // ← features 인자 없음 (task#1: 옛 PC창 원인 의심)
6. 15초 후 URL.revokeObjectURL
7. return 그 Window | null   // 모바일은 onWindowClosed 폴링 안 함
```

**`openKcpPayment` 모바일 분기:**
```ts
if (isMobile()) {
  return openKcpMobileSdk(kcp, opts.siteId);
}
// 이하 PC 분기 — 기존 코드 그대로 (window.open features 유지)
```

### M2 — `api/kcp-return.ts` 신규 Edge Function

```ts
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
  return Response.redirect(redirectUrl.toString(), 302);
}
```

**보안:** KCP body 를 통과만 한다. `console.log` 로 `enc_data`/`enc_info` 전체를 찍지 말 것 (필요 시 필드명만). 쿠키·자격증명 미수신·미기록.

### M3 — `src/routes/PaymentResult.tsx` 최종 rsvPy 제출 로직

**현 동작:** `res_cd === '0000'` 이면 즉시 `success` 표시 — KCP 결과만으로 예약이 확정되지 않으므로 부정확. `/rsvPy` 에 KCP 결과를 다시 POST 해야 슬롯 확정.

**신규 흐름 (useEffect 내, `ranRef` 가드 유지):**
```
1. orderId 없음            → 'invalid'  (기존 유지)
2. KCP 파라미터 전무
   (res_cd/enc_info/enc_data 모두 없음) → 'no_response'  (기존 유지)
3. res_cd !== '0000'       → cancelReservation(orderId, cookie) → 'cancelled'/'failure'  (기존 실패 로직 유지)
4. res_cd === '0000':
   a. useAuthStore.getState().hydrate() → cookies[resolvedSiteId]
   b. 쿠키 없음 → 'failure' + "세션 만료, 직접 확인 필요" 안내
   c. 쿼리의 KCP 결과 필드 전부를 URLSearchParams body 로 구성 (§4-C)
   d. gyFetch('/rsvPy', { method: 'POST', body, cookie })
   e. 응답 status/location/HTML 휴리스틱으로 확정 판정:
      - 정상 완료 → 'rsvpy_success'
      - /ordrErr redirect 또는 실패 키워드 → 'rsvpy_failure' + cancelReservation 시도
```

**`ResultState` 확장:**
```ts
type ResultState =
  | 'pending' | 'success' | 'rsvpy_success' | 'rsvpy_failure'
  | 'failure' | 'cancelled' | 'invalid' | 'no_response';
```
`success` 는 KCP 결과만 있고 enc 없는 구버전 호환용으로 잔존 — 신규 모바일 경로는 `rsvpy_success`/`rsvpy_failure` 사용. rsvPy 제출 동안 `pending` 스피너 노출.

**import 추가:** `import { gyFetch } from '@/lib/gytennis/proxyClient'`

**builder 주의:** gytennis `/rsvPy` 의 정확한 성공/실패 판정 키워드는 라이브 응답을 봐야 확정 (R4). 1차 구현은 `res.status` + `res.location`(`ordrErr` 포함 여부) + HTML 키워드("예약이 완료" 등) 휴리스틱으로 작성하고 QA 라이브 검증에서 보정.

### M4 — `Quick.tsx` / `Race.tsx` 호출부 수정

`openKcpPayment` 호출에서 `cookie` 인자만 제거. `onWindowClosed` 콜백 **내부**의 쿠키 재취득(`useAuthStore.getState().cookies[...]`)은 그대로 유지 (cancelReservation 에 필요).

- **Quick.tsx**: `reserve()` 내 (line ~146), "결제창 다시 열기" 버튼 (line ~329) — 2곳.
- **Race.tsx**: `openPaymentPopup` (line ~314) — 1곳.

```ts
// 변경 전
openKcpPayment(kcp, { siteId, cookie: c, onWindowClosed })
// 변경 후
openKcpPayment(kcp, { siteId, onWindowClosed })
```

Quick 의 `if (!isMobile()) setKcpReady(...)` 분기(line 145)는 유지 — 모바일은 `m_redirect_url` 복귀하므로 `kcpReady` 카드 불필요.

### M5 — `tests/handoff.test.ts` 갱신

**제거:**
- `describe('openKcpPayment mobile — redirect field 처리')` — 구 `openKcpMobile` form.submit 전제
- `describe('openKcpPayment mobile — 확장 REDIRECT_FIELDS strip (A1)')` — 동일

**유지:** `describe('isMobile(ua)')`, `describe('toMobileAction')`, `describe('isStandalonePwa')` — 함수 변경 없음.

**신규 `describe('openKcpPayment mobile — SDK blob 방식')`:**
- 모바일 UA 에서 `window.open` 이 **features 인자 없이** `_blank` 로 호출
- blob HTML 에 `m_redirect_url = ${origin}/api/kcp-return?order_id=...&site=...` 주입 확인
- blob HTML 에서 redirect 계열 필드(`Ret_URL`/`callback_url` 등) strip 확인
- blob HTML 에 `pay_method` 기본값 폴백 유지
- PC 호출 시 `m_redirect_url` 미주입 + features 인자 유지 (회귀)
- 검증 구조: `buildKcpBlobHtml` 을 export 해 HTML 문자열을 직접 단위테스트. `window.open`/`URL.createObjectURL` 은 `vi.spyOn` 모킹.

---

## 4. 인터페이스 합의안

### 4-A. `api/kcp-return.ts` 입출력 계약

**입력:** KCP → `m_redirect_url`
- Method: POST(`application/x-www-form-urlencoded`) 또는 GET — 양쪽 처리
- 필드: KCP 표준 결과 필드(`res_cd`, `res_msg`, `enc_info`, `enc_data`, `ordr_idxx`, `pay_method`, `good_mny`, `tno`, `app_time` 등) — **고정하지 말고 받은 전부 통과**

**출력:** `302 Found`, `Location: /payment-result?<merged-querystring>`
- merged = KCP 필드 전부 + 우리가 박은 `order_id`·`site` (우리 값 우선; `order_id` 없으면 KCP `ordr_idxx` 폴백)

### 4-B. `m_redirect_url` 포맷 (handoff.ts 주입)

```
${location.origin}/api/kcp-return?order_id=${encodeURIComponent(ordr_idxx)}&site=${encodeURIComponent(siteId)}
```
- `ordr_idxx` = `kcp.fields.ordr_idxx`. 없으면 빈 문자열 (kcp-return 이 KCP body 의 `ordr_idxx` 로 폴백)
- `siteId` = `KcpHandoffOptions.siteId` (`'gy'` | `'pj'`)

### 4-C. `PaymentResult.tsx` → `/api/gy/rsvPy` POST 폼 필드 구성

```ts
const body = new URLSearchParams();
for (const [k, v] of params.entries()) {
  if (k === 'site') continue;             // 우리 내부용 — gytennis 로 안 보냄
  body.set(k, v);                          // res_cd, res_msg, enc_info, enc_data, ordr_idxx, pay_method, good_mny, ... 전부
}
// gytennis 가 ordr_idxx 키를 기대 → order_id 만 있을 때 보강
if (!body.has('ordr_idxx') && params.get('order_id')) {
  body.set('ordr_idxx', params.get('order_id')!);
}
await gyFetch('/rsvPy', { method: 'POST', body, cookie });
```
- 쿠키: `useAuthStore.getState().cookies[resolvedSiteId]` — gyFetch 의 `X-GYT-Cookie` 헤더로만 프록시에 전달 (기존 패턴, PWA 밖으로 안 나감)
- **builder 주의:** `/rsvPy` 가 기대하는 정확한 폼 필드 이름은 라이브 검증 필요 (R4) — 1차는 "KCP 가 준 필드 전부 + order_id↔ordr_idxx 보강"

### 4-D. `KcpHandoffOptions` 최종 시그니처

```ts
export type KcpHandoffOptions = {
  /** mobile m_redirect_url 에 박을 사이트 식별자 */
  siteId?: SiteId;
  /** PC 팝업 닫힘 감지 콜백. 모바일에선 호출되지 않음. */
  onWindowClosed?: () => void;
};

export async function openKcpPayment(
  kcp: KcpForm,
  opts?: KcpHandoffOptions,
): Promise<Window | null>;
```
`cookie` 필드 **삭제** — 호출부(Quick 2곳, Race 1곳)에서 `cookie:` 인자 제거 필수.

### 4-E. `PaymentResult.tsx` 가 읽는 쿼리 파라미터

| 파라미터 | 출처 | 설명 |
|---------|------|------|
| `res_cd` | KCP | '0000' = 결제 성공 |
| `res_msg` | KCP | 결과 메시지 |
| `enc_info` / `enc_data` | KCP | 결제 결과 암호화 정보 |
| `ordr_idxx` | KCP | 주문번호 |
| `good_mny` / `pay_method` / `tno` 등 | KCP | KCP 가 보낸 나머지 전부 |
| `order_id` | handoff.ts | 우리 주입 주문번호 (ordr_idxx 폴백 소스) |
| `site` | handoff.ts | 사이트 ID (`gy`/`pj`) — gytennis 로 전송 안 함 |

---

## 5. 리스크 / 미해결 의문점

| ID | 리스크 | 대응 |
|----|--------|------|
| R1 | KCP 가 `site_cd`(AL4CM 등)에 `m_redirect_url` 화이트리스트 강제 시 임의 URL(booking-tennis.vercel.app) 거부 가능 | QA 라이브 검증으로만 확정. 거부 시: (a) KCP 가맹점 포털에서 도메인 등록(사용자 액션 — team-lead 가 사용자에 권한 확인 요청) (b) 불가 시 모바일은 "PC 에서 결제" 안내로 폴백 (`no_response` 카드 메시지 재활용) |
| R2 | KCP 가 `m_redirect_url` 로 POST 인지 GET 인지 미확정 | `kcp-return.ts` 가 양쪽 처리 (M2 반영). QA 가 `list_network_requests` 로 실제 메서드 확인 |
| R3 | standalone PWA `_blank` 탭 → 결제 후 `PaymentResult` 가 별 탭에서 열림 | 현 단계 허용 — `PaymentResult` 가 결과 + "홈으로" 링크 제공하므로 기능상 문제 없음. UX 개선은 별도 task |
| R4 | gytennis `/rsvPy` 가 기대하는 정확한 폼 필드/성공 판정 키워드 미확정 | 1차는 "KCP 필드 전부 통과 + order_id↔ordr_idxx 보강 + status/location/키워드 휴리스틱". QA 가 라이브 결제 1건의 `/rsvPy` 응답 캡처 → builder 보정 |
| R5 | `KCP_Pay_Execute` SDK 가 모바일 UA 에서 PC 결제창을 띄울 가능성 (features 인자 제거로 완화 시도, 미검증) | QA 모바일 viewport 에이전트로 실제 결제창 렌더 확인. SDK 가 UA 보고 모바일 결제창 자동 선택하는 게 정상 |
| R6 | `enc_data` 가 길면 `/payment-result?...` URL 이 브라우저/Vercel 길이 한계 초과 가능 | QA 에서 실제 `enc_data` 길이 확인. 초과 시: `kcp-return.ts` 가 302 대신 자동 POST 폼 HTML 반환 → `PaymentResult` 가 POST body 도 읽도록 전환. 1차는 302 쿼리로 구현 |
| R7 | Race 모바일 cascade 연속성 소실 — 모바일은 `PaymentResult` 로 이동하므로 Race cascade 상태 휘발 | **기존에도 동일한 한계.** 본 계획 범위 밖 — 현 동작 유지. 별도 task 권장 |
| R8 | `toMobileAction` 의 spay→smpay 변환이 SDK 방식에서 불필요할 수 있음 | SDK blob 내부에서 form action 사용 → `toMobileAction` 적용 유지(안전). export 는 기존 테스트 통과용으로 유지 |

---

## 6. QA 검증 체크리스트

### S1. 단위 테스트 (`npx vitest run`)
- [ ] `isMobile(ua)` 4케이스 통과 (유지)
- [ ] `toMobileAction` 4케이스 통과 (유지)
- [ ] `isStandalonePwa` 4케이스 통과 (유지)
- [ ] 신규 `openKcpPayment mobile — SDK blob 방식`: window.open features 없음 / `m_redirect_url` 주입 / redirect 필드 strip / pay_method 폴백
- [ ] 신규: PC 호출 시 `m_redirect_url` 미주입 + features 유지 (회귀)
- [ ] 구 `openKcpMobile` form.submit 기반 테스트 2개 describe 제거 확인
- [ ] **회귀: `tests/parsers.test.ts` 18개 케이스 전부 통과** — `parseKcpForm`/`extractOrderId` 미변경이므로 필수
- [ ] 회귀: 기타 기존 테스트 통과

### S2. 빌드 / 타입
- [ ] `npm run build` (tsc + vite) 에러 0 — `KcpHandoffOptions.cookie` 제거에 따른 호출부 타입 에러 없음
- [ ] `openKcpMobile`/`resolveInnerKcpForm`/`isKcpDomain` 참조가 코드베이스에 잔존하지 않음 (`grep` 확인)

### S3. preview 렌더 검증 (chrome-devtools MCP, 모바일 viewport)
- [ ] `/payment-result?order_id=X&res_cd=9999` → 실패/취소 카드
- [ ] `/payment-result` (쿼리 없음) → `invalid` 카드
- [ ] `/payment-result?order_id=X` (KCP 파라미터 없음) → `no_response` 카드
- [ ] PC viewport: Quick/Race 결제창 열기 → 기존 팝업 정상 (회귀)

### S4. 라이브 데이터 대조 (실제 KCP 흐름 — 사용자/QA 협조)
- [ ] 모바일에서 Quick 슬롯 예약 → `KCP_Pay_Execute` SDK 결제창이 **모바일용으로** 렌더 (R5)
- [ ] KCP 결제 진행 → `m_redirect_url` 거부 없이 `/api/kcp-return` 로 복귀 (R1)
- [ ] `list_network_requests` 로 KCP→`/api/kcp-return` 메서드(POST/GET) 확인 (R2)
- [ ] `/api/kcp-return` → `/payment-result` 302 정상, 쿼리에 `res_cd`/`order_id`/`enc_*` 포함
- [ ] `enc_data` 길이 확인 — `/payment-result?...` URL 정상 길이인지 (R6)
- [ ] `PaymentResult` → `/api/gy/rsvPy` POST 의 실제 응답 캡처 → 성공/실패 키워드 확정 (R4) → builder 보정
- [ ] 결제 성공 1건 → gytennis 마이페이지에서 예약 확정 확인
- [ ] 결제 취소 1건 → 슬롯이 `cancelReservation` 으로 해제 확인

### S5. 보안 불변 조건 (코드 리뷰)
- [ ] `api/kcp-return.ts` 가 쿠키·자격증명·enc 데이터를 로깅/저장하지 않음
- [ ] 자격증명·KCP 자동입력 없음 — 사용자 클릭 직후 form auto-submit 만
- [ ] 쿠키가 gytennis 프록시(`X-GYT-Cookie`) 외 경로로 서버에 전송되지 않음

### S6. Vercel 배포 검증
- [ ] `api/kcp-return.ts` 가 Edge Function 으로 배포 (`runtime: 'edge'`, `regions: ['icn1']`)
- [ ] prod 배포 후 `https://<prod>/api/kcp-return?order_id=test&res_cd=9999` → `/payment-result` 302 확인
- [ ] prod 모바일 end-to-end 1회 (S4 항목 prod 재확인)
