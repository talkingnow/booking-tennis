import { useRegisterSW } from 'virtual:pwa-register/react';
import { useUiStore } from '@/stores/uiStore';
import { Button } from '@/components/Button';

/**
 * Service-Worker update prompt modal.
 *
 * Shown when `vite-plugin-pwa` (registerType: 'prompt') detects a new SW
 * waiting to activate. The user can choose to update immediately or dismiss.
 *
 * Suppressed when the race countdown is armed (`isArmed === true`) to avoid
 * disrupting a time-critical booking sequence.
 */
export function SwUpdatePrompt() {
  const isArmed = useUiStore((s) => s.isArmed);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // Do not interrupt an active countdown
  if (!needRefresh || isArmed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 px-4 pointer-events-none">
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-xl p-5 w-full max-w-sm pointer-events-auto">
        <p className="text-sm font-semibold text-slate-100 mb-1">새 버전이 준비되었습니다</p>
        <p className="text-xs text-slate-400 mb-4">
          앱을 업데이트하면 최신 기능과 버그 수정이 적용됩니다.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => updateServiceWorker(true)} className="flex-1">
            지금 업데이트
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              /* Dismiss — user can refresh later */
            }}
          >
            나중에
          </Button>
        </div>
      </div>
    </div>
  );
}
