import { describe, it, expect } from 'vitest';
import { GY_POLICY, PJ_POLICY } from '../src/lib/sites/types';
import { isAdjacentSlot } from '../src/routes/Quick';
import { migratePriorityEntry } from '../src/routes/Race';
import type { Slot } from '../src/lib/gytennis/types';

function makeSlot(courtId: number, courtNo: number, hour: number, status: Slot['status'] = 'available'): Slot {
  return {
    courtId,
    courtNo,
    internalCourtId: courtNo,
    hour,
    status,
    date: '2026-06-01',
    priceFlag: 0,
    raw: `${courtId}-${courtNo}-${hour}`,
    isvkrrRaw: '',
  };
}

// ── Policy assertions ────────────────────────────────────────────────────────

describe('SitePolicy.maxConsecutiveSlots', () => {
  it('GY_POLICY.maxConsecutiveSlots === 1', () => {
    expect(GY_POLICY.maxConsecutiveSlots).toBe(1);
  });

  it('PJ_POLICY.maxConsecutiveSlots === 2', () => {
    expect(PJ_POLICY.maxConsecutiveSlots).toBe(2);
  });
});

// ── isAdjacentSlot ────────────────────────────────────────────────────────────

describe('isAdjacentSlot', () => {
  it('same court, step=1, adjacent hours → true', () => {
    const a = makeSlot(1, 1, 10);
    const b = makeSlot(1, 1, 11);
    expect(isAdjacentSlot(a, b, 1)).toBe(true);
    expect(isAdjacentSlot(b, a, 1)).toBe(true);
  });

  it('same court, step=2, 2-apart → true for gy 2h blocks', () => {
    const a = makeSlot(1, 1, 10);
    const b = makeSlot(1, 1, 12);
    expect(isAdjacentSlot(a, b, 2)).toBe(true);
  });

  it('same court, gap=2 with step=1 → false', () => {
    const a = makeSlot(1, 1, 10);
    const b = makeSlot(1, 1, 12);
    expect(isAdjacentSlot(a, b, 1)).toBe(false);
  });

  it('different courtNo → false', () => {
    const a = makeSlot(1, 1, 10);
    const b = makeSlot(1, 2, 11);
    expect(isAdjacentSlot(a, b, 1)).toBe(false);
  });

  it('different courtId → false', () => {
    const a = makeSlot(1, 1, 10);
    const b = makeSlot(2, 1, 11);
    expect(isAdjacentSlot(a, b, 1)).toBe(false);
  });

  it('same slot → gap 0 with step=1 → false', () => {
    const a = makeSlot(1, 1, 10);
    expect(isAdjacentSlot(a, a, 1)).toBe(false);
  });
});

// ── PriorityEntry migration ───────────────────────────────────────────────────

describe('migratePriorityEntry', () => {
  it('legacy {hour: 14} → {hours: [14]}', () => {
    const result = migratePriorityEntry({ id: 'a', courtId: 1, courtNo: 1, date: '2026-06-01', hour: 14 });
    expect(result).not.toBeNull();
    expect(result!.hours).toEqual([14]);
    expect((result as any).hour).toBeUndefined();
  });

  it('already-migrated entry with hours[] passes through unchanged', () => {
    const result = migratePriorityEntry({ id: 'b', courtId: 2, courtNo: 3, date: '2026-06-15', hours: [10, 11] });
    expect(result).not.toBeNull();
    expect(result!.hours).toEqual([10, 11]);
  });

  it('null input → null', () => {
    expect(migratePriorityEntry(null)).toBeNull();
  });

  it('entry missing required fields → null', () => {
    expect(migratePriorityEntry({ id: 'x', courtId: 1 })).toBeNull();
  });

  it('entry with neither hour nor hours → null', () => {
    expect(migratePriorityEntry({ id: 'z', courtId: 1, courtNo: 1, date: '2026-06-01' })).toBeNull();
  });
});

// ── Race fire matching: hours[] full availability required ───────────────────

describe('Race fire matching logic', () => {
  it('all hours available → all slots found', () => {
    const slots = [
      makeSlot(1, 2, 10, 'available'),
      makeSlot(1, 2, 11, 'available'),
      makeSlot(1, 2, 12, 'available'),
    ];
    const entryHours = [10, 11];
    const matched = entryHours.map((h) =>
      slots.find((s) => s.courtNo === 2 && s.hour === h && s.status === 'available'),
    );
    expect(matched.every(Boolean)).toBe(true);
    expect(matched.length).toBe(entryHours.length);
  });

  it('one hour unavailable → no_slot (matched count < entry.hours.length)', () => {
    const slots = [
      makeSlot(1, 2, 10, 'available'),
      makeSlot(1, 2, 11, 'reserved'), // unavailable
    ];
    const entryHours = [10, 11];
    const matched = entryHours.map((h) =>
      slots.find((s) => s.courtNo === 2 && s.hour === h && s.status === 'available'),
    );
    expect(matched.some((s) => !s)).toBe(true);
  });

  it('single hour entry (gy) → works with length=1', () => {
    const slots = [makeSlot(1, 1, 14, 'available')];
    const entryHours = [14];
    const matched = entryHours.map((h) =>
      slots.find((s) => s.courtNo === 1 && s.hour === h && s.status === 'available'),
    );
    expect(matched.every(Boolean)).toBe(true);
    expect(matched.length).toBe(1);
  });
});
