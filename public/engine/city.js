import { mulberry32, unit } from "./rng.js";
import { BETAS } from "./params.js";

// Pesos: la parroquia urbana Manta concentra ~96,6 % del cantón
// (261.871 de 271.145, INEC 2022). Los pesos de barrio son un reparto
// ilustrado dentro de esa parroquia, no un censo por barrio.
// mosquito > 1 marca sectores donde el escenario supone más criaderos
// (almacenamiento de agua, densidad). Eloy Alfaro y Primero de Mayo
// salen en las mingas de dengue reportadas en Manta en 2025.
// lat/lon son centros de referencia para visualización, no límites oficiales.
// Algunos se contrastaron con OpenStreetMap; el resto son aproximaciones.

export const BARRIOS = [
  { id: "centro", name: "Centro", parroquia: "Manta", weight: 7, mosquito: 1.1, x: 318, y: 274, lat: -0.9516, lon: -80.7207 },
  { id: "tarqui", name: "Tarqui", parroquia: "Manta", weight: 14, mosquito: 1.2, x: 292, y: 348, lat: -0.9620, lon: -80.7170 },
  { id: "los-esteros", name: "Los Esteros", parroquia: "Manta", weight: 12, mosquito: 1.38, x: 228, y: 312, lat: -0.9622, lon: -80.6923 },
  { id: "eloy-alfaro", name: "Eloy Alfaro", parroquia: "Manta", weight: 11, mosquito: 1.5, x: 438, y: 368, lat: -0.9823, lon: -80.7064 },
  { id: "cuba", name: "Cuba", parroquia: "Manta", weight: 6, mosquito: 1.12, x: 368, y: 214, lat: -0.9820, lon: -80.7020 },
  { id: "quince", name: "15 de Abril", parroquia: "Manta", weight: 7, mosquito: 1.22, x: 470, y: 286, lat: -0.9510, lon: -80.6970 },
  { id: "primero-mayo", name: "Primero de Mayo", parroquia: "Manta", weight: 6.5, mosquito: 1.42, x: 492, y: 408, lat: -0.9630, lon: -80.6900 },
  { id: "barbasquillo", name: "Barbasquillo", parroquia: "Manta", weight: 7, mosquito: 0.72, x: 528, y: 176, lat: -0.9515, lon: -80.7527 },
  { id: "pradera", name: "La Pradera", parroquia: "Manta", weight: 5, mosquito: 0.88, x: 404, y: 156, lat: -0.9815, lon: -80.6879 },
  { id: "jocay", name: "Jocay", parroquia: "Manta", weight: 5, mosquito: 0.84, x: 176, y: 220, lat: -0.9599, lon: -80.7161 },
  { id: "maria", name: "María Auxiliadora", parroquia: "Manta", weight: 6, mosquito: 1.18, x: 386, y: 442, lat: -0.9740, lon: -80.7020 },
  { id: "urbirrios", name: "Urbirrios", parroquia: "Manta", weight: 5.1, mosquito: 1.0, x: 556, y: 292, lat: -0.9450, lon: -80.6700 },
  { id: "san-pedro", name: "San Pedro", parroquia: "Manta", weight: 5, mosquito: 1.08, x: 236, y: 400, lat: -0.9810, lon: -80.7180 },
  { id: "san-mateo", name: "San Mateo", parroquia: "San Mateo", weight: 1.4, mosquito: 1.28, x: 610, y: 456, lat: -1.0630, lon: -80.7160 },
  { id: "santa-marianita", name: "Santa Marianita", parroquia: "Santa Marianita", weight: 1.0, mosquito: 0.9, x: 612, y: 108, lat: -0.9797, lon: -80.8415 },
  { id: "san-lorenzo", name: "San Lorenzo", parroquia: "San Lorenzo", weight: 1.0, mosquito: 1.22, x: 132, y: 444, lat: -1.0700, lon: -80.8950 },
];

