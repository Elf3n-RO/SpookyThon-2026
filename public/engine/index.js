import { BARRIOS } from "./city.js";
import { defaultConfig, normalizeConfig, CANTON_POPULATION, URBAN_PARISH_POPULATION, COSTS, BETAS } from "./params.js";
import { runTrio } from "./simulate.js";
import { buildReport } from "./report.js";

export { BARRIOS, defaultConfig, normalizeConfig, CANTON_POPULATION, URBAN_PARISH_POPULATION, COSTS, BETAS, runTrio };

export function childSeed(master, index) {
  let x = (master + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = (x ^ (x >>> 15)) >>> 0;
  return x === 0 ? 1 : x;
}

function mean(values) {
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i];
  return sum / values.length;
}

function quantile(values, q) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function packStrategy(rows, population) {
  const ever = rows.map((r) => r.ever);
  const deaths = rows.map((r) => r.deaths);
  const peak = rows.map((r) => r.peak);
  const spent = rows.map((r) => r.spent);
  return {
    everMean: mean(ever),
    everP10: quantile(ever, 0.1),
    everP90: quantile(ever, 0.9),
    deathMean: mean(deaths),
    deathP10: quantile(deaths, 0.1),
    deathP90: quantile(deaths, 0.9),
    peakMean: mean(peak),
    peakP10: quantile(peak, 0.1),
    peakP90: quantile(peak, 0.9),
    spentMean: mean(spent),
    spentP10: quantile(spent, 0.1),
    spentP90: quantile(spent, 0.9),
    dosesMean: mean(rows.map((r) => r.doses)),
    fumigationsMean: mean(rows.map((r) => r.fumigations)),
    closuresMean: mean(rows.map((r) => r.closures)),
    quarantinesMean: mean(rows.map((r) => r.quarantines)),
    attackMean: mean(ever) / population,
  };
}

function curvePack(rows, key) {
  const days = rows[0][key].length;
  const newMean = [];
  const newP10 = [];
  const newP90 = [];
  for (let d = 0; d < days; d += 1) {
    const col = rows.map((r) => r[key][d]);
    newMean.push(mean(col));
    newP10.push(quantile(col, 0.1));
    newP90.push(quantile(col, 0.9));
  }
  return { mean: newMean, p10: newP10, p90: newP90 };
}

function band(values) {
  return { mean: mean(values), p10: quantile(values, 0.1), p90: quantile(values, 0.9) };
}

export function aggregate(trios, config) {
  const none = trios.map((t) => t.none);
  const random = trios.map((t) => t.random);
  const smart = trios.map((t) => t.smart);
  const savedNone = trios.map((t) => t.none.ever - t.smart.ever);
  const savedRandom = trios.map((t) => t.random.ever - t.smart.ever);
  const deathsSaved = trios.map((t) => t.none.deaths - t.smart.deaths);
  const everSorted = smart.map((r) => r.ever).slice().sort((a, b) => a - b);
  const mid = everSorted[Math.floor((everSorted.length - 1) / 2)];
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < trios.length; i += 1) {
    const dist = Math.abs(trios[i].smart.ever - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return {
    winsVsNone: trios.filter((t) => t.smart.ever < t.none.ever).length,
    winsVsRandom: trios.filter((t) => t.smart.ever < t.random.ever).length,
    tiesVsRandom: trios.filter((t) => t.smart.ever === t.random.ever).length,
    savedVsNone: band(savedNone),
    savedVsRandom: band(savedRandom),
    deathsSavedVsNone: band(deathsSaved),
    strategies: {
      none: packStrategy(none, config.population),
      random: packStrategy(random, config.population),
      smart: packStrategy(smart, config.population),
    },
    curves: {
      none: { dailyNew: curvePack(none, "dailyNew"), dailyCum: curvePack(none, "dailyCum") },
      random: { dailyNew: curvePack(random, "dailyNew"), dailyCum: curvePack(random, "dailyCum") },
      smart: { dailyNew: curvePack(smart, "dailyNew"), dailyCum: curvePack(smart, "dailyCum") },
    },
    directMean: mean(trios.map((t) => t.direct)),
    representativeIndex: best,
    representativeSeed: trios[best].seed,
  };
}

function publicDetail(trio) {
  return {
    seed: trio.seed,
    population: trio.population,
    zero: trio.zero,
    direct: trio.direct,
    barrioSize: trio.barrioSize,
    log: trio.smart.log,
    frames: {
      none: trio.none.frames,
      random: trio.random.frames,
      smart: trio.smart.frames,
    },
    smart: {
      ever: trio.smart.ever,
      deaths: trio.smart.deaths,
      peak: trio.smart.peak,
      spent: trio.smart.spent,
    },
    none: { ever: trio.none.ever, deaths: trio.none.deaths, peak: trio.none.peak },
    random: { ever: trio.random.ever, deaths: trio.random.deaths, peak: trio.random.peak, spent: trio.random.spent },
    barrios: BARRIOS.map((b) => ({
      id: b.id,
      name: b.name,
      parroquia: b.parroquia,
      lat: b.lat,
      lon: b.lon,
      mosquito: b.mosquito,
    })),
  };
}

export async function simulateMany(configInput = {}, onProgress, shouldContinue = () => true) {
  const config = normalizeConfig(configInput);
  const trios = [];
  for (let i = 0; i < config.runs; i += 1) {
    if (!shouldContinue()) return null;
    const seed = childSeed(config.seed, i);
    trios.push(runTrio({ ...config, seed }, false));
    if (onProgress) {
      onProgress(i + 1, config.runs);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (!shouldContinue()) return null;
  const stats = aggregate(trios, config);
  const detailTrio = runTrio({ ...config, seed: stats.representativeSeed }, true);
  const summary = {
    config,
    runs: config.runs,
    ...stats,
    detail: publicDetail(detailTrio),
  };
  summary.report = buildReport(summary);
  return summary;
}
