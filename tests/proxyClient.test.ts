import { describe, it, expect } from 'vitest';
import { extractGytssn } from '../src/lib/gytennis/proxyClient';

describe('extractGytssn', () => {
  it('extracts gytssn from a single Set-Cookie line', () => {
    const result = extractGytssn([
      'gytssn=abc123; Path=/; Max-Age=7200; Secure; HttpOnly; SameSite=None',
    ]);
    expect(result).toBe('gytssn=abc123');
  });

  it('returns null when no gytssn cookie present', () => {
    const result = extractGytssn(['other=xyz; Path=/']);
    expect(result).toBeNull();
  });

  it('finds gytssn among multiple Set-Cookie entries', () => {
    const result = extractGytssn([
      'csrf=foo; Path=/',
      'gytssn=mysession; Path=/; HttpOnly',
      'theme=dark',
    ]);
    expect(result).toBe('gytssn=mysession');
  });

  it('handles empty array', () => {
    expect(extractGytssn([])).toBeNull();
  });
});
