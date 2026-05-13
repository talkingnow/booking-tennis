import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/gytennis/proxyClient', () => ({ gyFetch: vi.fn() }));
vi.mock('../src/lib/pjtennis/proxyClient', () => ({ pjFetch: vi.fn() }));
vi.mock('../src/lib/parsers/slotParser', () => ({ parseSlots: vi.fn(() => []) }));
vi.mock('../src/lib/parsers/metaParser', () => ({
  parseCourtMeta: vi.fn(() => ({ courtId: 0, courtName: 'mock', date: '2026-05-13' })),
  parseCalendar: vi.fn(() => []),
  parseFormHints: vi.fn(() => ({})),
}));

import { gyFetch } from '../src/lib/gytennis/proxyClient';
import { pjFetch } from '../src/lib/pjtennis/proxyClient';
import { getDailyBatch as gyGetDailyBatch } from '../src/lib/gytennis/slots';
import { getDailyBatch as pjGetDailyBatch } from '../src/lib/pjtennis/slots';

const mockHtml = '<table class="wholeTable"></table>';

function makeOkResponse() {
  return { status: 200, text: async () => mockHtml };
}

describe('getDailyBatch — stagger (GY)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (gyFetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeOkResponse());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('3코트 요청 시 첫 번째는 즉시, 이후 stagger 250ms 간격으로 발사', async () => {
    const callTimes: number[] = [];
    (gyFetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve(makeOkResponse());
    });

    const t0 = Date.now();
    const promise = gyGetDailyBatch([1, 2, 3], 'cookie', undefined, 250);
    await vi.runAllTimersAsync();
    await promise;

    expect(callTimes).toHaveLength(3);
    expect(callTimes[0] - t0).toBe(0);
    expect(callTimes[1] - t0).toBe(250);
    expect(callTimes[2] - t0).toBe(500);
  });

  it('단일 코트는 stagger 없이 즉시 호출', async () => {
    const callTimes: number[] = [];
    (gyFetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve(makeOkResponse());
    });

    const t0 = Date.now();
    const promise = gyGetDailyBatch([1], 'cookie', undefined, 250);
    await vi.runAllTimersAsync();
    await promise;

    expect(callTimes).toHaveLength(1);
    expect(callTimes[0] - t0).toBe(0);
  });

  it('한 코트 실패해도 다른 코트 결과 반환 (allSettled 유지)', async () => {
    let call = 0;
    (gyFetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      call++;
      if (call === 2) return Promise.reject(new Error('502'));
      return Promise.resolve(makeOkResponse());
    });

    const promise = gyGetDailyBatch([1, 2, 3], 'cookie', undefined, 0);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.get(1)).not.toBeNull();
    expect(result.get(2)).toBeNull();
    expect(result.get(3)).not.toBeNull();
  });
});

describe('getDailyBatch — stagger (PJ)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (pjFetch as ReturnType<typeof vi.fn>).mockResolvedValue(makeOkResponse());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('2코트 요청 시 두 번째는 250ms 후 발사', async () => {
    const callTimes: number[] = [];
    (pjFetch as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callTimes.push(Date.now());
      return Promise.resolve(makeOkResponse());
    });

    const t0 = Date.now();
    const promise = pjGetDailyBatch([1, 2], 'cookie', undefined, 250);
    await vi.runAllTimersAsync();
    await promise;

    expect(callTimes).toHaveLength(2);
    expect(callTimes[0] - t0).toBe(0);
    expect(callTimes[1] - t0).toBe(250);
  });
});
