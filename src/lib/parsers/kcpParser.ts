import type { KcpForm } from '../gytennis/types';

/**
 * Extract the KCP payment popup form from a /rsvConfirm response HTML.
 * Looks for a `<form>` whose action contains "kcp" and harvests all hidden inputs.
 * Returns null when no such form exists (e.g. server returned an error page).
 */
export function parseKcpForm(html: string): KcpForm | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const forms = Array.from(doc.querySelectorAll<HTMLFormElement>('form'));
  const form =
    forms.find((f) => /kcp/i.test(f.getAttribute('action') ?? '')) ??
    forms.find((f) => f.querySelector('input[name="ordr_idxx"]'));
  if (!form) return null;

  const action = form.getAttribute('action') ?? '';
  const fields: Record<string, string> = {};
  form.querySelectorAll<HTMLInputElement>('input[name]').forEach((input) => {
    const name = input.getAttribute('name');
    if (!name) return;
    fields[name] = input.value ?? '';
  });
  return { action, fields };
}

/**
 * Extract the order id from a /rsvConfirm response.
 * Looks for hidden input `name="ordr_idxx"` first, then any string matching GYP\\d+\\w+.
 */
export function extractOrderId(html: string): string | null {
  const m = html.match(/name="ordr_idxx"\s+value="([^"]+)"/);
  if (m) return m[1];
  const fallback = html.match(/GYP\d{17,}[A-Z0-9]+/);
  return fallback ? fallback[0] : null;
}
