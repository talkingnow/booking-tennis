# booking-tennis — 빌드 계획서 (Phase 2)

**작성**: 2026-05-12
**전제 자료**: `00_input_requirements.md`, `01_recon.md`

---

## 1. 요구사항 요약 (사용자 원문 인용)

> **가. 예약 오픈일을 대비한 빠른 예약**
> 1) 사용자가 예약 1~5분 전에 시스템 기동
> 2) 시스템에서는 로그인 단계까지 완료
> 3) 예약 시간이 되면 웹으로 패킷 자동으로 전송하여 희망하는 코트면 예약을 진행하여 결제창 띄우기
> 4) 이후 사용자가 웹 화면을 보면서 결제 진행
>
> **나. 평상시 예약을 위한 간편 예약**
> 1) 즐겨찾기한 코트 현황을 보여주기
> 2) 예약 가능한 코트면을 누르면 결제 직전까지 진행

**환경 제약**:
- 폰 단독 (아이폰 사파리/크롬, 안드로이드 크롬)
- 항시 가동 서버 없음 (Vercel 정적 + 서버리스 함수만)
- 멀티유저 (지인 공유), 데이터는 각자 폰 localStorage

---

## 2. 시스템 아키텍처 (확정)

```
┌────────────────────────────────────────────┐
│ 폰 (사파리/크롬) — PWA                       │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ React UI                              │   │
│  │ ├─ Home / Account / Race / Quick      │   │
│  │ └─ tailwind, shadcn/ui                │   │
│  ├──────────────────────────────────────┤   │
│  │ Domain Layer                          │   │
│  │ ├─ gytennis API client (lib/gytennis) │   │
│  │ ├─ HTML slot parser (DOMParser)       │   │
│  │ ├─ scheduler (정각 발사)               │   │
│  │ └─ storage (localStorage 래퍼)         │   │
│  ├──────────────────────────────────────┤   │
│  │ PWA Shell (vite-plugin-pwa)           │   │
│  └──────────────────────────────────────┘   │
└────────┬────────────────────────────────────┘
         │ fetch('/api/gy/...') — 같은 출처
         ↓
┌────────────────────────────────────────────┐
│ Vercel Edge Function                         │
│ /api/gy/[...path].ts                         │
│ - 무상태 프록시                                │
│ - X-GYT-Cookie → Cookie 헤더 변환             │
│ - Set-Cookie → X-GYT-Set-Cookie 헤더 변환     │
│ - body 그대로 전달                             │
└────────┬────────────────────────────────────┘
         │ 서버 fetch
         ↓
┌────────────────────────────────────────────┐
│ gytennis.or.kr (외부)                        │
└────────────────────────────────────────────┘
```

**왜 이 구조인가**:
- CORS 우회: gytennis 가 Allow-Origin 설정 없음 → 같은 출처 프록시 필수
- 무상태: Vercel Function 은 서버 메모리·DB 없음 (요구사항 "서버 없음" 준수)
- 보안: 자격증명·세션쿠키는 폰 localStorage 만 → 서버 측 유출 위험 0

---

## 3. 기술 스택 (확정)

| 레이어 | 선택 | 이유 |
|--------|------|------|
| 빌드 | **Vite 5** | 빠른 HMR, PWA 플러그인 안정 |
| 프레임워크 | **React 18 + TypeScript** | 익숙도·생태계 |
| 라우터 | **react-router-dom 6** | 표준 |
| 스타일 | **Tailwind CSS 3** | 모바일 우선 유틸리티 |
| UI 컴포넌트 | **shadcn/ui** | 깔끔, 복붙형 |
| 상태 | **Zustand** | Redux 보다 단순, localStorage 미들웨어 |
| HTTP | **ky** | fetch wrapper, 재시도·타임아웃 |
| HTML 파싱 | **DOMParser** (브라우저 내장) | 의존성 0 |
| PWA | **vite-plugin-pwa** | manifest + service worker 자동 |
| 테스트 | **Vitest + @testing-library/react** | Vite 친화 |
| 배포 | **Vercel** | 무료, GitHub 자동 배포 |
| 서버리스 | **Vercel Edge Functions** | 빠른 cold start |

---

## 4. 디렉토리 구조 (산출물)

