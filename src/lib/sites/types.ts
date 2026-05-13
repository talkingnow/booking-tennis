/**
 * Multi-site abstraction layer — type definitions.
 *
 * SiteId identifies the tennis reservation site.
 * SiteAdapter provides a uniform interface regardless of the upstream site.
 */
import type { CourtName } from '@/lib/courts';
import type {
  LoginResult,
  DailyView,
  Slot,
  ReservationResult,
} from '@/lib/gytennis/types';

export type SiteId = 'gy' | 'pj';

export type SitePolicy = {
  /** [startHour, endHour] inclusive-exclusive, 24h */
  hours: [number, number];
  /** Hour increment between slots. GY=2 (even hours only), PJ=1. Default 1. */
  hourStep?: number;
  /** Max contiguous slots per person per day (0 = dynamic via data-sot) */
  dailyMaxSlots: number;
  /** Max contiguous slots per court per booking (0 = dynamic via data-soc) */
  perCourtMaxSlots: number;
  /** Days in advance bookable */
  bookableDays: number;
  /** Free-text policy lines shown in PolicyNotice */
  notes: string[];
  /** Optional hourly fee table (KRW per hour). null = dynamic / unknown */
  hourlyFee?: {
    weekday: { early: number; day: number; night: number };
    weekend: { early: number; day: number; night: number };
  } | null;
};

export type SiteConfig = {
  id: SiteId;
  /** Display name */
  name: string;
  /** Upstream origin */
  origin: string;
  /** Proxy base path served by Vercel function */
  proxyBase: string; // '/api/gy' | '/api/pj'
  /** Session cookie name on the upstream site (M0 확정) */
  sessionCookieName: string; // 'gytssn' (gy) | 'pjtssn' (pj, R2 확정)
  policy: SitePolicy;
};

export type SiteAdapter = {
  config: SiteConfig;
  courts: CourtName[];
  login: (id: string, pw: string) => Promise<LoginResult>;
  isSessionValid: (cookie: string) => Promise<boolean>;
  /** Fine-grained session check; 'unknown' = upstream 502, not expiry */
  checkSession: (cookie: string) => Promise<'valid' | 'expired' | 'unknown'>;
  logout: (cookie: string) => Promise<void>;
  getDaily: (courtId: number, cookie: string, date?: string) => Promise<DailyView | null>;
  getDailyBatch: (
    courtIds: number[],
    cookie: string,
    date?: string,
  ) => Promise<Map<number, DailyView | null>>;
  submitReservation: (
    slots: Slot[],
    cookie: string,
    options?: { vanCode?: string },
  ) => Promise<ReservationResult>;
  verifyReservation: (orderId: string, cookie: string) => Promise<boolean>;
  cancelReservation: (orderId: string, cookie: string) => Promise<boolean>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Policy constants
// ──────────────────────────────────────────────────────────────────────────────

export const GY_POLICY: SitePolicy = {
  hours: [5, 22],
  hourStep: 2, // GY slots are 2-hour blocks: 06, 08, 10, ... (05 open, even hours)
  dailyMaxSlots: 0, // dynamic (data-sot)
  perCourtMaxSlots: 0, // dynamic (data-soc)
  bookableDays: 21,
  notes: [],
  hourlyFee: null,
};

export const PJ_POLICY: SitePolicy = {
  // Display range 06..21 (16 rows). Court faces expose 06 and 21 slot rows;
  // upstream booking window is 07~21, but server controls bookable availability per cell.
  hours: [6, 22],
  dailyMaxSlots: 2, // 1일 1면 2시간 = 1h 슬롯 2개
  perCourtMaxSlots: 2,
  bookableDays: 7,
  notes: [
    '1인 1일 1면(2시간)까지 · 1일 1회만 예약',
    '당일 기준 7일까지 예약 가능',
    '취소: 3일 전까지 환불 · 당일 환불 불가 · 비기상 사유 연 6회 한도',
    '기상·재해 사유는 전액 환불',
    '본인인증(거주민/재직/사업자) 필요',
    '결제수단: 신용카드',
    '평일 3,000원/h (야간 5,000) · 주말·공휴일 3,500원/h (야간 5,500)',
  ],
  hourlyFee: {
    weekday: { early: 3000, day: 3000, night: 5000 },
    weekend: { early: 3500, day: 3500, night: 5500 },
  },
};
