import { useEffect, useRef, useState } from 'react';

type LogEntry = {
  ts: string;
  type: 'req' | 'res' | 'err' | 'info';
  msg: string;
};

// Global log bus
const listeners = new Set<(e: LogEntry) => void>();
export function debugLog(type: LogEntry['type'], msg: string) {
  const entry: LogEntry = {
    ts: new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    type,
    msg,
  };
  listeners.forEach((fn) => fn(entry));
  // Also write to console for server-side capture
  console.log(`[DBG][${type}] ${msg}`);
}

export function DebugPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: LogEntry) => setLogs((prev) => [...prev.slice(-80), e]);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-2 right-2 z-50 bg-slate-800 text-xs text-slate-300 px-2 py-1 rounded opacity-70"
      >
        DBG
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700 text-xs font-mono">
      <div className="flex items-center justify-between px-2 py-1 bg-slate-800">
        <span className="text-slate-400 font-bold">DEBUG LOG</span>
        <div className="flex gap-2">
          <button onClick={() => setLogs([])} className="text-slate-500 hover:text-white">clear</button>
          <button
            onClick={() => {
              const text = logs.map((e) => `[${e.ts}][${e.type}] ${e.msg}`).join('\n');
              navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1000);
              }).catch(() => {});
            }}
            className={copied ? 'text-green-400' : 'text-slate-500 hover:text-white'}
          >{copied ? '복사됨' : '복사'}</button>
          <button onClick={() => setVisible(false)} className="text-slate-500 hover:text-white">hide</button>
        </div>
      </div>
      <div className="overflow-y-auto h-40 px-2 py-1 space-y-0.5">
        {logs.length === 0 && <p className="text-slate-600">로그 없음 — 예약 시도 시 여기에 표시됩니다</p>}
        {logs.map((e, i) => (
          <div key={i} className={`leading-5 ${
            e.type === 'err' ? 'text-red-400' :
            e.type === 'res' ? 'text-green-400' :
            e.type === 'req' ? 'text-yellow-300' :
            'text-slate-300'
          }`}>
            <span className="text-slate-600">{e.ts} </span>
            {e.msg}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
