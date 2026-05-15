import type { KcpForm } from '../gytennis/types';
import type { SiteId } from '../sites/types';
import { debugLog } from '@/components/DebugPanel';

export type KcpHandoffOptions = {
  /**
   * Site identifier — included in mobile m_redirect_url so PaymentResult
   * can determine which adapter to use for cancellation.
   */
  siteId?: SiteId;
  /**
   * Called when the popup window is detected as closed (polled every 1 s).
   * PC popup flow only — NOT called in mobile redirect flow.
   */
  onWindowClosed?: () => void;
};

const KCP_SDK_URL = 'https://pay.kcp.co.kr/plugin/payplus_web.jsp';

/**
 * Detect mobile device.
 * - Matches common mobile UA strings.
 * - iPadOS 13+ reports as "Mac" but has maxTouchPoints > 1.
 */
export function isMobile(ua: string = navigator.userAgent): boolean {
  if (/android|iphone|ipad|ipod|iemobile|opera mini/i.test(ua)) return true;
  // iPadOS 13+ UA spoof
  if ((navigator.maxTouchPoints ?? 0) > 1 && /Mac/i.test(ua)) return true;
  return false;
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Normalize KCP action URL for mobile: spay.kcp.co.kr → smpay.kcp.co.kr.
 * Other hosts are returned unchanged.
 */
export function toMobileAction(action: string): string {
  try {
    const u = new URL(action);
    if (u.hostname === 'spay.kcp.co.kr') {
      u.hostname = 'smpay.kcp.co.kr';
    }
    return u.toString();
  } catch {
    return action;
  }
}

/**
 * Returns true when running as an installed PWA in standalone display mode.
 * iOS Safari sets navigator.standalone; other browsers use the CSS media query.
 */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window.navigator as any).standalone === true) return true;
  if (window.matchMedia?.('(display-mode: standalone)')?.matches === true) return true;
  return false;
}

/**
 * Mobile flow: open a blob page that loads KCP SDK and calls KCP_Pay_Execute.
 * KCP redirects the result to /api/kcp-return which proxies to /payment-result.
 * Always opens in _blank (no width/height features) so KCP mobile UI fills the tab.
 */
// Redirect-style fields that gytennis/KCP embed — strip them so we can inject our own.
const REDIRECT_FIELDS = new Set([
  'm_redirect_url', 'Ret_URL', 'ret_url', 'RETURN_URL', 'return_url',
  'callback_url', 'noti_url', 'KCPRedirectURL',
  'returnUrl', 'ReturnUrl', 'retUrl', 'complete_url', 'CompleteUrl',
  'success_url', 'SuccessUrl', 'fail_url', 'FailUrl',
  'm_signal_url', 'notice_url', 'NoticeUrl', 'redirect_url', 'RedirectURL',
]);

function openKcpMobileSdk(kcp: KcpForm, siteId: SiteId | undefined): null {
  const orderId = kcp.fields.ordr_idxx ?? '';
  const qs = new URLSearchParams();
  if (orderId) qs.set('order_id', orderId);
  if (siteId) qs.set('site', siteId);
  const qsPart = qs.toString() ? `?${qs.toString()}` : '';
  const redirectUrl = `${location.origin}/api/kcp-return${qsPart}`;

  // Resolve action to absolute URL for the form
  const action = kcp.action.startsWith('http')
    ? kcp.action
    : `https://www.gytennis.or.kr${kcp.action.startsWith('/') ? '' : '/'}${kcp.action}`;

  // Strip redirect fields, ensure pay_method default, inject our m_redirect_url
  const mergedFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(kcp.fields)) {
    if (!REDIRECT_FIELDS.has(k)) mergedFields[k] = v;
  }
  if (!mergedFields.pay_method) mergedFields.pay_method = '100000000000';
  mergedFields.m_redirect_url = redirectUrl;

  const fieldsHtml = Object.entries(mergedFields)
    .map(([n, v]) => `<input type="hidden" name="${escAttr(n)}" value="${escAttr(v)}" />`)
    .join('\n');

  const pageHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=yes,maximum-scale=5.0">
