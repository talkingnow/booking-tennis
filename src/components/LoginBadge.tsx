import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore, selectMeta } from '@/stores/authStore';
import type { SiteId } from '@/lib/sites/types';
import { isRegistered, getSite } from '@/lib/sites/registry';

function relativeTime(ts: number | null): string {
  if (ts === null) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}초 전`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}분 전`;
  return `${Math.floor(mins / 60)}시간 전`;
}

function maskId(id: string): string {
  if (id.length <= 4) return id + '****';
  return id.slice(0, 4) + '****';
}

export function LoginBadge({ siteId }: { siteId: SiteId }): JSX.Element | null {
  const meta = useAuthStore(selectMeta(siteId));
  const account = useAuthStore((s) => s.accounts[siteId]);
  const cookie = useAuthStore((s) => s.cookies[siteId]);
  const [, tick] = useState(0);

  // Re-render every 30s to update relative time display
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const siteName = isRegistered(siteId)
    ? getSite(siteId).config.name
    : siteId === 'pj' ? '파주시' : '고양시';

  const retry = useCallback(() => {
    useAuthStore.getState().validateAndLogin(siteId);
  }, [siteId]);

  const { lastResult, lastValidatedAt, lastError } = meta;
  const timeLabel = relativeTime(lastValidatedAt);

  const isActuallyValid = !!cookie && lastResult !== 'expired' && lastResult !== 'error' && lastResult !== 'validating';

  // Hide if never touched and no account configured — avoid noise for single-site users
  if (lastResult === 'idle' && !account && !cookie) return null;

  if (isActuallyValid || lastResult === 'valid') {
    return (
      <div className="flex items-center gap-2 text-sm text-green-400">
        <span className="w-4 text-center">✓</span>
        <span>
          {siteName} 로그인됨{account ? ` ${maskId(account.id)}` : ''}
        </span>
        {timeLabel && <span className="text-xs text-slate-500">{timeLabel}</span>}
      </div>
    );
  }

  if (lastResult === 'idle') {
    if (!cookie && account) {
      return (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span className="w-4 text-center">·</span>
          <span>{siteName} 미로그인</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="w-4 text-center">·</span>
        <span>{siteName} 확인 중…</span>
      </div>
    );
  }

  if (lastResult === 'expired') {
    return (
      <div className="flex items-center gap-2 text-sm text-yellow-400">
        <span className="w-4 text-center">⚠</span>
        <span>{siteName} 세션 만료</span>
        <button
          onClick={retry}
          className="text-xs underline text-yellow-300 hover:text-yellow-200"
        >
          재시도
        </button>
      </div>
    );
  }

  if (lastResult === 'error') {
    return (
      <div className="flex items-center gap-2 text-sm text-red-400">
        <span className="w-4 text-center">✕</span>
        <span className="truncate max-w-[180px]">{siteName} 로그인 실패{lastError ? ` — ${lastError}` : ''}</span>
        <button
          onClick={retry}
          className="text-xs underline text-red-300 hover:text-red-200 shrink-0"
        >
          재시도
        </button>
      </div>
    );
  }

  // no_account
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span className="w-4 text-center">+</span>
      <Link to="/account" className="underline hover:text-slate-300">
        {siteName} 계정 미설정
      </Link>
    </div>
  );
}
