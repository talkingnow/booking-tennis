import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { isMobile, toMobileAction, isStandalonePwa, openKcpPayment } from '../src/lib/payment/handoff';

describe('isMobile(ua)', () => {
  it('iPhone UA → true', () => {
    expect(
      isMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'),
    ).toBe(true);
  });

  it('Android UA → true', () => {
    expect(
      isMobile('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'),
    ).toBe(true);
  });

  it('Mac desktop UA → false', () => {
    expect(
      isMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
    ).toBe(false);
  });

  it('Windows desktop UA → false', () => {
    expect(
      isMobile('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
    ).toBe(false);
  });
});

describe('toMobileAction', () => {
  it('spay.kcp.co.kr 절대 URL → smpay.kcp.co.kr', () => {
    expect(toMobileAction('https://spay.kcp.co.kr/kcpPaypop.do?encType=abc'))
      .toBe('https://smpay.kcp.co.kr/kcpPaypop.do?encType=abc');
  });
  it('smpay 가 이미 모바일이면 변경 없음', () => {
    expect(toMobileAction('https://smpay.kcp.co.kr/kcpPaypop.do?x=1'))
      .toBe('https://smpay.kcp.co.kr/kcpPaypop.do?x=1');
  });
  it('다른 호스트는 통과', () => {
    expect(toMobileAction('https://www.gytennis.or.kr/something'))
      .toBe('https://www.gytennis.or.kr/something');
  });
  it('상대경로는 그대로 반환', () => {
    expect(toMobileAction('/kcpPaypop.do?x=1')).toContain('kcpPaypop.do');
  });
});

describe('openKcpPayment mobile — SDK blob 방식', () => {
  let openedUrl: string | null = null;
  let openedTarget: string | null = null;
  let openedFeatures: string | undefined;

  beforeEach(() => {
    openedUrl = null;
    openedTarget = null;
    openedFeatures = undefined;
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
    });
    vi.stubGlobal('location', { origin: 'https://booking.example.com' });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('window', {
      navigator: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        maxTouchPoints: 5,
      },
      open: vi.fn((url: string, target: string, features?: string) => {
        openedUrl = url;
        openedTarget = target;
        openedFeatures = features;
        return { closed: false };
      }),
      matchMedia: undefined,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('window.open 이 _blank 타겟으로 blob URL 호출됨', async () => {
    await openKcpPayment({
      action: 'https://spay.kcp.co.kr/kcpPaypop.do',
      fields: { site_cd: 'A1234', ordr_idxx: 'ORDER001', good_name: '테니스장' },
    });
    expect(openedUrl).toBe('blob:mock-url');
    expect(openedTarget).toBe('_blank');
  });

  it('모바일 흐름에서 features 인자 없음 (PC 팝업 사이즈 없음)', async () => {
    await openKcpPayment({
      action: 'https://spay.kcp.co.kr/kcpPaypop.do',
      fields: { site_cd: 'A1234', ordr_idxx: 'ORDER002' },
    });
    expect(openedFeatures).toBeUndefined();
  });

  it('반환값은 null (모바일 탭 추적 불가)', async () => {
    const result = await openKcpPayment({
      action: 'https://spay.kcp.co.kr/kcpPaypop.do',
      fields: { site_cd: 'A1234', ordr_idxx: 'ORDER003' },
    });
    expect(result).toBeNull();
  });

  it('siteId 가 m_redirect_url(/api/kcp-return?site=gy) 에 포함되어 blob 생성됨', async () => {
    // Intercept Blob constructor to capture HTML content
    const capturedParts: string[] = [];
    const OriginalBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class MockBlob extends OriginalBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        if (typeof parts[0] === 'string') capturedParts.push(parts[0]);
      }
    });

    await openKcpPayment(
      { action: 'https://spay.kcp.co.kr/kcpPaypop.do', fields: { site_cd: 'A1234', ordr_idxx: 'ORDER004' } },
      { siteId: 'gy' },
    );
    expect(capturedParts.length).toBeGreaterThan(0);
    expect(capturedParts[0]).toContain('/api/kcp-return?site=gy');
  });
});

describe('isStandalonePwa', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('navigator.standalone=true → true', () => {
    vi.stubGlobal('navigator', { standalone: true });
    vi.stubGlobal('window', { navigator: { standalone: true }, matchMedia: undefined });
    expect(isStandalonePwa()).toBe(true);
  });

  it('matchMedia display-mode:standalone → true', () => {
    vi.stubGlobal('window', {
      navigator: {},
      matchMedia: () => ({ matches: true }),
    });
    expect(isStandalonePwa()).toBe(true);
  });

  it('navigator.standalone=false + matchMedia=false → false', () => {
    vi.stubGlobal('window', {
      navigator: { standalone: false },
      matchMedia: () => ({ matches: false }),
    });
    expect(isStandalonePwa()).toBe(false);
  });

  it('window undefined → false', () => {
    vi.stubGlobal('window', undefined);
    expect(isStandalonePwa()).toBe(false);
  });
});