<title>결제 진행 중...</title>
<style>
  html,body{margin:0;padding:0;overflow:auto;-webkit-overflow-scrolling:touch;}
  body{padding:16px;background:#0f172a;color:#f1f5f9;font-family:sans-serif;
       min-height:100dvh;box-sizing:border-box;}
  .center{display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-height:100dvh;gap:16px;}
  .msg{font-size:15px;}
  .err{color:#f87171;font-size:13px;margin-top:8px;}
</style>
</head>
<body>
<form name="order_info" method="post" action="${escAttr(action)}" accept-charset="UTF-8">
${fieldsHtml}
</form>
<div class="center">
<p class="msg">결제창을 불러오는 중입니다...</p>
<p class="err" id="err" style="display:none"></p>
</div>
<script src="${KCP_SDK_URL}"></script>
<script>
window.addEventListener('load', function () {
  try {
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

  debugLog('info', `KCP mobile SDK blob action=${action} redirect=${redirectUrl} fields=${Object.keys(mergedFields).join(',')}`);
  window.open(blobUrl, '_blank');

  setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000);

  return null;
}

/**
 * Open the KCP payment window.
 *
 * Mobile: SDK blob flow — blob page loads payplus_web.jsp and calls KCP_Pay_Execute
 * in a new tab. KCP redirects result to /api/kcp-return → /payment-result.
 *
 * PC: KCP_Pay_Execute popup flow — blob page opens KCP payment popup.
 * onWindowClosed fires when the popup is closed.
 */
export async function openKcpPayment(kcp: KcpForm, opts: KcpHandoffOptions = {}): Promise<Window | null> {
  const { onWindowClosed, siteId } = opts;

  if (isMobile()) {
    return openKcpMobileSdk(kcp, siteId);
  }

  // ── PC: KCP_Pay_Execute popup flow ────────────────────────────────────────
  const GYTENNIS = 'https://www.gytennis.or.kr';
  const action = kcp.action.startsWith('http')
    ? kcp.action
    : `${GYTENNIS}${kcp.action.startsWith('/') ? '' : '/'}${kcp.action}`;

  const fieldsHtml = Object.entries(kcp.fields)
    .map(([n, v]) => `<input type="hidden" name="${escAttr(n)}" value="${escAttr(v)}" />`)
    .join('\n');

  const pageHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=yes,maximum-scale=5.0">
<title>결제 진행 중...</title>
<style>
  html,body{margin:0;padding:0;overflow:auto;-webkit-overflow-scrolling:touch;}
  body{padding:16px;background:#0f172a;color:#f1f5f9;font-family:sans-serif;
       min-height:100dvh;box-sizing:border-box;}
  .center{display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-height:100dvh;gap:16px;}
  .msg{font-size:15px;}
  .err{color:#f87171;font-size:13px;margin-top:8px;}
</style>
</head>
<body>
<form name="order_info" method="post" action="${escAttr(action)}" accept-charset="UTF-8">
${fieldsHtml}
</form>
<div class="center">
<p class="msg">결제창을 불러오는 중입니다...</p>
<p class="err" id="err" style="display:none"></p>
</div>
<script src="${KCP_SDK_URL}"></script>
<script>
window.addEventListener('load', function () {
  try {
    var pm = document.querySelector('input[name="pay_method"]');
    if (!pm) {
      pm = document.createElement('input');
      pm.type = 'hidden';
      pm.name = 'pay_method';
      document.order_info.appendChild(pm);
    }
    if (!pm.value) pm.value = '100000000000';
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

  debugLog('info', `KCP PC blob action=${action} fields=${Object.keys(kcp.fields).join(',')}`);
  const popup = window.open(blobUrl, '_blank', 'width=720,height=820,scrollbars=yes,resizable=yes');
  debugLog(popup ? 'info' : 'err', `팝업 open=${!!popup}`);

  setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000);

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
