import type { KcpForm } from '../gytennis/types';
import type { SiteId } from '../sites/types';
import { debugLog } from '@/components/DebugPanel';
import { gyFetch } from '../gytennis/proxyClient';
import { parseKcpForm } from '../parsers/kcpParser';
import { useAuthStore } from '@/stores/authStore';

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

const GYTENNIS = 'https://www.gytennis.or.kr';
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
 * Open the KCP payment window.
 *
 * Mobile: m_redirect_url redirect flow — form.submit() to KCP with m_redirect_url,
 * KCP redirects back to /payment-result after payment. No popup, no KCP SDK.
 *
 * PC: KCP_Pay_Execute popup flow — blob page loads payplus_web.jsp SDK and opens
 * the KCP payment popup. onWindowClosed fires when the popup is closed.
 *
 * gytennis flow: /rsvConfirm → /rsvVf (already called) → KCP
 */
export async function openKcpPayment(kcp: KcpForm, opts: KcpHandoffOptions = {}): Promise<Window | null> {
  const { onWindowClosed, siteId } = opts;

  // Resolve action to absolute URL (gytennis-relative → absolute)
  const action = kcp.action.startsWith('http')
    ? kcp.action
    : `${GYTENNIS}${kcp.action.startsWith('/') ? '' : '/'}${kcp.action}`;

  const fieldsHtml = Object.entries(kcp.fields)
    .map(([n, v]) => `<input type="hidden" name="${escAttr(n)}" value="${escAttr(v)}" />`)
    .join('\n');

  if (isMobile()) {
    let targetAction = action;
    let targetFields = kcp.fields;

    // ── 2-hop resolution: /rsvPy is gytennis intermediate, not KCP ───────
    if (kcp.action.includes('/rsvPy') || !kcp.action.includes('kcp.co.kr')) {
      debugLog('info', `KCP 2-hop start action=${kcp.action}`);
      const siteIdToUse = siteId || 'gy';
      const c = useAuthStore.getState().cookies[siteIdToUse];
      if (c) {
        const searchParams = new URLSearchParams();
        for (const [k, v] of Object.entries(kcp.fields)) searchParams.append(k, v);
        
        const res = await gyFetch(kcp.action, { method: 'POST', body: searchParams, cookie: c });
        const html = res.status === 200 ? await res.text() : '';
        // Diagnostic: surface what /rsvPy actually returned so we can pick
        // the right parsing strategy (form / JS / 302 redirect / error).
        const formCount = (html.match(/<form\b/gi) || []).length;
        const actions = Array.from(html.matchAll(/<form[^>]*action=["']([^"']+)["']/gi)).map((m) => m[1]).slice(0, 4);
        const scriptHints = [
          /KCP_Pay_Execute/i.test(html) ? 'KCP_Pay_Execute' : '',
          /location\.href\s*=/i.test(html) ? 'location.href=' : '',
          /window\.open/i.test(html) ? 'window.open' : '',
          /smpay\.kcp\.co\.kr|spay\.kcp\.co\.kr/i.test(html) ? 'smpay-url' : '',
        ].filter(Boolean);
        // Capture hidden inputs from each <form> so we can see what state /rsvPy
        // exposes (e.g. enc_info filled or empty, ordr_idxx echo, etc.).
        const inputDumps = Array.from(html.matchAll(/<form[\s\S]*?<\/form>/gi)).map((fm) => {
          const inputs = Array.from((fm[0] || '').matchAll(/<input[^>]*name=["']([^"']+)["'][^>]*?(?:value=["']([^"']*)["'])?/gi))
            .map((im) => `${im[1]}=${(im[2]||'').length}b`).slice(0, 20).join(',');
          return inputs;
        });
        const scripts = Array.from(html.matchAll(/<script[^>]*(?:src=["']([^"']+)["'])?[^>]*>([\s\S]{0,200}?)<\/script>/gi))
          .map((sm) => sm[1] ? `src:${sm[1]}` : `inline:${(sm[2]||'').replace(/\s+/g,' ').slice(0,120)}`).slice(0, 6);
        debugLog('info', `2hop resp status=${res.status} loc=${res.location||'-'} htmlLen=${html.length} forms=${formCount} actions=${JSON.stringify(actions)} hints=${JSON.stringify(scriptHints)} inputs=${JSON.stringify(inputDumps)} scripts=${JSON.stringify(scripts)}`);
        debugLog('info', `2hop body[0..2400]=${html.slice(0,2400).replace(/\s+/g,' ')}`);

        const innerForm = res.status === 200 ? parseKcpForm(html) : null;
        if (innerForm && innerForm.action.includes('kcp.co.kr')) {
          targetAction = innerForm.action;
          targetFields = innerForm.fields;
          debugLog('info', `KCP 2-hop success — submitting to smpay`);
        } else {
          debugLog('err', `KCP 2-hop failed — no inner KCP form found (innerAction=${innerForm?.action || 'none'})`);
        }
      }
    }

    // ── Mobile: current-tab POST → KCP mobile page (M-V2-a) ──────────────
    const orderId = targetFields.ordr_idxx ?? '';
    const siteQuery = siteId ? `&site=${encodeURIComponent(siteId)}` : '';
    const redirectUrl = `${location.origin}/payment-result?order_id=${encodeURIComponent(orderId)}${siteQuery}`;

    // M-V1: spay.kcp.co.kr → mobile-spay.kcp.co.kr
    const mobileAction = toMobileAction(targetAction);

    // M-V2-a: standalone PWA uses target=_blank to escape in-app overlay.
    const form = document.createElement('form');
    form.method = 'post';
    form.action = mobileAction;
    form.acceptCharset = 'UTF-8';

    // Redirect-related fields from gytennis's rsvConfirm form must be stripped
    // and replaced with our own m_redirect_url. If gytennis's URL reaches KCP,
    // the browser is sent to gytennis.or.kr/ordrErr (no session cookie → 예약 만료).
    const REDIRECT_FIELDS = new Set([
      'm_redirect_url', 'Ret_URL', 'ret_url', 'RETURN_URL', 'return_url',
      'callback_url', 'noti_url', 'KCPRedirectURL',
      'returnUrl', 'ReturnUrl', 'retUrl', 'complete_url', 'CompleteUrl',
      'success_url', 'SuccessUrl', 'fail_url', 'FailUrl',
      'm_signal_url', 'notice_url', 'NoticeUrl', 'redirect_url', 'RedirectURL',
    ]);

    const addField = (name: string, value: string) => {
      const inp = document.createElement('input');
      inp.type = 'hidden'; inp.name = name; inp.value = value;
      form.appendChild(inp);
    };

    const strippedNames: string[] = [];
    for (const [n, v] of Object.entries(targetFields)) {
      if (REDIRECT_FIELDS.has(n)) { strippedNames.push(n); continue; }
      addField(n, v);
    }
    addField('m_redirect_url', redirectUrl);
    if (!targetFields.pay_method) addField('pay_method', '100000000000');

    const standalone = isStandalonePwa();
    if (standalone) form.target = '_blank';

    // Full payload dump for qa live capture via chrome-devtools MCP
    const formInputs = Array.from(form.elements) as HTMLInputElement[];
    debugLog('info', `KCP mobile payload ${JSON.stringify({
      action: mobileAction,
      redirect: redirectUrl,
      standalone,
      ua: navigator.userAgent.slice(0, 80),
      origin: location.origin,
      referrer: document.referrer || '(none)',
      fields: formInputs.map((el) => `${el.name}=${String(el.value).length}b`),
      strippedRedirect: strippedNames,
    })}`);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);

    return null;
  }

  // ── PC: KCP_Pay_Execute popup flow ────────────────────────────────────────
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
