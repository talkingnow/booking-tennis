import { create } from 'zustand';
import { clearAccount, loadAccount, saveAccount, migrateLegacyAccount, type StoredAccount } from '@/lib/storage/account';
import { clearSession, loadSession, saveSession, migrateLegacySession } from '@/lib/storage/session';
import type { SiteId } from '@/lib/sites/types';
import { getSite } from '@/lib/sites/registry';

type AuthState = {
  accounts: Partial<Record<SiteId, StoredAccount>>;
  cookies: Partial<Record<SiteId, string>>;
  busy: boolean;
  error: string | null;
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
};

// In-flight login promises per site: concurrent callers share the same request.
const _loginPromises: Partial<Record<SiteId, Promise<boolean>>> = {};

export const useAuthStore = create<AuthState>((set, get) => ({
  accounts: {},
  cookies: {},
  busy: false,
  error: null,

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

    set({ busy: true, error: null });

    _loginPromises[siteId] = Promise.resolve().then(() => {
      const adapter = getSite(siteId);
      return adapter.login(target.id, target.pw);
    }).then((result) => {
      if (result.ok) {
        saveSession(siteId, result.cookie);
        set((state) => ({
          cookies: { ...state.cookies, [siteId]: result.cookie },
          busy: false,
        }));
        return true;
      }
      set({
        busy: false,
        error:
          result.reason === 'bad_credentials'
            ? '아이디 또는 비밀번호가 올바르지 않습니다.'
            : result.reason === 'network'
              ? '네트워크 오류가 발생했습니다.'
              : '로그인에 실패했습니다.',
      });
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
    set((state) => {
      const cookies = { ...state.cookies };
      delete cookies[siteId];
      return { cookies, busy: false };
    });
  },

  forget: (siteId: SiteId) => {
    clearAccount(siteId);
    clearSession(siteId);
    set((state) => {
      const accounts = { ...state.accounts };
      const cookies = { ...state.cookies };
      delete accounts[siteId];
      delete cookies[siteId];
      return { accounts, cookies };
    });
  },
}));
