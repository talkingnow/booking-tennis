/**
 * Court registry for all supported sites.
 *
 * Local SiteId type alias (structural copy of sites/types.ts SiteId) to avoid
 * a circular import: sites/types.ts → courts.ts → sites/types.ts.
 * TypeScript treats these as compatible because they are structurally identical.
 */
type SiteId = 'gy' | 'pj';

export type CourtName = {
  id: number;
  name: string;
  kind: 'outdoor' | 'indoor';
  /** Court face display labels as shown on the site. */
  courtNos: number[];
};

// ──────────────────────────────────────────────────────────────────────────────
// Goyang (gytennis.or.kr) — 10 court complexes
// Verified live 2026-05-12.
// ──────────────────────────────────────────────────────────────────────────────
export const COURTS_GY: CourtName[] = [
  { id: 1,  name: '대화',            kind: 'outdoor', courtNos: [1,2,3,4]           },
  { id: 2,  name: '삼송유수지',      kind: 'outdoor', courtNos: [1,2,3,4,5]         },
  { id: 3,  name: '성라',            kind: 'outdoor', courtNos: [1,2,3]             },
  { id: 4,  name: '성사전천후(실내)', kind: 'indoor',  courtNos: [9,10,11,12]        },
  { id: 5,  name: '성사실외',        kind: 'outdoor', courtNos: [1,2,3,4,5,6,7,8]  },
  { id: 6,  name: '중산',            kind: 'outdoor', courtNos: [1,2,3]             },
  { id: 7,  name: '충장',            kind: 'outdoor', courtNos: [1,2,3,4]           },
  { id: 8,  name: '킨텍스유수지',    kind: 'outdoor', courtNos: [1,2,3,4,5]         },
  { id: 9,  name: '토당',            kind: 'outdoor', courtNos: [1,2,3,4,5,6]       },
  { id: 10, name: '화정',            kind: 'outdoor', courtNos: [1,2,3]             },
];

// ──────────────────────────────────────────────────────────────────────────────
// Paju (pjtennis.or.kr) — 12 court complexes
// Verified live 2026-05-12 via daily/1..12 page scraping.
// 합계: 55 court faces.
// ──────────────────────────────────────────────────────────────────────────────
// Verified live 2026-05-13 via agent-browser /daily/{1..12} gtitle capture.
// Previous mapping had 8 of 12 entries wrong (id 2,3,6,7,9,10,11,12).
export const COURTS_PJ: CourtName[] = [
  { id: 1,  name: '광탄',            kind: 'outdoor', courtNos: [1,2,3]             },
  { id: 2,  name: '하지석동',        kind: 'outdoor', courtNos: [1,2,3,4,5]         },
  { id: 3,  name: '금촌',            kind: 'outdoor', courtNos: [1,2,3,4]           },
  { id: 4,  name: '법원',            kind: 'outdoor', courtNos: [1,2,3,4]           },
  { id: 5,  name: '연풍리',          kind: 'outdoor', courtNos: [1,2,3]             },
  { id: 6,  name: '운정1(가온A)',    kind: 'outdoor', courtNos: [1,2,3,4]           },
  { id: 7,  name: '운정2(가온B)',    kind: 'outdoor', courtNos: [1,2,3]             },
  { id: 8,  name: '상지석동',        kind: 'outdoor', courtNos: [1,2,3]             },
  { id: 9,  name: '월롱',            kind: 'outdoor', courtNos: [1,2,3,4,5,6]       },
  { id: 10, name: '적성',            kind: 'outdoor', courtNos: [1,2,3,4,5,6]       },
  { id: 11, name: '통일',            kind: 'outdoor', courtNos: [1,2,3,4,5,6]       },
  { id: 12, name: '공설(파주스타디움)', kind: 'outdoor', courtNos: [1,2,3,4,5,6,7,8] },
];

// ──────────────────────────────────────────────────────────────────────────────
// Multi-site helpers
// ──────────────────────────────────────────────────────────────────────────────

const COURTS_BY_SITE: Record<SiteId, CourtName[]> = {
  gy: COURTS_GY,
  pj: COURTS_PJ,
};

export function getCourts(siteId: SiteId): CourtName[] {
  return COURTS_BY_SITE[siteId] ?? [];
}

export function getCourt(siteId: SiteId, id: number): CourtName | undefined {
  return getCourts(siteId).find((c) => c.id === id);
}

export function courtName(siteId: SiteId, id: number): string {
  return getCourt(siteId, id)?.name ?? `코트${id}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Legacy exports — kept for backward compat; all callers updated to siteId form.
// Aliases to COURTS_GY.
// ──────────────────────────────────────────────────────────────────────────────
/** @deprecated Use COURTS_GY or getCourts(siteId) */
export const COURTS = COURTS_GY;
