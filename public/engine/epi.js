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
  counts.infPlace.fill(0);
  counts.infBus.fill(0);
  counts.infBarrio.fill(0);
  const n = city.n;
  const homeOf = city.homeOf;
  const placeOf = city.placeOf;
  const busOf = city.busOf;
  const barrioOf = city.barrioOf;
  const infHome = counts.infHome;
  const infPlace = counts.infPlace;
  const infBus = counts.infBus;
  const infBarrio = counts.infBarrio;
  let s = 0;
  let e = 0;
  let iCount = 0;
  let r = 0;
  let d = 0;
  for (let i = 0; i < n; i += 1) {
    const st = status[i];
    if (st === S) s += 1;
    else if (st === E) e += 1;
    else if (st === I) {
      iCount += 1;
      const outside = quarantined[i] ? leak : 1;
      infHome[homeOf[i]] += 1;
      infBarrio[barrioOf[i]] += 1;
      const place = placeOf[i];
      const bus = busOf[i];
      if (place >= 0) infPlace[place] += outside;
      if (bus >= 0) infBus[bus] += outside;
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

const COMP = { home: 0, place: 0, bus: 0, vector: 0, total: 0 };

// Las razones de cada sitio se arman una vez por fase del día.
// La fórmula de cada persona queda igual; solo se evita repetirla.
export function prepareHazards(ctx) {
  const city = ctx.city;
  const counts = ctx.counts;
  const day = ctx.day;
  const fumUntil = ctx.fumUntil;
  const delayed = ctx.delayed;
  let hazard = ctx.hazard;
  if (!hazard || hazard.homes !== city.homes.length) {
    hazard = ctx.hazard = {
      homes: city.homes.length,
      homeRatio: new Float64Array(city.homes.length),
      placeRatio: new Float64Array(city.places.length),
      busRatio: new Float64Array(city.buses.length),
      delayedRatio: new Float64Array(city.barrios.length),
      spill: new Float64Array(city.barrios.length),
      fumBarrio: new Uint8Array(city.barrios.length),
      placeFum: new Uint8Array(city.places.length),
      rev: -1,
    };
  }

  const homeSize = city.homeSize;
  const infHome = counts.infHome;
  for (let i = 0; i < hazard.homeRatio.length; i += 1) {
    const hs = homeSize[i];
    hazard.homeRatio[i] = hs > 1 ? infHome[i] / (hs - 1) : 0;
  }
  const placeSize = city.placeSize;
  const infPlace = counts.infPlace;
  for (let i = 0; i < hazard.placeRatio.length; i += 1) {
    const nP = placeSize[i];
    hazard.placeRatio[i] = nP > 0 ? infPlace[i] / nP : 0;
  }
  const busSize = city.busSize;
  const infBus = counts.infBus;
  for (let i = 0; i < hazard.busRatio.length; i += 1) {
    const nB = busSize[i];
    hazard.busRatio[i] = nB > 0 ? infBus[i] / nB : 0;
  }

  const barrioSize = city.barrioSize;
  const nBarrios = city.barrios.length;
  for (let b = 0; b < nBarrios; b += 1) {
    hazard.fumBarrio[b] = isFumigated(b, day, fumUntil) ? 1 : 0;
    const nBar = barrioSize[b];
    hazard.delayedRatio[b] = nBar > 0 ? (delayed[b] || 0) / nBar : 0;
  }
  const places = city.places;
  for (let i = 0; i < places.length; i += 1) hazard.placeFum[i] = hazard.fumBarrio[places[i].barrio];

  const spillBeta = ctx.config.contagion * BETAS.spill;
  for (let b = 0; b < nBarrios; b += 1) {
    const neigh = city.neighbors[b];
    let spill = 0;
    for (let k = 0; k < neigh.length; k += 1) {
      const nb = neigh[k];
      const ratio = hazard.delayedRatio[nb];
      if (ratio === 0) continue;
      const nf = hazard.fumBarrio[nb] ? FUMIGATION.home : 1;
      spill += spillBeta * city.barrios[nb].mosquito * nf * ratio;
    }
    hazard.spill[b] = spill;
  }
  hazard.rev = ctx.rev;
}

export function exposed(i, hazard, city) {
  const place = city.placeOf[i];
  const bus = city.busOf[i];
  return (
    hazard.homeRatio[city.homeOf[i]] > 0 ||
    (place >= 0 && hazard.placeRatio[place] > 0) ||
    (bus >= 0 && hazard.busRatio[bus] > 0) ||
    hazard.delayedRatio[city.barrioOf[i]] > 0 ||
    hazard.spill[city.barrioOf[i]] > 0
  );
}

// Fuerza de infección del día, separada por sitio.
// fumForce: índice de barrio que se evalúa como si hoy se fumigara (o null).
export function components(i, ctx) {
  if (!ctx.hazard || ctx.hazard.rev !== ctx.rev) prepareHazards(ctx);
  const { city, config, vaccinated, quarantined, closedUntil, day } = ctx;
  const fumForce = ctx.fumForce;
  const hazard = ctx.hazard;
  const b = city.barrioOf[i];
  const p = city.placeOf[i];
  const bus = city.busOf[i];
  const fumH = hazard.fumBarrio[b] || fumForce === b ? FUMIGATION.home : 1;

  let home = 0;
  const homeRatio = hazard.homeRatio[city.homeOf[i]];
  if (homeRatio !== 0) {
    home = config.contagion * BETAS.home * fumH * homeRatio;
    const stayed = p >= 0 && day < closedUntil[p] && !quarantined[i];
    if (stayed) home *= 1.35;
    if (quarantined[i]) home *= 1.1;
  }

  let place = 0;
  const placeOpen = p >= 0 && !(day < closedUntil[p]) && !quarantined[i];
  if (placeOpen) {
    const ratio = hazard.placeRatio[p];
    if (ratio !== 0) {
      const meta = city.places[p];
      const pf = hazard.placeFum[p] || fumForce === meta.barrio ? FUMIGATION.place : 1;
      place = config.contagion * meta.beta * pf * ratio;
    }
  }

  let busL = 0;
  const busOpen = bus >= 0 && !quarantined[i] && (p < 0 || !(day < closedUntil[p]));
  if (busOpen) {
    const ratio = hazard.busRatio[bus];
    if (ratio !== 0) busL = config.contagion * BETAS.bus * ratio;
  }

  let vector = 0;
  const delayedRatio = hazard.delayedRatio[b];
  const spill = hazard.spill[b];
  if (delayedRatio !== 0 || spill !== 0) {
    vector = config.contagion * BETAS.barrio * city.barrios[b].mosquito * fumH * delayedRatio + spill;
  }

  const scale = vaccinated[i] ? 1 - config.vaccineEfficacy : 1;
  if (scale !== 1) {
    home *= scale;
    place *= scale;
    busL *= scale;
    vector *= scale;
  }
  COMP.home = home;
  COMP.place = place;
  COMP.bus = busL;
  COMP.vector = vector;
  COMP.total = home + place + busL + vector;
  return COMP;
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
  const vLam = new Float64Array(city.barrios.length);
  for (let barrio = 0; barrio < vLam.length; barrio += 1) {
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
    vLam[barrio] = lam;
  }

  ctx.rev = 1;
  prepareHazards(ctx);
  let expected = 0;
  for (let i = 0; i < city.n; i += 1) {
    if (origin.has(i)) continue;
    const extra = vLam[city.barrioOf[i]];
    if (extra === 0 && !exposed(i, ctx.hazard, city)) continue;
    const hazard = (components(i, ctx).total + extra) * days;
    expected += infectProb(hazard);
  }
  return expected;
}
