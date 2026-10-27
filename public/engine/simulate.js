import { unit } from "./rng.js";
import { COSTS, hospitalBeds } from "./params.js";
import { buildCity, describeZero } from "./city.js";
import {
  S,
  E,
  I,
  R,
  D,
  emptyCounts,
  fillCounts,
  components,
  infectProb,
  expectedDirectInfections,
} from "./epi.js";
import { planSmart, planRandom } from "./plan.js";

function applyAction(action, ctx) {
  const { status, vaccinated, quarantined, fumUntil, closedUntil, city } = ctx;
  if (action.cost > ctx.wallet + 1e-9) {
    throw new Error("La acción excede el presupuesto del día");
  }
  if (action.type === "vaccine") {
    if (status[action.target] !== S || vaccinated[action.target]) {
      throw new Error("Se intentó vacunar a alguien que no está sano");
    }
    vaccinated[action.target] = 1;
  } else   if (action.type === "quarantine") {
    if (status[action.target] !== I || quarantined[action.target]) {
      throw new Error("Se intentó aislar a alguien que no está infeccioso");
    }
    if ((ctx.sickDays[action.target] || 0) < ctx.config.reportLag) {
      throw new Error("Se intentó aislar un caso que todavía no está en el parte");
    }
    quarantined[action.target] = 1;
  } else if (action.type === "fumigation") {
    if (ctx.day < fumUntil[action.target]) throw new Error("Fumigación duplicada");
    fumUntil[action.target] = ctx.day + COSTS.fumigationDays;
  } else if (action.type === "closure") {
    const meta = city.places[action.target];
    if (!meta || (meta.type !== "school" && meta.type !== "market" && meta.type !== "central")) {
      throw new Error("Ese lugar no se cierra");
    }
    if (ctx.day < closedUntil[action.target]) throw new Error("Cierre duplicado");
    closedUntil[action.target] = ctx.day + COSTS.closureDays;
  } else {
    throw new Error("Acción desconocida");
  }
  ctx.wallet -= action.cost;
}

function summarizeLog(actions, city) {
  const row = {
    vaccines: 0,
    quarantines: 0,
    fumigated: [],
    closed: [],
    spent: 0,
  };
  for (const action of actions) {
    row.spent += action.cost;
    if (action.type === "vaccine") row.vaccines += 1;
    else if (action.type === "quarantine") row.quarantines += 1;
    else if (action.type === "fumigation") row.fumigated.push(city.barrios[action.target].name);
    else if (action.type === "closure") row.closed.push(city.places[action.target].name);
  }
  return row;
}

