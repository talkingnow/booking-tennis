import type { Slot } from '@/lib/gytennis/types';

type Props = {
  slots: Slot[];
  selected: Slot[];
  onToggle: (slot: Slot) => void;
};

const hourBuckets = [6, 8, 10, 12, 14, 16, 18, 20];

const statusStyle: Record<Slot['status'], string> = {
  available: 'bg-slate-800 border-slate-600 hover:border-accent cursor-pointer text-slate-200',
  reserved: 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed',
  blocked: 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed',
};

// Only two visual states (per user request):
//   ○ = available (pickable)
//   × = anything else (reserved or blocked)
function glyph(s: Slot): string {
  return s.status === 'available' ? '○' : '×';
}

function label(s: Slot): string {
  if (s.status === 'available') return '예약 가능';
  if (s.status === 'reserved') return '이미 예약됨';
  return '예약 불가';
}

/**
 * Slot grid matching the gytennis website layout:
 *   columns = court face number (1코트, 2코트, ...)
 *   rows    = 2-hour time buckets (06~08, 08~10, ...)
 */
export function SlotPicker({ slots, selected, onToggle }: Props) {
  const courtNos = Array.from(new Set(slots.map((s) => s.courtNo))).sort((a, b) => a - b);
  const isSelected = (s: Slot) => selected.some((x) => x.raw === s.raw);

  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-xs border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="px-1 py-1 text-left text-slate-400 font-medium text-[10px] w-20">
              시간 \ 코트
            </th>
            {courtNos.map((no) => (
              <th key={no} className="px-1 py-1 text-slate-300 font-semibold text-center">
                {no}코트
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hourBuckets.map((h) => (
            <tr key={h}>
              <td className="px-1 py-1 text-slate-400 text-[10px] whitespace-nowrap">
                {String(h).padStart(2, '0')}~{String(h + 2).padStart(2, '0')}
              </td>
              {courtNos.map((no) => {
                const s = slots.find((x) => x.courtNo === no && x.hour === h);
                if (!s) {
                  // No cell at all for this slot — render as × (consistent binary view)
                  return (
                    <td key={no} className="p-0">
                      <div className="h-10 rounded bg-slate-900 border border-slate-800 text-slate-700 flex items-center justify-center">
                        ×
                      </div>
                    </td>
                  );
                }
                const sel = isSelected(s);
                const clickable = s.status === 'available';
                return (
                  <td key={no} className="p-0">
                    <button
                      type="button"
                      onClick={() => clickable && onToggle(s)}
                      disabled={!clickable}
                      className={`w-full h-10 rounded border ${statusStyle[s.status]} ${
                        sel ? '!border-accent !bg-accent !text-bg font-semibold' : ''
                      }`}
                      title={label(s)}
                    >
                      {sel ? '✓' : glyph(s)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex gap-3 text-[10px] text-slate-500 px-1">
        <span><span className="text-slate-200">○</span> 예약 가능</span>
        <span><span className="text-slate-600">×</span> 예약 불가</span>
      </div>
    </div>
  );
}
