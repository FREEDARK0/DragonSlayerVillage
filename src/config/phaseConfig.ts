export interface PhaseParams {
  calmTurns: number;
  harassmentTurns: number;
  dragonsInCalm: [number, number];
  dragonsInHarassment: [number, number];
  dragonsInBattle: [number, number];
  survivalTurnsForVictory: number;
  dragonMaxStayTurns: number;
}

const DEFAULT_PARAMS: PhaseParams = {
  calmTurns: 5,
  harassmentTurns: 15,
  dragonsInCalm: [0, 0],
  dragonsInHarassment: [1, 2],
  dragonsInBattle: [1, 3],
  survivalTurnsForVictory: 15,
  dragonMaxStayTurns: 4,
};

const PHASE_PARAMS_BY_YEAR: Record<number, Partial<PhaseParams>> = {
  1: {},
  2: {
    calmTurns: 4,
    harassmentTurns: 18,
    dragonsInHarassment: [1, 3],
    dragonsInBattle: [2, 3],
    survivalTurnsForVictory: 18,
  },
  3: {
    calmTurns: 4,
    harassmentTurns: 20,
    dragonsInHarassment: [2, 3],
    dragonsInBattle: [2, 3],
    survivalTurnsForVictory: 20,
  },
};

export function getPhaseParams(year: number): PhaseParams {
  const overrides = PHASE_PARAMS_BY_YEAR[year];
  if (!overrides) {
    const lastYear = Math.max(...Object.keys(PHASE_PARAMS_BY_YEAR).map(Number));
    const last = PHASE_PARAMS_BY_YEAR[lastYear] ?? {};
    const extraTurns = (year - lastYear) * 2;
    return {
      ...DEFAULT_PARAMS,
      ...last,
      harassmentTurns: (last.harassmentTurns ?? DEFAULT_PARAMS.harassmentTurns) + extraTurns,
      survivalTurnsForVictory: (last.survivalTurnsForVictory ?? DEFAULT_PARAMS.survivalTurnsForVictory) + extraTurns,
    };
  }
  return { ...DEFAULT_PARAMS, ...overrides };
}
