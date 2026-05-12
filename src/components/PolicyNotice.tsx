import { useSiteStore } from '@/stores/siteStore';
import { isRegistered, getSite } from '@/lib/sites/registry';

/**
 * Shows policy notes for the active site when it has non-empty notes.
 * Typically used for pjtennis which has detailed booking rules.
 */
export function PolicyNotice() {
  const { activeSiteId } = useSiteStore();

  if (!isRegistered(activeSiteId)) return null;
  const adapter = getSite(activeSiteId);
  const { notes, hourlyFee } = adapter.config.policy;

  if (!notes.length) return null;

  return (
    <div className="rounded-xl bg-slate-800 border border-blue-700/50 p-4 text-xs text-slate-300 space-y-2">
      <p className="font-semibold text-blue-400 text-sm">📋 {adapter.config.name} 예약 정책 (참고용)</p>
      <ul className="space-y-1 list-disc list-inside text-slate-400">
        {notes.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
      {hourlyFee && (
        <div className="mt-2 border-t border-slate-700 pt-2">
          <p className="text-slate-500 mb-1">요금 (참고용 — 결제 직전 KCP 실금액 우선)</p>
          <div className="grid grid-cols-2 gap-1 text-slate-400">
            <span>평일 조조/주간:</span>
            <span>{hourlyFee.weekday.day.toLocaleString()}원/h</span>
            <span>평일 야간:</span>
            <span>{hourlyFee.weekday.night.toLocaleString()}원/h</span>
            <span>주말/공휴일 조조/주간:</span>
            <span>{hourlyFee.weekend.day.toLocaleString()}원/h</span>
            <span>주말/공휴일 야간:</span>
            <span>{hourlyFee.weekend.night.toLocaleString()}원/h</span>
          </div>
        </div>
      )}
    </div>
  );
}
