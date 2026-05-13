import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSlots, groupByCourtNo } from '../src/lib/parsers/slotParser';
import { parseCalendar, parseCourtMeta, parseFormHints } from '../src/lib/parsers/metaParser';
import { extractOrderId, parseKcpForm } from '../src/lib/parsers/kcpParser';

const fix = (name: string) =>
  readFileSync(resolve(__dirname, 'fixtures', name), 'utf8');

describe('slotParser', () => {
  const html = fix('daily_1.html');

  it('parses 32 slots from a real /daily/1 page', () => {
    const slots = parseSlots(html);
    expect(slots).toHaveLength(32);
  });

  it('classifies slots: isvkrr=available, ctooltip-trigger=reserved, disabled=blocked', () => {
    const slots = parseSlots(html);
    const buckets = { available: 0, reserved: 0, blocked: 0, pending: 0 };
    slots.forEach((s) => buckets[s.status]++);
    // Live gytennis verified (2026-05-12 fixture daily/1):
    //   7 cells have <input name="isvkrr[]"> alone → available
    //   23 cells have ctooltip-trigger (15 with "0|" + 8 with "1|") → reserved
    //   2 cells have yxjorg[disabled] → blocked
    expect(buckets.available).toBe(7);
    expect(buckets.reserved).toBe(23);
    expect(buckets.blocked).toBe(2);
  });

  it('extracts date/courtId/displayed courtNo/hour from header + raw value', () => {
    const slots = parseSlots(html);
    const s = slots.find((x) => x.courtNo === 1 && x.hour === 14);
    expect(s).toBeDefined();
    expect(s!.date).toBe('2026-05-12');
    expect(s!.courtId).toBe(1);
    expect(s!.internalCourtId).toBe(1);
    expect(s!.raw).toBe('2026-05-12|1|1|14|0');
  });

  it('uses displayed court number from header (daily_4: 9~12, not internal 13~16)', () => {
    const html4 = fix('daily_4.html');
    const slots = parseSlots(html4);
    const displayedNumbers = Array.from(new Set(slots.map((s) => s.courtNo))).sort((a, b) => a - b);
    const internals = Array.from(new Set(slots.map((s) => s.internalCourtId))).sort((a, b) => a - b);
    expect(displayedNumbers).toEqual([9, 10, 11, 12]);
    expect(internals).toEqual([13, 14, 15, 16]);
  });

  it('classifies isvkrr-present cells as AVAILABLE (gytennis renders them as pickable)', () => {
    const slots = parseSlots(html);
    const available = slots.filter((s) => s.status === 'available');
    expect(available.length).toBe(7);
  });

  it('returns [] for non-daily HTML', () => {
    expect(parseSlots('<html><body>nope</body></html>')).toEqual([]);
  });

  it('groups by courtNo and sorts by hour', () => {
    const slots = parseSlots(html);
    const grouped = groupByCourtNo(slots);
    expect(grouped.size).toBeGreaterThan(0);
    for (const [, arr] of grouped) {
      for (let i = 1; i < arr.length; i++) {
        expect(arr[i].hour).toBeGreaterThanOrEqual(arr[i - 1].hour);
      }
    }
  });
});

describe('metaParser', () => {
  const html = fix('daily_1.html');

  it('parses court meta (data-sot/data-soc/data-grp)', () => {
    const meta = parseCourtMeta(html, 1);
    expect(meta.id).toBe(1);
    expect(meta.dailyLimit).toBe(2);
    expect(meta.perCourtLimit).toBe(1);
  });

  it('falls back when .gtitle is absent', () => {
    const meta = parseCourtMeta('<html></html>', 7);
    expect(meta.id).toBe(7);
    expect(meta.dailyLimit).toBe(0);
  });

  it('parses 21-day calendar (ensdat)', () => {
    const cal = parseCalendar(html);
    expect(cal.length).toBeGreaterThanOrEqual(20);
    const first = cal[0];
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof first.reserved).toBe('number');
    expect(typeof first.totalCnt).toBe('number');
  });

  it('parses form hints (cvalue/cdate/submitPath)', () => {
    const hints = parseFormHints(html);
    expect(hints.cvalue).toBe(1);
    expect(hints.cdate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(hints.submitPath).toBe('rsvConfirm');
  });
});

