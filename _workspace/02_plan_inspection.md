# booking-tennis — 앱 전체 검수 + 수정 계획서 (Phase 2 보강)

**작성**: 2026-05-12 / planner
**입력**: 사용자 요구사항(`00_input_requirements.md`), 정찰(`01_recon.md`), 기존 빌드 계획(`02_plan.md`), 현 코드 (M1~M11 완료 상태)
**검수 모드**: 정적 분석 + 빌드/테스트 회귀 + 사용자 시나리오 워크스루
**현 빌드 상태**: `npm run build` ✓, `npx vitest run` 18/18 ✓ (Edge 함수 미실행 — Vercel 배포에서만 동작)

---

## 1. 요구사항 요약

### 1-1. 사용자 원문 (입력 요구사항 §2)

> **가. 빠른 예약 (예약 오픈일 22:00 / 07:00 발사용)**
> 1. 사용자가 예약 1~5분 전 PWA 실행
> 2. `[기동]` 탭 → 시스템이 백그라운드로 gytennis 로그인 완료
> 3. 코트면·시간대 선택 → `[발사 대기]`
> 4. 카운트다운 후 정각에 자동 HTTP POST 전송 → 예약 확정 → 결제창 진입
> 5. 사용자가 결제창에서 수동 결제

> **나. 평상시 예약을 위한 간편 예약**
> 1. 즐겨찾기한 코트 슬롯 현황을 한 화면에 표시
> 2. 예약 가능한 슬롯 탭 → 결제 직전까지 자동 진행
> 3. 사용자가 결제 수동

**비기능**: 정각 ±100ms / ID·PW localStorage / 오프라인 셸 / 폰 단독.

### 1-2. 현재 구현 vs 요구사항 (gap 매트릭스)

| 영역 | 구현 | gap / 이슈 |
|---|---|---|
| Vercel Edge 프록시 (`api/gy/[...path].ts`) | ✓ icn1 / 화이트리스트 / X-GYT-* 헤더 / Set-Cookie 추출 | 타임아웃·재시도 없음, allowlist 가 `?date=` 쿼리 미고려 (현재는 path-only — 동작에는 OK) |
| 슬롯 파서 (`lib/parsers/slotParser.ts`) | ✓ 분류 가설 반영 (isvkrr=avail / ctooltip=reserved / disabled=blocked), 18 테스트 통과 | "예약 가능 슬롯이 없는 코트" 가 가설상 ctooltip-trigger 가 모두 reserved 로 분류되는데, 실서버에서 `0|...` ctooltip 이 "Pending(예약 진행 중, 결제 미완료)" 일 가능성 (R-A) |
| 메타 / 캘린더 파서 | ✓ data-sot/-soc/-grp/ensdat | |
| KCP 파서 | ✓ `ordr_idxx`, action+hidden 추출 | rsvConfirm 응답에서 SweetAlert error 분기 fallback HTML 패턴 가설(`classifyError` 정규식) 미검증 (R-B) |
| 로그인 (`lib/gytennis/auth.ts`) | ✓ 303 + Set-Cookie 처리 | bad-creds 가 200+빈쿠키 일 때만 감지 — gytennis 가 200+ 신규 gytssn 발급 시 오탐 가능 (R-C) |
| 예약 제출 (`reserve.ts`) | ✓ `isvkrr[]` 사용 (yxjorg 가격=0 버그 픽스 완료) | `rsvVf`(검증) 호출 안 함 — 결제창 직전 단계 누락 (R-D) / `vanCode` UI 미노출 |
| 결제 핸드오프 (`payment/handoff.ts`) | ✓ form auto-submit + `_blank` | iOS 사파리 팝업 차단 시 대체 UX(같은창 전환) UI 토글 없음. KCP popup 닫힘 → `rsvCls` 자동 취소 미연결 (R-E) |
| 정각 스케줄러 (`scheduler/countdown.ts`) | ✓ `Date.now()` 기반 + 적응적 tick (>5s:1s, 500ms:50ms, <500ms:5ms) + `leadMs` | 서버시각 동기 보정(`Date` 헤더) 없음. iOS 백그라운드 진입 시 타이머 throttling 미대응 (R-F) |
| Race UI (`routes/Race.tsx`) | ✓ 5단계 위저드, auto-login | `defaultDate()` 가 `setMonth(+1)` — 5월 31일 + 1개월 = 7월 1일 (월 오버플로 버그) (B-1). 결제창 8분 TTL 카운트다운 미표시 (B-2). 발사 실패 시 슬롯 재조회 안 함 (B-3) |
| Quick UI (`routes/Quick.tsx`) | ✓ 즐겨찾기, 병렬 조회, 단일 슬롯 클릭→예약, 세션 만료 재시도 | (1) 단일 슬롯만 — `perCourtLimit≥2` 인 코트도 1슬롯(=2h) 만 가능. (2) `confirm()` 모달 없음 — 실수 탭 → 즉시 결제창. (3) 슬롯 버튼 사이즈 < 44px (B-4) |
| Account UI | ✓ id/pw + remember + 자동입력 | `saveCredentials` → `setTimeout(doLogin)` 0-tick 패턴 깨지기 쉬움. account 인자를 doLogin 에 직접 전달하도록 리팩 (B-5) |
| Home / 라우팅 | ✓ 4개 라우트 | "기동" 버튼이 따로 없음 (요구사항 가-2: `[기동] 탭`). 현재는 Race 진입 시 useEffect 가 자동 로그인 — 사용자에게 진행상태 보이지 않음 (B-6) |
| PWA shell | ✓ vite-plugin-pwa autoUpdate / manifest / SW + icons | autoUpdate 가 발사 직전 SW 갱신 → reload 위험. `registerType:'prompt'` 로 바꾸고 사용자 동의 후 reload (B-7) |
| 오프라인 셸 | △ navigateFallback=`/index.html` 만 — 캐시 즐겨찾기 안내 페이지 없음 | docs/usage-*.md 미작성, install-guide.md 만 존재 |
| 자격증명 보안 | ✓ localStorage 전용, X-GYT-Cookie 헤더로만 전송 | 평문 저장 — README/Account 화면 경고 OK. 옵션으로 in-memory only(미체크 시) 동작 추가 (선택) |

