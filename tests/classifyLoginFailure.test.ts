import { describe, it, expect } from 'vitest';
import { classifyLoginFailure } from '../src/lib/auth/classifyFailure';

describe('classifyLoginFailure', () => {
  it('빈 본문 → bad_credentials', () => {
    expect(classifyLoginFailure(null)).toBe('bad_credentials');
    expect(classifyLoginFailure('')).toBe('bad_credentials');
  });

  it('일반 로그인 페이지 재렌더 → bad_credentials', () => {
    const html = `<html><body><form><input name="userid"><input name="passwd"></form></body></html>`;
    expect(classifyLoginFailure(html)).toBe('bad_credentials');
  });

  it('"잠시 후 다시" → rate_limited', () => {
    expect(classifyLoginFailure('<p>잠시 후 다시 시도해 주세요.</p>')).toBe('rate_limited');
  });

  it('"너무 많은 시도" → rate_limited', () => {
    expect(classifyLoginFailure('<div>너무 많은 시도가 감지되었습니다.</div>')).toBe('rate_limited');
  });

  it('"Too many requests" → rate_limited', () => {
    expect(classifyLoginFailure('Too Many Requests')).toBe('rate_limited');
  });

  it('"계정이 잠금" → account_locked', () => {
    expect(classifyLoginFailure('<p>계정이 잠금 상태입니다.</p>')).toBe('account_locked');
  });

  it('"이용이 제한" → account_locked', () => {
    expect(classifyLoginFailure('<div>이용이 제한된 계정입니다.</div>')).toBe('account_locked');
  });

  it('"비밀번호 5회 초과" → account_locked', () => {
    expect(classifyLoginFailure('비밀번호 5회 초과로 잠겼습니다.')).toBe('account_locked');
  });

  it('lock 우선순위 — 잠금 + rate-limit 동시 출현 시 account_locked', () => {
    expect(classifyLoginFailure('계정이 차단되었습니다. 잠시 후 다시 시도해 주세요.')).toBe('account_locked');
  });

  it('태그 노이즈가 있어도 텍스트 매칭', () => {
    const html = '<html><body><div class="alert"><strong>너무 많은</strong> 요청입니다</div></body></html>';
    expect(classifyLoginFailure(html)).toBe('rate_limited');
  });
});
