/**
 * Site adapter registry.
 * Adapters are registered at module level. gy.ts and pj.ts import this file
 * and call registerSite() at import time.
 */
import type { SiteId, SiteAdapter } from './types';

const _registry = new Map<SiteId, SiteAdapter>();

export function registerSite(adapter: SiteAdapter): void {
  _registry.set(adapter.config.id, adapter);
}

/**
 * Get the SiteAdapter for a given SiteId.
 * Throws if the adapter is not registered (should never happen in production).
 */
export function getSite(id: SiteId): SiteAdapter {
  const adapter = _registry.get(id);
  if (!adapter) {
    throw new Error(`Site adapter not registered: ${id}`);
  }
  return adapter;
}

export function listSites(): SiteAdapter[] {
  return Array.from(_registry.values());
}

/**
 * Check if all adapters are registered (useful for testing).
 */
export function isRegistered(id: SiteId): boolean {
  return _registry.has(id);
}
