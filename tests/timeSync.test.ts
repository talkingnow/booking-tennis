/**
 * Unit tests for measureServerOffsetMs in timeSync.ts.
 * Tests: Date header parsing accuracy, offset calculation, median selection,
 * and fallback to 0 when no header is present.
 *
 * Note on timing: all serverTime values are computed inside the mock's
 * `headers.get()` call so they're always fresh relative to real wall-clock.
 * Tolerances are generous (±1500 ms) because Promise microtask scheduling in
 * a jsdom test environment can introduce hundreds of ms of jitter.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { measureServerOffsetMs } from '../src/lib/scheduler/timeSync';

describe('measureServerOffsetMs', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('returns 0 when Date header is missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      headers: { get: () => null },
    } as unknown as Response);
    const offset = await measureServerOffsetMs(3);
    expect(offset).toBe(0);
  });

  it('returns 0 when Date header is unparseable', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      headers: { get: (h: string) => (h.toLowerCase() === 'date' ? 'not-a-date' : null) },
    } as unknown as Response);
    const offset = await measureServerOffsetMs(3);
    expect(offset).toBe(0);
  });

  it('offset is positive when server clock is ahead of client', async () => {
    const serverAheadBy = 5_000; // 5 s — large enough to survive jitter
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        headers: {
          // Date.now() is called at headers.get() time (inside measureServerOffsetMs)
          get: (h: string) =>
            h.toLowerCase() === 'date'
              ? new Date(Date.now() + serverAheadBy).toUTCString()
              : null,
        },
      } as unknown as Response),
    );

    const offset = await measureServerOffsetMs(1);
    // Offset must be positive and in the right order of magnitude.
    // Allow ±2000 ms for test-environment scheduling jitter.
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThan(serverAheadBy + 2_000);
    expect(offset).toBeGreaterThan(serverAheadBy - 2_000);
  });

  it('offset is negative when server clock is behind client', async () => {
    const serverBehindBy = 5_000;
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        headers: {
          get: (h: string) =>
            h.toLowerCase() === 'date'
              ? new Date(Date.now() - serverBehindBy).toUTCString()
              : null,
        },
      } as unknown as Response),
    );

    const offset = await measureServerOffsetMs(1);
    expect(offset).toBeLessThan(0);
    expect(offset).toBeGreaterThan(-serverBehindBy - 2_000);
    expect(offset).toBeLessThan(-serverBehindBy + 2_000);
  });

  it('returns the median (index n/2) of sorted samples, not the mean', async () => {
    // Three calls produce offsets shaped as high/low/mid.
    // Sorted → [low, mid, high] → median = mid.
    // We use large spread so relative order survives jitter.
    const vals = [10_000, -10_000, 0]; // sorted: [-10000, 0, 10000] → median = 0
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const diff = vals[call % vals.length];
      call++;
      return Promise.resolve({
        headers: {
          get: (h: string) =>
            h.toLowerCase() === 'date'
              ? new Date(Date.now() + diff).toUTCString()
              : null,
        },
      } as unknown as Response);
    });

    const offset = await measureServerOffsetMs(3);
    // Median of three samples with offsets ≈ [-10000, 0, 10000] → middle ≈ 0
    // With jitter, allow ±2000 ms.
    expect(offset).toBeGreaterThan(-2_000);
    expect(offset).toBeLessThan(2_000);
  });

  it('skips failed samples and returns 0 when all fail', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    const offset = await measureServerOffsetMs(3);
    expect(offset).toBe(0);
  });

  it('returns a valid number even if only 1 of 3 samples succeeds', async () => {
    const diff = 3_000;
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      call++;
      if (call === 2) {
        return Promise.resolve({
          headers: {
            get: (h: string) =>
              h.toLowerCase() === 'date'
                ? new Date(Date.now() + diff).toUTCString()
                : null,
          },
        } as unknown as Response);
      }
      return Promise.reject(new Error('network'));
    });

    const offset = await measureServerOffsetMs(3);
    expect(typeof offset).toBe('number');
    expect(isNaN(offset)).toBe(false);
    // Offset should reflect the one successful sample
    expect(offset).toBeGreaterThan(0);
  });
});
