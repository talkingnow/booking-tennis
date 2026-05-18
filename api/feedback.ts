export const config = { runtime: 'edge', regions: ['icn1'] };

type FeedbackKind = 'bug' | 'improvement' | 'other';

type FeedbackContext = {
  siteId: 'gy' | 'pj';
  appVersion: string;
  ua: string;
  timestamp: string;
  route: string;
};

type FeedbackPayload = {
  kind: FeedbackKind;
  message: string;
  context: FeedbackContext;
};

const KINDS = new Set(['bug', 'improvement', 'other']);

function validate(body: unknown): FeedbackPayload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!KINDS.has(b.kind as string)) return null;
  if (typeof b.message !== 'string' || b.message.trim().length === 0 || b.message.length > 2000) return null;
  if (!b.context || typeof b.context !== 'object') return null;
  const ctx = b.context as Record<string, unknown>;
  if (!['gy', 'pj'].includes(ctx.siteId as string)) return null;
  return b as unknown as FeedbackPayload;
}

function buildWebhookBody(url: string, payload: FeedbackPayload): string {
  const kindLabel: Record<FeedbackKind, string> = { bug: '버그', improvement: '개선', other: '기타' };
  const text = [
    `[${kindLabel[payload.kind]}] ${payload.message}`,
    `사이트: ${payload.context.siteId} | v${payload.context.appVersion}`,
    `경로: ${payload.context.route}`,
    `시각: ${payload.context.timestamp}`,
    `UA: ${payload.context.ua.slice(0, 120)}`,
  ].join('\n');

  const host = new URL(url).hostname;
  if (host.includes('discord.com')) return JSON.stringify({ content: text });
  if (host.includes('slack.com')) return JSON.stringify({ text });
  return JSON.stringify(payload);
}

async function postWithRetry(url: string, body: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok || res.status < 500) return res.ok;
    } catch {
      if (attempt === 1) return false;
    }
  }
  return false;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), { status: 405 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_payload' }), { status: 400 });
  }

  const payload = validate(body);
  if (!payload) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid_payload' }), { status: 400 });
  }

  const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'webhook_not_configured' }), { status: 500 });
  }

  const ok = await postWithRetry(webhookUrl, buildWebhookBody(webhookUrl, payload));
  if (!ok) {
    return new Response(JSON.stringify({ ok: false, error: 'webhook_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
