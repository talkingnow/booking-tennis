/**
 * auth_audit.test.ts — D1~D9, E1~E3 단위 케이스
 *
 * 대상: authStore.validateAndLogin 분기, selectMeta 참조 안정성,
 *       applyBootAutoLoginPolicy, startKeepAlive 동시성
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/sites/registry', () => ({
  isRegistered: vi.fn(() => true),
  getSite: vi.fn(),
  registerSite: vi.fn(),
}));

import { getSite } from '../src/lib/sites/registry';
import { useAuthStore, selectMeta } from '../src/stores/authStore';
import { applyBootAutoLoginPolicy } from '../src/lib/auth/applyBootAutoLogin';
import type { LoginResult } from '../src/lib/gytennis/types';

function makeAdapter(
  checkSessionResult: 'valid' | 'expired' | 'unknown',
  loginResult: LoginResult = { ok: false, reason: 'bad_credentials' },
) {
  return {
    checkSession: vi.fn(async () => checkSessionResult),
    login: vi.fn(async (): Promise<LoginResult> => loginResult),
    logout: vi.fn(async () => {}),
    isSessionValid: vi.fn(async () => checkSessionResult === 'valid'),
  };
}

beforeEach(() => {
  useAuthStore.setState({
    accounts: {},
    cookies: {},
    busy: false,
    error: null,
    meta: {},
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  useAuthStore.getState().stopKeepAlive();
});

// ─── D 시리즈 — validateAndLogin 분기 ────────────────────────────────────────

describe('D1 — cookie+valid → meta=valid, login 0회', () => {
  it('returns true and sets meta to valid without calling login', async () => {
    useAuthStore.setState({
      accounts: { gy: { id: 'u', pw: 'p', remember: true, savedAt: Date.now() } },
      cookies: { gy: 'gytssn=live' },
    });
    const adapter = makeAdapter('valid');
    vi.mocked(getSite).mockReturnValue(adapter as any);

    const result = await useAuthStore.getState().validateAndLogin('gy');

    expect(result).toBe(true);
    expect(adapter.login).not.toHaveBeenCalled();
    expect(useAuthStore.getState().meta.gy?.lastResult).toBe('valid');
  });
});

describe('D2 — cookie+expired+account → doLogin 호출', () => {
  it('calls login once and sets meta to valid on success', async () => {
    useAuthStore.setState({
      accounts: { gy: { id: 'u', pw: 'p', remember: true, savedAt: Date.now() } },
      cookies: { gy: 'gytssn=old' },
    });
    const adapter = makeAdapter('expired', { ok: true, cookie: 'gytssn=new' });
    vi.mocked(getSite).mockReturnValue(adapter as any);

    vi.useRealTimers(); // login uses Promise chains — real timers needed
    const result = await useAuthStore.getState().validateAndLogin('gy');

    expect(result).toBe(true);
    expect(adapter.login).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().meta.gy?.lastResult).toBe('valid');
    vi.useFakeTimers();
  });
});

describe('D3 — cookie+expired+no account → cookie 비고 meta=no_account (BUG-7 회귀)', () => {
  it('clears cookie and sets meta to no_account', async () => {
    useAuthStore.setState({
      accounts: {},
      cookies: { gy: 'gytssn=stale' },
    });
    const adapter = makeAdapter('expired');
    vi.mocked(getSite).mockReturnValue(adapter as any);

    await useAuthStore.getState().validateAndLogin('gy');

    expect(useAuthStore.getState().cookies.gy).toBeUndefined();
    expect(useAuthStore.getState().meta.gy?.lastResult).toBe('no_account');
  });
});

describe('D4 — cookie+unknown(502) → no-op', () => {
  it('returns false, does not call login, does not set error', async () => {
    useAuthStore.setState({
      accounts: { gy: { id: 'u', pw: 'p', remember: true, savedAt: Date.now() } },
      cookies: { gy: 'gytssn=old' },
    });
    const adapter = makeAdapter('unknown');
    vi.mocked(getSite).mockReturnValue(adapter as any);

    const result = await useAuthStore.getState().validateAndLogin('gy');

    expect(result).toBe(false);
    expect(adapter.login).not.toHaveBeenCalled();
    expect(useAuthStore.getState().error).toBeNull();
  });
});

describe('D5 — no cookie+account → doLogin', () => {
  it('calls doLogin and returns true on success', async () => {
    useAuthStore.setState({
      accounts: { gy: { id: 'u', pw: 'p', remember: true, savedAt: Date.now() } },
      cookies: {},
    });
    const adapter = makeAdapter('expired', { ok: true, cookie: 'gytssn=fresh' });
    vi.mocked(getSite).mockReturnValue(adapter as any);

    vi.useRealTimers();
    const result = await useAuthStore.getState().validateAndLogin('gy');

    expect(result).toBe(true);
    expect(adapter.login).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
  });
});

describe('D6 — no cookie+no account → meta=no_account', () => {
  it('returns false silently and sets meta to no_account', async () => {
    const result = await useAuthStore.getState().validateAndLogin('gy');
    expect(result).toBe(false);
    expect(useAuthStore.getState().meta.gy?.lastResult).toBe('no_account');
  });
});

describe('D7 — selectMeta reference 안정성 (BUG-9 회귀)', () => {
  it('returns the same object reference on 100 consecutive calls with no state change', () => {
    // Pre-set a known meta so we get a non-IDLE_META object too
    useAuthStore.setState({
      meta: { gy: { lastValidatedAt: 1000, lastResult: 'valid' } },
    });
    const first = selectMeta('gy')(useAuthStore.getState());
    for (let i = 0; i < 99; i++) {
      const ref = selectMeta('gy')(useAuthStore.getState());
      expect(Object.is(ref, first)).toBe(true);
    }
  });

  it('IDLE_META reference is stable when siteId has no meta entry', () => {
    const first = selectMeta('gy')(useAuthStore.getState());
    for (let i = 0; i < 99; i++) {
      const ref = selectMeta('gy')(useAuthStore.getState());
      expect(Object.is(ref, first)).toBe(true);
    }
  });
});

describe('D8 — applyBootAutoLoginPolicy ON', () => {
  it('calls validateAndLogin for both sites and startKeepAlive', async () => {
    // Need real timers for promise resolution
    vi.useRealTimers();
    const store = useAuthStore.getState();
    const spyValidate = vi.spyOn(store, 'validateAndLogin');
    const spyKeepAlive = vi.spyOn(store, 'startKeepAlive');
    // Patch getState so the spies are returned
    vi.spyOn(useAuthStore, 'getState').mockReturnValue(store);

    applyBootAutoLoginPolicy(true);

    expect(spyValidate).toHaveBeenCalledWith('gy');
    expect(spyValidate).toHaveBeenCalledWith('pj');
    expect(spyKeepAlive).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    vi.useFakeTimers();
  });
});

describe('D9 — applyBootAutoLoginPolicy OFF', () => {
  it('clears cookies and meta, calls stopKeepAlive', () => {
    useAuthStore.setState({
      cookies: { gy: 'gytssn=live', pj: 'pjtssn=live' },
      meta: {
        gy: { lastValidatedAt: Date.now(), lastResult: 'valid' },
        pj: { lastValidatedAt: Date.now(), lastResult: 'valid' },
      },
    });

    // Spy on stopKeepAlive via the real action reference before calling policy
    const originalStop = useAuthStore.getState().stopKeepAlive;
    let stopCalled = 0;
    const patchedStop = () => { stopCalled++; originalStop(); };
    // Patch the store action by overriding setState-sourced action
    useAuthStore.setState({ stopKeepAlive: patchedStop } as any);

    applyBootAutoLoginPolicy(false);

    expect(Object.keys(useAuthStore.getState().cookies)).toHaveLength(0);
    expect(Object.keys(useAuthStore.getState().meta)).toHaveLength(0);
    expect(stopCalled).toBe(1);

    // Restore
    useAuthStore.setState({ stopKeepAlive: originalStop } as any);
  });
});

// ─── E 시리즈 — 동시성 / keepAlive ───────────────────────────────────────────

describe('E1 — doLogin 5회 연타 → adapter.login 1회 (BUG-8 회귀 가드)', () => {
  it('calls adapter.login only once despite 5 concurrent doLogin calls', async () => {
    vi.useRealTimers();
    useAuthStore.setState({
      accounts: { gy: { id: 'u', pw: 'p', remember: true, savedAt: Date.now() } },
      cookies: {},
    });

    let resolveLogin!: (v: LoginResult) => void;
    const delayedLogin = new Promise<LoginResult>((res) => { resolveLogin = res; });
    const adapter = {
      checkSession: vi.fn(),
      login: vi.fn(() => delayedLogin),
      logout: vi.fn(),
    };
    vi.mocked(getSite).mockReturnValue(adapter as any);

    const { doLogin } = useAuthStore.getState();
    const calls = [
      doLogin('gy'), doLogin('gy'), doLogin('gy'), doLogin('gy'), doLogin('gy'),
    ];
    resolveLogin({ ok: true, cookie: 'gytssn=ok' });
    await Promise.all(calls);

    expect(adapter.login).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
  });
});

describe('E2 — startKeepAlive → 25분 후 validateAndLogin 호출', () => {
  it('triggers validateAndLogin for both sites after 25 minutes', async () => {
    const store = useAuthStore.getState();
    const spyValidate = vi.spyOn(store, 'validateAndLogin').mockResolvedValue(false);
    vi.spyOn(useAuthStore, 'getState').mockReturnValue(store);

    store.startKeepAlive();
    vi.advanceTimersByTime(25 * 60 * 1000);

    // Allow microtask queue to flush
    await Promise.resolve();

    expect(spyValidate).toHaveBeenCalledWith('gy');
    expect(spyValidate).toHaveBeenCalledWith('pj');

    store.stopKeepAlive();
    vi.restoreAllMocks();
  });
});

describe('E3 — startKeepAlive 2회 호출 → 타이머 1개만 유지', () => {
  it('clears previous interval before starting a new one', () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    useAuthStore.getState().startKeepAlive(); // first start
    useAuthStore.getState().startKeepAlive(); // second start — should clear first

    // clearInterval must have been called at least once to prevent double timers
    expect(clearIntervalSpy).toHaveBeenCalled();

    useAuthStore.getState().stopKeepAlive();
    clearIntervalSpy.mockRestore();
  });
});