```
booking-tennis/
├ public/
│  ├ icons/                # PWA 아이콘 (192, 512, maskable)
│  ├ manifest.webmanifest  # vite-plugin-pwa 생성
│  └ apple-touch-icon.png
├ src/
│  ├ main.tsx              # 진입점
│  ├ App.tsx               # 라우터
│  ├ routes/
│  │  ├ Home.tsx           # 모드 선택 (가/나)
│  │  ├ Account.tsx        # ID/PW 입력·관리
│  │  ├ Race.tsx           # 가. 빠른 예약 위저드
│  │  └ Quick.tsx          # 나. 간편 예약 + 즐겨찾기
│  ├ components/
│  │  ├ Button.tsx
│  │  ├ Countdown.tsx      # 정각 카운트다운
│  │  ├ SlotGrid.tsx       # 슬롯 그리드
│  │  ├ CourtCard.tsx
│  │  └ FavoriteToggle.tsx
│  ├ lib/
│  │  ├ gytennis/
│  │  │  ├ client.ts       # ky 클라이언트 (베이스 URL=/api/gy)
│  │  │  ├ auth.ts         # login / logout / isLoggedIn
│  │  │  ├ slots.ts        # getDailySlots(courtId, date)
│  │  │  ├ reserve.ts      # submitReservation / verify / cancel
│  │  │  └ types.ts        # Slot, Court, OrderId, ...
│  │  ├ parsers/
│  │  │  ├ slotParser.ts   # HTML → Slot[]
│  │  │  ├ metaParser.ts   # data-sot/data-soc, ensdat JSON
│  │  │  └ kcpParser.ts    # rsvConfirm 응답 HTML → KCP form
│  │  ├ scheduler/
│  │  │  ├ countdown.ts    # performance.now 기반 ms 정밀 타이머
│  │  │  └ fire.ts         # 정각 발사 트리거
│  │  ├ storage/
│  │  │  ├ account.ts      # account (id/pw) localStorage
│  │  │  ├ session.ts      # gytssn 쿠키 localStorage
│  │  │  └ favorites.ts    # 즐겨찾기 코트 localStorage
│  │  └ courts.ts          # 10개 코트 메타 (이름·ID)
│  ├ stores/
│  │  ├ authStore.ts       # Zustand
│  │  ├ favoritesStore.ts
│  │  └ raceStore.ts       # 가. 발사 상태
│  └ styles/
│     └ index.css          # Tailwind base
├ api/
│  └ gy/
│     └ [...path].ts       # Vercel Edge Function 프록시
├ docs/
│  ├ install-guide.md      # 지인용 설치 안내 (PWA 홈 추가)
│  ├ usage-race.md         # 가. 사용법
│  └ usage-quick.md        # 나. 사용법
├ tests/
│  ├ slotParser.test.ts
│  ├ metaParser.test.ts
│  ├ kcpParser.test.ts
│  ├ countdown.test.ts
│  └ proxy.test.ts
├ package.json
├ vite.config.ts
├ tailwind.config.ts
├ vercel.json              # 라우팅·헤더
├ tsconfig.json
└ .env.example
```

---

## 5. 모듈별 작업 분해 (builder 담당)

### M1. 프로젝트 골격 (0.5일)
- [ ] `npm create vite@latest . -- --template react-ts`
- [ ] Tailwind 설치·설정
- [ ] shadcn/ui init
- [ ] vite-plugin-pwa 설치·기본 manifest
- [ ] react-router-dom 4개 경로 스텁
- [ ] `vercel.json` 라우팅 (`/api/*` → Edge)

### M2. Vercel Edge 프록시 (1일)
- [ ] `api/gy/[...path].ts`
- [ ] 입력: `X-GYT-Cookie`, body, method, query
- [ ] 출력: 응답 본문 + `X-GYT-Set-Cookie` (응답 헤더에서 추출)
- [ ] 30x 리다이렉트는 `redirect: 'manual'` + `Location` 헤더 전달
- [ ] Edge Runtime 환경 (`export const config = { runtime: 'edge' }`)
- [ ] 단위테스트: 로컬 mock gytennis 응답
- [ ] 에러: 5xx 시 사용자 알림 메시지 표준화

### M3. gytennis 클라이언트 + 파서 (2일)
- [ ] `lib/gytennis/auth.ts`: `login(id, pw)` → 쿠키 추출 + storage 저장
- [ ] `lib/gytennis/slots.ts`: `getDailySlots(courtId, date)` → HTML 받아 파싱
- [ ] `lib/gytennis/reserve.ts`: `submitReservation(slot)` → order_id + KCP form
- [ ] `lib/parsers/slotParser.ts`: DOMParser 로 `td.resTag` 추출
  - `value` 분해 (date|cid|cno|hour|flag)
  - `data-ctooltip` 첫 글자 → available/reserved
  - `disabled` 속성 → blocked
- [ ] `lib/parsers/metaParser.ts`: `data-sot/data-soc`, ensdat JSON
- [ ] `lib/parsers/kcpParser.ts`: rsvConfirm 응답에서 KCP form 추출
- [ ] 단위테스트: 기존 BookingTennis 의 샘플 HTML 활용

### M4. 정각 발사 스케줄러 (1일)
- [ ] `lib/scheduler/countdown.ts`
  - `setupCountdown(targetMs)` → onTick(remainingMs), onFire()
  - `performance.now()` + drift 보정 (1초마다 보정)
