export type SlotStatus = 'available' | 'reserved' | 'blocked';

export type Slot = {
  /** YYYY-MM-DD */
  date: string;
  /** 1..10 (court complex id, == URL /daily/{courtId}) */
  courtId: number;
  /** court face number within the complex (1..N) */
  courtNo: number;
  /** slot start hour (24h, even numbers 6,8,...,20) */
  hour: number;
  /** 0 when DOM `value` flag is 0; actual price comes from rsvConfirm form payload */
  priceFlag: number;
  status: SlotStatus;
  /** The original yxjorg[] value, e.g. "2026-05-12|1|1|6|0" */
  raw: string;
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