**우선순위**:
- **P0 (반드시 수정)** — B-1 / B-2 / R-D / R-E / B-7
- **P1 (강력 권장)** — B-3 / B-4 / B-5 / B-6 / R-F (시간 동기) / R-C (로그인 분기 강화)
- **P2 (선택)** — R-A 검증, vanCode UI, 멀티슬롯 Quick, in-memory 자격증명 옵션

---

## 2. 변경 범위 (파일 표)

| 파일 | 종류 | 우선순위 | 변경 요지 |
|---|---|---|---|
| `src/routes/Race.tsx` | 수정 | P0 | `defaultDate()` 오버플로 픽스 / 결제창 TTL 카운트다운 / 실패 시 슬롯 재조회 버튼 / "기동" 단계 UI 분리 |
| `src/lib/gytennis/reserve.ts` | 수정 | P0 | `verifyReservation(orderId)` 호출 추가 (rsvConfirm 직후, KCP form 반환 전) |
| `src/lib/payment/handoff.ts` | 수정 | P0 | `openInSelf` UI 토글 props 노출 / `onClose` 콜백 인터페이스 추가 |
| `src/components/PaymentCountdown.tsx` | 신규 | P0 | 8분 TTL 카운트다운 + 만료 시 `cancelReservation` 자동 호출 |
| `vite.config.ts` | 수정 | P0 | `VitePWA({registerType: 'prompt'})` + `useRegisterSW` 훅 추가 |
| `src/components/SwUpdatePrompt.tsx` | 신규 | P0 | SW 업데이트 동의 모달 |
| `src/routes/Quick.tsx` | 수정 | P1 | 클릭 → confirm 모달 / 버튼 ≥44px / 다중 슬롯 모드(접힘) |
| `src/components/ConfirmDialog.tsx` | 신규 | P1 | 공용 confirm 모달 |
| `src/stores/authStore.ts` | 수정 | P1 | `saveCredentials` 가 account 객체 반환 / `doLogin(acc?)` 인자 받기 / 로그인 200+신쿠키 케이스 분기 |
| `src/routes/Account.tsx` | 수정 | P1 | `setTimeout(doLogin)` 제거 — `doLogin(acc)` 직접 호출 |
| `src/lib/scheduler/timeSync.ts` | 신규 | P1 | `/api/gy/` HEAD ping 으로 서버 `Date:` 헤더 추출 → offset 계산 → `targetMs` 보정 |
| `src/lib/scheduler/countdown.ts` | 수정 | P1 | `offsetMs` 인자 추가, `visibilitychange` 이벤트 시 강제 tick |
| `src/routes/Home.tsx` | 수정 | P1 | "기동" 명확화 — Race 진입 라벨, 세션 상태 인디케이터 |
| `src/components/SlotPicker.tsx` | 수정 | P2 | 셀 높이 ≥44px / aria-label / 키보드 포커스 링 |
| `tests/race-default-date.test.ts` | 신규 | P0 | `defaultDate()` 오버플로 회귀 케이스 |
| `tests/verifyReservation.test.ts` | 신규 | P0 | rsvVf 호출 mock 회귀 |
| `tests/timeSync.test.ts` | 신규 | P1 | 서버 Date 헤더 파싱 / offset 계산 |
| `docs/usage-race.md` | 신규 | P1 | 가. 사용 매뉴얼 + 스크린샷 placeholder |
| `docs/usage-quick.md` | 신규 | P1 | 나. 사용 매뉴얼 |
| `CLAUDE.md` | 수정 | P0 | 변경 이력 추가 |

