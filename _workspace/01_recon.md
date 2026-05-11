# gytennis.or.kr — HTTP API 정찰 결과

**작성**: 2026-05-12
**기반 자료**:
- 신규 HAR: `_workspace/gytennis_recon.har` (실제 로그인→예약→결제창→취소 흐름 캡처)
- 기존 정찰: `~/Desktop/BookingTennis/_workspace/01_recon*.md` (DOM 구조 + dailys.js 분석)

---

## 1. 핵심 결론 (PWA 구현 관점)

| 항목 | 결과 | PWA 영향 |
|------|------|---------|
| 인증 방식 | 세션 쿠키 `gytssn` (HttpOnly, Secure, SameSite=None, 2h) | **쿠키 직접 조작 불가** → 프록시 필요 |
| CSRF 토큰 | **없음** | 매우 단순 |
| CAPTCHA | **없음** | 자동 발사 가능 |
| CORS | gytennis 가 Access-Control-Allow-Origin 미설정 추정 | **Vercel Function 프록시 필수** |
| 슬롯 데이터 형식 | HTML 페이지 안의 form table (XHR 아님) | 매 조회마다 HTML GET + DOM 파싱 |
| 예약 트랜잭션 | 단일 POST `/rsvConfirm` | 정각 발사 1회로 충분 |
| 결제 PG | KCP (spay.kcp.co.kr) — popup form post | URL/order_id 받아서 사용자 폰 사파리에 열기 |

---

## 2. API 엔드포인트 (확정)

### 2-1. 로그인

```http
POST https://www.gytennis.or.kr/Login
Content-Type: application/x-www-form-urlencoded

userid=<ID>&passwd=<PW>
```

- 응답: **303 See Other** → `Location: /`
- 응답 헤더에 `Set-Cookie: gytssn=<sessionid>; Max-Age=7200; HttpOnly; Secure; SameSite=None`
- **CSRF·캡차 없음**. `maxlength`: userid 16, passwd 20.

### 2-2. 슬롯 조회

```http
GET https://www.gytennis.or.kr/daily/{court_id}/{YYYY-MM-DD}
Cookie: gytssn=<session>
```

- `court_id`: 1~10 (대화/삼송유수지/성라/성사전천후/성사실외/중산/충장/킨텍스유수지/토당/화정)
- 응답: HTML. 슬롯 셀 구조:

```html
<td class="resTag">
  <input type="checkbox" name="yxjorg[]" class="yxjorg"
         value="2026-05-12|1|1|6|0"      <!-- date|court_id|court_no|hour|flag -->
         onClick="utils.checkboxSelect();" />
  <div class="ctooltip-trigger" data-ctooltip="0|2026-05-12|1|6">
       <!-- 첫 글자: 0=빈, 1=예약됨 -->
    <i class="fa-solid fa-user-clock"></i>
  </div>
</td>
```

- 한도 메타: `<div class="gtitle" data-sot="2" data-grp="1" data-soc="1">`
  - `data-sot`: 일일 최대 슬롯 수 (예: 2 → 4시간)
  - `data-soc`: 동일 코트 최대 슬롯 수 (예: 1 → 2시간)
- 21일 캘린더 inline JSON: `<input id="ensdat" value='[{"date":"...","reserved":"27","total_cnt":5},...]' />`

### 2-3. 예약 제출 ★ (정각 발사 대상)

```http
POST https://www.gytennis.or.kr/rsvConfirm
Content-Type: application/x-www-form-urlencoded
Cookie: gytssn=<session>

cvalue=1&cdate=2026-05-12&isvkrr[]=2026-05-12|1|4|14|8000&van_code=
```

- `cvalue`: 코트 ID (1~10)
- `cdate`: 조회 날짜
- `isvkrr[]`: 슬롯 식별자 (배열, 다중 선택 가능)
  - 형식: `YYYY-MM-DD|court_id|court_no|hour|price`
  - **주의**: 슬롯 조회 시 `yxjorg[]`로 표시되는 값과 다름 — JS `utils.confirm()` 가 변환
- `van_code`: 결제 카드사 코드 (빈 값 가능)
- 응답: HTML (200). 응답 본문에 KCP 결제 form + `order_id` (`GYP17785423972C18DC21` 형식) 포함

### 2-4. 예약 검증 (예약 직후 호출)

```http
POST https://www.gytennis.or.kr/rsvVf
X-Requested-With: XMLHttpRequest
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Cookie: gytssn=<session>

id=<order_id>
```

