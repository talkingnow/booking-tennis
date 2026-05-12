export type SlotStatus = 'available' | 'reserved' | 'blocked';

export type Slot = {
  /** YYYY-MM-DD */
  date: string;
  /** 1..10 (court complex id, == URL /daily/{courtId}) */
  courtId: number;
  /**
   * Court face number AS DISPLAYED on the gytennis website
   * (e.g. "9 코트" → 9). Parsed from the column header label,
   * NOT from the yxjorg `value` field which carries a different
   * site-internal id.
   */
  courtNo: number;
  /**
   * Site-internal court face id from the yxjorg `value` field
   * (3rd token). Required for submission but not user-visible.
   * For daily/4 indoor courts the internal id (13-16) differs
   * from the displayed courtNo (9-12).
   */
  internalCourtId: number;
  /** slot start hour (24h, even numbers 6,8,...,20) */
  hour: number;
  /** 0 when DOM `value` flag is 0; actual price comes from rsvConfirm form payload */
  priceFlag: number;
  status: SlotStatus;
  /** The original yxjorg[] value, e.g. "2026-05-12|1|1|6|0" */
  raw: string;
  /**
   * The isvkrr[] value for this slot, e.g. "2026-05-12|1|1|6|8000".
   * Differs from raw: last token is the actual price, not 0.
   * Empty string for non-available slots (no isvkrr input in DOM).
   */
  isvkrrRaw: string;
};

export type CourtMeta = {
  id: number;
  /** Daily max slot count for this complex (data-sot) */
  dailyLimit: number;
  /** Per-court max consecutive slots (data-soc) */
  perCourtLimit: number;
};

export type CalendarEntry = {
  date: string;
  reserved: number;
  totalCnt: number;
};

export type DailyView = {
  meta: CourtMeta;
  slots: Slot[];
  calendar: CalendarEntry[];
  /** Raw HTML form action target, normally "rsvConfirm" */
  submitPath: string;
  /** cvalue hidden field (== courtId) */
  cvalue: number;
  /** cdate hidden field */
  cdate: string;
};

export type LoginResult =
  | { ok: true; cookie: string }
  | { ok: false; reason: 'bad_credentials' | 'network' | 'unknown'; detail?: string };

export type ReservationResult =
  | {
      ok: true;
      orderId: string;
      /** Raw HTML of /rsvConfirm response. Contains the KCP popup form. */
      html: string;
      /** Extracted KCP popup parameters, if successfully parsed. */
      kcp: KcpForm | null;
    }
  | {
      ok: false;
      reason:
        | 'not_logged_in'
        | 'already_taken'
        | 'daily_limit'
        | 'per_court_limit'
        | 'unknown';
      detail?: string;
    };

export type KcpForm = {
  /** Form action URL, normally https://spay.kcp.co.kr/kcpPaypop.do?encType= */
  action: string;
  /** All hidden input name/value pairs, ready to URL-encode */
  fields: Record<string, string>;
};
