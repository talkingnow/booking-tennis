export type FeedbackKind = 'bug' | 'improvement' | 'other';

export type FeedbackContext = {
  siteId: 'gy' | 'pj';
  appVersion: string;
  ua: string;
  timestamp: string;
  route: string;
};

export type FeedbackPayload = {
  kind: FeedbackKind;
  message: string;
  context: FeedbackContext;
};

export type FeedbackResponse =
  | { ok: true }
  | { ok: false; error: 'invalid_payload' | 'webhook_not_configured' | 'webhook_failed' };

// Forbidden keys that must never appear in the submitted context.
// Context is built via whitelist — this list is for test assertions only.
export const FORBIDDEN_CONTEXT_KEYS = [
  'cookie', 'cookies', 'account', 'accounts', 'favorite', 'favorites',
  'priorities', 'kcpForm', 'orderId', 'order_id', 'password', 'pw',
] as const;

declare const __APP_VERSION__: string;

function buildContext(): FeedbackContext {
  return {
    // Whitelist: only safe metadata — no auth/session/payment data
    siteId: (localStorage.getItem('gyt:activeSite') ?? 'gy') as 'gy' | 'pj',
    appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0',
    ua: navigator.userAgent,
    timestamp: new Date().toISOString(),
    route: window.location.pathname + window.location.search,
  };
}

export async function submitFeedback(
  kind: FeedbackKind,
  message: string,
): Promise<FeedbackResponse> {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length > 2000) {
    return { ok: false, error: 'invalid_payload' };
  }

  const payload: FeedbackPayload = {
    kind,
    message: trimmed,
    context: buildContext(),
  };

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as FeedbackResponse;
  } catch {
    return { ok: false, error: 'webhook_failed' };
  }
}
