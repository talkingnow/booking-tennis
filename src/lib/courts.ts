/**
 * Static registry of the 10 gytennis court complexes.
 *
 * courtNos: display labels shown on gytennis.or.kr ("N 코트" column headers).
 * These match slot.courtNo values parsed by slotParser (which reads column
 * header text, NOT the yxjorg internal id). Verified live 2026-05-12.
 *
 * Notable: 성사전천후(실내) uses labels 9-12 because it shares numbering with
 * 성사실외 (labels 1-8) at the same facility complex.
 * The yxjorg/isvkrr internal ids are globally sequential (1-45+) but are
 * handled internally by the parser via Slot.internalCourtId.
 */

export type CourtName = {
  id: number;
  name: string;
  kind: 'outdoor' | 'indoor';
  /** Court face display labels as shown on gytennis.or.kr. */
  courtNos: number[];
};

export const COURTS: CourtName[] = [
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

export function getCourt(id: number): CourtName | undefined {
  return COURTS.find((c) => c.id === id);
}

export function courtName(id: number): string {
  return getCourt(id)?.name ?? `코트${id}`;
}