- 예약 트랜잭션 유효성 재확인용 XHR. 결제창 띄우기 전 호출됨.

### 2-5. 예약 취소 (결제 미완료 시)

```http
POST https://www.gytennis.or.kr/rsvCls
X-Requested-With: XMLHttpRequest
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Cookie: gytssn=<session>

id=<order_id>
```

- 사용자가 결제창 닫을 때 호출. 슬롯 해제.

### 2-6. 로그아웃

```http
GET https://www.gytennis.or.kr/logOff
```

- 응답: 307 redirect. 세션 무효화.

---

## 3. 결제 PG 흐름 (KCP)

```
1. /rsvConfirm 응답 HTML 안에 KCP 결제 popup form 포함
2. JS 가 자동으로 spay.kcp.co.kr/kcpPaypop.do 로 form POST
3. 사용자가 결제수단 선택 + 카드 정보 입력
4. 결제 완료 시 spay.kcp.co.kr → gytennis 로 결과 콜백
5. 사용자 취소 시: POST spay.kcp.co.kr/com/closeSPayLogging.do → 후속 /rsvCls
```

**KCP 주요 파라미터** (rsvConfirm 응답에서 추출):
- `site_cd`: AL4CM (gytennis 가맹점 코드)
- `ordr_idxx`: order_id (= GYP...)
- `good_name`: "대화 4번 코트예약" 등
- `good_mny`: 가격
- `buyr_name`: 사용자 ID
- `pay_method`: 100000000000 (신용카드)

**PWA 핵심**: 결제창은 KCP 가 띄우는 popup → **사용자 폰 사파리/크롬에서 열기 위해 `rsvConfirm` 응답 HTML 전체를 폰 webview/iframe 에 주입** 하면 자동 전이됨.

---

## 4. CORS 문제 + 해결책

### 문제
- PWA 는 `booking-tennis.vercel.app` 호스팅 → gytennis.or.kr 직접 호출 시
  - 브라우저가 Preflight OPTIONS 발생 → gytennis 가 `Access-Control-Allow-Origin` 없으면 차단
  - `gytssn` 쿠키도 SameSite=None + Secure 라 cross-origin XHR 에 첨부되더라도 `Allow-Credentials: true` 가 없으면 사용 불가

### 해결: Vercel Function 동일 출처 프록시

```
[PWA: booking-tennis.vercel.app]
  ↓ fetch('/api/proxy/Login', {body: ...})  ← 동일 출처
[Vercel Function: /api/proxy/[...path].ts]
  ↓ Set-Cookie 추출 후 PWA 에 응답 헤더로 전달
  ↓ fetch('https://www.gytennis.or.kr/Login', {body, headers: {Cookie: ...}})
[gytennis.or.kr]
```

**구현 패턴**:
- PWA → Vercel Function: 같은 출처 → CORS 무관
- Vercel Function → gytennis: 서버 측 fetch → CORS 무관
- 세션 쿠키 `gytssn` 은 **PWA localStorage** 에 저장 (Vercel Function 무상태)
- Vercel Function 은 `X-GYT-Cookie` 헤더로 받아 → gytennis 호출 시 `Cookie: gytssn=...` 로 변환

**보안**:
- HTTPS 강제
- 사용자 ID/PW 는 PWA → Function 한 번만 전송 (로그인 시)
- Function 은 로그 미저장 (Vercel 기본 로그 외)

---

## 5. 정각 발사 전략 (가. 빠른 예약)

```
T-5분: 사용자 PWA 기동
       PWA → /api/proxy/Login → gytssn 쿠키 획득 → localStorage 저장
T-1분: 사용자 코트면/시간 선택, "발사 대기" 버튼
       PWA 가 정각 까지 setTimeout 카운트다운
T=0:   PWA → /api/proxy/rsvConfirm
       Body: cvalue=X&cdate=Y&isvkrr[]=Z|...
       Cookie: 미리 저장한 gytssn
T+50ms: 응답 HTML 수신
       → PWA 가 응답에서 KCP form 추출
       → 새 탭/Webview 에 KCP 결제 페이지 열기
T+1s:  사용자가 결제 진행
```

**시간 정확도**:
- `performance.now()` + `setTimeout` 으로 ms 단위 제어
- 네트워크 지연을 흡수하기 위해 `T-50ms` 시점에 발사 시도 (선택)
- gytennis 서버 시각 동기화: NTP 미지원 → 사이트 응답 헤더 `Date:` 와 폰 시계 차이 보정