**삭제 없음.** 모든 변경은 가산·수정.

---

## 3. 모듈별 작업 분해 (builder 담당)

### M-A. Race 위저드 안정화 (P0, 1.5h)
**파일**: `src/routes/Race.tsx`, `src/components/PaymentCountdown.tsx`(신규)
- `defaultDate()` → `addMonths(today, 1)` 안전 구현: 일자가 다음달 말일 초과 시 말일로 클램프. 회귀 테스트.
- `phase === 'success'` 카드에 `<PaymentCountdown deadline={Date.now()+8*60*1000} onExpire={() => cancelReservation(orderId, cookie)} />` 마운트.
- `phase === 'failed'` 카드에 "슬롯 재조회" 버튼 — `loadSlots()` 재호출 + phase=setup.
- 기존 `fire()` 의 result 처리 직후 `verifyReservation(orderId, cookie)` 호출 → false 면 `phase='failed'` + `error='검증 실패: 다시 시도'`.

### M-B. Quick 안정성 / 접근성 (P1, 1h)
**파일**: `src/routes/Quick.tsx`, `src/components/ConfirmDialog.tsx`(신규)
- 슬롯 버튼 클릭 → `ConfirmDialog` 로 "{코트명} {courtNo}번 {hour}시 예약하시겠습니까? 즉시 결제창이 열립니다." → 확인 후 `reserve()`.
- 버튼 min-height 44px, padding 충분, focus-visible 링.
- 다중 슬롯 모드 (옵션) — 토글 켜면 picked 배열에 누적, "선택한 N개 예약" 버튼으로 일괄 submitReservation. `dailyLimit/perCourtLimit` 클라이언트 검증.

### M-C. 결제 핸드오프 + 취소 자동화 (P0, 45m)
**파일**: `src/lib/payment/handoff.ts`, `src/lib/gytennis/reserve.ts`
- `openKcpPayment(kcp, { openInSelf, onWindowClosed })` 시그니처 확장. `_blank` 일 때 `window.open` 핸들 반환 → polling 으로 닫힘 감지 → `onWindowClosed` 발화.
- Race/Quick 양쪽에서 `onWindowClosed` 에 결제 미완료 가정 안내 + `cancelReservation` 옵션.

### M-D. PWA SW 업데이트 안전화 (P0, 30m)
**파일**: `vite.config.ts`, `src/components/SwUpdatePrompt.tsx`(신규), `src/main.tsx`
- `registerType: 'prompt'` + `useRegisterSW({ onNeedRefresh })` → SwUpdatePrompt 노출.
- 사용자가 새로고침 동의해야만 reload. 발사 중에는 자동 reload 금지.

### M-E. 시간 동기 (P1, 1h)
**파일**: `src/lib/scheduler/timeSync.ts`(신규), `src/lib/scheduler/countdown.ts`(수정), `src/routes/Race.tsx`(수정)
- `getServerOffsetMs()` — `fetch('/api/gy/', {method:'HEAD'})` → 응답 헤더 `date` → `serverNow - clientNow`.
- 프록시도 HEAD 허용 처리 확인 (현 코드 `/^\/$/` 허용 — OK).
- `startCountdown({ targetMs, offsetMs })` — `Date.now() + offsetMs` 를 "실시간" 으로 사용.
- Race 의 `arm()` 직전에 ping 3회 평균 offset 측정.

