import { pjFetch, extractPjSession } from './proxyClient';
import type { LoginResult } from './types';
import { debugLog } from '@/components/DebugPanel';

/**
 * Submit a login form to pjtennis.
 *
 * R4 확정 (M0 curl 2026-05-12): form input name="userid" / name="passwd"
 * — 고양시(gytennis)와 동일. 초기 계획서의 username/password 가정은 틀렸음.
 *
 * - Success: status 303 + Set-Cookie: <session>=...
 * - Failure: status 200 (login page re-rendered)
 */
export async function login(userid: string, passwd: string): Promise<LoginResult> {
  const body = new URLSearchParams({ userid, passwd });
  try {
    const res = await pjFetch('/Login', { method: 'POST', body });
    const cookie = extractPjSession(res.setCookies);
    debugLog('res', `pjLogin → status=${res.status} cookie=${cookie ? cookie.slice(0, 20) + '…' : 'none'}`);
    // pjtennis: 303→/ on success, 200 (login page re-rendered) on failure.
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
