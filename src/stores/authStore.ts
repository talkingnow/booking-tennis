import { create } from 'zustand';
import { clearAccount, loadAccount, saveAccount, migrateLegacyAccount, type StoredAccount } from '@/lib/storage/account';
import { clearSession, loadSession, saveSession, migrateLegacySession } from '@/lib/storage/session';
import type { SiteId } from '@/lib/sites/types';
import { getSite, isRegistered } from '@/lib/sites/registry';

export type SiteAuthResult =
  | 'idle' | 'validating' | 'valid' | 'expired' | 'no_account' | 'error';

export type SiteAuthMeta = {
  lastValidatedAt: number | null;
  lastResult: SiteAuthResult;
  lastError?: string;
};

// Stable reference — must NOT be recreated each call, or zustand sees a fresh
// snapshot every render and triggers React error #185 (infinite loop).
const IDLE_META: SiteAuthMeta = { lastValidatedAt: null, lastResult: 'idle' };

export function selectMeta(siteId: SiteId) {
  return (s: AuthState): SiteAuthMeta => s.meta[siteId] ?? IDLE_META;
}

type AuthState = {
  accounts: Partial<Record<SiteId, StoredAccount>>;
  cookies: Partial<Record<SiteId, string>>;
  busy: boolean;
  error: string | null;
  meta: Partial<Record<SiteId, SiteAuthMeta>>;
  hydrate: () => void;
  /**
   * Persist credentials to localStorage for the given site and update store.
   * Returns the constructed StoredAccount so the caller can pass it directly
   * to doLogin() without relying on async store propagation.
   */
  saveCredentials: (siteId: SiteId, id: string, pw: string, remember: boolean) => StoredAccount;
  /**
   * Perform login for the given site.
   * If `acc` is provided it is used directly (avoids the race condition where
   * the Zustand state setter hasn't propagated yet).
   * Falls back to the stored account from state when acc is omitted.
   * Concurrent callers for the same site share the same in-flight promise.
   */
  doLogin: (siteId: SiteId, acc?: StoredAccount) => Promise<boolean>;
  doLogout: (siteId: SiteId) => Promise<void>;
  forget: (siteId: SiteId) => void;
  /**
   * Check session validity and re-login if expired.
   * - 'unknown' (upstream 502): no-op, returns false without setting error.
   * - 'expired': attempts doLogin, returns result.
   * - 'valid': returns true immediately.
   * - no cookie + account: fires doLogin directly.
   * - no cookie + no account: returns false silently.
   */
  validateAndLogin: (siteId: SiteId) => Promise<boolean>;
  /** Start a 25-min keep-alive interval; stops any existing interval first. */
  startKeepAlive: () => void;
  /** Clear the keep-alive interval. */
  stopKeepAlive: () => void;
};

// In-flight login promises per site: concurrent callers share the same request.
const _loginPromises: Partial<Record<SiteId, Promise<boolean>>> = {};

// Keep-alive interval handle (module-level, survives re-renders)
let _keepAliveTimer: ReturnType<typeof setInterval> | null = null;

const KEEP_ALIVE_MS = 25 * 60 * 1000; // 25 minutes
const SITE_IDS: SiteId[] = ['gy', 'pj'];

