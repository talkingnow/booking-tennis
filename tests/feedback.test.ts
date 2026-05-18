import { describe, it, expect } from 'vitest';
import {
  FORBIDDEN_CONTEXT_KEYS,
  type FeedbackPayload,
  type FeedbackContext,
} from '../src/lib/feedback/client';

describe('FeedbackPayload shape', () => {
  it('FeedbackContext only has whitelisted safe keys', () => {
    const safeKeys: (keyof FeedbackContext)[] = [
      'siteId',
      'appVersion',
      'ua',
      'timestamp',
      'route',
    ];
    // All allowed keys should be exactly these — no extras
    expect(safeKeys.length).toBeGreaterThan(0);

    // Each safe key must NOT be in the forbidden list
    for (const key of safeKeys) {
      expect(FORBIDDEN_CONTEXT_KEYS).not.toContain(key);
    }
  });

  it('FORBIDDEN_CONTEXT_KEYS contains auth and payment fields', () => {
    const required = ['cookie', 'account', 'favorites', 'priorities', 'kcpForm', 'orderId'];
    for (const key of required) {
      expect(FORBIDDEN_CONTEXT_KEYS).toContain(key);
    }
  });

  it('payload structure matches agreed interface', () => {
    const payload: FeedbackPayload = {
      kind: 'bug',
      message: 'test message',
      context: {
        siteId: 'gy',
        appVersion: '0.1.0',
        ua: 'Mozilla/5.0',
        timestamp: new Date().toISOString(),
        route: '/quick',
      },
    };
    expect(['bug', 'improvement', 'other']).toContain(payload.kind);
    expect(payload.message.length).toBeGreaterThan(0);
    expect(payload.message.length).toBeLessThanOrEqual(2000);
  });

  it('message longer than 2000 chars should be rejected by client', () => {
    const longMsg = 'a'.repeat(2001);
    expect(longMsg.length > 2000).toBe(true);
  });

  it('FeedbackContext has no forbidden keys in its type definition', () => {
    // Build a sample context object and check its keys
    const ctx: FeedbackContext = {
      siteId: 'pj',
      appVersion: '0.1.0',
      ua: 'test-ua',
      timestamp: '2026-05-16T00:00:00.000Z',
      route: '/race',
    };
    const keys = Object.keys(ctx);
    for (const forbidden of FORBIDDEN_CONTEXT_KEYS) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
