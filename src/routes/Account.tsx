import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useSiteStore } from '@/stores/siteStore';
import { useUiStore } from '@/stores/uiStore';
import { applyBootAutoLoginPolicy } from '@/lib/auth/applyBootAutoLogin';
import { Card, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';

export default function Account() {
  // BUG-6: use individual selectors instead of whole-store destructure
  const accounts = useAuthStore((s) => s.accounts);
  const cookies = useAuthStore((s) => s.cookies);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const saveCredentials = useAuthStore((s) => s.saveCredentials);
  const doLogin = useAuthStore((s) => s.doLogin);
  const doLogout = useAuthStore((s) => s.doLogout);
  const forget = useAuthStore((s) => s.forget);
  // BUG-1: hydrate() removed — App.tsx handles it once at boot

  const { activeSiteId } = useSiteStore();
  const bootAutoLogin = useUiStore((s) => s.bootAutoLogin);
  const setBootAutoLogin = useUiStore((s) => s.setBootAutoLogin);

  const account = accounts[activeSiteId] ?? null;
  const cookie = cookies[activeSiteId] ?? null;

  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);

  // No hydrate() here — BUG-1 fix: would restore cookies and break OFF intent

  useEffect(() => {
    if (account) setId(account.id);
    if (account?.remember) setPw(account.pw);
    else setPw('');
  }, [account, activeSiteId]);

  // BUG-3/BUG-2: toggle handler applies full policy (clears in-memory or fires login+keepAlive)
  const onToggleBoot = (on: boolean) => {
    setBootAutoLogin(on);
    applyBootAutoLoginPolicy(on);
  };

  const siteLabel = activeSiteId === 'pj' ? '파주시' : '고양시';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const acc = saveCredentials(activeSiteId, id, pw, remember);
    await doLogin(activeSiteId, acc);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">계정 설정</h1>

      <Card>
        <CardTitle>상태 ({siteLabel})</CardTitle>
        <div className="text-sm space-y-1">
          <div>
            계정 저장: {account ? <span className="text-emerald-400">{account.id}</span> : '없음'}
          </div>
          <div>
            세션 활성: {cookie ? <span className="text-emerald-400">로그인됨</span> : '미로그인'}
          </div>
        </div>
      </Card>

      {!cookie && (
        <Card>
          <CardTitle>{siteLabel} 로그인</CardTitle>
          <form className="space-y-3" onSubmit={onSubmit}>
            <div>
              <label className="block text-xs text-slate-400 mb-1">아이디</label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value)}
                maxLength={16}
                autoComplete="username"
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-accent outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">비밀번호</label>
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                maxLength={20}
                autoComplete="current-password"
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-accent outline-none text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              이 기기에 저장 (다음 접속 시 자동입력)
            </label>
            {error && <div className="text-xs text-red-400">{error}</div>}
            <Button type="submit" disabled={busy}>
              {busy ? '로그인 중…' : '로그인'}
            </Button>
          </form>
        </Card>
      )}

      {cookie && (
        <Card>
          <CardTitle>세션 관리</CardTitle>
          <div className="space-y-2">
            <Button variant="secondary" onClick={() => doLogout(activeSiteId)} disabled={busy}>
              로그아웃
            </Button>
            <Button variant="danger" onClick={() => forget(activeSiteId)} disabled={busy}>
              계정 삭제 (저장 정보 폐기)
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>일반 설정</CardTitle>
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={bootAutoLogin}
            onChange={(e) => onToggleBoot(e.target.checked)}
            className="mt-1"
          />
          <div className="flex-1">
            <div>구동 시 자동 로그인</div>
            <div className="text-xs text-slate-400 mt-0.5">
              앱을 켤 때 저장된 계정으로 자동 로그인합니다. 끄면 [계정 설정] 의 로그인 버튼을 직접 눌러야 합니다. (기본 꺼짐)
            </div>
          </div>
        </label>
      </Card>

      <Card>
        <CardTitle>보안 안내</CardTitle>
        <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
          <li>자격증명은 이 폰의 브라우저 저장소(localStorage)에만 보관됩니다.</li>
          <li>서버에 전송·저장되지 않습니다.</li>
          <li>"계정 삭제" 누르면 즉시 폐기됩니다.</li>
        </ul>
      </Card>

      <div className="text-center">
        <Link to="/feedback" className="text-sm text-slate-400 hover:text-slate-200 underline underline-offset-2">
          불편한 점이나 개선 의견을 알려주세요
        </Link>
      </div>
    </div>
  );
}
