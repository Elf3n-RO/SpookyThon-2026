import { unit } from "./rng.js";
import { COSTS, closureCost } from "./params.js";
import { S, I, components, horizonInfections, isFumigated } from "./epi.js";

// El Comité no mira el futuro ni el azar de los dados.
// Cada mañana ordena las acciones legales por contagios evitados por dólar
// y se guarda el dinero si la mejor jugada todavía no alcanza.
// Nunca vacuna a quien no está sano.

const MIN_RATIO = 0.0008;
const RESERVE_RATIO = 0.7;
const VACCINE_HORIZON = 8;

function vaccineValue(i, ctx) {
  if (ctx.status[i] !== S || ctx.vaccinated[i]) return 0;
  if (ctx.config.vaccineEfficacy <= 0) return 0;
  const comp = components(i, ctx);
  const chance = horizonInfections(comp.total, VACCINE_HORIZON);
  if (chance <= 0) return 0;
  const person = ctx.city.people[i];
  const betaP = person.place >= 0 ? ctx.city.places[person.place].beta : 0;
  const onward = 1 + 0.55 * betaP + 0.15 * Math.min(1, (ctx.city.homeSize[person.home] - 1) / 4);
  return chance * ctx.config.vaccineEfficacy * onward;
}

function quarantineValue(i, ctx, scratch) {
  if (ctx.status[i] !== I || ctx.quarantined[i]) return 0;
  if ((ctx.sickDays[i] || 0) < ctx.config.reportLag) return 0;
  const daysLeft = ctx.timer[i];
  if (daysLeft <= 0) return 0;
  const person = ctx.city.people[i];
  const place = person.place;
  const bus = person.bus;
  if (place < 0 && bus < 0) return 0;
  const infPlace = place >= 0 ? ctx.counts.infPlace[place] : 0;
  const infBus = bus >= 0 ? ctx.counts.infBus[bus] : 0;
  if (infPlace <= 0 && infBus <= 0) return 0;
  const removed = 1 - ctx.config.quarantineLeak;

  scratch.token += 1;
  if (scratch.token >= 0xfffffffe) {
    scratch.seen.fill(0);
    scratch.token = 1;
  }
  const token = scratch.token;
  let value = 0;

  const consider = (j, sharePlace, shareBus) => {
    if (j === i || ctx.status[j] !== S || scratch.seen[j] === token) return;
    scratch.seen[j] = token;
    const comp = components(j, ctx);
    let lam2 = comp.total;
    if (sharePlace && infPlace > 0) lam2 -= (comp.place / infPlace) * removed;
    if (shareBus && infBus > 0) lam2 -= (comp.bus / infBus) * removed;
    if (lam2 < 0) lam2 = 0;
    value += horizonInfections(comp.total, daysLeft) - horizonInfections(lam2, daysLeft);
  };

  if (place >= 0 && infPlace > 0) {
    const members = ctx.city.places[place].members;
    for (let k = 0; k < members.length; k += 1) {
      const j = members[k];
      consider(j, true, ctx.city.people[j].bus === bus && bus >= 0);
    }
  }
  if (bus >= 0 && infBus > 0) {
    const members = ctx.city.buses[bus].members;
    for (let k = 0; k < members.length; k += 1) consider(members[k], ctx.city.people[members[k]].place === place, true);
  }
  return value;
}

function fumigationValue(barrio, ctx) {
  if (isFumigated(barrio, ctx.day, ctx.fumUntil)) return 0;
  const localI = ctx.counts.infBarrio[barrio];
  const delayedI = ctx.delayed[barrio] || 0;
  if (localI <= 0 && delayedI <= 0) return 0;
  const members = ctx.city.barrioMembers[barrio];
  let value = 0;
  const prev = ctx.fumForce;
  for (let k = 0; k < members.length; k += 1) {
    const i = members[k];
    if (ctx.status[i] !== S) continue;
    ctx.fumForce = null;
    const open = components(i, ctx).total;
    ctx.fumForce = barrio;
    const shut = components(i, ctx).total;
    value += horizonInfections(open, 5) - horizonInfections(shut, 5);
  }
  ctx.fumForce = prev;
  return value;
}

function closureValue(placeId, ctx) {
  const meta = ctx.city.places[placeId];
  if (meta.type !== "school" && meta.type !== "market" && meta.type !== "central") return 0;
  if (ctx.day < ctx.closedUntil[placeId]) return 0;
  if (ctx.counts.infPlace[placeId] <= 0) return 0;
  const members = meta.members;
  let value = 0;
  for (let k = 0; k < members.length; k += 1) {
    const j = members[k];
    if (ctx.status[j] !== S || ctx.quarantined[j]) continue;
    const comp = components(j, ctx);
    const lam2 = Math.max(0, comp.total - comp.place + comp.home * 0.35);
    value += horizonInfections(comp.total, 4) - horizonInfections(lam2, 4);
  }
  return value;
}

function pushAction(pool, type, target, cost, value, label) {
  if (value <= 0 || !Number.isFinite(cost) || cost <= 0) return;
  const ratio = value / cost;
  if (ratio < MIN_RATIO) return;
  pool.push({ type, target, cost, value, ratio, label, key: `${type}:${target}` });
}

