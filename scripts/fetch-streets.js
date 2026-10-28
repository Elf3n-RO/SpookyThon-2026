import { writeFile } from "node:fs/promises";
import { BARRIOS } from "../public/engine/city.js";

function meters(a, b) {
  const cos = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dLat = (b.lat - a.lat) * 111320;
  const dLon = (b.lon - a.lon) * 111320 * cos;
  return Math.hypot(dLat, dLon);
}

function simplify(points, minMeters) {
  const kept = [points[0]];
  for (const point of points.slice(1, -1)) {
    if (meters(kept[kept.length - 1], point) >= minMeters) kept.push(point);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

const pairs = new Map();
for (let index = 0; index < BARRIOS.length; index += 1) {
  const ranked = BARRIOS
    .map((other, otherIndex) => ({ otherIndex, distance: index === otherIndex ? Infinity : meters(BARRIOS[index], other) }))
    .sort((a, b) => a.distance - b.distance);
  for (const item of ranked.slice(0, 2)) {
    const ids = [BARRIOS[index].id, BARRIOS[item.otherIndex].id].sort();
    pairs.set(ids.join("|"), [index, item.otherIndex]);
  }
}

async function route(a, b) {
  const url = `https://router.project-osrm.org/route/v1/foot/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
  const response = await fetch(url, { headers: { "user-agent": "plaga-z-street-routes" } });
  if (!response.ok) throw new Error(`${response.status} ${a.id} ${b.id}`);
  const data = await response.json();
  const line = data.routes?.[0]?.geometry?.coordinates;
  if (!line?.length) throw new Error(`sin ruta ${a.id} ${b.id}`);
  const points = line.map(([lon, lat]) => ({ lat, lon }));
  points[0] = { lat: a.lat, lon: a.lon };
  points[points.length - 1] = { lat: b.lat, lon: b.lon };
  return simplify(points, 28).map((point) => [
    Math.round(point.lat * 1e5) / 1e5,
    Math.round(point.lon * 1e5) / 1e5,
  ]);
}

const routes = {};
for (const [key, [left, right]] of pairs) {
  const line = await route(BARRIOS[left], BARRIOS[right]);
  routes[key] = line;
  console.log(key, line.length);
  await new Promise((resolve) => setTimeout(resolve, 250));
}

const body = `// Rutas a pie entre cada barrio y sus dos vecinos más cercanos.
// Geometría de OpenStreetMap vía OSRM. Cada punto es [lat, lon].
export const STREET_ROUTES = ${JSON.stringify(routes)};
`;
await writeFile(new URL("../public/streets.js", import.meta.url), body);
console.log("pairs", pairs.size);
