import { useSiteStore } from '@/stores/siteStore';
import type { SiteId } from '@/lib/sites/types';

const SITES: { id: SiteId; label: string }[] = [
  { id: 'gy', label: '고양시' },
  { id: 'pj', label: '파주시' },
];

export function SiteSelector({ disabled }: { disabled?: boolean }) {
  const { activeSiteId, setActiveSite } = useSiteStore();

  return (
    <div className={`inline-flex rounded-lg overflow-hidden border border-slate-700 text-xs ${disabled ? 'opacity-70 pointer-events-none' : ''}`}>
      {SITES.map((s) => (
        <button
          key={s.id}
          onClick={() => !disabled && setActiveSite(s.id)}
          disabled={disabled}
          className={`px-3 py-1.5 font-medium transition-colors ${
            activeSiteId === s.id
              ? 'bg-accent text-bg'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
          aria-pressed={activeSiteId === s.id}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
