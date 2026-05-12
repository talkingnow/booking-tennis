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
- 입력 요구사항: `_workspace/00_input_requirements.md`
- 정찰 결과: `_workspace/01_recon.md`
- 기존 데스크탑 시스템 정찰 자료: `~/Desktop/BookingTennis/_workspace/01_recon*.md`

**하네스 (Agent Teams 기반):**
- 스킬: `.claude/skills/booking-tennis-pwa-builder/SKILL.md`
- 팀원 에이전트: `.claude/agents/{planner,builder,qa}.md`
- 트리거: "PWA 수정", "슬롯 버그", "예약 위저드 개선", "재배포" 등 booking-tennis 후속 요청 시 자동 활성
- 흐름: TeamCreate → planner(plan) → builder(code) → qa(verify) → 사용자 보고 → TeamDelete
- 사용 조건: 본 프로젝트 디렉토리(`~/Desktop/booking-tennis/`)를 CWD 로 Claude Code 실행

**변경 이력:**

| 날짜 | 변경 내용 | 비고 |
|------|----------|------|
| 2026-05-11 | 프로젝트 초기 생성 | README/CLAUDE.md/.gitignore + git remote 연결 |
| 2026-05-12 | M1~M11 PWA 구현 + Vercel prod 배포 | 4 routes + 18 tests, icn1 region |
| 2026-05-12 | 슬롯 분류 1차 수정 (cno→displayed) | `Slot.internalCourtId` 도입, daily/4 9~12 정상 |
| 2026-05-12 | 슬롯 분류 2차 반전 (isvkrr=avail/ctooltip=reserved) | 사용자 라이브 대조 결과 분류 가설 반전, UI ○/× 이진 |
| 2026-05-12 | Agent Teams 하네스 도입 | `.claude/agents/{planner,builder,qa}.md` + `.claude/skills/booking-tennis-pwa-builder/SKILL.md` — 향후 모든 변경은 Plan→Build→Verify 3단계 팀워크 |
| 2026-05-12 | 예약 버그 2종 수정 | (1) isvkrr[] 전송 값 수정 — yxjorg(가격=0) → isvkrrRaw(실제가격) / (2) Quick.tsx auto-login effect 추가 |
| 2026-05-12 | 검수 후 M-A~M-G 수정 (defaultDate 버그, PaymentCountdown, pending 슬롯, SW prompt, timeSync, authStore 강건화) | 02_plan_inspection.md |
| 2026-05-12 | 즉시 예약 즐겨찾기 관리 패널 + blank screen 버그(useEffect 무한루프) 수정 | Quick.tsx hydrate deps [] 고정 |
| 2026-05-12 | M1~M4: 결제팝업 스크롤, 팝업닫힘 자동취소(payConfirmedRef), Race normal모드 제거, SlotGrid 시각화 | 02_plan_improve4.md |
