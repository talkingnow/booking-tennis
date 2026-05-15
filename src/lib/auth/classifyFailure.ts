import type { LoginFailReason } from '@/lib/gytennis/types';

/**
 * Classify a non-303 login response body into a more specific failure reason.
 * gytennis/pjtennis collapse most failures into "200 + login page re-rendered",
 * so the only signal is body content. We match conservative phrase sets to
 * avoid false positives — anything we can't classify falls back to bad_credentials.
 *
 * Why this exists: rate-limit and account-lock events were previously
 * indistinguishable from a wrong password, hiding operational risk.
 */

const RATE_LIMIT_PATTERNS: RegExp[] = [
  /너무\s*많은/,            // "너무 많은 시도" / "너무 많은 요청"
  /일시적으로\s*제한/,
  /잠시\s*후에?\s*다시/,    // "잠시 후 다시" / "잠시 후에 다시"
  /접속이\s*많/,            // "접속이 많아"
  /too\s*many\s*(requests|attempts)/i,
  /rate.?limit/i,
];

// Allow 0-2 hangul josa chars (이/가/을/를/은/는/도/만) + whitespace between
// noun and verb so "계정이 잠금" matches as well as "계정 잠금".
const J = '[가-힣]{0,2}\\s*';

const ACCOUNT_LOCK_PATTERNS: RegExp[] = [
  new RegExp(`계정${J}(잠금|잠겼|정지|차단|제한)`),
  new RegExp(`(잠금|잠겼|정지|차단|제한)${J}계정`),
  new RegExp(`로그인${J}(차단|제한|정지)`),
  /이용이?\s*(제한|정지|중지)/,
  /비밀번호\s*\d+\s*회.{0,8}초과/,  // "비밀번호 5회 초과"
  /account\s*(locked|suspended|disabled)/i,
];

export function classifyLoginFailure(body: string | null | undefined): LoginFailReason {
  if (!body) return 'bad_credentials';
  // Strip tags lightly to avoid attribute noise; full HTML parse not required
  // because target phrases live in user-visible text content.
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const re of ACCOUNT_LOCK_PATTERNS) if (re.test(text)) return 'account_locked';
  for (const re of RATE_LIMIT_PATTERNS) if (re.test(text)) return 'rate_limited';
  return 'bad_credentials';
}
