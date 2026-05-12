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

  it('classifies slots into available/reserved/blocked', () => {
    const slots = parseSlots(html);
    const buckets = { available: 0, reserved: 0, blocked: 0 };
    slots.forEach((s) => buckets[s.status]++);
    // From recon: 15 available, 8 reserved, 9 blocked
    expect(buckets.available).toBe(15);
    expect(buckets.reserved).toBe(8);
    expect(buckets.blocked).toBe(9);
  });

  it('extracts date/courtId/courtNo/hour from raw value', () => {
    const slots = parseSlots(html);
    const s = slots.find((x) => x.courtNo === 1 && x.hour === 14);
    expect(s).toBeDefined();
    expect(s!.date).toBe('2026-05-12');
    expect(s!.courtId).toBe(1);
    expect(s!.raw).toBe('2026-05-12|1|1|14|0');
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
