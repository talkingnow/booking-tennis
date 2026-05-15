import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for authStore.validateAndLogin — boot-time session check logic.
 *
 * We mock the site registry so tests don't hit the network.
 */

vi.mock('../src/lib/sites/registry', () => ({
  isRegistered: vi.fn(() => true),
  getSite: vi.fn(),
  registerSite: vi.fn(),
}));

import { getSite } from '../src/lib/sites/registry';
import { useAuthStore } from '../src/stores/authStore';

import type { LoginResult } from '../src/lib/gytennis/types';

function makeAdapter(checkSessionResult: 'valid' | 'expired' | 'unknown') {
  return {
    checkSession: vi.fn(async () => checkSessionResult),
    login: vi.fn(async (): Promise<LoginResult> => ({ ok: false, reason: 'bad_credentials' })),
    isSessionValid: vi.fn(async () => checkSessionResult === 'valid'),
    logout: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  // Reset store to a clean state before each test
  useAuthStore.setState({
    accounts: {},
    cookies: {},
    busy: false,
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().stopKeepAlive();
});

describe('validateAndLogin', () => {
  it('returns false silently when no cookie and no account', async () => {
    const result = await useAuthStore.getState().validateAndLogin('gy');
    expect(result).toBe(false);
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('calls doLogin when cookie is missing but account exists', async () => {
    // Seed an account but no cookie
    useAuthStore.setState({
      accounts: { gy: { id: 'user1', pw: 'pw1', remember: true, savedAt: Date.now() } },
      cookies: {},
    });

    const adapter = makeAdapter('expired');
    adapter.login = vi.fn(async (): Promise<LoginResult> => ({ ok: true, cookie: 'gytssn=abc' }));
    vi.mocked(getSite).mockReturnValue(adapter as any);

    // Stub fetch for the login call inside the adapter
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'X-GYT-Status': '303', 'X-GYT-Set-Cookie': 'gytssn=abc; Path=/' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    const result = await useAuthStore.getState().validateAndLogin('gy');
    expect(result).toBe(true);
    vi.unstubAllGlobals();
  });

  it('returns true without re-login when checkSession=valid', async () => {
    useAuthStore.setState({
      accounts: { gy: { id: 'u', pw: 'p', remember: true, savedAt: Date.now() } },
      cookies: { gy: 'gytssn=live' },
    });

    const adapter = makeAdapter('valid');
    vi.mocked(getSite).mockReturnValue(adapter as any);

    const result = await useAuthStore.getState().validateAndLogin('gy');
    expect(result).toBe(true);
    expect(adapter.checkSession).toHaveBeenCalledWith('gytssn=live');
    // doLogin should NOT have been called
    expect(adapter.login).not.toHaveBeenCalled();
  });

  it('returns false without error when checkSession=unknown (502)', async () => {
    useAuthStore.setState({
      accounts: { gy: { id: 'u', pw: 'p', remember: true, savedAt: Date.now() } },
      cookies: { gy: 'gytssn=old' },
    });

    const adapter = makeAdapter('unknown');
    vi.mocked(getSite).mockReturnValue(adapter as any);

    const result = await useAuthStore.getState().validateAndLogin('gy');
    expect(result).toBe(false);
    // Must NOT trigger login or set error — 502 is not an expiry
    expect(adapter.login).not.toHaveBeenCalled();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('clears stale cookie and returns false when checkSession=expired with no account', async () => {
    useAuthStore.setState({
      accounts: {},
      cookies: { gy: 'gytssn=stale' },
    });

    const adapter = makeAdapter('expired');
    vi.mocked(getSite).mockReturnValue(adapter as any);

    const result = await useAuthStore.getState().validateAndLogin('gy');
    expect(result).toBe(false);
    expect(useAuthStore.getState().cookies.gy).toBeUndefined();
  });

  // BUG-7 회귀: expired + no account → meta.lastResult must be 'no_account', NOT 'expired'
  // (LoginBadge의 'expired' 분기는 재시도 버튼을 노출하나, account 없으면 재시도 해도 'no_account'가 됨)
  it('BUG-7: sets meta.lastResult to no_account (not expired) when cookie expired and no account', async () => {
    useAuthStore.setState({
      accounts: {},
      cookies: { gy: 'gytssn=stale' },
    });

    const adapter = makeAdapter('expired');
    vi.mocked(getSite).mockReturnValue(adapter as any);

    await useAuthStore.getState().validateAndLogin('gy');
    const meta = useAuthStore.getState().meta.gy;
    expect(meta?.lastResult).toBe('no_account');
  });

  it('re-logins when checkSession=expired and account exists', async () => {
    useAuthStore.setState({
      accounts: { pj: { id: 'pjuser', pw: 'pjpw', remember: true, savedAt: Date.now() } },
      cookies: { pj: 'pjtssn=old' },
    });

    const adapter = makeAdapter('expired');
    adapter.login = vi.fn(async (): Promise<LoginResult> => ({ ok: true, cookie: 'pjtssn=fresh' }));
    vi.mocked(getSite).mockReturnValue(adapter as any);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'X-PJ-Status': '303', 'X-PJ-Set-Cookie': 'pjtssn=fresh; Path=/' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    const result = await useAuthStore.getState().validateAndLogin('pj');
    expect(result).toBe(true);
    vi.unstubAllGlobals();
  });
});