describe('metaParser — daily_4 (indoor)', () => {
  const html = fix('daily_4.html');
  it('handles different court complex', () => {
    const meta = parseCourtMeta(html, 4);
    expect(meta.id).toBe(4);
    expect(meta.dailyLimit).toBeGreaterThan(0);
  });
});

describe('slotParser — PJ scheme (pj_daily9.html)', () => {
  const html = fix('pj_daily9.html');

  it('detects PJ scheme and returns non-empty slots', () => {
    const slots = parseSlots(html);
    expect(slots.length).toBeGreaterThan(0);
  });

  it('classifies blocked cell (rjelnu disabled)', () => {
    const slots = parseSlots(html);
    const blocked = slots.filter((s) => s.status === 'blocked');
    expect(blocked.length).toBeGreaterThanOrEqual(1);
    expect(blocked[0].hour).toBe(7);
  });

  it('classifies reserved cell (fa-user-clock icon)', () => {
    const slots = parseSlots(html);
    const reserved = slots.filter((s) => s.status === 'reserved');
    expect(reserved.length).toBeGreaterThanOrEqual(2);
    const hours = reserved.map((s) => s.hour);
    expect(hours).toContain(8);
  });

  it('classifies available cell (edhtqe present, no icon)', () => {
    const slots = parseSlots(html);
    const available = slots.filter((s) => s.status === 'available');
    expect(available.length).toBeGreaterThanOrEqual(1);
    expect(available[0].hour).toBe(9);
    expect(available[0].isvkrrRaw).toContain('9|35|9|3000');
  });

  it('extracts correct courtId=9 and courtNo=1 from PJ fixture', () => {
    const slots = parseSlots(html);
    expect(slots.every((s) => s.courtId === 9)).toBe(true);
    expect(slots.every((s) => s.courtNo === 1)).toBe(true);
  });
});

describe('COURTS_PJ mapping', () => {
  it('maps id=9 to 월롱 (was 통일 before fix)', async () => {
    const { COURTS_PJ } = await import('../src/lib/courts');
    const c = COURTS_PJ.find((x) => x.id === 9);
    expect(c?.name).toBe('월롱');
  });

  it('maps id=2 to 하지석동 (was 운정1(가온A) before fix)', async () => {
    const { COURTS_PJ } = await import('../src/lib/courts');
    const c = COURTS_PJ.find((x) => x.id === 2);
    expect(c?.name).toBe('하지석동');
  });

  it('maps id=12 to 공설(파주스타디움) (was 금촌 before fix)', async () => {
    const { COURTS_PJ } = await import('../src/lib/courts');
    const c = COURTS_PJ.find((x) => x.id === 12);
    expect(c?.name).toBe('공설(파주스타디움)');
  });
});

describe('kcpParser', () => {
  it('returns null for non-payment HTML', () => {
    expect(parseKcpForm('<html><body><p>nope</p></body></html>')).toBeNull();
    expect(extractOrderId('<html></html>')).toBeNull();
  });

  it('extracts order id from a synthetic rsvConfirm response', () => {
    const html = `
      <form action="https://spay.kcp.co.kr/kcpPaypop.do?encType=" method="post">
        <input type="hidden" name="ordr_idxx" value="GYP17785423972C18DC21" />
        <input type="hidden" name="site_cd" value="AL4CM" />
        <input type="hidden" name="good_mny" value="8000" />
      </form>
    `;
    expect(extractOrderId(html)).toBe('GYP17785423972C18DC21');
    const kcp = parseKcpForm(html);
    expect(kcp).not.toBeNull();
    expect(kcp!.action).toContain('kcp');
    expect(kcp!.fields.ordr_idxx).toBe('GYP17785423972C18DC21');
    expect(kcp!.fields.site_cd).toBe('AL4CM');
    expect(kcp!.fields.good_mny).toBe('8000');
  });
});
