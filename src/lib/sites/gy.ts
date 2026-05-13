/**
 * gytennis SiteAdapter — wraps src/lib/gytennis/* with the SiteAdapter interface.
 * Auto-registers with the site registry on import.
 */
import * as gyAuth from '@/lib/gytennis/auth';
import * as gySlots from '@/lib/gytennis/slots';
import * as gyReserve from '@/lib/gytennis/reserve';
import { COURTS_GY } from '@/lib/courts';
import { GY_POLICY } from './types';
import type { SiteAdapter, SiteConfig } from './types';
import { registerSite } from './registry';

const GY_CONFIG: SiteConfig = {
  id: 'gy',
  name: '고양시',
  origin: 'https://www.gytennis.or.kr',
  proxyBase: '/api/gy',
  sessionCookieName: 'gytssn',
  policy: GY_POLICY,
};

export const gyAdapter: SiteAdapter = {
  config: GY_CONFIG,
  courts: COURTS_GY,
  login: gyAuth.login,
  isSessionValid: gyAuth.isSessionValid,
  checkSession: gyAuth.checkSession,
  logout: gyAuth.logout,
  getDaily: gySlots.getDaily,
  getDailyBatch: gySlots.getDailyBatch,
  submitReservation: gyReserve.submitReservation,
  verifyReservation: gyReserve.verifyReservation,
  cancelReservation: gyReserve.cancelReservation,
};

// Auto-register when this module is imported
registerSite(gyAdapter);
