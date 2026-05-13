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

describe('openKcpPayment mobile — redirect field 처리', () => {
  let capturedForm: HTMLFormElement | null = null;

  beforeEach(() => {
    capturedForm = null;
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
    });
    vi.stubGlobal('location', { origin: 'https://booking.example.com' });
    // Intercept form.submit to capture the form without navigating
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function(this: HTMLFormElement) {
      capturedForm = this.cloneNode(true) as HTMLFormElement;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.querySelectorAll('form').forEach(f => f.remove());
  });

  it('gytennis m_redirect_url 필드를 제거하고 우리 URL만 포함', () => {
    openKcpPayment({
      action: 'https://spay.kcp.co.kr/kcpPaypop.do',
      fields: {
        site_cd: 'A1234',
        ordr_idxx: 'ORDER001',
        good_name: '테니스장 예약',
        m_redirect_url: 'https://www.gytennis.or.kr/ordrErr',
        Ret_URL: 'https://www.gytennis.or.kr/ret',
        ret_url: 'https://www.gytennis.or.kr/ret2',
      },
    });

    expect(capturedForm).not.toBeNull();
    const form = capturedForm!;
    const names = Array.from(form.querySelectorAll('input[type=hidden]')).map(i => (i as HTMLInputElement).name);

    expect(names).toContain('m_redirect_url');
    expect(names).not.toContain('Ret_URL');
    expect(names).not.toContain('ret_url');

    const redirectInput = form.querySelector('input[name="m_redirect_url"]') as HTMLInputElement;
    expect(redirectInput.value).toContain('booking.example.com');
    expect(redirectInput.value).not.toContain('gytennis');
    expect(redirectInput.value).toContain('ORDER001');

    expect(names).toContain('site_cd');
    expect(names).toContain('good_name');
  });

  it('callback_url / noti_url / KCPRedirectURL / RETURN_URL 모두 제거', () => {
    openKcpPayment({
      action: '/kcpPaypop.do',
      fields: {
        site_cd: 'B9999',
        callback_url: 'https://www.gytennis.or.kr/cb',
        noti_url: 'https://www.gytennis.or.kr/noti',
        KCPRedirectURL: 'https://www.gytennis.or.kr/kcp-ret',
        RETURN_URL: 'https://www.gytennis.or.kr/return',
      },
    });

    expect(capturedForm).not.toBeNull();
    const form = capturedForm!;
    const names = Array.from(form.querySelectorAll('input[type=hidden]')).map(i => (i as HTMLInputElement).name);

    expect(names).not.toContain('callback_url');
    expect(names).not.toContain('noti_url');
    expect(names).not.toContain('KCPRedirectURL');
    expect(names).not.toContain('RETURN_URL');
    expect(names).toContain('m_redirect_url');
    expect(names).toContain('site_cd');
  });
});

describe('openKcpPayment mobile — 확장 REDIRECT_FIELDS strip (A1)', () => {
  let capturedForm: HTMLFormElement | null = null;

  beforeEach(() => {
    capturedForm = null;
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
    });
    vi.stubGlobal('location', { origin: 'https://booking.example.com' });
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function(this: HTMLFormElement) {
      capturedForm = this.cloneNode(true) as HTMLFormElement;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.querySelectorAll('form').forEach(f => f.remove());
  });

  it('확장 redirect 변형 필드 모두 제거 (returnUrl, SuccessUrl, RedirectURL 등)', () => {
    const extendedFields: Record<string, string> = {
      site_cd: 'X0001',
      ordr_idxx: 'ORDER-EXT',
      returnUrl: 'https://www.gytennis.or.kr/r1',
      ReturnUrl: 'https://www.gytennis.or.kr/r2',
      retUrl: 'https://www.gytennis.or.kr/r3',
      complete_url: 'https://www.gytennis.or.kr/c1',
      CompleteUrl: 'https://www.gytennis.or.kr/c2',
      success_url: 'https://www.gytennis.or.kr/s1',
      SuccessUrl: 'https://www.gytennis.or.kr/s2',
      fail_url: 'https://www.gytennis.or.kr/f1',
      FailUrl: 'https://www.gytennis.or.kr/f2',
      m_signal_url: 'https://www.gytennis.or.kr/sig',
      notice_url: 'https://www.gytennis.or.kr/notice',
      NoticeUrl: 'https://www.gytennis.or.kr/Notice',
      redirect_url: 'https://www.gytennis.or.kr/redir',
      RedirectURL: 'https://www.gytennis.or.kr/RedirURL',
    };
    openKcpPayment({ action: 'https://spay.kcp.co.kr/pay.do', fields: extendedFields });
    expect(capturedForm).not.toBeNull();
    const names = Array.from(capturedForm!.querySelectorAll('input[type=hidden]')).map(i => (i as HTMLInputElement).name);
    const stripped = [
      'returnUrl','ReturnUrl','retUrl','complete_url','CompleteUrl',
      'success_url','SuccessUrl','fail_url','FailUrl',
      'm_signal_url','notice_url','NoticeUrl','redirect_url','RedirectURL',
    ];
    for (const field of stripped) {
      expect(names, `"${field}" should be stripped`).not.toContain(field);
    }
    // Our m_redirect_url is injected
    expect(names).toContain('m_redirect_url');
    const redir = capturedForm!.querySelector('input[name="m_redirect_url"]') as HTMLInputElement;
    expect(redir.value).toContain('/payment-result');
    expect(redir.value).toContain('ORDER-EXT');
  });

  it('m_redirect_url 단일 값으로 덮어쓰기 — 원본 gytennis URL 없음', () => {
    openKcpPayment({
      action: 'https://spay.kcp.co.kr/pay.do',
      fields: {
        site_cd: 'Y0001',
        ordr_idxx: 'ORD-OVER',
        m_redirect_url: 'https://www.gytennis.or.kr/MUST_BE_GONE',
      },
    });
    expect(capturedForm).not.toBeNull();
    const redirectInputs = Array.from(capturedForm!.querySelectorAll('input[name="m_redirect_url"]')) as HTMLInputElement[];
    expect(redirectInputs).toHaveLength(1);
    expect(redirectInputs[0].value).not.toContain('gytennis');
    expect(redirectInputs[0].value).toContain('payment-result');
  });

  it('pay_method 미입력 시 기본값 100000000000 폴백 유지', () => {
    openKcpPayment({
      action: 'https://spay.kcp.co.kr/pay.do',
      fields: { site_cd: 'Z0001', ordr_idxx: 'ORD-PM' },
    });
    expect(capturedForm).not.toBeNull();
    const pm = capturedForm!.querySelector('input[name="pay_method"]') as HTMLInputElement | null;
    expect(pm?.value).toBe('100000000000');
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