---

## 6. 평상시 예약 흐름 (나. 간편 예약)

```
1. PWA 열기 (이미 로그인된 세션)
2. PWA → /api/proxy/daily/{court_id}/{date} GET (병렬, 즐겨찾기 코트 N개)
3. HTML 파싱: data-ctooltip[0] 슬롯 + data-sot/data-soc 한도 → 챔비
4. UI 에 슬롯 그리드 표시
5. 사용자가 빈 슬롯 탭
6. PWA → /api/proxy/rsvConfirm (즉시)
7. 결제창 진입
```

**세션 만료 처리**: 응답이 /Login 으로 리다이렉트되면 PWA 가 자동 재로그인 (저장된 PW 사용).

---

## 7. 코트 메타 (기존 정찰 그대로 재사용)

| ID | 이름 | URL | 코트 수 (추정) | 시간대 |
|----|------|-----|--------------|--------|
| 1 | 대화 | /daily/1 | ? | 06~22, 2h |
| 2 | 삼송유수지 | /daily/2 | ? | 06~22, 2h |
| 3 | 성라 | /daily/3 | ? | 06~22, 2h |
| 4 | 성사전천후 (실내) | /daily/4 | ? | 06~22, 2h |
| 5 | 성사실외 | /daily/5 | ? | 06~22, 2h |
| 6 | 중산 | /daily/6 | ? | 06~22, 2h |
| 7 | 충장 | /daily/7 | ? | 06~22, 2h |
| 8 | 킨텍스유수지 | /daily/8 | ? | 06~22, 2h |
| 9 | 토당 | /daily/9 | ? | 06~22, 2h |
| 10 | 화정 | /daily/10 | ? | 06~22, 2h |

→ **실제 코트 수는 `data-sot/data-soc` 메타로 동적 추출** (기존 BookingTennis 의 `config/courts.yaml` 참고 가능).

---

## 8. 보안·약관 위험 (기존 정찰 인용)

| 항목 | 결과 |
|------|------|
| CSRF·CAPTCHA·WAF | 모두 없음 (자동화 우호적) |
| 약관 자동화 명시 금지 | 없음, 단 "부정 이용" 일반 조항 존재 |
| 행동 기반 봇 탐지 | 미확인 → 인간적 지연 권장 (50~200ms) |
| 세션 만료 | 2시간 → PWA 가 만료 감지 시 자동 재로그인 |

---

## 9. 미해결·추가 정찰 필요

| # | 항목 | 시점 |
|---|------|------|
| R1 | 각 코트의 `data-sot/data-soc/court_count` 실측 | 첫 빌드 시 코드에서 동적 조회 |
| R2 | `/rsvConfirm` 응답 HTML 정확한 KCP form 구조 (HAR 에 body 없음) | 빌드 중 실 호출로 캡처 |
| R3 | CORS preflight 결과 (실측) | PWA 첫 호출 시 확인, 막히면 프록시 사용 |
| R4 | 동시 로그인 시 기존 세션 무효화 여부 | 빌드 중 두 기기 동시 로그인 테스트 |
| R5 | 폰 사파리에서 KCP popup → 정상 결제 완료 가능 여부 | E2E 테스트 |

---

## 10. PWA 아키텍처 결정 (정찰 결론)

```
┌─────────────────────────────────────┐
│ 폰 (사파리/크롬)                     │
│ ┌─────────────────────────────────┐ │
│ │ PWA (Vite+React)                │ │
│ │ - localStorage: {id,pw,gytssn}  │ │
│ │ - 슬롯 HTML 파서 (DOMParser)    │ │
│ │ - 정각 카운트다운                │ │
│ └─────────────────────────────────┘ │
└────────┬────────────────────────────┘
         │ 같은 출처 fetch
         ↓
┌─────────────────────────────────────┐
│ Vercel Edge Function                │
│ /api/proxy/[...path]                │
│ - 무상태 프록시                       │
│ - X-GYT-Cookie 헤더 → Cookie 변환   │
│ - Set-Cookie → X-GYT-Set-Cookie     │
└────────┬────────────────────────────┘
         │ 서버 fetch
         ↓
┌─────────────────────────────────────┐
│ gytennis.or.kr                       │
└─────────────────────────────────────┘
```

다음 단계: `_workspace/02_plan.md` 작성 → 모듈별 작업 분해.
