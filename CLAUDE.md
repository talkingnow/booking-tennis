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
| 2026-05-12 | fix(auth): doLogin() 중복 호출 가드 (busy 체크) — 로그인 튕김 방지 | authStore.ts |
| 2026-05-12 | KCP 결제창 모바일 리다이렉트(방안 A) — isMobile() 분기, m_redirect_url, /payment-result 콜백 라우트 신규 | 02_plan_kcp_mobile.md |
| 2026-05-12 | 4종 개선: doLogin promise 공유(중복방지), 결제중 슬롯 반영(payment_in_progress), PWA 상단 safe-area-inset-top, Quick 자동조회 제거 | |
| 2026-05-12 | 파주시테니스협회 멀티사이트 확장 (M0~M8) — SiteAdapter 추상화, /api/pj 프록시, 파주 12코트 55면, SiteSelector UI, storage 격리, Race 금요일 07:00 prefill | 02_plan_paju.md / 01_recon_paju.md / 06_qa_report_paju.md |
| 2026-05-13 | qa × agent-browser 통합 — `.claude/agents/qa.md` 를 chrome-devtools MCP 기반으로 개정, 검증 파이프라인 4→6단계 확장(S4 자동 브라우저 운전 추가), 모바일 viewport·KCP 핸드오프·세션만료 8종 시나리오 명문화 | 05_session_handoff_qa_browser.md / MCP: `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest` |
| 2026-05-15 | 모바일 KCP 결제 SDK 방식 전환 (M1~M5) — 2-hop(`/rsvPy` 직접 POST) 폐기, `openKcpMobileSdk` SDK blob 방식으로 교체. `api/kcp-return.ts` Edge Function 신규(KCP 콜백 → `/payment-result` 302). `PaymentResult.tsx` 가 KCP 결과로 `/rsvPy` 최종 제출. 진단: `/rsvPy` 빈 enc POST → `/ordrErr` 확인 | 02_plan_kcp_sdk_mobile.md / 03_build_log_kcp_sdk_mobile.md / 06_qa_report_kcp_sdk_mobile.md |
