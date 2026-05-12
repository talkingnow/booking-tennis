/**
 * Tests that submitReservation (after M-C) calls verifyReservation internally
 * and includes `verified: boolean` in the result.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Slot } from '../src/lib/gytennis/types';

// Mock gyFetch before importing the module under test
vi.mock('../src/lib/gytennis/proxyClient', () => ({
  gyFetch: vi.fn(),
}));

import { gyFetch } from '../src/lib/gytennis/proxyClient';
import { submitReservation } from '../src/lib/gytennis/reserve';

const mockFetch = gyFetch as ReturnType<typeof vi.fn>;

const sampleSlot: Slot = {
  date: '2026-05-12',
  courtId: 1,
  courtNo: 1,
  internalCourtId: 1,
  hour: 14,
  priceFlag: 0,
  status: 'available',
  raw: '2026-05-12|1|1|14|0',
  isvkrrRaw: '2026-05-12|1|1|14|8000',
};

const successHtml = `
  <html><body>
  <form action="https://spay.kcp.co.kr/kcpPaypop.do?encType=" method="post">
    <input type="hidden" name="ordr_idxx" value="GYP17785423972C18DC21" />
    <input type="hidden" name="site_cd" value="AL4CM" />
    <input type="hidden" name="good_mny" value="8000" />
  </form>
  </body></html>
`;

describe('submitReservation — verifyReservation integration (M-C)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns verified=true when rsvVf responds 200', async () => {
    // Call 1: POST /rsvConfirm → success with orderId
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: async () => successHtml,
      location: undefined,
    });
    // Call 2: POST /rsvVf → 200 (verified)
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: async () => '',
      location: undefined,
    });

    const result = await submitReservation([sampleSlot], 'test-cookie');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.verified).toBe('boolean');
      expect(result.verified).toBe(true);
    }
    // gyFetch called twice: rsvConfirm + rsvVf
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns verified=false when rsvVf responds with non-200', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: async () => successHtml,
      location: undefined,
    });
    mockFetch.mockResolvedValueOnce({
      status: 500,
      text: async () => '',
      location: undefined,
    });

    const result = await submitReservation([sampleSlot], 'test-cookie');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verified).toBe(false);
    }
  });

  it('does not call rsvVf when rsvConfirm fails (not_logged_in)', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 307,
      text: async () => '',
      location: '/login',
    });

    const result = await submitReservation([sampleSlot], 'test-cookie');

    expect(result.ok).toBe(false);
    // Only one call (rsvConfirm), no rsvVf
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns ok=false for no-slot input without calling gyFetch', async () => {
    const result = await submitReservation([], 'test-cookie');
    expect(result.ok).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
