import { pjFetch, extractPjSession } from './proxyClient';
import type { LoginResult } from './types';
import { debugLog } from '@/components/DebugPanel';

/**
 * Submit a login form to pjtennis.
 *
 * pjtennis uses 'username' and 'password' (not 'userid'/'passwd' like gytennis).
 * TODO(M0/R4): Confirm input names from raw form HTML. Fallback: 'userid'/'passwd'.
 *
 * - Success: status 303 + Set-Cookie: <session>=...
 * - Failure: status 200 (login page re-rendered)
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  // TODO(M0/R4): If live test shows 'userid'/'passwd', change these keys.
  const body = new URLSearchParams({ username, password });
  try {
    const res = await pjFetch('/Login', { method: 'POST', body });
    const cookie = extractPjSession(res.setCookies);
    debugLog('res', `pjLogin → status=${res.status} cookie=${cookie ? cookie.slice(0, 20) + '…' : 'none'}`);
    // pjtennis likely behaves like gytennis: 303→/ on success, 200 on failure.
    if (res.status === 303 && cookie) {
      return { ok: true, cookie };
    }
    return { ok: false, reason: 'bad_credentials' };
  } catch (e) {
    return { ok: false, reason: 'network', detail: String(e) };
  }
}

/** Probe the session by hitting /myPage; redirects to /Login when invalid. */
export async function isSessionValid(cookie: string): Promise<boolean> {
  try {
    const res = await pjFetch('/myPage', { cookie });
    if (res.status === 307 || res.status === 302) return false;
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function logout(cookie: string): Promise<void> {
  try {
    await pjFetch('/logOff', { cookie });
  } catch {
    // ignore
  }
}
