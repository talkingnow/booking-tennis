import { Button } from '@/components/Button';

type Props = {
  open: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Simple modal overlay confirmation dialog.
 * Renders nothing when `open` is false.
 */
export function ConfirmDialog({ open, message, onConfirm, onCancel }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-6 w-full max-w-sm space-y-4">
        <p className="text-sm text-slate-100 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <Button onClick={onConfirm} className="flex-1">
            확인
          </Button>
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            취소
          </Button>
        </div>
      </div>
    </div>
  );
}
