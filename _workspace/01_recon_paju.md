# pjtennis 라이브 정찰 결과 (M0)

**정찰일**: 2026-05-12
**방법**: curl raw HTTP (사용자 직접 실행)

---

## 확정 항목

| 항목 | 값 | 비고 |
|------|-----|------|
| 로그인 URL | `POST https://www.pjtennis.or.kr/Login` | gytennis 동일 |
| 로그인 파라미터 | `userid` / `passwd` | gytennis 동일 (초기 가정 username/password 는 오류) |
| 로그인 성공 응답 | HTTP 303 See Other + Location: / | gytennis 동일 |
| 세션 쿠키 이름 | `pjtssn` | gytennis: gytssn |
| 세션 쿠키 속성 | Max-Age=7200, path=/, domain=.pjtennis.or.kr, secure, HttpOnly, SameSite=None | |
| 슬롯 페이지 | `/daily/{N}` — 인증 없이 접근 가능 | gytennis 동일 |
| HTML 구조 키워드 | `wholeTable` ✅ `ensdat` ✅ `data-sot` ✅ `data-soc` ✅ `data-grp` ✅ `rsvConfirm` ✅ `van_code` ✅ | gytennis 동일 |
| isvkrr / yxjorg | 정적 HTML 미포함 | JS 동적 주입 (슬롯 클릭 시) — gytennis 동일 패턴 |
| ctooltip / rsvVf / rsvCls | 미확인 (로그인 후 날짜 지정 URL에서 추가 확인 필요) | |
| 예약 form | `<form id="frm" method="post">` + `van_code` hidden input | gytennis 동일 |
| 서버 | Apache/2.4.46 (Unix) OpenSSL/1.0.2k-fips | |

---

## R1/R2/R4 해소

| ID | 항목 | 결과 |
|----|------|------|
| **R1** ✅ | 슬롯 HTML 구조 | gytennis 동일. 기존 slotParser.ts 재사용 확정 |
| **R2** ✅ | 세션 쿠키 이름 | `pjtssn` 확정. proxyClient.ts extractPjSession 단일 정규식으로 확정 |
| **R4** ✅ | 로그인 파라미터 | `userid`/`passwd` 확정. auth.ts 수정 완료 |

---

## 미해소

| ID | 항목 | 대응 |
|----|------|------|
| **R3** | 결제 PG (KCP 여부) | 라이브 예약 1회 테스트 시 rsvConfirm 응답에서 확인 |

---

## curl 로그 요약

```
# Step 1: 로그인 폼 파라미터 확인
$ curl -s "https://www.pjtennis.or.kr/Login" | grep -i 'input|form'
→ name="userid" / name="passwd" 확인

# Step 2: 로그인 시도
$ curl -i -s -c /tmp/pj.cookie -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'userid=...' --data-urlencode 'passwd=...' \
  "https://www.pjtennis.or.kr/Login"
→ HTTP/1.1 303 See Other
→ Set-Cookie: pjtssn=...; Max-Age=7200; ...

# Step 3: 슬롯 페이지 구조 확인 (로그인 후)
$ curl -s -b /tmp/pj.cookie "https://www.pjtennis.or.kr/daily/1" | grep -o '...' | sort -u
→ data-grp, data-soc, data-sot, ensdat, rsvConfirm, wholeTable
```
