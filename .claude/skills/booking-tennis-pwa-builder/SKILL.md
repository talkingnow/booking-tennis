---
name: booking-tennis-pwa-builder
description: booking-tennis PWA(아이폰·안드로이드용 gytennis 예약 도우미)를 빌드·수정·확장하는 오케스트레이터. Claude Code 의 실제 **Agent Teams 기능**으로 `BT-Build-team` 을 만들고 planner(opus)·builder(sonnet)·qa(opus) 를 팀원으로 띄워 계획→빌드→검증 3단계를 한 팀으로 수행한다. React/TS/Vite/Vercel Edge 스택. "PWA 수정해", "슬롯 표시 버그", "예약 위저드 개선", "KCP 결제 흐름 보완", "재배포", "테스트 추가", "디자인 변경", "기능 추가" 등 booking-tennis 프로젝트 모든 후속·확장 요청에 트리거.
---

# Booking Tennis PWA Builder — Agent Teams 오케스트레이터

본 스킬은 **Claude Code 의 Agent Teams 기능**(`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)을 전제로, 단일 세션 안에서 `BT-Build-team` 을 만들고 팀원을 띄워 계획→빌드→검증을 한 팀으로 수행한다. **서브에이전트 단발 호출이 아니라** 공유 task list + SendMessage 로 협업하는 실제 팀이다.

## 사전 조건

- Claude Code v2.1.32+
- 사용자 settings.json 에 `"env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }` (이미 설정됨)
- 본 세션의 **CWD = `~/Desktop/booking-tennis`** (agents 가 이 디렉토리에서 해결됨)
- 도구: `TeamCreate`, `TeamDelete`, `SendMessage`, `TaskCreate`, `TaskUpdate`, `TaskList`, `Agent(team_name, name, subagent_type, model)`
- 본 세션이 team lead 가 된다 (Agent Teams 규칙: 팀을 만든 세션이 lead 로 고정)

## 모델 정책 (강제)

| 역할 | 모델 | 비고 |
|------|------|------|
| team-lead (오케스트레이터, 본 세션) | opus | TeamCreate 호출 세션 |
| planner | **opus** | 계획·인터페이스·검증 기준 |
| builder | **sonnet** | TS·React·Edge Function 작성 |
| qa | **opus** | 라이브 대조·회귀·preview 검증 |

모든 Agent 호출에 `model` 명시 필수.

## Phase 0: 컨텍스트 확인 (lead 단독)

1. `_workspace/` 존재 여부 확인 (있어야 정상; 신규 빌드면 `_workspace/00_input_requirements.md` 작성)
2. `src/`·`api/`·`tests/` 존재 여부 확인
3. 기존 팀 정리: `~/.claude/teams/` 에 잔여 팀 있으면 `TeamDelete`
4. 사용자 요청 분류:
   - 신규 빌드 → Phase 1 시작
   - 수정·확장 → 해당 Phase 로 재진입 (계획만 / 빌드만 / qa 만 등)
   - 단순 질의 → 스킬 없이 직접 응답

## Phase 0.5: 팀 생성

```
TeamCreate(
  team_name="BT-Build-team",
  description="booking-tennis PWA 빌드·확장 (계획→빌드→검증)",
  agent_type="team-lead"
)
```

팀원 3명 병렬 스폰:

```
Agent(team_name="BT-Build-team", name="planner",
      subagent_type="planner", model="opus",
      prompt="<Phase 1 입력 — 사용자 원문 + 변경 범위 후보 + 기존 _workspace 참조>")

Agent(team_name="BT-Build-team", name="builder",
      subagent_type="builder", model="sonnet",
      prompt="대기. Phase 2 시작되면 TaskList 폴링.")

Agent(team_name="BT-Build-team", name="qa",
      subagent_type="qa", model="opus",
      prompt="대기. Phase 3 시작되면 TaskList 폴링.")
```

> `subagent_type` 은 `.claude/agents/{planner,builder,qa}.md` 정의를 그대로 사용 (model·도구 메타 자동 적용).

## Phase 1: 계획 (Plan)

`TaskCreate` 로 작업 추가:

- `task#1` "Build 계획서 작성 — _workspace/02_plan_{topic}.md" / `owner=planner`

planner 는 `02_plan_{topic}.md` 작성 후 `TaskUpdate(status=completed)` + lead 에 SendMessage.

**계획서 6개 섹션 (필수):**
1. 요구사항 요약 (사용자 원문 인용 + 해석)
2. 변경 범위 (신규/수정/삭제 파일 표)
3. 모듈별 작업 분해 (builder 담당)
4. 인터페이스 합의안 (타입·헤더 프로토콜·라우터)
5. 리스크 / 미해결 의문점
6. QA 검증 체크리스트

**게이트:** lead 가 계획서 요지를 마크다운으로 **사용자에 보고** → 사용자 OK 후 Phase 2 진입.

## Phase 2: 빌드 (Build)

lead 가 모듈별 `TaskCreate` (모두 `owner=builder`). 모듈은 계획서 Section 3 그대로:

- `task#2` "M1: 파서 수정 (src/lib/parsers/...)"
- `task#3` "M2: UI 수정 (src/components/SlotPicker.tsx)"
- ...

builder 는 ID 순으로 처리, 끝나면 `TaskUpdate(status=completed)` + lead 에 SendMessage. 마지막에 `_workspace/03_build_log_{topic}.md` 작성.

인터페이스 의문점은 builder 가 SendMessage 로 직접 planner 에 질의 (peer 통신 허용).

각 모듈 완료 시 `npx vitest run` + `npm run build` 통과 확인. 회귀 0 보장.

## Phase 3: 검증 (Verify)

`TaskCreate`:
- `task#N` "QA 통합 검증 — _workspace/06_qa_report_{topic}.md" / `owner=qa`

qa 는 다음 단계 수행:
1. `npx vitest run` 통과 확인
2. `npm run build` 통과 확인
3. preview 서버에서 `/api/gy/daily/{1~10}` 실 호출 → 파서 결과 사용자 보고와 대조
4. `preview_screenshot` 으로 UI 시각 확인
5. (선택) `vercel deploy --prod` 후 배포 환경 검증
6. 라이브 대조 가설(예: gytennis DOM 변경)이 있으면 사용자 대조 요청

**결함 발견 시:** lead 가 builder 에 신규 task 로 재할당 → 같은 팀 내 루프 (qa 회귀).

## Phase 4: 인계 + 팀 해체

- `_workspace/`·`README.md`·`CLAUDE.md` 변경 이력 갱신
- Vercel 자동 배포 또는 `vercel deploy --prod --yes` + alias set
- 사용자에 라이브 URL 보고
- 팀원 종료 후 `TeamDelete()`:

```
SendMessage(to="planner", message={type:"shutdown_request"})
SendMessage(to="builder", message={type:"shutdown_request"})
SendMessage(to="qa",      message={type:"shutdown_request"})
# 모두 idle 확인 후
TeamDelete()
```

## 팀 통신 규칙

| 채널 | 용도 |
|------|------|
| `TaskCreate` / `TaskUpdate` | 작업 할당·진행상태. **task list 가 진실의 원천** |
| `SendMessage(to=<name>)` | 인터페이스 질의, 결함 보고, 완료 통지 |
| 파일 `_workspace/0X_*.md` | 단계 산출물 (계획·빌드 로그·QA 리포트) |
| 파일 `src/`·`api/`·`tests/` | 최종 코드 |

## 에러 핸들링 (lead 책임)

| 상황 | 대응 |
|------|------|
| planner 정찰 부족 | lead 에 SendMessage → lead 가 사용자에 HAR 캡처 / DevTools 가이드 |
| builder ↔ planner 인터페이스 충돌 | builder 결정 우선, lead 중재 |
| qa 결함 발견 | lead 가 builder 에 신규 task, qa 회귀 |
| Vercel 502 / 빌드 실패 | 빌드 중단, lead 가 원인 분석 후 픽스 task 발행 |
| 결제 자동화 시도 발견 | 빌드 중단, 사용자 확인 |
| 팀원 idle 장시간 | `TaskList` 미배정 작업 확인 후 재할당 |

## 후속 작업 패턴

| 사용자 요청 | 재진입 Phase | 동작 |
|------------|-------------|------|
| "슬롯 표시 버그" | Phase 1 | planner 재가동 (팀 살아있으면 SendMessage, 없으면 Phase 0.5) |
| "결제 흐름 개선" | Phase 1 → 2 | planner → builder |
| "UI 디자인 변경" | Phase 2 부분 | builder |
| "QA만 다시" | Phase 3 | qa |
| "전체 재빌드" | Phase 0 백업 후 0.5 | 전 팀원 |

## 산출물 체크리스트

- [ ] `_workspace/00_input_requirements.md` (이미 존재)
- [ ] `_workspace/01_recon.md` (이미 존재 — 변경 시 보강)
- [ ] `_workspace/02_plan_{topic}.md` ← **필수**, 사용자 보고
- [ ] `_workspace/03_build_log_{topic}.md`
- [ ] `_workspace/06_qa_report_{topic}.md`
- [ ] `src/`·`api/`·`tests/` 변경 반영
- [ ] git 커밋 (모듈 단위) + `vercel deploy --prod`
- [ ] `CLAUDE.md` 변경 이력 갱신

## 한계 / 주의

- Agent Teams 는 실험 기능 — `/resume` `/rewind` 로는 in-process teammate 복원 불가
- 한 lead 는 동시에 한 팀만. 새 빌드 전 반드시 `TeamDelete`
- 본 세션의 **CWD 가 booking-tennis** 여야 agents 가 해결됨. BookingTennis 디렉토리에서 호출하면 작동 안 함
- 자격증명 자동 입력 금지 (manual_handoff 유지)
- 결제 PG(KCP) 자동 입력 금지 — 사용자 클릭 직후 form auto-submit 만 허용
