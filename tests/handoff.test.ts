import { describe, it, expect, vi, afterEach } from 'vitest';
import { isMobile, toMobileAction, isStandalonePwa } from '../src/lib/payment/handoff';

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