export function planSmart(ctx, scratch) {
  const pool = [];
  const { city, status, counts } = ctx;

  for (let i = 0; i < city.n; i += 1) {
    if (status[i] === I && !ctx.quarantined[i] && (ctx.sickDays[i] || 0) >= ctx.config.reportLag) {
      const value = quarantineValue(i, ctx, scratch);
      const person = city.people[i];
      const where = person.place >= 0 ? city.places[person.place].name : city.barrios[person.barrio].name;
      pushAction(pool, "quarantine", i, COSTS.quarantine, value, `Aislar caso en ${where}`);
    }
  }

  for (let b = 0; b < city.barrios.length; b += 1) {
    const value = fumigationValue(b, ctx);
    pushAction(pool, "fumigation", b, COSTS.fumigation, value, `Fumigar ${city.barrios[b].name}`);
  }

  for (let p = 0; p < city.places.length; p += 1) {
    const meta = city.places[p];
    if (meta.type !== "school" && meta.type !== "market" && meta.type !== "central") continue;
    const value = closureValue(p, ctx);
    pushAction(pool, "closure", p, closureCost(meta.type), value, `Cerrar ${meta.name} 5 días`);
  }

  for (let i = 0; i < city.n; i += 1) {
    const value = vaccineValue(i, ctx);
    const barrio = city.barrios[city.people[i].barrio].name;
    pushAction(pool, "vaccine", i, COSTS.vaccine, value, `Vacunar en ${barrio}`);
  }

  pool.sort((a, b) => b.ratio - a.ratio || a.key.localeCompare(b.key));

  const actions = [];
  let wallet = ctx.wallet;
  while (pool.length) {
    const best = pool[0];
    if (best.cost <= wallet) {
      actions.push(best);
      wallet -= best.cost;
      pool.shift();
      continue;
    }
    let altIndex = -1;
    for (let i = 1; i < pool.length; i += 1) {
      if (pool[i].cost <= wallet) {
        altIndex = i;
        break;
      }
    }
    if (altIndex >= 0 && pool[altIndex].ratio >= best.ratio * RESERVE_RATIO) {
      actions.push(pool[altIndex]);
      wallet -= pool[altIndex].cost;
      pool.splice(altIndex, 1);
      continue;
    }
    break;
  }
  return actions;
}

function collect(ids, predicate) {
  const out = [];
  for (let i = 0; i < ids.length; i += 1) {
    if (predicate(ids[i])) out.push(ids[i]);
  }
  return out;
}

export function planRandom(ctx) {
  const { city, config, status } = ctx;
  const reserved = new Set();
  const actions = [];
  let wallet = ctx.wallet;
  let guard = 0;

  const vaccinePool = () =>
    collect(indexRange(city.n), (i) => status[i] === S && !ctx.vaccinated[i] && !reserved.has(`vaccine:${i}`));
  const quarantinePool = () =>
    collect(
      indexRange(city.n),
      (i) =>
        status[i] === I &&
        !ctx.quarantined[i] &&
        (ctx.sickDays[i] || 0) >= ctx.config.reportLag &&
        !reserved.has(`quarantine:${i}`),
    );
  const fumigationPool = () => {
    const any = [];
    for (let b = 0; b < city.barrios.length; b += 1) {
      if (isFumigated(b, ctx.day, ctx.fumUntil) || reserved.has(`fumigation:${b}`)) continue;
      any.push(b);
    }
    return any;
  };
  const closurePool = () => {
    const out = [];
    for (let p = 0; p < city.places.length; p += 1) {
      const meta = city.places[p];
      if (meta.type !== "school" && meta.type !== "market" && meta.type !== "central") continue;
      if (ctx.day < ctx.closedUntil[p] || reserved.has(`closure:${p}`)) continue;
      if (ctx.counts.infPlace[p] <= 0) continue;
      if (closureCost(meta.type) > wallet) continue;
      out.push(p);
    }
    return out;
  };

  while (wallet >= COSTS.quarantine && guard < 600) {
    guard += 1;
    const options = [];
    if (wallet >= COSTS.vaccine && vaccinePool().length) options.push("vaccine");
    if (wallet >= COSTS.quarantine && quarantinePool().length) options.push("quarantine");
    if (wallet >= COSTS.fumigation && fumigationPool().length) options.push("fumigation");
    if (closurePool().length) options.push("closure");
    if (!options.length) break;

    const type = options[Math.floor(unit(config.seed, ctx.day, guard, 3) * options.length)];
    let pool;
    let cost;
    let label;
    if (type === "vaccine") {
      pool = vaccinePool();
      cost = COSTS.vaccine;
      label = "Vacuna al azar";
    } else if (type === "quarantine") {
      pool = quarantinePool();
      cost = COSTS.quarantine;
      label = "Aislamiento al azar";
    } else if (type === "fumigation") {
      pool = fumigationPool();
      cost = COSTS.fumigation;
      label = "Fumigación al azar";
    } else {
      pool = closurePool();
      const pick = pool[Math.floor(unit(config.seed, ctx.day, guard, 9) * pool.length)];
      cost = closureCost(city.places[pick].type);
      const action = {
        type,
        target: pick,
        cost,
        value: 0,
        ratio: 0,
        label: `Cierre al azar de ${city.places[pick].name}`,
        key: `${type}:${pick}`,
      };
      actions.push(action);
      wallet -= cost;
      reserved.add(action.key);
      continue;
    }
    const target = pool[Math.floor(unit(config.seed, ctx.day, guard, 8) * pool.length)];
    const action = { type, target, cost, value: 0, ratio: 0, label, key: `${type}:${target}` };
    actions.push(action);
    wallet -= cost;
    reserved.add(action.key);
  }
  return actions;
}

function indexRange(n) {
  const ids = new Array(n);
  for (let i = 0; i < n; i += 1) ids[i] = i;
  return ids;
}
