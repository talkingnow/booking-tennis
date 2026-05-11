export default function Race() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">🚀 빠른 예약</h1>
      <p className="text-sm text-slate-400">M5 단계에서 구현 예정 — 5단계 위저드.</p>
      <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">
        <li>로그인 상태 확인</li>
        <li>코트·날짜·시간 선택</li>
        <li>타겟 시각 확인</li>
        <li>발사 대기 (카운트다운)</li>
        <li>결제창 진입</li>
      </ol>
    </div>
  );
}
