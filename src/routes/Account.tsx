import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardTitle } from '@/components/Card';
import { Button } from '@/components/Button';

export default function Account() {
  const { account, cookie, busy, error, hydrate, saveCredentials, doLogin, doLogout, forget } =
    useAuthStore();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (account) setId(account.id);
    if (account?.remember) setPw(account.pw);
  }, [account]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // saveCredentials returns the new account synchronously; pass it directly
    // to doLogin() to avoid the race condition where Zustand state setter
    // hasn't propagated yet when doLogin reads get().account.
    const acc = saveCredentials(id, pw, remember);
    await doLogin(acc);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">계정 설정</h1>

      <Card>
        <CardTitle>상태</CardTitle>
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
          <CardTitle>gytennis 로그인</CardTitle>
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
            <Button variant="secondary" onClick={() => doLogout()} disabled={busy}>
              로그아웃
            </Button>
            <Button variant="danger" onClick={() => forget()} disabled={busy}>
              계정 삭제 (저장 정보 폐기)
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>보안 안내</CardTitle>
        <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
          <li>자격증명은 이 폰의 브라우저 저장소(localStorage)에만 보관됩니다.</li>
          <li>서버에 전송·저장되지 않습니다.</li>
          <li>"계정 삭제" 누르면 즉시 폐기됩니다.</li>
        </ul>
      </Card>
    </div>
  );
}
