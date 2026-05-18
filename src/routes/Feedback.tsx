import { useState } from 'react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { submitFeedback, type FeedbackKind } from '@/lib/feedback/client';
import { useSiteStore } from '@/stores/siteStore';

type SubmitState = 'idle' | 'busy' | 'ok' | 'error';

const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: 'bug', label: '버그' },
  { value: 'improvement', label: '개선' },
  { value: 'other', label: '기타' },
];

export default function Feedback() {
  const { activeSiteId } = useSiteStore();
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showContext, setShowContext] = useState(false);

  const trimmed = message.trim();
  const charCount = trimmed.length;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || charCount > 2000) return;
    setState('busy');
    setErrorMsg('');
    const res = await submitFeedback(kind, trimmed);
    if (res.ok) {
      setState('ok');
      setMessage('');
    } else {
      setState('error');
      if (res.error === 'webhook_not_configured') {
        setErrorMsg('서버 설정이 완료되지 않았습니다. 관리자에게 문의하세요.');
      } else {
        setErrorMsg('전송에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">피드백 보내기</h1>

      {state === 'ok' && (
        <div className="rounded-lg bg-emerald-900/40 border border-emerald-700 p-3 text-sm text-emerald-300">
          피드백이 전송되었습니다. 감사합니다!
        </div>
      )}

      <Card>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <p className="text-xs text-slate-400 mb-2">카테고리</p>
            <div className="flex gap-3">
              {KINDS.map((k) => (
                <label key={k.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="kind"
                    value={k.value}
                    checked={kind === k.value}
                    onChange={() => setKind(k.value)}
                  />
                  {k.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">내용</label>
            <textarea
              rows={5}
              maxLength={2000}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (state === 'error') setState('idle');
              }}
              placeholder="불편한 점, 개선 아이디어, 또는 버그를 알려주세요."
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 focus:border-accent outline-none text-sm resize-none"
              required
            />
            <div className="text-right text-xs text-slate-500 mt-0.5">{charCount} / 2000</div>
          </div>

          {errorMsg && (
            <div className="text-xs text-red-400">{errorMsg}</div>
          )}

          <Button type="submit" disabled={state === 'busy' || !trimmed || charCount > 2000}>
            {state === 'busy' ? '전송 중…' : '전송'}
          </Button>
        </form>
      </Card>

      <Card>
        <button
          type="button"
          className="w-full flex items-center justify-between text-sm text-slate-400 hover:text-slate-200"
          onClick={() => setShowContext((v) => !v)}
        >
          <span>함께 전송되는 정보</span>
          <span>{showContext ? '▲' : '▼'}</span>
        </button>
        {showContext && (
          <ul className="mt-3 text-xs text-slate-400 space-y-1">
            <li>사이트: <span className="text-slate-200">{activeSiteId}</span></li>
            <li>앱 버전: <span className="text-slate-200">{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'}</span></li>
            <li>현재 경로: <span className="text-slate-200">{window.location.pathname}</span></li>
            <li>전송 시각: (제출 시점)</li>
            <li>브라우저 정보: (User-Agent 요약)</li>
            <li className="text-slate-500">* 자격증명, 쿠키, 즐겨찾기는 전송되지 않습니다.</li>
          </ul>
        )}
      </Card>
    </div>
  );
}

declare const __APP_VERSION__: string;
