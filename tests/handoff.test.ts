import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { isMobile, toMobileAction, isStandalonePwa, openKcpPayment } from '../src/lib/payment/handoff';

// Helper: intercept Blob constructor to capture HTML content synchronously
function captureBlobHtml(fn: () => Promise<unknown>): Promise<string> {
  return new Promise((resolve) => {
    const OriginalBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class MockBlob extends OriginalBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        if (typeof parts[0] === 'string') resolve(parts[0] as string);
      }
    });
    fn().catch(() => {});
  });
}

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

  it('m_redirect_url 에 order_id 와 site 모두 포함됨', async () => {
    const html = await captureBlobHtml(() =>
      openKcpPayment(
        { action: 'https://spay.kcp.co.kr/kcpPaypop.do', fields: { site_cd: 'A1234', ordr_idxx: 'ORDER004' } },
        { siteId: 'gy' },
      ),
    );
    expect(html).toContain('order_id=ORDER004');
    expect(html).toContain('site=gy');
    expect(html).toContain('/api/kcp-return');
  });

  it('redirect 계열 필드(Ret_URL / callback_url 등) strip 확인', async () => {
    const html = await captureBlobHtml(() =>
      openKcpPayment({
        action: 'https://spay.kcp.co.kr/kcpPaypop.do',
        fields: {
          site_cd: 'A1234',
          ordr_idxx: 'ORDER005',
          Ret_URL: 'https://www.gytennis.or.kr/ret',
          callback_url: 'https://www.gytennis.or.kr/cb',
          m_redirect_url: 'https://www.gytennis.or.kr/MUST_BE_GONE',
        },
      }),
    );
    expect(html).not.toContain('gytennis.or.kr');
    expect(html).toContain('/api/kcp-return');
  });

  it('pay_method 미입력 시 기본값 100000000000 폴백', async () => {
    const html = await captureBlobHtml(() =>
      openKcpPayment({
        action: 'https://spay.kcp.co.kr/kcpPaypop.do',
        fields: { site_cd: 'Z0001', ordr_idxx: 'ORD-PM' },
      }),
    );
    expect(html).toContain('name="pay_method"');
    expect(html).toContain('value="100000000000"');
  });
});

describe('openKcpPayment PC — m_redirect_url 미주입 + features 유지 (회귀)', () => {
  let openedFeatures: string | undefined;

  beforeEach(() => {
    openedFeatures = undefined;
    // Desktop UA
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      maxTouchPoints: 0,
    });
    vi.stubGlobal('location', { origin: 'https://booking.example.com' });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:pc-mock-url'),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal('window', {
      navigator: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        maxTouchPoints: 0,
      },
      open: vi.fn((_url: string, _target: string, features?: string) => {
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

  it('PC 팝업에 width/height features 인자 포함', async () => {
    await openKcpPayment({
      action: 'https://spay.kcp.co.kr/kcpPaypop.do',
      fields: { site_cd: 'A1234', ordr_idxx: 'PC001' },
    });
    expect(openedFeatures).toContain('width=720');
    expect(openedFeatures).toContain('height=820');
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
