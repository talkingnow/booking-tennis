/**
 * pjtennis SiteAdapter — wraps src/lib/pjtennis/* with the SiteAdapter interface.
 * Auto-registers with the site registry on import.
 */
import * as pjAuth from '@/lib/pjtennis/auth';
import * as pjSlots from '@/lib/pjtennis/slots';
import * as pjReserve from '@/lib/pjtennis/reserve';
import { COURTS_PJ } from '@/lib/courts';
import { PJ_POLICY } from './types';
import type { SiteAdapter, SiteConfig } from './types';
import { registerSite } from './registry';

const PJ_CONFIG: SiteConfig = {
  id: 'pj',
  name: '파주시',
  origin: 'https://www.pjtennis.or.kr',
  proxyBase: '/api/pj',
  // R2 확정 (M0 curl 2026-05-12): Set-Cookie: pjtssn=… 확인됨
  sessionCookieName: 'pjtssn',
  policy: PJ_POLICY,
};

export const pjAdapter: SiteAdapter = {
  config: PJ_CONFIG,
  courts: COURTS_PJ,
  login: pjAuth.login,
  isSessionValid: pjAuth.isSessionValid,
  logout: pjAuth.logout,
  getDaily: pjSlots.getDaily,
  getDailyBatch: pjSlots.getDailyBatch,
  submitReservation: pjReserve.submitReservation,
  verifyReservation: pjReserve.verifyReservation,
  cancelReservation: pjReserve.cancelReservation,
};

// Auto-register when this module is imported
registerSite(pjAdapter);