export const useAuthStore = create<AuthState>((set, get) => ({
  accounts: {},
  cookies: {},
  busy: false,
  error: null,
  meta: {},

  hydrate: () => {
    // One-time legacy key migration (bt:account → bt:account:gy, etc.)
    migrateLegacyAccount();
    migrateLegacySession();

    const accounts: Partial<Record<SiteId, StoredAccount>> = {};
    const cookies: Partial<Record<SiteId, string>> = {};

    for (const siteId of ['gy', 'pj'] as SiteId[]) {
      const account = loadAccount(siteId);
      if (account) accounts[siteId] = account;
      const cookie = loadSession(siteId);
      if (cookie) cookies[siteId] = cookie;
    }

    set({ accounts, cookies });
  },

  saveCredentials: (siteId, id, pw, remember) => {
    const acc: StoredAccount = { id, pw, remember, savedAt: Date.now() };
    if (remember) saveAccount(siteId, acc);
    set((state) => ({
      accounts: { ...state.accounts, [siteId]: acc },
      error: null,
    }));
    return acc;
  },

  doLogin: (siteId: SiteId, acc?: StoredAccount) => {
    // Deduplicate: if a login for this site is already in progress, share it.
    if (_loginPromises[siteId]) return _loginPromises[siteId]!;

    const target = acc ?? get().accounts[siteId];
    if (!target) {
      set({ error: '계정 정보가 없습니다.' });
      return Promise.resolve(false);
    }

    set((state) => ({
      busy: true,
      error: null,
      meta: {
        ...state.meta,
        [siteId]: { lastValidatedAt: null, lastResult: 'validating' as SiteAuthResult },
      },
    }));

    _loginPromises[siteId] = Promise.resolve().then(() => {
      const adapter = getSite(siteId);
      return adapter.login(target.id, target.pw);
    }).then((result) => {
      if (result.ok) {
        saveSession(siteId, result.cookie);
        set((state) => ({
          cookies: { ...state.cookies, [siteId]: result.cookie },
          busy: false,
          meta: {
            ...state.meta,
            [siteId]: { lastValidatedAt: Date.now(), lastResult: 'valid' as SiteAuthResult },
          },
        }));
        return true;
      }
      const errMsg =
        result.reason === 'bad_credentials'
          ? '아이디 또는 비밀번호가 올바르지 않습니다.'
          : result.reason === 'rate_limited'
            ? '로그인 시도가 너무 잦습니다. 잠시 기다린 뒤 다시 시도해 주세요.'
            : result.reason === 'account_locked'
              ? '계정이 잠겼거나 이용이 제한되었습니다. 사이트에서 직접 확인해 주세요.'
              : result.reason === 'upstream_unreachable'
                ? '서버 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.'
                : result.reason === 'network'
                  ? '네트워크 오류가 발생했습니다.'
                  : '로그인에 실패했습니다.';
      set((state) => ({
        busy: false,
        error: errMsg,
        meta: {
          ...state.meta,
          [siteId]: { lastValidatedAt: Date.now(), lastResult: 'error' as SiteAuthResult, lastError: errMsg },
        },
      }));
      return false;
    }).catch(() => {
      const errMsg = '로그인 중 오류가 발생했습니다.';
      set((state) => ({
        busy: false,
        error: errMsg,
        meta: {
          ...state.meta,
          [siteId]: { lastValidatedAt: Date.now(), lastResult: 'error' as SiteAuthResult, lastError: errMsg },
        },
      }));
      return false;
    }).finally(() => {
      delete _loginPromises[siteId];
    });

    return _loginPromises[siteId]!;
  },

  doLogout: async (siteId: SiteId) => {
    const cookie = get().cookies[siteId];
    set({ busy: true });
    if (cookie) {
      try {
        await getSite(siteId).logout(cookie);
      } catch {}
    }
    clearSession(siteId);
    // BUG-11: reset meta on logout so LoginBadge doesn't show stale valid state
    set((state) => {
      const cookies = { ...state.cookies };
      const meta = { ...state.meta };
      delete cookies[siteId];
      delete meta[siteId];
      return { cookies, busy: false, meta };
    });
  },

  forget: (siteId: SiteId) => {
    clearAccount(siteId);
    clearSession(siteId);
    // BUG-11: clear meta on forget so LoginBadge clears immediately
    set((state) => {
      const accounts = { ...state.accounts };
      const cookies = { ...state.cookies };
      const meta = { ...state.meta };
      delete accounts[siteId];
      delete cookies[siteId];
      delete meta[siteId];
      return { accounts, cookies, meta };
    });
  },

  validateAndLogin: async (siteId: SiteId) => {
    const { cookies, accounts, doLogin } = get();
    const cookie = cookies[siteId];
    const account = accounts[siteId];

    // No credentials at all — nothing to do
    if (!cookie && !account) {
      set((state) => ({
        meta: {
          ...state.meta,
          [siteId]: { lastValidatedAt: Date.now(), lastResult: 'no_account' as SiteAuthResult },
        },
      }));
      return false;
    }

    // No cookie but account exists — fire login directly
    if (!cookie && account) {
      return doLogin(siteId);
    }

    // Cookie exists — verify with the site
    if (!isRegistered(siteId)) return false;

    set((state) => ({
      meta: {
        ...state.meta,
        [siteId]: { lastValidatedAt: null, lastResult: 'validating' as SiteAuthResult },
      },
    }));

    const adapter = getSite(siteId);
    const status = await adapter.checkSession(cookie!);

    if (status === 'valid') {
      set((state) => ({
        meta: {
          ...state.meta,
          [siteId]: { lastValidatedAt: Date.now(), lastResult: 'valid' as SiteAuthResult },
        },
      }));
      return true;
    }
    if (status === 'unknown') return false; // 502 — don't treat as expiry

    // expired — re-login if we have credentials
    if (account) {
      set((state) => ({
        meta: {
          ...state.meta,
          [siteId]: { lastValidatedAt: null, lastResult: 'expired' as SiteAuthResult },
        },
      }));
      return doLogin(siteId);
    }
    // expired but no stored credentials — clear stale session quietly
    // BUG-7: use 'no_account' (not 'expired') so LoginBadge doesn't show misleading retry button
    clearSession(siteId);
    set((state) => {
      const c = { ...state.cookies };
      delete c[siteId];
      return {
        cookies: c,
        meta: {
          ...state.meta,
          [siteId]: { lastValidatedAt: Date.now(), lastResult: 'no_account' as SiteAuthResult },
        },
      };
    });
    return false;
  },

  startKeepAlive: () => {
    if (_keepAliveTimer !== null) clearInterval(_keepAliveTimer);
    _keepAliveTimer = setInterval(() => {
      const { validateAndLogin } = useAuthStore.getState();
      for (const siteId of SITE_IDS) {
        validateAndLogin(siteId);
      }
    }, KEEP_ALIVE_MS);
  },

  stopKeepAlive: () => {
    if (_keepAliveTimer !== null) {
      clearInterval(_keepAliveTimer);
      _keepAliveTimer = null;
    }
  },
}));