### M-F. authStore 강건화 (P1, 30m)
**파일**: `src/stores/authStore.ts`, `src/routes/Account.tsx`
- `saveCredentials` → `StoredAccount` 반환.
- `doLogin(acc?)` — 인자 우선, 없으면 store.account.
- Account 의 `onSubmit` 에서 `const acc = saveCredentials(...); doLogin(acc);` 으로 setTimeout 제거.
- `login()` 결과: status=200 + 신규 gytssn 인 경우도 success 로 명시 (현재 동작 유지).

### M-G. 문서 / 변경 이력 (P1, 30m)
- `docs/usage-race.md`, `docs/usage-quick.md` — 스크린샷 placeholder 포함.
- `CLAUDE.md` 변경 이력에 본 검수 사이클 1행 추가.

**총 공수**: ~6h (builder 1명 기준).

---

## 4. 인터페이스 합의안

### 4-1. `cancelReservation` / `verifyReservation` 흐름

```ts
// reserve.ts (수정)
export type ReservationResult =
  | { ok: true; orderId: string; html: string; kcp: KcpForm | null; verified: boolean }
  | { ok: false; reason: ReasonCode; detail?: string };

// submitReservation 내부:
const verified = orderId ? await verifyReservation(orderId, cookie) : false;
return { ok: true, orderId, html, kcp, verified };
```

UI: `result.ok && !result.verified` 면 경고 배너 + 진행 차단 옵션.

### 4-2. 시간 동기 API

```ts
// lib/scheduler/timeSync.ts
export async function measureServerOffsetMs(samples = 3): Promise<number>;

// countdown.ts (수정)
export type CountdownOptions = {
  targetMs: number;
  leadMs?: number;
  /** Add to Date.now() to obtain server-aligned time. Default 0. */
  offsetMs?: number;
  onTick?: (remainingMs: number) => void;
  onFire: () => void;
};
```

### 4-3. 결제 핸드오프 콜백

```ts
export type KcpHandoffOptions = {
  openInSelf?: boolean;
  /** Polled every 1s while popup open. Null when openInSelf or popup blocked. */
  onWindowClosed?: () => void;
};
export function openKcpPayment(kcp: KcpForm, opts?: KcpHandoffOptions): Window | null;
```

### 4-4. SW 업데이트 훅

```ts
// main.tsx
const { needRefresh, updateServiceWorker } = useRegisterSW({
  onNeedRefresh() { setShowPrompt(true); },
});
```

### 4-5. localStorage 스키마 (변동 없음)

| 키 | 값 | 만료 |
|---|---|---|
| `bt:account` | `{id, pw, remember, savedAt}` | 사용자 삭제까지 |
| `bt:session` | `{cookie, savedAt}` | 115분 (자동 만료) |
| `bt:favorites` | `[{courtId, courtNo?}]` | 없음 |

---

## 5. 리스크 / 미해결 의문점

| # | 항목 | 영향 | 대응 |
|---|---|---|---|
| R-A | `data-ctooltip="0\|..."` 슬롯이 사이트에서는 ○(예약가능)으로 보이지만 실제 클릭 시 "다른 사람이 결제 진행 중" 오류 반환 — 시각 구분 없음 | 사용자가 클릭했다가 오류로 실패, UX 혼란 | **[확정] 예약 시도 후 "결제 진행 중" 오류 발생 시 해당 슬롯을 노란색(🟡 `pending`) 으로 마킹. 슬롯 파서에 `pending` 상태 추가, SlotPicker 에 노란 배지 표시.** |
| R-B | rsvConfirm 실패 응답 HTML 의 SweetAlert 문구 — `classifyError` 정규식이 실 응답과 일치하는지 미검증 | "이미 예약됨" 메시지 매핑 오류 → "unknown" 으로 fallback | 실 발사 1회 후 실패 응답 HAR 캡처 |
| R-C | gytennis 가 200 OK + 신규 gytssn 으로 로그인 성공시키는 경우의 빈도 | `auth.login` 의 가정 흔들림 | 로그인 직후 `/myPage` 200 확인 절차 추가 (선택, 정각 발사 직전 RTT 비용 있음) |
| R-D | 결제창 직전 `rsvVf` 호출이 실 사이트에서 필수인지 | 누락 시 결제 거부 가능 | 본 계획에서 호출 추가 — QA 회귀 |
| R-E | 사용자가 KCP 결제창 닫고 PWA 로 돌아온 후, `rsvCls` 자동 호출 정책 | 자동 취소가 너무 공격적 → 결제 진행 중인 사용자도 취소될 위험 | **[확정 — B안] 창 닫힘 시 자동 취소 없음. PaymentCountdown 8분 만료 시에만 `cancelReservation` 자동 호출. 사용자가 직접 누를 수 있는 "예약 취소" 버튼 별도 제공.** |
| R-F | iOS 백그라운드 진입 시 setTimeout throttling | 카운트다운 stale, 정각 미스 | `visibilitychange` listener 로 visible 복귀 시 강제 tick. "앱 열어둠" 가이드 강조 |
| R-G | Vercel Edge Function cold start (예약 폭주 시각 22:00) | 첫 요청 +200~500ms | T-2분 시점에 `/api/gy/` HEAD 워밍업 호출 (timeSync 호출과 합치기) |
| R-H | gytennis 시계가 폰 시계보다 빠를 때 leadMs 의도와 반대로 동작 | 정각 전에 발사 → 거부 | timeSync offset 정확도 ±50ms 가정, leadMs 기본 50→0 으로 변경 (offset 보정이 정확하면 lead 불요) |

