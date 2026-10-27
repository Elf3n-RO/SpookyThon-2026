import { BETAS, FUMIGATION } from "./params.js";

export const S = 0;
export const E = 1;
export const I = 2;
export const R = 3;
export const D = 4;

export function emptyCounts(city) {
  return {
    infHome: new Float64Array(city.homes.length),
    susHome: new Float64Array(city.homes.length),
    infPlace: new Float64Array(city.places.length),
    susPlace: new Float64Array(city.places.length),
    infBus: new Float64Array(city.buses.length),
    susBus: new Float64Array(city.buses.length),
    infBarrio: new Float64Array(city.barrios.length),
    susBarrio: new Float64Array(city.barrios.length),
    S: 0,
    E: 0,
    I: 0,
    R: 0,
    D: 0,
  };
}

export function fillCounts(city, status, quarantined, counts, leak = 0) {
  counts.infHome.fill(0);
  counts.susHome.fill(0);
  counts.infPlace.fill(0);
  counts.susPlace.fill(0);
  counts.infBus.fill(0);
  counts.susBus.fill(0);
  counts.infBarrio.fill(0);
  counts.susBarrio.fill(0);
  let s = 0;
  let e = 0;
  let iCount = 0;
  let r = 0;
  let d = 0;
  const n = city.n;
  const people = city.people;
  for (let i = 0; i < n; i += 1) {
    const st = status[i];
    const person = people[i];
    if (st === S) {
      s += 1;
      counts.susHome[person.home] += 1;
      counts.susBarrio[person.barrio] += 1;
      if (person.place >= 0) counts.susPlace[person.place] += 1;
      if (person.bus >= 0) counts.susBus[person.bus] += 1;
    } else if (st === E) e += 1;
    else if (st === I) {
      iCount += 1;
      const outside = quarantined[i] ? leak : 1;
      counts.infHome[person.home] += 1;
      counts.infBarrio[person.barrio] += 1;
      if (person.place >= 0) counts.infPlace[person.place] += outside;
      if (person.bus >= 0) counts.infBus[person.bus] += outside;
    } else if (st === R) r += 1;
    else d += 1;
  }
  counts.S = s;
  counts.E = e;
  counts.I = iCount;
  counts.R = r;
  counts.D = d;
  return counts;
}

export function isFumigated(barrio, day, fumUntil) {
  return day < fumUntil[barrio];
}

// Fuerza de infección del día, separada por sitio.
// fumForce: índice de barrio que se evalúa como si hoy se fumigara (o null).
export function components(i, ctx) {
  const { city, config, counts, fumUntil, closedUntil, vaccinated, quarantined, delayed, day } = ctx;
  const fumForce = ctx.fumForce;
  const person = city.people[i];
  const b = person.barrio;
  const h = person.home;
  const p = person.place;
  const bus = person.bus;
  const fumHere = isFumigated(b, day, fumUntil) || fumForce === b;
  const fumH = fumHere ? FUMIGATION.home : 1;

  let home = 0;
  let place = 0;
  let busL = 0;
  let vector = 0;
  const hs = city.homeSize[h];
  if (hs > 1) {
    home = config.contagion * BETAS.home * fumH * (counts.infHome[h] / (hs - 1));
    const stayed = p >= 0 && day < closedUntil[p] && !quarantined[i];
    if (stayed) home *= 1.35;
    if (quarantined[i]) home *= 1.1;
  }

  const placeOpen = p >= 0 && !(day < closedUntil[p]) && !quarantined[i];
  if (placeOpen) {
    const meta = city.places[p];
    const nP = city.placeSize[p];
    if (nP > 0) {
      const pf = isFumigated(meta.barrio, day, fumUntil) || fumForce === meta.barrio ? FUMIGATION.place : 1;
      place = config.contagion * meta.beta * pf * (counts.infPlace[p] / nP);
    }
  }

  const busOpen = bus >= 0 && !quarantined[i] && (p < 0 || !(day < closedUntil[p]));
  if (busOpen) {
    const nB = city.busSize[bus];
    if (nB > 0) busL = config.contagion * BETAS.bus * (counts.infBus[bus] / nB);
  }

  const nBar = city.barrioSize[b];
  if (nBar > 0) {
    vector = config.contagion * BETAS.barrio * city.barrios[b].mosquito * fumH * ((delayed[b] || 0) / nBar);
  }
  const neigh = city.neighbors[b];
  for (let k = 0; k < neigh.length; k += 1) {
    const nb = neigh[k];
    const nbn = city.barrioSize[nb];
    if (nbn <= 0) continue;
    const nf = isFumigated(nb, day, fumUntil) || fumForce === nb ? FUMIGATION.home : 1;
    vector += config.contagion * BETAS.spill * city.barrios[nb].mosquito * nf * ((delayed[nb] || 0) / nbn);
  }

  const scale = vaccinated[i] ? 1 - config.vaccineEfficacy : 1;
  home *= scale;
  place *= scale;
  busL *= scale;
  vector *= scale;
  return { home, place, bus: busL, vector, total: home + place + busL + vector };
}

export function infectProb(lambda) {
  if (lambda <= 0) return 0;
  return 1 - Math.exp(-lambda);
}

export function horizonInfections(lambda, days) {
  if (lambda <= 0 || days <= 0) return 0;
  return 1 - Math.exp(-lambda * days);
}

// Esperado de contagios directos del caso índice si nadie más transmite.
export function expectedDirectInfections(city, config, zeros) {
  const list = Array.isArray(zeros) ? zeros : [zeros];
  const counts = emptyCounts(city);
  const origin = new Set(list);
  const barrioLoad = new Float64Array(city.barrios.length);
  for (const zero of list) {
    const person = city.people[zero];
    counts.infHome[person.home] += 1;
    counts.infBarrio[person.barrio] += 1;
    barrioLoad[person.barrio] += 1;
    if (person.place >= 0) counts.infPlace[person.place] += 1;
    if (person.bus >= 0) counts.infBus[person.bus] += 1;
  }
  const delayed = new Float64Array(city.barrios.length);
  const fumUntil = new Int16Array(city.barrios.length);
  const closedUntil = new Int16Array(city.places.length);
  const vaccinated = new Uint8Array(city.n);
  const quarantined = new Uint8Array(city.n);
  const ctx = {
    city,
    config,
    counts,
    fumUntil,
    closedUntil,
    vaccinated,
    quarantined,
    delayed,
    day: 0,
    fumForce: null,
  };
  const days = config.infectiousDays;
  const vLam = (barrio) => {
    let lam = 0;
    const nBar = city.barrioSize[barrio];
    if (nBar > 0 && barrioLoad[barrio] > 0) {
      lam += config.contagion * BETAS.barrio * city.barrios[barrio].mosquito * (barrioLoad[barrio] / nBar);
    }
    const neigh = city.neighbors[barrio];
    for (let k = 0; k < neigh.length; k += 1) {
      const nb = neigh[k];
      const nSrc = city.barrioSize[nb];
      if (nSrc > 0 && barrioLoad[nb] > 0) {
        lam += config.contagion * BETAS.spill * city.barrios[nb].mosquito * (barrioLoad[nb] / nSrc);
      }
    }
    return lam;
  };

  let expected = 0;
  for (let i = 0; i < city.n; i += 1) {
    if (origin.has(i)) continue;
    const local = components(i, ctx).total;
    const hazard = (local + vLam(city.people[i].barrio)) * days;
    expected += infectProb(hazard);
  }
  return expected;
}
