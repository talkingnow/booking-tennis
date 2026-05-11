# booking-tennis — Claude Code Project

## 하네스: 고양시 공공테니스장 자동 예약 PWA

**목표:** gytennis.or.kr 자동 예약을 **폰 단독**(아이폰/안드로이드)에서 PWA로 수행. 항시 가동 서버 없음.

**두 가지 모드:**
- **가. 빠른 예약**: 예약 1~5분 전 기동 → 로그인 → 정각 발사 → 결제창
- **나. 간편 예약**: 즐겨찾기 슬롯 → 탭 → 결제창

**스택:** Vite + React + TypeScript + Tailwind / vite-plugin-pwa / Vercel (호스팅 + Functions)

**핵심 제약:**
- 정각 발사 ±100ms (폰 시계 기반)
- 사용자 자격증명은 폰 localStorage 만, 서버 전송 금지
- 결제는 사용자 수동 (manual handoff)
- 멀티유저 — 데이터 격리 (각자 폰에만)

**관련 자료:**
- 입력 요구사항: `_workspace/input_requirements_pwa_2026-05-11.md`
- 기존 데스크탑 시스템 정찰 자료: `~/Desktop/BookingTennis/_workspace/01_recon*.md`

**변경 이력:**

| 날짜 | 변경 내용 | 비고 |
|------|----------|------|
| 2026-05-11 | 프로젝트 초기 생성 | README/CLAUDE.md/.gitignore + git remote 연결 |
