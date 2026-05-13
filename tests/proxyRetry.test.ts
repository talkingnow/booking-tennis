import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for B5 mitigation: timeout + retry + upstreamError detection.
 * Tests cover gyFetch / pjFetch behaviour when the Edge proxy returns 502.
 */

// ── gyFetch upstreamError detection ────────────────────────────────────────

describe('gyFetch — upstreamError detection', async () => {
  const { gyFetch } = await import('../src/lib/gytennis/proxyClient');

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets upstreamError=true when transport is 502 with no X-GYT-Status', async () => {
    const mockHeaders = new Headers({ 'content-type': 'application/json' });
    const mockRes = {
      status: 502,
      headers: mockHeaders,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    vi.mocked(fetch).mockResolvedValueOnce(mockRes as any);

    const result = await gyFetch('/Login', { method: 'POST' });
    expect(result.upstreamError).toBe(true);
    expect(result.status).toBe(502);
  });

  it('sets upstreamError=false when transport is 200 with X-GYT-Status 303', async () => {
    const mockHeaders = new Headers({
      'X-GYT-Status': '303',
      'X-GYT-Set-Cookie': 'gytssn=abc123; Path=/',
    });
    const mockRes = {
      status: 200,
      headers: mockHeaders,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    vi.mocked(fetch).mockResolvedValueOnce(mockRes as any);

    const result = await gyFetch('/Login', { method: 'POST' });
    expect(result.upstreamError).toBe(false);
    expect(result.status).toBe(303);
  });

  it('sets upstreamError=false for a normal 200 response', async () => {
    const mockHeaders = new Headers({ 'X-GYT-Status': '200' });
    const mockRes = {
      status: 200,
      headers: mockHeaders,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    vi.mocked(fetch).mockResolvedValueOnce(mockRes as any);

    const result = await gyFetch('/myPage', { cookie: 'gytssn=xyz' });
    expect(result.upstreamError).toBe(false);
    expect(result.status).toBe(200);
  });
});

// ── pjFetch upstreamError detection ────────────────────────────────────────

describe('pjFetch — upstreamError detection', async () => {
  const { pjFetch } = await import('../src/lib/pjtennis/proxyClient');

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets upstreamError=true when transport is 502 with no X-PJ-Status', async () => {
    const mockHeaders = new Headers({ 'content-type': 'application/json' });
    const mockRes = {
      status: 502,
      headers: mockHeaders,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    vi.mocked(fetch).mockResolvedValueOnce(mockRes as any);

    const result = await pjFetch('/Login', { method: 'POST' });
    expect(result.upstreamError).toBe(true);
  });

  it('sets upstreamError=false for normal pj 200 response', async () => {
    const mockHeaders = new Headers({ 'X-PJ-Status': '200' });
    const mockRes = {
      status: 200,
      headers: mockHeaders,
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    vi.mocked(fetch).mockResolvedValueOnce(mockRes as any);

    const result = await pjFetch('/myPage', { cookie: 'pjtssn=abc' });
    expect(result.upstreamError).toBe(false);
    expect(result.status).toBe(200);
  });
});

// ── gytennis auth — upstream_unreachable login reason ──────────────────────

describe('gytennis auth — login upstream_unreachable', async () => {
  const gyAuth = await import('../src/lib/gytennis/auth');

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns upstream_unreachable when Edge proxy returns 502', async () => {
    const mockHeaders = new Headers({ 'content-type': 'application/json' });
    vi.mocked(fetch).mockResolvedValue({
      status: 502,
      headers: mockHeaders,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as any);

    const result = await gyAuth.login('user', 'pass');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('upstream_unreachable');
    }
  });
});

// ── gytennis auth — checkSession distinguishes unknown from expired ─────────

describe('gytennis auth — checkSession', async () => {
  const gyAuth = await import('../src/lib/gytennis/auth');

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns unknown when upstream 502', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 502,
      headers: new Headers({ 'content-type': 'application/json' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as any);

    const result = await gyAuth.checkSession('gytssn=xyz');
    expect(result).toBe('unknown');
  });

  it('returns expired when myPage redirects 302', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      headers: new Headers({ 'X-GYT-Status': '302' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as any);

    const result = await gyAuth.checkSession('gytssn=xyz');
    expect(result).toBe('expired');
  });

  it('returns valid when myPage returns 200', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      headers: new Headers({ 'X-GYT-Status': '200' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as any);

    const result = await gyAuth.checkSession('gytssn=xyz');
    expect(result).toBe('valid');
  });
});
