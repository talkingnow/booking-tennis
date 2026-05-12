/**
 * Static registry of the 10 gytennis court complexes.
 * courtNos sourced from courts.yaml (BookingTennis recon, 2026-05-11).
 * daily_limit / per_court_limit are fetched live from data-sot / data-soc.
 */

export type CourtName = {
  id: number;
  name: string;
  kind: 'outdoor' | 'indoor';
  courtNos: number[];
};

export const COURTS: CourtName[] = [
  { id: 1,  name: '대화',           kind: 'outdoor', courtNos: [1,2,3,4] },
  { id: 2,  name: '삼송유수지',     kind: 'outdoor', courtNos: [1,2,3,4] },
  { id: 3,  name: '성라',           kind: 'outdoor', courtNos: [1,2,3,4] },
  { id: 4,  name: '성사전천후(실내)', kind: 'indoor',  courtNos: [1,2]     },
  { id: 5,  name: '성사실외',       kind: 'outdoor', courtNos: [1,2,3,4] },
  { id: 6,  name: '중산',           kind: 'outdoor', courtNos: [1,2,3,4] },
  { id: 7,  name: '충장',           kind: 'outdoor', courtNos: [1,2,3,4] },
  { id: 8,  name: '킨텍스유수지',   kind: 'outdoor', courtNos: [1,2,3,4] },
  { id: 9,  name: '토당',           kind: 'outdoor', courtNos: [1,2,3,4] },
  { id: 10, name: '화정',           kind: 'outdoor', courtNos: [1,2,3,4] },
];

export function getCourt(id: number): CourtName | undefined {
  return COURTS.find((c) => c.id === id);
}

export function courtName(id: number): string {
  return getCourt(id)?.name ?? `코트${id}`;
}
