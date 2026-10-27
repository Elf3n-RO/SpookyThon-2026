// Una sola fuente para los números del escenario.
// El README explica de dónde sale cada uno.

export const CANTON_POPULATION = 271145;
export const URBAN_PARISH_POPULATION = 261871;

export const BETAS = {
  home: 0.14,
  school: 0.06,
  market: 0.18,
  work: 0.05,
  central: 0.25,
  bus: 0.08,
  barrio: 0.17,
  spill: 0.035,
};

export const COSTS = {
  vaccine: 28,
  quarantine: 18,
  fumigation: 240,
  schoolClosurePerDay: 90,
  marketClosurePerDay: 150,
  centralClosurePerDay: 220,
  closureDays: 5,
  fumigationDays: 6,
};

// Efecto de una fumigación vigente: 0.5 = se elimina la mitad de la
// presión del domicilio y del barrio. En el predio diurno el efecto es menor.
export const FUMIGATION = {
  home: 0.5,
  place: 0.85,
  days: 6,
};

export const defaultConfig = {
  seed: 20261030,
  days: 72,
  population: 1600,
  contagion: 1,
  incubationDays: 6,
  infectiousDays: 5,
  vectorDelay: 6,
  vaccineEfficacy: 0.65,
  pDeathBase: 0.001,
  dailyBudget: 280,
  runs: 20,
  zeroBarrio: "eloy-alfaro",
  zeroPlace: "hogar",
  bedsPerThousand: 1.4,
  severeShare: 0.13,
  reportLag: 1,
  clusterSize: 4,
  quarantineLeak: 0.4,
};

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function normalizeConfig(input = {}) {
  const c = { ...defaultConfig, ...input };
  c.seed = Math.floor(Math.abs(Number(c.seed)));
  if (!Number.isFinite(c.seed) || c.seed === 0) c.seed = defaultConfig.seed;
  c.seed = c.seed % 4294967295;
  c.days = Math.round(clamp(c.days, 20, 120));
  c.population = Math.round(clamp(c.population, 700, 3600));
  c.contagion = clamp(c.contagion, 0.25, 4);
  c.incubationDays = Math.round(clamp(c.incubationDays, 2, 14));
  c.infectiousDays = Math.round(clamp(c.infectiousDays, 2, 14));
  c.vectorDelay = Math.round(clamp(c.vectorDelay, 0, 14));
  c.vaccineEfficacy = clamp(c.vaccineEfficacy, 0, 0.95);
  c.pDeathBase = clamp(c.pDeathBase, 0, 0.05);
  c.dailyBudget = Math.round(clamp(c.dailyBudget, 0, 4000));
  c.runs = Math.round(clamp(c.runs, 1, 80));
  c.bedsPerThousand = clamp(c.bedsPerThousand, 0.2, 8);
  c.severeShare = clamp(c.severeShare, 0, 0.5);
  c.zeroBarrio = String(c.zeroBarrio || defaultConfig.zeroBarrio);
  c.zeroPlace = String(c.zeroPlace || defaultConfig.zeroPlace);
  c.reportLag = Math.round(clamp(c.reportLag, 0, 5));
  c.clusterSize = Math.round(clamp(c.clusterSize, 1, 12));
  c.quarantineLeak = clamp(c.quarantineLeak, 0, 0.8);
  const places = ["hogar", "colegio", "mercado", "mercado-central", "trabajo", "bus"];
  if (!places.includes(c.zeroPlace)) c.zeroPlace = "hogar";
  return c;
}

export function closureCost(placeType) {
  const days = COSTS.closureDays;
  if (placeType === "school") return COSTS.schoolClosurePerDay * days;
  if (placeType === "central") return COSTS.centralClosurePerDay * days;
  if (placeType === "market") return COSTS.marketClosurePerDay * days;
  return Infinity;
}

export function hospitalBeds(population, bedsPerThousand) {
  return Math.max(1, Math.round((population * bedsPerThousand) / 1000));
}
