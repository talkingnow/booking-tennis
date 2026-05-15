/**
 * pjtennis types — re-exports from gytennis/types (shared wire format)
 * plus any pjtennis-specific additions.
 *
 * pjtennis appears to use the same server codebase as gytennis (same URL
 * patterns, same HTML structure per §1-2 of the build plan). All core types
 * are therefore identical. This file re-exports them so pjtennis modules
 * can import from a single source without depending on gytennis directly.
 */
export type {
  SlotStatus,
  Slot,
  CourtMeta,
  CalendarEntry,
  DailyView,
  LoginResult,
  LoginFailReason,
  ReservationResult,
  KcpForm,
} from '@/lib/gytennis/types';
