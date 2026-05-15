import { gyFetch, extractGytssn } from './proxyClient';
import type { LoginResult } from './types';
import { classifyLoginFailure } from '@/lib/auth/classifyFailure';
import { debugLog } from '@/components/DebugPanel';

/**
 * Submit a login form to gytennis.
 * - Success: status 303 + Set-Cookie: gytssn=...
 * - Failure: status 200 with the login page re-rendered (no Set-Cookie change)
 */
export async function login(userid: string, passwd: string): Promise<LoginResult> {
  const body = new URLSearchParams({ userid, passwd });
  try {
    const res = await gyFetch('/Login', { method: 'POST', body });
    const cookie = extractGytssn(res.setCookies);
    debugLog('res', `Login → status=${res.status} cookie=${cookie ? cookie.slice(0,20)+'…' : 'none'} upstreamError=${res.upstreamError}`);
    if (res.upstreamError) {
      return { ok: false, reason: 'upstream_unreachable' };
    }
    // gytennis returns 303→/ on success, 200 (login page re-rendered) on failure.
    // Crucially, the server also returns a guest gytssn cookie on failed logins,
    // so we must NOT rely on cookie presence alone — check status strictly.
    if (res.status === 303 && cookie) {
      return { ok: true, cookie };
    }
    let errBody: string | null = null;
    try { errBody = await res.text(); } catch { /* ignore */ }
    const reason = classifyLoginFailure(errBody);
    if (reason !== 'bad_credentials') {
      debugLog('err', `Login classified as ${reason}`);
    }
    return { ok: false, reason };
  } catch (e) {
    return { ok: false, reason: 'network', detail: String(e) };
  }
}

/**
 * 'valid' — session active
 * 'expired' — server redirected to login page
 * 'unknown' — upstream_unreachable (502); treat as unknown, not expired
 */
export type SessionCheckResult = 'valid' | 'expired' | 'unknown';

/** Probe the session by hitting /myPage; redirects to /Login when invalid. */
export async function isSessionValid(cookie: string): Promise<boolean> {
  return (await checkSession(cookie)) === 'valid';
}

export async function checkSession(cookie: string): Promise<SessionCheckResult> {
  try {
    const res = await gyFetch('/myPage', { cookie });
    if (res.upstreamError) return 'unknown';
    // 307/302 redirect to /Login indicates expired
    if (res.status === 307 || res.status === 302) return 'expired';
    return res.status === 200 ? 'valid' : 'expired';
  } catch {
    return 'unknown';
  }
}

export async function logout(cookie: string): Promise<void> {
  try {
    await gyFetch('/logOff', { cookie });
  } catch {
    // ignore
  }
}
