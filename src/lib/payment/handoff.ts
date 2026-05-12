import type { KcpForm } from '../gytennis/types';

/**
 * Open the KCP payment popup by dynamically building a form, attaching it to
 * the document, and submitting it.
 *
 * Notes:
 * - The submission MUST be triggered from a user gesture (a click handler),
 *   otherwise iOS Safari and Chrome block window.open / popups.
 * - target="_blank" opens in a new tab; pass openInSelf=true to navigate the
 *   current window instead (useful when the KCP page doesn't restore well).
 */
export function openKcpPayment(kcp: KcpForm, opts: { openInSelf?: boolean } = {}): void {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = kcp.action;
  form.acceptCharset = 'UTF-8';
  form.style.display = 'none';
  if (!opts.openInSelf) form.target = '_blank';

  for (const [name, value] of Object.entries(kcp.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  try {
    form.submit();
  } finally {
    // Detach after the navigation has been initiated
    setTimeout(() => form.remove(), 1000);
  }
}