- [ ] `lib/scheduler/fire.ts`
  - 발사 직전 50ms 마진 (네트워크 RTT 흡수)
  - 결과 콜백 (성공/실패/타임아웃)
- [ ] 단위테스트: 가짜 시간 (vi.useFakeTimers)

### M5. 가. 빠른 예약 UI (1.5일)
- [ ] `routes/Race.tsx` — 5단계 위저드
  1. 로그인 상태 확인 → 미로그인 시 자동 로그인
  2. 코트 + 날짜 + 코트면 + 시간대 선택
  3. 타겟 시각 확인 (예: 22:00:00)
  4. 발사 대기 — Countdown 표시 + 취소 가능
  5. 발사 결과 → 성공 시 결제창 자동 오픈
- [ ] `components/Countdown.tsx`
- [ ] 발사 후 결제 핸드오프: KCP form 을 새 윈도우 또는 같은 페이지에서 submit

### M6. 나. 간편 예약 UI (1.5일)
- [ ] `routes/Quick.tsx`
  - 즐겨찾기 코트 N개 병렬 조회
  - 그리드 UI: 코트 × 시간대, 빈/예약됨/불가 시각화
- [ ] 빈 슬롯 탭 → confirm 모달 → submit → 결제창
- [ ] 즐겨찾기 토글 UI
- [ ] 새로고침 풀다운 (mobile pull-to-refresh)

### M7. 계정 관리 UI (0.5일)
- [ ] `routes/Account.tsx`
  - ID/PW 입력 + "기억하기" 체크 (체크 시 localStorage)
  - 로그인 테스트 버튼
  - 로그아웃 / 계정 삭제
  - 세션 만료 표시 (남은 시간)

### M8. 결제 핸드오프 (0.5일)
- [ ] `rsvConfirm` 응답 HTML 을 `<iframe srcdoc>` 로 마운트하거나
- [ ] 새 탭에서 `window.open()` 후 form auto-submit
- [ ] 결제창 닫힘 감지 → `rsvCls` 호출 옵션
- [ ] 폰 사파리 팝업 차단 대응 (사용자 직접 탭으로 트리거)

### M9. PWA 마감 (0.5일)
- [ ] manifest 아이콘 (192·512·maskable·apple-touch)
- [ ] 오프라인 셸 (네트워크 없을 때 안내 페이지)
- [ ] "홈 화면에 추가" 가이드 페이지
- [ ] iOS Safari `viewport-fit=cover`, safe-area-inset 처리

### M10. 배포 (0.5일)
- [ ] Vercel 프로젝트 연결 (GitHub `talkingnow/booking-tennis` Private)
- [ ] 자동 배포 + Preview URL
- [ ] 환경변수 (없음 — 모든 시크릿은 폰에)
- [ ] 커스텀 도메인 (선택, 사용자 결정)

### M11. 지인 배포 가이드 (0.5일)
- [ ] `docs/install-guide.md` — iOS·Android 각각 스크린샷 포함
- [ ] `docs/usage-race.md`, `usage-quick.md`
- [ ] README 최신화

---

## 6. 인터페이스 합의안

### 6-1. 프록시 헤더 프로토콜

PWA → Function:
- `X-GYT-Cookie: gytssn=<value>` (있을 때만)
- `X-GYT-Method: POST` (기본 GET)
- `X-GYT-Redirect: manual` (선택, 기본 follow)
- body: 그대로 (form-urlencoded)

Function → PWA:
- 응답 본문: gytennis 응답 본문 그대로
- `X-GYT-Status: 303` (실제 status, fetch 가 30x 흡수하므로 헤더로 전달)
- `X-GYT-Location: /` (303 리다이렉트 시)
- `X-GYT-Set-Cookie: gytssn=<value>` (Set-Cookie 추출)

### 6-2. 슬롯 타입 (TypeScript)

```ts
type Slot = {
  date: string;        // 2026-05-12
  courtId: number;     // 1~10
  courtNo: number;     // 1~6
  hour: number;        // 6~20
  price: number;       // 8000
  status: 'available' | 'reserved' | 'blocked';
  reservedBy?: string; // tooltip API 시 (선택)
};

type CourtMeta = {
  id: number;
  name: string;
  dailyLimit: number;     // data-sot
  perCourtLimit: number;  // data-soc
  courtCount: number;     // 동적 측정
};
```

### 6-3. localStorage 스키마

| 키 | 값 | 만료 |
|----|-----|------|
| `bt:account` | `{id, pw, savedAt}` | 없음 (사용자 삭제까지) |
| `bt:session` | `{cookie, savedAt}` | 2h (자동 만료 처리) |
| `bt:favorites` | `[{courtId, courtNo}]` | 없음 |
| `bt:race-draft` | `{courtId, date, slots, targetTime}` | 24h |

