import { simulateMany, defaultConfig } from "../public/engine/index.js";

const config = { ...defaultConfig, ...(process.env.RUNS ? { runs: Number(process.env.RUNS) } : {}) };
const t0 = Date.now();
const result = await simulateMany(config);
const s = result.strategies;
console.log(JSON.stringify({
  ms: Date.now() - t0,
  seed: result.config.seed,
  runs: result.runs,
  population: result.config.population,
  days: result.config.days,
  directMean: result.directMean,
  none: s.none.everMean,
  random: s.random.everMean,
  smart: s.smart.everMean,
  noneP: [s.none.everP10, s.none.everP90],
  smartP: [s.smart.everP10, s.smart.everP90],
  savedNone: result.savedVsNone,
  savedRandom: result.savedVsRandom,
  winsNone: result.winsVsNone,
  winsRandom: result.winsVsRandom,
  spent: { none: s.none.spentMean, random: s.random.spentMean, smart: s.smart.spentMean },
  doses: s.smart.dosesMean,
  quar: s.smart.quarantinesMean,
  fum: s.smart.fumigationsMean,
  close: s.smart.closuresMean,
  deaths: { none: s.none.deathMean, random: s.random.deathMean, smart: s.smart.deathMean },
  peak: { none: s.none.peakMean, random: s.random.peakMean, smart: s.smart.peakMean },
  zero: result.detail.zero,
  opening: result.detail.log.slice(0, 4),
}, null, 2));
