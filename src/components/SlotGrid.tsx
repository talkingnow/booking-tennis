/**
 * SlotGrid — time × court-face matrix for one court complex.
 *
 * Rows: SLOT_HOURS (6, 8, 10, 12, 14, 16, 18, 20)
 * Cols: courtNos from courts.ts meta, fallback to distinct from slots
 *
 * Cell states:
 *   available  — accent ○ (clickable)
 *   reserved   — slate  × (disabled)
 *   pending    — yellow ⏳ (processing payment)
 *   blocked    — gray  – (site-disabled)
 */
import { useMemo } from 'react';
import type { Slot, SlotStatus } from '@/lib/gytennis/types';
import { getCourt } from '@/lib/courts';
import { isRegistered, getSite } from '@/lib/sites/registry';
import type { SiteId } from '@/lib/sites/types';

export type SlotGridProps = {
  courtId: number;
  slots: Slot[];
  /** Site identifier — determines which court registry to use. */
  siteId?: SiteId;
  /** Slot raw keys that are in "payment pending" state. */
  pendingSlots?: Set<string>;
  /** Called when an available slot cell is clicked. */
  onSlotClick?: (slot: Slot) => void;
  /** Currently loading (shows skeleton). */
  loading?: boolean;
  /** Explicit hour rows. Defaults to site policy.hours range, or slots distinct. */
  hours?: number[];
};

function effectiveStatus(slot: Slot, pendingSlots: Set<string>): SlotStatus {
  if (pendingSlots.has(slot.raw)) return 'pending';
  return slot.status;
}

function cellClass(status: SlotStatus): string {
  switch (status) {
    case 'available': return 'bg-accent/20 border border-accent text-accent hover:bg-accent hover:text-bg cursor-pointer';
    case 'pending':   return 'bg-yellow-300/20 border border-yellow-400 text-yellow-300 cursor-not-allowed';
    case 'reserved':  return 'bg-slate-800 border border-slate-700 text-slate-500 cursor-default';
    case 'blocked':   return 'bg-slate-900 border border-slate-800 text-slate-700 cursor-default';
    default:          return 'bg-slate-900 border border-slate-800 text-slate-700 cursor-default';
  }
}

function cellLabel(status: SlotStatus): string {
  switch (status) {
    case 'available': return '○';
    case 'pending':   return '⏳';
    case 'reserved':  return '×';
    case 'blocked':   return '–';
    default:          return '–';
  }
}

export function SlotGrid({ courtId, slots, siteId = 'gy', pendingSlots = new Set(), onSlotClick, loading, hours }: SlotGridProps) {
  // Dynamic hour rows: explicit prop > site policy > distinct from slots
  const slotHours = useMemo(() => {
    if (hours?.length) return hours;
    if (isRegistered(siteId)) {
      const [s, e] = getSite(siteId).config.policy.hours;
      const out: number[] = [];
      for (let h = s; h < e; h++) out.push(h);
      return out;
    }
    return Array.from(new Set(slots.map((x) => x.hour))).sort((a, b) => a - b);
  }, [hours, siteId, slots]);

  // Determine column court numbers
  const metaCourtNos = getCourt(siteId, courtId)?.courtNos;
  const courtNos = metaCourtNos?.length
    ? metaCourtNos
    : Array.from(new Set(slots.map((s) => s.courtNo))).sort((a, b) => a - b);

  // Build lookup: `${hour}-${courtNo}` → Slot
  const slotMap = new Map<string, Slot>();
  for (const s of slots) {
    slotMap.set(`${s.hour}-${s.courtNo}`, s);
  }

  if (loading) {
    return (
      <div className="overflow-x-auto">
        <div className="animate-pulse text-xs text-slate-500 py-4 text-center">조회 중…</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="text-xs border-separate border-spacing-0.5 mx-auto">
        <thead>
          <tr>
            <th className="text-slate-500 font-normal px-1 pb-1 text-right pr-2">시</th>
            {courtNos.map((n) => (
              <th key={n} className="text-slate-400 font-normal px-1 pb-1 text-center min-w-[48px]">
                {n}번
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slotHours.map((hour) => (
            <tr key={hour}>
              <td className="text-slate-500 text-right pr-2 font-mono">
                {String(hour).padStart(2, '0')}
              </td>
              {courtNos.map((courtNo) => {
                const slot = slotMap.get(`${hour}-${courtNo}`);
                if (!slot) {
                  // No parser data for this cell — visually dimmer than blocked to avoid confusion
                  return (
                    <td key={courtNo} className="min-h-[44px] min-w-[48px] text-center">
                      <div
                        className="min-h-[44px] min-w-[48px] flex items-center justify-center rounded bg-slate-950 border border-slate-900 text-slate-800 text-[10px]"
                        title="데이터 없음"
                      >
                        ·
                      </div>
                    </td>
                  );
                }
                const status = effectiveStatus(slot, pendingSlots);
                const clickable = status === 'available' && !!onSlotClick;
                return (
                  <td key={courtNo} className="min-h-[44px] min-w-[48px] text-center">
                    <button
                      className={`min-h-[44px] min-w-[48px] w-full flex items-center justify-center rounded text-base font-bold transition-colors ${cellClass(status)}`}
                      disabled={!clickable}
                      onClick={clickable ? () => onSlotClick!(slot) : undefined}
                      aria-label={`${courtNo}번 코트 ${hour}시 ${status}`}
                    >
                      {cellLabel(status)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
