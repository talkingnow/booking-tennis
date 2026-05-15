import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore, selectMeta } from '@/stores/authStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUiStore } from '@/stores/uiStore';
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
  const bootAutoLogin = useUiStore((s) => s.bootAutoLogin);
  const [, tick] = useState(0);

  // Re-render every 30s to update relative time display
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const siteName = isRegistered(siteId)
    ? getSite(siteId).config.name
    : siteId === 'pj' ? '파주시' : '고양시';

  const setActiveSite = useSiteStore((s) => s.setActiveSite);

  const retry = useCallback(() => {
    useAuthStore.getState().validateAndLogin(siteId);
  }, [siteId]);

  // Switch active site so /account opens for the clicked badge's site,
  // not the currently-selected one in the top-right SiteSelector.
  const goAccount = useCallback(() => {
    setActiveSite(siteId);
  }, [siteId, setActiveSite]);

  const { lastResult, lastValidatedAt, lastError } = meta;

  // Hide if never touched and no account configured — avoid noise for single-site users
  if (lastResult === 'idle' && !account) return null;

  const timeLabel = relativeTime(lastValidatedAt);

  if (lastResult === 'idle') {
    // BUG-5: account exists but auto-login OFF → show manual login prompt, not "확인 중…"
    if (account && !bootAutoLogin) {
      return (
        <div className="flex items-center gap-2 text-sm text-amber-300">
          <span className="w-4 text-center">🔒</span>
          <Link to="/account" onClick={goAccount} className="underline hover:text-amber-200">
            {siteName} 수동 로그인 필요
          </Link>
        </div>
      );
    }
    // bootAutoLogin ON (or no account) — show spinner
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="w-4 text-center">·</span>
        <span>{siteName} 확인 중…</span>
      </div>
    );
  }

  if (lastResult === 'validating') {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <span className="w-4 text-center animate-spin">↻</span>
        <span>{siteName} 로그인 중…</span>
      </div>
    );
  }

  if (lastResult === 'valid') {
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

  if (lastResult === 'no_account') {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="w-4 text-center">+</span>
        <Link to="/account" onClick={goAccount} className="underline hover:text-slate-300">
          {siteName} 계정 미설정
        </Link>
      </div>
    );
  }

  // F5: exhaustive over SiteAuthResult — all 6 branches handled above. Render nothing for unknown.
  return null;
}