---

## 7. 리스크 / 미해결

| # | 리스크 | 대응 |
|---|------|------|
| R1 | gytennis 가 향후 CSRF 추가 | 응답에 hidden 토큰 감지 시 자동 추출·전송 (확장 포인트 마련) |
| R2 | KCP 결제창이 폰 사파리에서 안 열림 | 새 탭 → form auto-submit 방식 (사용자 탭 트리거 필수) |
| R3 | iOS 백그라운드 진입 시 카운트다운 정지 | "앱 열어두기" 안내 + Wake Lock API (Android 한정) |
| R4 | 동시 로그인 차단 (다른 기기) | 로그인 실패 감지 시 사용자에 안내, 재로그인 유도 |
| R5 | 25일 22:00 트래픽 폭주 | Vercel Edge Function 콜드스타트 → 22:00 직전 워밍업 (T-2분에 /api/gy/health ping) |
| R6 | Vercel Function 의 fetch 가 SameSite 쿠키 누락 | 서버 측은 SameSite 무관 (브라우저 정책) → OK |
| R7 | 비밀번호 localStorage 평문 저장 | "기억하기" 옵션, 미체크 시 세션 종료 후 삭제 |

---

## 8. QA 검증 체크리스트 (S1~S12)

| # | 시나리오 | 합격 기준 |
|---|---------|---------|
| S1 | 로그인 성공 → gytssn 쿠키 저장 | localStorage 에 gytssn 존재 |
| S2 | 로그인 실패 (잘못된 PW) | 에러 메시지 + 쿠키 미저장 |
| S3 | 슬롯 조회 후 파싱 | available/reserved/blocked 모두 분류 |
| S4 | 정각 발사 정확도 | 5회 측정 평균 ±100ms 이내 |
| S5 | 발사 성공 → KCP form 추출 | iframe srcdoc 으로 결제창 표시 |
| S6 | 발사 실패 (이미 예약됨) | 사용자에 명확한 사유 표시 |
| S7 | 발사 실패 (한도 초과) | data-sot/data-soc 검증 동작 |
| S8 | 즐겨찾기 추가/삭제 | localStorage 반영 + UI 갱신 |
| S9 | 간편 예약 빈 슬롯 탭 | 1초 내 결제창 진입 |
| S10 | 세션 만료 (2h) | 자동 재로그인 후 재시도 |
| S11 | 오프라인 (비행기 모드) | 안내 페이지 + 캐시된 즐겨찾기 표시 |
| S12 | PWA 홈 추가 (iOS/Android) | 풀스크린 + 아이콘 정상 |

---

## 9. 작업 순서·기간 (총 9.5일)

| 일차 | 작업 | 산출물 |
|------|------|--------|
| Day 1 | M1 골격 + M2 프록시 절반 | Vite + Tailwind + 라우팅 + Edge Function 스텁 |
| Day 2 | M2 프록시 완성 + M3 절반 | 프록시 완전 작동, 로그인 API 동작 |
| Day 3 | M3 완성 + M4 절반 | 슬롯 파서·예약 클라이언트 + 카운트다운 |
| Day 4 | M4 완성 + M5 절반 | 정각 발사 검증 + Race 위저드 1~3단계 |
| Day 5 | M5 완성 + M7 | Race 완성 + Account 화면 |
| Day 6 | M6 절반 | Quick 슬롯 그리드 |
| Day 7 | M6 완성 + M8 | Quick 완성 + 결제 핸드오프 |
| Day 8 | M9 PWA 마감 | manifest, icon, offline shell |
| Day 9 | M10 배포 + M11 가이드 | 실제 Vercel URL + 사용자 매뉴얼 |
| Day 9.5 | QA 회귀 + 픽스 | S1~S12 통과 |

---

## 10. 의사결정·확장 포인트

| 항목 | 현재 결정 | 추후 옵션 |
|------|---------|---------|
| 다중 계정 | 1폰 1계정 | 계정 전환 UI 추가 가능 |
| 푸시 알림 | 미사용 | iOS 16.4+ / Android 자동지원, 발사 5분전 알림 |
| Wake Lock | 미사용 | Android 한정, 화면 자동꺼짐 방지 |
| 통계·로그 | 없음 | localStorage 발사 이력만 (서버 미전송) |
| 결제 자동완성 | 안 함 (요구사항 위반) | 영구 안 함 |

---

## 11. 다음 행동

1. 사용자가 본 계획 확인
2. Phase 3 빌드 진입 — M1 부터 순차
3. M2 (프록시) 완성 직후 실 gytennis 연결 PoC 1회 → CORS·세션 동작 검증
4. 검증 통과 시 M3~M10 일괄 진행

**확인 후 빌드 시작 OK 하시면 M1 부터 작업합니다.**
