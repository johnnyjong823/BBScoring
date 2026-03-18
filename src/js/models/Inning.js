/**
 * BBScoring — Inning 局數資料模型
 */

export function createHalfInning() {
  return {
    atBats: [],
    runs: 0,
    hits: 0,
    errors: 0,
    leftOnBase: 0
  };
}

export function createInning(number) {
  return {
    number,
    top: createHalfInning(),
    bottom: createHalfInning()
  };
}
