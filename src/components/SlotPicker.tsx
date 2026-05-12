import type { Slot } from '@/lib/gytennis/types';

type Props = {
  slots: Slot[];
  selected: Slot[];
  onToggle: (slot: Slot) => void;
};

const hourBuckets = [6, 8, 10, 12, 14, 16, 18, 20];

const statusStyle: Record<Slot['status'], string> = {
  available: 'bg-slate-800 border-slate-600 hover:border-accent cursor-pointer',
  reserved: 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed line-through',
  blocked: 'bg-slate-900 border-slate-800 text-slate-700 cursor-not-allowed',
};

export function SlotPicker({ slots, selected, onToggle }: Props) {
  // group by courtNo
  const courtNos = Array.from(new Set(slots.map((s) => s.courtNo))).sort((a, b) => a - b);

  const isSelected = (s: Slot) =>
    selected.some((x) => x.raw === s.raw);

  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-slate-400 font-medium">코트면</th>
            {hourBuckets.map((h) => (
              <th key={h} className="px-1 py-1 text-slate-400 font-medium">
                {h}시
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {courtNos.map((no) => (
            <tr key={no}>
              <td className="px-2 py-1 text-slate-300 font-medium">{no}번</td>
              {hourBuckets.map((h) => {
                const s = slots.find((x) => x.courtNo === no && x.hour === h);
                if (!s)
                  return (
                    <td key={h} className="p-1">
                      <div className="h-9 rounded bg-slate-900 border border-slate-800 opacity-30" />
                    </td>
                  );
                const sel = isSelected(s);
                const clickable = s.status === 'available';
                return (
                  <td key={h} className="p-1">
                    <button
                      type="button"
                      onClick={() => clickable && onToggle(s)}
                      disabled={!clickable}
                      className={`w-full h-9 rounded border text-[10px] ${
                        statusStyle[s.status]
                      } ${sel ? '!border-accent !bg-accent !text-bg font-semibold' : ''}`}
                      title={
                        s.status === 'available'
                          ? '예약 가능'
                          : s.status === 'reserved'
                            ? '이미 예약됨'
                            : '예약 불가'
                      }
                    >
                      {sel ? '✓' : s.status === 'reserved' ? '×' : s.status === 'blocked' ? '−' : ' '}
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
