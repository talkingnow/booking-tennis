# booking-tennis

고양시 공공테니스장(gytennis.or.kr) 자동 예약 PWA — 아이폰/안드로이드 단독 구동.

## 개요

- **타입**: Progressive Web App (PWA)
- **타겟**: 아이폰 (사파리/크롬) + 안드로이드 (크롬)
- **서버**: 없음 (정적 호스팅 + CORS 프록시만)
- **사용자**: 본인 + 지인 (멀티유저, 데이터는 각자 폰 localStorage)

## 두 가지 사용 모드

### 가. 빠른 예약 (예약 오픈일용)
예약 1~5분 전 앱 실행 → 로그인 → 시간 도래 시 정각 발사 → 결제창 진입 → 수동 결제

### 나. 간편 예약 (평상시)
즐겨찾기 코트 슬롯 한눈에 보기 → 빈 슬롯 탭 → 결제창 진입 → 수동 결제

## 기술 스택 (예정)

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- vite-plugin-pwa
- Vercel (호스팅 + Serverless Functions)

## 개발 단계

| Phase | 상태 |
|-------|------|
| 1. gytennis 정찰 (HTTP 패킷 분석) | ⏳ 대기 |
| 2. CORS 가능성 검증 | 대기 |
| 3. PWA 골격 + Vercel 배포 | 대기 |
| 4. 가. 빠른 예약 구현 | 대기 |
| 5. 나. 간편 예약 구현 | 대기 |
| 6. QA + 지인 배포 가이드 | 대기 |

## 참고

- 기존 데스크탑 시스템: `~/Desktop/BookingTennis/` (Python+Playwright, 보존)
- 정찰 자료 참고: `~/Desktop/BookingTennis/_workspace/01_recon*.md`
