import { useAuthStore } from '@/stores/authStore';

/**
 * Apply boot-auto-login policy uniformly.
 * - on=true:  validateAndLogin both sites + startKeepAlive
 * - on=false: clear in-memory cookies & meta, stopKeepAlive
 *             (localStorage is preserved — toggling ON re-validates from there)
 *
 * Used in: App.tsx (boot), Account.tsx (toggle handler).
 * Must NOT be called inside render — call from effects or event handlers only.
 */
export function applyBootAutoLoginPolicy(on: boolean): void {
  const store = useAuthStore.getState();
  if (on) {
    store.validateAndLogin('gy');
    store.validateAndLogin('pj');
    store.startKeepAlive();
  } else {
    useAuthStore.setState({ cookies: {}, meta: {} });
    store.stopKeepAlive();
  }
}
