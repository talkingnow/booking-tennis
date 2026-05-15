# 빌드 로그 — KCP SDK 모바일 결제 흐름 교체

**날짜**: 2026-05-15
**커밋**: b327663
**계획서**: `_workspace/02_plan_kcp_sdk_mobile.md`

---

## 변경 요지

### M1: `src/lib/payment/handoff.ts`

**폐기 (삭제):**
- `resolveInnerKcpForm()` — 2-hop gytennis 프록시 시도 함수
- `openKcpMobile()` — form.submit 방식 모바일 핸드오프
- `isKcpDomain()` — 내부 전용 KCP 도메인 판별 함수
- `KcpHandoffOptions.cookie` — 모바일에서 더 이상 불필요

**신규:**
- `openKcpMobileSdk(kcp, siteId)` — SDK blob 방식
  - `m_redirect_url = ${location.origin}/api/kcp-return?site=${siteId}`
  - `pay_method` 기본값 `'100000000000'` 보장
  - blob HTML: `<form name="order_info">` + 전 필드 + `payplus_web.jsp` 스크립트 + `KCP_Pay_Execute` onload
  - `window.open(blobUrl, '_blank')` — features 인자 없음 (PC 팝업 width/height 제거)
  - 15초 후 `URL.revokeObjectURL`

**유지:**
- `isMobile()`, `toMobileAction()`, `isStandalonePwa()` — export 유지
- PC 팝업 흐름 (`window.open(blobUrl, '_blank', 'width=720,height=820,...')`) — 변경 없음

### M2: `api/kcp-return.ts` (신규)

- `runtime: 'edge', regions: ['icn1']`
- GET/POST 양방향 처리 → 모든 필드를 쿼리스트링으로 302 `/payment-result`
- body(enc_info/enc_data 등) 로깅·저장 없음

### M3: `src/routes/PaymentResult.tsx`

- `ResultState` 확장: `'rsvpy_success' | 'rsvpy_failure'` 추가
- `res_cd=0000` + `enc_info` 존재 시 `/rsvPy` POST:
  - 고양시: `fetch('/api/gy/rsvPy', ...)`
  - 파주시: `fetch('/api/pj/rsvPy', ...)` (사이트 분기)
  - 쿠키: `useAuthStore.getState().cookies[resolvedSiteId]` (localStorage 전용)
  - 성공 판정: `res.ok` + HTML에 `"예약이 완료"` / `"rsvRst"` / `"완료되었습니다"` 포함
- `res_cd=0000` + enc 없음 → 기존 `'success'` (하위호환)
- `res_cd !== '0000'` → 기존 취소 로직 유지
- `RSVPY_FIELDS`: enc_info, enc_data, ordr_idxx, good_name, good_mny, buyr_name, buyr_mail, pay_method, site_cd, res_cd, res_msg, tran_cd 등 24개 필드

### M3 부수 변경: `api/pj/[...path].ts`

- `/rsvPy` 패턴을 `ALLOWED_PATHS`에 추가 (파주시 예약 확정 지원)

### M4: `src/routes/Race.tsx` / `src/routes/Quick.tsx`

- `openKcpPayment` 호출부 3곳에서 `cookie:` 옵션 제거
  - `Quick.tsx` line 146, 327
  - `Race.tsx` line 313

### M5: `tests/handoff.test.ts`

**제거:**
- `openKcpPayment mobile — redirect field 처리` (form.submit 기반, 폐기)
- `openKcpPayment mobile — 확장 REDIRECT_FIELDS strip (A1)` (동상)

**유지:**
- `isMobile(ua)` 4케이스
- `toMobileAction` 4케이스
- `isStandalonePwa` 4케이스

**신규 `openKcpPayment mobile — SDK blob 방식` 4케이스:**
- `window.open` 이 `_blank` 타겟으로 `blob:mock-url` 호출 확인
- features 인자 `undefined` (PC 팝업 사이즈 없음)
- 반환값 `null`
- `Blob` 생성자 모킹으로 blob HTML에 `/api/kcp-return?site=gy` 포함 검증

---

## 회귀 테스트 결과

```
Test Files  10 passed (10)
Tests       106 passed (106)
Start at    10:52:27
Duration    1.85s
```

기존 18 파서 케이스(parsers.test.ts 22) 포함 전체 통과. 신규 4케이스 추가로 총 106케이스.

## 빌드 결과

```
> tsc -b && vite build
✓ 82 modules transformed.
dist/index.html                                  0.82 kB │ gzip:  0.43 kB
dist/assets/index-RNw6zH32.js                 233.53 kB │ gzip: 75.01 kB
✓ built in 924ms
PWA v0.21.2 — precache 10 entries (255.94 KiB)
```

TypeScript 오류: 0

---

## 미해결 리스크 (라이브 테스트 필요)

| ID | 내용 |
|----|------|
| R1 | KCP site_cd=AL4CM 에서 `m_redirect_url=booking-tennis.vercel.app` 화이트리스트 허용 여부 — 실기기 확인 필요 |
| R2 | KCP 결과 전송 방식(GET vs POST) — Edge Function 양쪽 처리로 대응, 실기기 확인 필요 |
| R4 | `/rsvPy` 성공 판정 패턴("예약이 완료") 유효 여부 — 실기기 확인 필요 |
