/**
 * Static registry of the 10 gytennis court complexes.
 * Court face counts and limits are populated dynamically from the daily page
 * (data-sot / data-soc), so only id+name lives here.
 */

export type CourtName = {
  id: number;
  name: string;
  kind: 'outdoor' | 'indoor';
};

export const COURTS: CourtName[] = [
  { id: 1, name: '대화', kind: 'outdoor' },
  { id: 2, name: '삼송유수지', kind: 'outdoor' },
  { id: 3, name: '성라', kind: 'outdoor' },
  { id: 4, name: '성사전천후(실내)', kind: 'indoor' },
  { id: 5, name: '성사실외', kind: 'outdoor' },
  { id: 6, name: '중산', kind: 'outdoor' },
  { id: 7, name: '충장', kind: 'outdoor' },
  { id: 8, name: '킨텍스유수지', kind: 'outdoor' },
  { id: 9, name: '토당', kind: 'outdoor' },
  { id: 10, name: '화정', kind: 'outdoor' },
];

export function getCourt(id: number): CourtName | undefined {
  return COURTS.find((c) => c.id === id);
}

export function courtName(id: number): string {
  return getCourt(id)?.name ?? `코트${id}`;
}