export function runStrategy(city, config, strategy, zero, detail) {
  const n = city.n;
  const status = new Uint8Array(n);
  const timer = new Uint8Array(n);
  const vaccinated = new Uint8Array(n);
  const quarantined = new Uint8Array(n);
  const fumUntil = new Int16Array(city.barrios.length);
  const closedUntil = new Int16Array(city.places.length);
  const prev = new Uint8Array(n);
  const delayed = new Float64Array(city.barrios.length);
  const sickDays = new Uint8Array(n);
  const counts = emptyCounts(city);
  const history = [];
  const everBarrio = new Int16Array(city.barrios.length);
  const scratch = { seen: new Uint32Array(n), token: 1 };
  const seeds = zero.ids?.length ? zero.ids : [zero.id];

  for (const id of seeds) {
    status[id] = I;
    timer[id] = config.infectiousDays;
    sickDays[id] = config.reportLag;
    everBarrio[city.people[id].barrio] += 1;
  }

  const ctx = {
    city,
    config,
    status,
    timer,
    sickDays,
    vaccinated,
    quarantined,
    fumUntil,
    closedUntil,
    counts,
    delayed,
    day: 0,
    wallet: 0,
    fumForce: null,
  };

  let wallet = 0;
  let spent = 0;
  const spentBy = { vaccine: 0, quarantine: 0, fumigation: 0, closure: 0 };
  let doses = 0;
  let quarantines = 0;
  let fumigations = 0;
  let closures = 0;
  let peak = 0;
  let peakDay = 0;
  const dailyNew = new Float64Array(config.days);
  const dailyCum = new Float64Array(config.days);
  const dailyI = new Float64Array(config.days);
  const log = [];
  const frames = detail ? [] : null;
  const beds = hospitalBeds(config.population, config.bedsPerThousand);

  for (let day = 0; day < config.days; day += 1) {
    wallet += config.dailyBudget;
    fillCounts(city, status, quarantined, counts, config.quarantineLeak);
    if (config.vectorDelay <= 0) delayed.set(counts.infBarrio);
    else {
      delayed.fill(0);
      const src = day - config.vectorDelay;
      if (src >= 0) delayed.set(history[src]);
    }

    ctx.day = day;
    ctx.wallet = wallet;
    ctx.fumForce = null;
    let actions = [];
    if (strategy === "smart") actions = planSmart(ctx, scratch);
    else if (strategy === "random") actions = planRandom(ctx);

    for (const action of actions) {
      applyAction(action, ctx);
      wallet = ctx.wallet;
      spent += action.cost;
      spentBy[action.type] += action.cost;
      if (action.type === "vaccine") doses += 1;
      else if (action.type === "quarantine") quarantines += 1;
      else if (action.type === "fumigation") fumigations += 1;
      else if (action.type === "closure") closures += 1;
    }
    if (detail || day < 8) log.push({ day, ...summarizeLog(actions, city) });

    fillCounts(city, status, quarantined, counts, config.quarantineLeak);
    const morningI = counts.I;
    prev.set(status);
    let news = 0;
    for (let i = 0; i < n; i += 1) {
      if (status[i] !== S) continue;
      const lambda = components(i, ctx).total;
      if (lambda <= 0) continue;
      if (unit(config.seed, day, i, 1) < infectProb(lambda)) {
        status[i] = E;
        timer[i] = config.incubationDays;
        everBarrio[city.people[i].barrio] += 1;
        news += 1;
      }
    }

    const load = (morningI * config.severeShare) / beds;
    let pd = config.pDeathBase;
    if (load > 1) pd = Math.min(0.012, config.pDeathBase + 0.003 * (load - 1));
    for (let i = 0; i < n; i += 1) {
      if (prev[i] === I) {
        timer[i] -= 1;
        if (timer[i] <= 0) {
          status[i] = unit(config.seed, day, i, 2) < pd ? D : R;
        } else {
          sickDays[i] += 1;
        }
      } else if (prev[i] === E) {
        timer[i] -= 1;
        if (timer[i] <= 0) {
          status[i] = I;
          timer[i] = config.infectiousDays;
          sickDays[i] = 0;
        }
      }
    }

    fillCounts(city, status, quarantined, counts, config.quarantineLeak);
    history.push(counts.infBarrio.slice());
    dailyNew[day] = news;
    dailyCum[day] = n - counts.S;
    dailyI[day] = counts.I;
    if (counts.I > peak) {
      peak = counts.I;
      peakDay = day;
    }
    if (frames) {
      frames.push({
        i: Array.from(counts.infBarrio),
        ever: Array.from(everBarrio),
        totals: { s: counts.S, e: counts.E, i: counts.I, r: counts.R, d: counts.D },
      });
    }
  }

  fillCounts(city, status, quarantined, counts);
  return {
    strategy,
    ever: n - counts.S,
    deaths: counts.D,
    recovered: counts.R,
    infectiousEnd: counts.I,
    exposedEnd: counts.E,
    peak,
    peakDay,
    spent,
    spentBy,
    doses,
    quarantines,
    fumigations,
    closures,
    dailyNew: Array.from(dailyNew),
    dailyCum: Array.from(dailyCum),
    dailyI: Array.from(dailyI),
    log,
    frames,
    beds,
  };
}

export function runTrio(config, withFrames) {
  const city = buildCity(config.seed, config.population);
  const zero = describeZero(city, config);
  const direct = expectedDirectInfections(city, config, zero.ids || [zero.id]);
  return {
    seed: config.seed,
    zero,
    direct,
    population: city.n,
    barrioSize: city.barrioSize,
    none: runStrategy(city, config, "none", zero, withFrames),
    random: runStrategy(city, config, "random", zero, withFrames),
    smart: runStrategy(city, config, "smart", zero, withFrames),
  };
}

export { S, E, I, R, D };
