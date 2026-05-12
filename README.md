# booking-tennis

고양시 공공테니스장(gytennis.or.kr) 자동 예약 PWA — 아이폰/안드로이드 단독 구동.

## 라이브 데모

배포 URL: 카톡으로 받은 `https://booking-tennis-...vercel.app`

## 사용 안내

- 지인용 설치 가이드: [docs/install-guide.md](docs/install-guide.md)
- 두 가지 모드: **빠른 예약** (오픈런용 정각 발사) / **간편 예약** (즐겨찾기 즉시 예약)

## 개요

- **타입**: Progressive Web App (PWA) — 폰 단독 구동, 항시 서버 없음
- **타겟**: 아이폰 Safari / 안드로이드 Chrome
- **호스팅**: Vercel 정적 + 서버리스 함수 (CORS 프록시 1개)
- **사용자**: 본인 + 지인 (멀티유저, 데이터는 각자 폰 localStorage)
- **자격증명 보관**: 폰 localStorage 한정. 서버 전송 없음.

## 기술 스택

- Vite + React 18 + TypeScript
- Tailwind CSS (모바일 우선)
- Zustand (상태) / ky (HTTP)
- vite-plugin-pwa (manifest + service worker)
- Vercel Edge Functions (gytennis.or.kr 프록시)

## 디렉토리

```
src/
├ routes/         Home / Account / Race / Quick
├ components/     Card / Button / SlotPicker
├ lib/
│  ├ gytennis/    auth, slots, reserve, types, proxyClient
│  ├ parsers/     slotParser, metaParser, kcpParser
│  ├ scheduler/   countdown (정각 발사)
│  ├ storage/     localStorage 래퍼
│  ├ payment/     KCP form handoff
│  └ courts.ts    10개 코트 레지스트리
└ stores/         authStore / favoritesStore
api/gy/[...path].ts   Vercel Edge 프록시
tests/                Vitest 단위테스트
_workspace/           정찰·계획 산출물
```

## 개발

```bash
npm install
npm run dev          # 5173
vercel dev           # 3001 (Edge Function 포함)
npm run build
npm test
```

## 개발 진행 상황

| Phase | 상태 |
|-------|------|
| 1. gytennis 정찰 | ✅ 완료 (`_workspace/01_recon.md`) |
| 2. PWA 골격 (M1) | ✅ |
| 3. Vercel 프록시 (M2) | ✅ 로컬 + 클라우드 검증 |
| 4. 도메인 클라이언트·파서 (M3) | ✅ 16/16 테스트 |
| 5. 스케줄러·UI (M4~M8) | ✅ 4-route 작동 |
| 6. PWA 마감 (M9) | ✅ 아이콘 + manifest |
| 7. 지인 배포 가이드 (M11) | ✅ `docs/install-guide.md` |

## 참고

- 기존 데스크탑 Python 시스템: `~/Desktop/BookingTennis/` (보존)
- 정찰 보강 자료: `~/Desktop/BookingTennis/_workspace/01_recon*.md`
