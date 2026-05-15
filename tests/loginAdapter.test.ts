import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/gytennis/proxyClient', () => ({
  gyFetch: vi.fn(),
  extractGytssn: vi.fn((cookies: string[]) => {
    for (const sc of cookies) {
      const m = sc.match(/(?:^|;\s*)gytssn=([^;]+)/i);
      if (m) return `gytssn=${m[1]}`;
    }
    return null;
  }),
}));
vi.mock('../src/lib/pjtennis/proxyClient', () => ({
  pjFetch: vi.fn(),
  extractPjSession: vi.fn((cookies: string[]) => {
    for (const sc of cookies) {
      const m = sc.match(/(?:^|;\s*)pjtssn=([^;]+)/i);
      if (m) return `pjtssn=${m[1]}`;
    }
    return null;
  }),
}));
vi.mock('../src/components/DebugPanel', () => ({ debugLog: vi.fn() }));

import { login as gyLogin } from '../src/lib/gytennis/auth';
import { login as pjLogin } from '../src/lib/pjtennis/auth';
import { gyFetch } from '../src/lib/gytennis/proxyClient';
import { pjFetch } from '../src/lib/pjtennis/proxyClient';

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('gytennis login — 303+Location:/Login false-positive guard', () => {
  it('rejects 303 with Location → /Login as bad_credentials', async () => {
    vi.mocked(gyFetch).mockResolvedValue({
      status: 303,
      location: 'https://www.gytennis.or.kr/Login',
      setCookies: ['gytssn=guestabc; Max-Age=7200'],
      headers: new Headers(), upstreamError: false,
      text: async () => '', bytes: async () => new ArrayBuffer(0),
    });
    const r = await gyLogin('wrong', 'wrong');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_credentials');
  });

  it('accepts 303 with Location → / as success', async () => {
    vi.mocked(gyFetch).mockResolvedValue({
      status: 303,
      location: 'https://www.gytennis.or.kr/',
      setCookies: ['gytssn=authcookie; Max-Age=7200'],
      headers: new Headers(), upstreamError: false,
      text: async () => '', bytes: async () => new ArrayBuffer(0),
    });
    const r = await gyLogin('right', 'right');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cookie).toBe('gytssn=authcookie');
  });

  it('rejects 200 (legacy failure path)', async () => {
    vi.mocked(gyFetch).mockResolvedValue({
      status: 200, location: null, setCookies: [],
      headers: new Headers(), upstreamError: false,
      text: async () => '', bytes: async () => new ArrayBuffer(0),
    });
    const r = await gyLogin('x', 'x');
    expect(r.ok).toBe(false);
  });
});

describe('pjtennis login — 303+Location:/Login false-positive guard', () => {
  it('rejects 303 with Location → /Login as bad_credentials', async () => {
    vi.mocked(pjFetch).mockResolvedValue({
      status: 303,
      location: 'https://www.pjtennis.or.kr/Login',
      setCookies: ['pjtssn=guestxyz; Max-Age=7200'],
      headers: new Headers(), upstreamError: false,
      text: async () => '', bytes: async () => new ArrayBuffer(0),
    });
    const r = await pjLogin('wrong', 'wrong');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_credentials');
  });

  it('accepts 303 with Location → / as success', async () => {
    vi.mocked(pjFetch).mockResolvedValue({
      status: 303,
      location: 'https://www.pjtennis.or.kr/',
      setCookies: ['pjtssn=authpjcookie; Max-Age=7200'],
      headers: new Headers(), upstreamError: false,
      text: async () => '', bytes: async () => new ArrayBuffer(0),
    });
    const r = await pjLogin('right', 'right');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cookie).toBe('pjtssn=authpjcookie');
  });
});