---

## 6. QA 검증 체크리스트

qa 가 본 계획 적용 후 사용할 회귀 항목.

### 6-1. 단위 테스트 (자동)
- [ ] `npx vitest run` — **기존 18 케이스 회귀 통과**
- [ ] `tests/race-default-date.test.ts` — 1월 31일/3월 31일/5월 31일/10월 31일 + 1개월 = 말일 클램프
- [ ] `tests/verifyReservation.test.ts` — rsvVf POST body 형식 + 응답 status 처리
- [ ] `tests/timeSync.test.ts` — Date 헤더 파싱 + 평균 offset 산출
- [ ] `npm run build` 성공
- [ ] `npm run lint` (tsc --noEmit) 무경고

### 6-2. 라이브 대조 (수동, 사용자 1폰 1세션)
- [ ] daily/1, daily/4, daily/7 각각 슬롯 ○/× 시각이 사이트 화면과 100% 일치
- [ ] 1회 발사 → rsvConfirm 응답 HAR 캡처 → classifyError 정규식 검증 (R-B)
- [ ] KCP 결제창 사파리/크롬 양쪽 정상 오픈 (팝업차단 OFF 가정)
- [ ] KCP 창 닫고 8분 후 `rsvCls` 자동 호출 확인 (server 슬롯 해제 확인)
- [ ] 세션 만료 (2h) 후 Quick 진입 시 자동 재로그인 + 슬롯 즉시 표시

### 6-3. UI / 모바일 (수동)
- [ ] iPhone Safari 화면(W=390) Race 모든 단계 깨짐 없음
- [ ] Quick 슬롯 버튼 최소 44px (개발자도구 측정)
- [ ] SwUpdatePrompt — SW 갱신 시 모달 노출, 사용자 동의 전에 reload 안 됨
- [ ] PaymentCountdown — 8:00 → 0:00 카운트, 0 도달 시 자동 cancel + 안내

### 6-4. 정확도 (수동/반자동)
- [ ] timeSync 5회 측정 후 offset SD < 100ms
- [ ] 가짜 targetMs (now+10s) 발사 시 fire 시각이 target ± 100ms 이내 (5회 평균)
- [ ] iOS 백그라운드 진입 → visible 복귀 시 카운트다운 즉시 정정

### 6-5. 배포
- [ ] `vercel --prod` 배포 — preview URL 1차 → prod 승인
- [ ] `/api/gy/` HEAD 200 + Date 헤더 존재 확인 (curl)
- [ ] PWA "홈 화면에 추가" iOS/Android 정상 동작 + 풀스크린

---

## 7. 다음 행동

1. team-lead 가 본 계획을 사용자에게 공유 → P0/P1 범위 확정 (특히 R-A, R-E 정책 결정)
2. 승인 시 builder 에 작업 분배 — M-A → M-C → M-D → M-B → M-E → M-F → M-G 순
3. builder 단계마다 단위 테스트 추가, 마지막에 qa 가 §6 체크리스트 실행
4. CLAUDE.md 변경 이력에 본 사이클 기록

---

**확인 후 빌드 진입 OK.**