const ROUTES = [
  ["jocay", "los-esteros", "tarqui", "centro", "cuba"],
  ["san-lorenzo", "san-pedro", "los-esteros", "centro", "quince", "eloy-alfaro"],
  ["barbasquillo", "pradera", "cuba", "centro", "tarqui"],
  ["san-mateo", "maria", "primero-mayo", "eloy-alfaro", "centro"],
  ["santa-marianita", "barbasquillo", "urbirrios", "quince", "centro"],
];

function householdSize(rng) {
  let size = 2;
  if (rng() < 0.75) size += 1;
  if (rng() < 0.55) size += 1;
  if (rng() < 0.25) size += 1;
  if (rng() < 0.08) size += 1;
  return size;
}

function quotasFor(population) {
  const weights = BARRIOS.map((b) => b.weight);
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (population * w) / sum);
  const quotas = raw.map((x) => Math.floor(x));
  let left = population - quotas.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, f: x - Math.floor(x) }))
    .sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; k < left; k += 1) quotas[order[k].i] += 1;
  return quotas;
}

function betaFor(type) {
  if (type === "school") return BETAS.school;
  if (type === "market") return BETAS.market;
  if (type === "central") return BETAS.central;
  return BETAS.work;
}

export function buildCity(seed, population) {
  const rng = mulberry32(seed);
  const quotas = quotasFor(population);
  const people = [];
  const homes = [];
  const barrioMembers = BARRIOS.map(() => []);
  const homeOfBarrio = [];

  for (let b = 0; b < BARRIOS.length; b += 1) {
    let left = quotas[b];
    while (left > 0) {
      const size = Math.min(left, householdSize(rng));
      const home = homes.length;
      const members = [];
      for (let k = 0; k < size; k += 1) {
        const id = people.length;
        people.push({ barrio: b, home, place: -1, bus: -1 });
        members.push(id);
        barrioMembers[b].push(id);
      }
      homes.push(members);
      homeOfBarrio.push(b);
      left -= size;
    }
  }

  const places = [];
  const placeIndex = new Map();

  function addPlace(type, barrio, name) {
    const id = places.length;
    places.push({
      id,
      type,
      barrio,
      name,
      beta: betaFor(type),
      members: [],
    });
    placeIndex.set(`${type}:${barrio}`, id);
    return id;
  }

  for (let b = 0; b < BARRIOS.length; b += 1) {
    addPlace("school", b, `Colegio ${BARRIOS[b].name}`);
    addPlace("market", b, `Mercado ${BARRIOS[b].name}`);
    addPlace("work", b, `Trabajo ${BARRIOS[b].name}`);
  }
  const centralBarrio = BARRIOS.findIndex((b) => b.id === "centro");
  const centralId = places.length;
  places.push({
    id: centralId,
    type: "central",
    barrio: centralBarrio,
    name: "Mercado Central",
    beta: BETAS.central,
    members: [],
  });

  const buses = ROUTES.map((ids, i) => ({
    id: i,
    name: `Bus ${i + 1}`,
    barrios: ids.map((id) => BARRIOS.findIndex((b) => b.id === id)),
    members: [],
  }));
  const routesByBarrio = BARRIOS.map(() => []);
  buses.forEach((bus, i) => {
    for (const b of bus.barrios) routesByBarrio[b].push(i);
  });

  for (let i = 0; i < people.length; i += 1) {
    const person = people[i];
    const role = rng();
    let place = -1;
    if (role < 0.22) {
      place = placeIndex.get(`school:${person.barrio}`);
    } else if (role < 0.7) {
      const roll = rng();
      if (roll < 0.16) place = centralId;
      else if (roll < 0.38) place = placeIndex.get(`market:${person.barrio}`);
      else place = placeIndex.get(`work:${person.barrio}`);
    }
    person.place = place;
    if (place >= 0) places[place].members.push(i);
    if (place >= 0 && rng() < 0.36) {
      const options = routesByBarrio[person.barrio];
      if (options.length) {
        const bus = options[Math.floor(rng() * options.length)];
        person.bus = bus;
        buses[bus].members.push(i);
      }
    }
  }

  const neighbors = BARRIOS.map(() => []);
  for (let a = 0; a < BARRIOS.length; a += 1) {
    for (let b = a + 1; b < BARRIOS.length; b += 1) {
      const dx = BARRIOS[a].x - BARRIOS[b].x;
      const dy = BARRIOS[a].y - BARRIOS[b].y;
      if (dx * dx + dy * dy <= 145 * 145) {
        neighbors[a].push(b);
        neighbors[b].push(a);
      }
    }
  }

  const barrioIndex = new Map(BARRIOS.map((b, i) => [b.id, i]));

  return {
    seed,
    n: people.length,
    people,
    homes,
    homeSize: homes.map((h) => h.length),
    homeBarrio: homeOfBarrio,
    places,
    placeSize: places.map((p) => p.members.length),
    buses,
    busSize: buses.map((b) => b.members.length),
    barrios: BARRIOS,
    barrioMembers,
    barrioSize: barrioMembers.map((m) => m.length),
    neighbors,
    barrioIndex,
    centralId,
  };
}

