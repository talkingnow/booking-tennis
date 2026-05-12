import { create } from 'zustand';
import { login as apiLogin, logout as apiLogout } from '@/lib/gytennis/auth';
import { clearAccount, loadAccount, saveAccount, type StoredAccount } from '@/lib/storage/account';
import { clearSession, loadSession, saveSession } from '@/lib/storage/session';

type AuthState = {
  account: StoredAccount | null;
  cookie: string | null;
  busy: boolean;
  error: string | null;
  hydrate: () => void;
  /**
   * Persist credentials to localStorage and update store.
   * Returns the constructed StoredAccount so the caller can pass it directly
   * to doLogin() without relying on async store propagation.
   */
  saveCredentials: (id: string, pw: string, remember: boolean) => StoredAccount;
  /**
   * Perform gytennis login.
   * If `acc` is provided it is used directly (avoids the race condition where
   * the Zustand state setter hasn't propagated yet).
   * Falls back to the stored account from state when acc is omitted.
   */
  doLogin: (acc?: StoredAccount) => Promise<boolean>;
  doLogout: () => Promise<void>;
  forget: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  account: null,
  cookie: null,
  busy: false,
  error: null,

  hydrate: () => {
    set({ account: loadAccount(), cookie: loadSession() });
  },

  saveCredentials: (id, pw, remember) => {
    const acc: StoredAccount = { id, pw, remember, savedAt: Date.now() };
    if (remember) saveAccount(acc);
    set({ account: acc, error: null });
    return acc;
  },

  doLogin: async (acc?: StoredAccount) => {
    // Prefer the explicitly-passed account (avoids setTimeout race condition).
    const target = acc ?? get().account;
    if (!target) {
      set({ error: '계정 정보가 없습니다.' });
      return false;
    }
    set({ busy: true, error: null });
    const result = await apiLogin(target.id, target.pw);
    if (result.ok) {
      saveSession(result.cookie);
      set({ cookie: result.cookie, busy: false });
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
  },

  doLogout: async () => {
    const cookie = get().cookie;
    set({ busy: true });
    if (cookie) await apiLogout(cookie);
    clearSession();
    set({ cookie: null, busy: false });
  },

  forget: () => {
    clearAccount();
    clearSession();
    set({ account: null, cookie: null });
  },
}));
