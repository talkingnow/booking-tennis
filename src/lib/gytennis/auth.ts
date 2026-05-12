import { gyFetch, extractGytssn } from './proxyClient';
import type { LoginResult } from './types';

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
    if (res.status === 303 && cookie) {
      return { ok: true, cookie };
    }
    // Some deployments respond 200 with a fresh login page on bad creds.
    if (!cookie) {
      return { ok: false, reason: 'bad_credentials' };
    }
    // Got a cookie but unexpected status — treat as success but flag in detail.
    return { ok: true, cookie };
  } catch (e) {
    return { ok: false, reason: 'network', detail: String(e) };
  }
}

/** Probe the session by hitting /myPage; redirects to /Login when invalid. */
export async function isSessionValid(cookie: string): Promise<boolean> {
  try {
    const res = await gyFetch('/myPage', { cookie });
    // 307 redirect to /Login indicates expired
    if (res.status === 307 || res.status === 302) return false;
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function logout(cookie: string): Promise<void> {
  try {
    await gyFetch('/logOff', { cookie });
  } catch {
    // ignore
  }
}