export function describeZero(city, config) {
  const barrioId = city.barrioIndex.has(config.zeroBarrio)
    ? city.barrioIndex.get(config.zeroBarrio)
    : city.barrioIndex.get("eloy-alfaro");
  let pool = [];
  let placeName = "hogar";

  if (config.zeroPlace === "mercado-central") {
    pool = city.places[city.centralId].members;
    placeName = "Mercado Central";
  } else if (config.zeroPlace === "hogar") {
    pool = city.barrioMembers[barrioId];
    placeName = `un hogar de ${BARRIOS[barrioId].name}`;
  } else if (config.zeroPlace === "bus") {
    for (const i of city.barrioMembers[barrioId]) {
      if (city.people[i].bus >= 0) pool.push(i);
    }
    placeName = `un bus que sale de ${BARRIOS[barrioId].name}`;
  } else {
    const want =
      config.zeroPlace === "colegio" ? "school" : config.zeroPlace === "mercado" ? "market" : "work";
    const label =
      config.zeroPlace === "colegio" ? "el colegio" : config.zeroPlace === "mercado" ? "el mercado" : "el trabajo";
    for (const i of city.barrioMembers[barrioId]) {
      const p = city.people[i].place;
      if (p >= 0 && city.places[p].type === want && city.places[p].barrio === barrioId) pool.push(i);
    }
    placeName = `${label} de ${BARRIOS[barrioId].name}`;
  }

  let note = "";
  if (pool.length === 0) {
    pool = city.barrioMembers[barrioId];
    placeName = `un hogar de ${BARRIOS[barrioId].name}`;
    note = "No había nadie en ese lugar; el caso índice queda en un hogar del barrio.";
  }
  const u = unit(config.seed, 17, pool.length, 4);
  const id = pool[Math.floor(u * pool.length) % pool.length];
  const person = city.people[id];
  const ids = [id];
  const want = Math.max(1, config.clusterSize || 1);
  const mates = [];
  if (config.zeroPlace === "hogar") {
    for (const other of city.homes[person.home]) if (other !== id) mates.push(other);
  } else if (person.place >= 0) {
    for (const other of city.places[person.place].members) if (other !== id) mates.push(other);
  }
  for (const other of city.barrioMembers[person.barrio]) if (other !== id) mates.push(other);
  for (const other of mates) {
    if (ids.length >= want) break;
    if (!ids.includes(other)) ids.push(other);
  }
  return {
    id,
    ids,
    barrio: person.barrio,
    barrioId: BARRIOS[person.barrio].id,
    barrioName: BARRIOS[person.barrio].name,
    placeName,
    note,
  };
}
