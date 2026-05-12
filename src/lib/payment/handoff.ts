import type { KcpForm } from '../gytennis/types';
import { debugLog } from '@/components/DebugPanel';

export type KcpHandoffOptions = {
  /**
   * Called when the popup window is detected as closed (polled every 1 s).
   * Per R-E B안: does NOT automatically cancel the reservation.
   */
  onWindowClosed?: () => void;
};

const GYTENNIS = 'https://www.gytennis.or.kr';
const KCP_SDK_URL = 'https://pay.kcp.co.kr/plugin/payplus_web.jsp';

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Open the KCP payment popup.
 *
 * gytennis rsvConfirm returns a page whose "결제하기" button calls:
 *   jsf__pay(form) → verifies via /rsvVf → KCP_Pay_Execute(form)
 *
 * We already called /rsvVf in reserve.ts, so we skip jsf__pay and call
 * KCP_Pay_Execute directly via a self-contained blob page.
 *
 * The form action (/rsvPy) is the KCP *callback* URL (server-to-server after
 * payment) — NOT where we POST the form. KCP_Pay_Execute opens the popup
 * and KCP calls back to /rsvPy when payment completes.
 */
export function openKcpPayment(kcp: KcpForm, opts: KcpHandoffOptions = {}): Window | null {
  const { onWindowClosed } = opts;

  // Resolve action to absolute URL (gytennis-relative → absolute)
  const action = kcp.action.startsWith('http')
    ? kcp.action
    : `${GYTENNIS}${kcp.action.startsWith('/') ? '' : '/'}${kcp.action}`;

  const fieldsHtml = Object.entries(kcp.fields)
    .map(([n, v]) => `<input type="hidden" name="${escAttr(n)}" value="${escAttr(v)}" />`)
    .join('\n');

  // Self-contained HTML blob that:
  // 1. loads the KCP SDK from pay.kcp.co.kr
  // 2. calls KCP_Pay_Execute(form) on load — opens the KCP payment popup
  const pageHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>결제 진행 중...</title>
<style>
  body{margin:0;background:#0f172a;color:#f1f5f9;font-family:sans-serif;
       display:flex;flex-direction:column;align-items:center;justify-content:center;
       min-height:100vh;gap:16px;}
  .msg{font-size:15px;}
  .err{color:#f87171;font-size:13px;margin-top:8px;}
</style>
</head>
<body>
<form name="order_info" method="post" action="${escAttr(action)}" accept-charset="UTF-8">
${fieldsHtml}
</form>
<p class="msg">결제창을 불러오는 중입니다...</p>
<p class="err" id="err" style="display:none"></p>
<script src="${KCP_SDK_URL}"></script>
<script>
window.addEventListener('load', function () {
  try {
    // Ensure pay_method is set (jsf__pay normally does this)
    var pm = document.querySelector('input[name="pay_method"]');
    if (pm && !pm.value) pm.value = '100000000000';
    KCP_Pay_Execute(document.order_info);
  } catch (e) {
    var el = document.getElementById('err');
    el.textContent = '결제창 오류: ' + e.message;
    el.style.display = 'block';
  }
});
</script>
</body>
</html>`;

  const blob = new Blob([pageHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  debugLog('info', `KCP blob 생성 action=${action} fields=${Object.keys(kcp.fields).join(',')}`);
  const popup = window.open(blobUrl, '_blank', 'width=520,height=720,scrollbars=yes,resizable=yes');
  debugLog(popup ? 'info' : 'err', `팝업 open=${!!popup}`);

  // Revoke blob URL after the page has had time to load
  setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000);

  // Poll for popup closure
  if (popup && onWindowClosed) {
    let notified = false;
    const timer = setInterval(() => {
      if (notified) { clearInterval(timer); return; }
      try {
        if (popup.closed) {
          notified = true;
          clearInterval(timer);
          onWindowClosed();
        }
      } catch {
        notified = true;
        clearInterval(timer);
        onWindowClosed();
      }
    }, 1_000);
  }

  return popup;
}
