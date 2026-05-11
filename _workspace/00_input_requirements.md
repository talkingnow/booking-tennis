# Tennis Booking PWA — 신규 프로젝트 입력 요구사항 (2026-05-11)

> 본 파일은 **신규 PWA 프로젝트**의 단일 진실 원본.
> 기존 `BookingTennis/` 데스크탑 시스템은 **보존**하고, 별도 GitHub 레포지토리로 신규 진행.

---

## 0. 프로젝트 개요

- **이름**: `booking-tennis`
- **레포**: https://github.com/talkingnow/booking-tennis (Private)
- **로컬 경로**: `~/Desktop/booking-tennis/`
- **타입**: PWA (Progressive Web App) — 폰 단독 구동, 항시 가동 서버 없음
- **대상 단말**: 아이폰 (사파리/크롬) + 안드로이드 (크롬)
- **사용자**: 본인 + 지인 (멀티유저, 데이터는 각자 폰 localStorage)
- **타겟 사이트**: gytennis.or.kr (고양시 공공 테니스장)

---

## 1. 확정된 결정사항 (사용자 "추천대로 해봐" 응답에 따름)

| 항목 | 결정 |
|------|------|
| 호스팅 | **Vercel 무료** (GitHub 연동 자동 배포) |
| CORS 우회 | **Vercel Serverless Function 프록시** (필요시) |
| 정찰 | 데스크탑 Chrome DevTools 로 사용자 함께 진행 (가이드 제공) |
| 계정 다중성 | **1폰 1계정** (단순화) — 추후 확장 여지 |
| 기존 데스크탑 시스템 | **보존** — `BookingTennis/` 그대로 유지, 정찰 자료 참고용 |
| 신규 레포 | **별도 GitHub 레포지토리 신규 생성** ← 본 결정 |

---

## 2. 기능 요구사항

### 가. 빠른 예약 (예약 오픈일 22:00 / 07:00 발사용)
1. 사용자가 예약 1~5분 전 PWA 실행
2. [기동] 탭 → 시스템이 백그라운드로 gytennis 로그인 완료
3. 코트면·시간대 선택 → [발사 대기]
4. 카운트다운 후 정각에 자동 HTTP POST 전송 → 예약 확정 → 결제창 진입
5. 사용자가 결제창에서 수동 결제

### 나. 평상시 간편 예약
1. 즐겨찾기 코트 슬롯 현황을 한 화면에 표시
2. 예약 가능한 슬롯 탭 → 결제 직전까지 자동 진행
3. 사용자가 결제 수동

---

## 3. 비기능 요구사항

| 항목 | 기준 |
|------|------|
| 정각 발사 정확도 | ±100ms (폰 시계 기반) |
| 보안 | ID/PW 폰 localStorage 만, HTTPS 강제 |
| 오프라인 | 앱 셸 캐싱 (네트워크 일시 단절 후 복구) |
| 설치 | "홈 화면에 추가" 가이드 페이지 제공 |
| 푸시 알림 | 안드로이드 우선, iOS 16.4+ 가능 시 추가 |
| 코드 공개성 | (사용자 결정 — 아래 Q2) |

---

## 4. 기술 스택 (제안)

- **프레임워크**: Vite + React + TypeScript (가장 빠른 PWA 개발 경험)
- **PWA 매니페스트**: `vite-plugin-pwa`
- **상태/스토리지**: Zustand + localStorage
- **UI**: Tailwind CSS (모바일 우선) + shadcn/ui
- **호스팅**: Vercel
- **프록시 (필요시)**: Vercel Functions (Edge Runtime, fetch())
- **HTTP 클라이언트**: 폰 측 fetch + ky (재시도)
- **타이밍**: `performance.now()` + `requestAnimationFrame` 정밀 발사

---

## 5. 산출물 (별도 레포)

```
<new-repo>/
├ src/
│  ├ pages/
│  │  ├ Home.tsx           # 모드 선택 (가/나)
│  │  ├ Account.tsx        # ID/PW 입력
│  │  ├ Race.tsx           # 가. 빠른 예약
│  │  └ Quick.tsx          # 나. 간편 예약
│  ├ lib/
│  │  ├ gytennis.ts        # API 클라이언트 (정찰 기반)
│  │  ├ scheduler.ts       # 정각 발사 로직
│  │  └ storage.ts         # localStorage 래퍼
│  ├ components/
│  └ App.tsx
├ api/                     # Vercel Functions (CORS 프록시)
│  └ proxy.ts
├ public/
│  ├ manifest.json
│  └ icons/
├ docs/
│  ├ install-guide.md      # 지인용 설치 안내
│  └ recon-gytennis.md     # 정찰 결과 문서
├ tests/
├ package.json
├ vite.config.ts
├ vercel.json
└ README.md
```

---

## 6. 단계별 작업 (Phase 1~4)

| Phase | 내용 | 기간 |
|-------|------|------|
| 1. 정찰 | gytennis 로그인/예약/결제 패킷 캡처 → `docs/recon-gytennis.md` | 1~2일 |
| 2. CORS 테스트 | 폰에서 직접 호출 가능 여부 + Vercel Function 프록시 PoC | 0.5일 |
| 3. 골격 | Vite+React+PWA 스캐폴딩 + Vercel 배포 파이프 | 1일 |
| 4. 가. 빠른 예약 | 로그인 → 발사대기 → 정각 POST → 결제창 | 2~3일 |
| 5. 나. 간편 예약 | 즐겨찾기 + 슬롯 조회 + 즉시 예약 | 1~2일 |
| 6. QA + 배포 | 실제 단말 테스트, 지인 설치 가이드 | 1일 |

**총 6.5~9.5일**

---

## ✅ 사용자 답변 (완료)

- Q1: `booking-tennis`
- Q2: Private
- Q3: https://github.com/talkingnow/booking-tennis (사용자가 직접 생성 완료)

---

## (참고) 원래 질문

### Q1. 레포지토리 이름 제안 — 어느 것?
- (a) `tennis-flash` (빠르다는 의미)
- (b) `gytennis-pwa`
- (c) `court-grab`
- (d) `booking-tennis-pwa`
- (e) 직접 작성: _______

**답:**

### Q2. GitHub 레포 공개 범위
- (a) **Public** — 지인 공유 쉽고 신뢰↑, 단 코드 공개됨 (자격증명은 코드에 없으므로 안전)
- (b) **Private** — 지인만 초대해서 접근. 깃허브 계정 있는 지인만 가능
- (c) 모르겠음 → 추천: **(a) Public** (어차피 PWA URL 만 알면 누구나 쓸 수 있고, 코드 공개가 보안 검증에 유리)

**답:**

### Q3. (선택) GitHub 계정명 확인
- `gh` CLI 미설치 상태. 레포 생성은 사용자가 GitHub 웹에서 직접 만들거나, `gh` 설치 후 위임 가능.
- 사용자 GitHub 사용자명: _______
- 선호 방식: (a) 내가 직접 GitHub 웹에서 만들고 URL 알려줌 / (b) `gh` 설치 후 Claude 에게 위임

**답:**

---

## 다음 단계 (사용자 답변 후)

1. 본 파일 답변 반영
2. 새 디렉토리 `~/Desktop/<repo-name>/` 생성 + git init
3. GitHub 레포 연결
4. Build-team 재구성 (planner / builder / qa) → Phase 1 정찰 시작
