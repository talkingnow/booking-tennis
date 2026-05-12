# 빌드 로그 — M-A~M-G 검수 수정 (2026-05-12)

## 테스트 결과

```
Test Files  5 passed (5)
     Tests  37 passed (37)
  Duration  ~1.3s
```

기존 18 케이스 전원 유지. 신규 19 케이스 추가 (race-default-date × 8, timeSync × 7, verifyReservation × 4).

## 빌드 결과

```
✓ tsc -b (0 errors)
✓ vite build — 67 modules, dist/index.html + sw.js 생성
```

---

## 모듈별 변경 요약

### M-A — Race 위저드 안정화

| 항목 | 변경 내용 |
|------|----------|
| `Race.tsx: defaultDate()` | `d.setMonth(d.getMonth()+1)` 월 오버플로 버그 → 직접 nextMonth/nextYear 계산 + `lastDay = new Date(nextYear, nextMonth+1, 0).getDate()`로 클램프. 함수 export 추가. |
| `PaymentCountdown.tsx` (신규) | 8분 카운트다운. 1초 interval 갱신. 1분 미만 시 빨간색. "지금 취소" 버튼 → onCancel. 만료 시 onExpire. cancelReservation은 호출자(Race.tsx)가 담당. |
| `Race.tsx: phase=success` | `<PaymentCountdown deadline onExpire onCancel>` 마운트. deadline = 발사 성공 시각 + 8분. |
| `Race.tsx: phase=failed` | "다시 시도" + "슬롯 재조회" 버튼 추가. |
| `Race.tsx: arm()` | `measureServerOffsetMs(3)` 호출 후 `startCountdown({ offsetMs })` 전달. `setArmed(true)` / `setArmed(false)` 연동. |
| `tests/race-default-date.test.ts` (신규) | 8개 케이스: Jan/Mar/May/Oct/Dec 오버플로 클램프, Feb 정상, mid-month 정상, YYYY-MM-DD 형식 검증. |
| `tests/verifyReservation.test.ts` (신규) | 4개 케이스: rsvVf 200→verified=true, 500→false, 307 redirect→rsvVf 미호출, empty slots. |

### M-C — 결제 핸드오프 + 취소 자동화

| 항목 | 변경 내용 |
|------|----------|
| `types.ts: ReservationResult` | `ok: true` 브랜치에 `verified: boolean` 필드 추가. |
| `reserve.ts: submitReservation` | orderId 추출 성공 시 `verifyReservation(orderId, cookie)` 호출 → 결과를 `verified` 필드로 포함. |
| `handoff.ts: KcpHandoffOptions` | `openInSelf?: boolean`, `onWindowClosed?: () => void` 타입 추가. |
| `handoff.ts: openKcpPayment` | 반환 타입 `Window \| null`. `_blank` 팝업 시 1초 polling으로 닫힘 감지 → `onWindowClosed` 발화. R-E B안: onWindowClosed에서 cancelReservation 미호출 (UI 안내만). |

### M-D — PWA SW 업데이트 안전화

| 항목 | 변경 내용 |
|------|----------|
| `vite.config.ts` | `registerType: 'autoUpdate'` → `'prompt'`. |
| `stores/uiStore.ts` (신규) | `isArmed: boolean` + `setArmed()`. Race.tsx의 카운트다운 상태를 SwUpdatePrompt에 전달. |
| `SwUpdatePrompt.tsx` (신규) | `useRegisterSW()` 사용. `needRefresh && !isArmed` 조건에서 업데이트 배너 표시. "지금 업데이트" → `updateServiceWorker(true)`. |
| `main.tsx` | `<SwUpdatePrompt />` 마운트. |

### M-B — Quick 안정성·접근성 + pending 슬롯

| 항목 | 변경 내용 |
|------|----------|
| `types.ts: SlotStatus` | `'pending'` 추가. JSDoc 설명 보강. |
| `SlotPicker.tsx` | `statusStyle['pending']` = 노란 배경(bg-yellow-200). `glyph()` 에 ⏳ 추가. `label()` 에 "결제 진행 중" 추가. 범례 업데이트. |
| `ConfirmDialog.tsx` (신규) | 간단한 모달 overlay. open/message/onConfirm/onCancel props. |
| `Quick.tsx` | 슬롯 버튼 클릭 → ConfirmDialog → 확인 후 reserve(). "결제 진행 중" 류 에러 → pendingSlots 로컬 상태로 마킹 → 노란 ⏳ 배지. 버튼 min-h-[44px] 접근성. |

### M-E — 시간 동기

| 항목 | 변경 내용 |
|------|----------|
| `scheduler/timeSync.ts` (신규) | `measureServerOffsetMs(samples=3)` — HEAD /api/gy/ 3회 → 각 (serverDate - midpoint) → 중앙값 반환. 네트워크 오류 시 skip. 전부 실패 시 0 반환. |
| `scheduler/countdown.ts` | `CountdownOptions.offsetMs` 추가. `now = () => Date.now() + offsetMs`. `visibilitychange` 이벤트로 화면 복귀 시 강제 tick. cancel 시 리스너 제거. |
| `Race.tsx: arm()` | `async` 전환. `await measureServerOffsetMs(3)` 호출 후 offset 전달. |
| `tests/timeSync.test.ts` (신규) | 7개 케이스: Date header 파싱, 오프셋 부호 검증, 중앙값 선택, 실패 케이스. |

### M-F — authStore 강건화

| 항목 | 변경 내용 |
|------|----------|
| `authStore.ts: saveCredentials` | 반환 타입 `StoredAccount`로 변경. |
| `authStore.ts: doLogin` | `doLogin(acc?: StoredAccount)` 시그니처. `acc`가 있으면 우선 사용, 없으면 `get().account`. setTimeout 경쟁 조건 제거. |
| `Account.tsx: onSubmit` | `const acc = saveCredentials(...)` → `await doLogin(acc)`. `setTimeout(() => doLogin(), 0)` 제거. |

### M-G — 문서 및 CLAUDE.md

| 항목 | 변경 내용 |
|------|----------|
| `docs/usage-race.md` (신규) | 빠른 예약 5단계 가이드. |
| `docs/usage-quick.md` (신규) | 간편 예약 가이드. |
| `CLAUDE.md` | 변경 이력 표에 M-A~M-G 행 추가. |

---

## 회귀 체크리스트

- [x] 기존 18 케이스 (parsers 14 + proxyClient 4) 전원 통과
- [x] 신규 19 케이스 전원 통과
- [x] `tsc -b` 0 error
- [x] `vite build` 성공
- [x] SlotStatus 'pending' → SlotPicker/Quick 일관 반영
- [x] ReservationResult.verified → reserve.ts + types.ts 일관
- [x] openKcpPayment 반환 타입 void → Window|null (Race.tsx 호환)
- [x] authStore.doLogin 시그니처 변경 → Account.tsx / Race.tsx / Quick.tsx 호환
- [x] vite-plugin-pwa/client 타입 → tsconfig.json types 추가
