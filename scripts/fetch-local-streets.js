import { writeFile } from "node:fs/promises";
import { BARRIOS } from "../public/engine/city.js";

const REACH = 1750;

function meters(lat, lon, barrio) {
  const cos = Math.cos((((lat + barrio.lat) / 2) * Math.PI) / 180);
  const dLat = (lat - barrio.lat) * 111320;
  const dLon = (lon - barrio.lon) * 111320 * cos;
  return Math.hypot(dLat, dLon);
}

function simplify(points, minMeters) {
  const kept = [points[0]];
  for (const point of points.slice(1, -1)) {
    const last = kept[kept.length - 1];
    if (meters(point.lat, point.lon, { lat: last.lat, lon: last.lon }) >= minMeters) kept.push(point);
  }
  const end = points[points.length - 1];
  if (kept.length === 1 || kept[kept.length - 1] !== end) kept.push(end);
  return kept;
}

const clauses = BARRIOS.map((barrio) => `way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|living_street)$"](around:${REACH},${barrio.lat},${barrio.lon});`).join("");
const query = `[out:json][timeout:180];(${clauses});out geom;`;
const response = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": "plaga-z-local-streets",
  },
  body: `data=${encodeURIComponent(query)}`,
});
if (!response.ok) throw new Error(`Overpass ${response.status}`);
const data = await response.json();

const buckets = Object.fromEntries(BARRIOS.map((barrio) => [barrio.id, []]));
const seen = new Set();
let segments = 0;

for (const way of data.elements) {
  const geometry = way.geometry;
  if (!geometry || geometry.length < 2) continue;
  const points = simplify(geometry, 42);
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const midLat = (a.lat + b.lat) / 2;
    const midLon = (a.lon + b.lon) / 2;
    const near = BARRIOS.filter((barrio) => meters(midLat, midLon, barrio) <= REACH);
    if (!near.length) continue;
    const ends = [
      [Math.round(a.lat * 1e5) / 1e5, Math.round(a.lon * 1e5) / 1e5],
      [Math.round(b.lat * 1e5) / 1e5, Math.round(b.lon * 1e5) / 1e5],
    ].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    const key = `${ends[0][0]},${ends[0][1]},${ends[1][0]},${ends[1][1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = [ends[0][0], ends[0][1], ends[1][0], ends[1][1]];
    if (Math.hypot(row[2] - row[0], row[3] - row[1]) < 0.00008) continue;
    for (const barrio of near) buckets[barrio.id].push(row);
    segments += 1;
  }
}

const body = `// Tramos de calle de OpenStreetMap a menos de 1,75 km de cada barrio.
// Cada tramo es [lat, lon, lat, lon]. El grosor no cambia: solo el color.
export const LOCAL_STREETS = ${JSON.stringify(buckets)};
`;
await writeFile(new URL("../public/local-streets.js", import.meta.url), body);
const counts = Object.fromEntries(Object.entries(buckets).map(([id, rows]) => [id, rows.length]));
console.log(JSON.stringify({ ways: data.elements.length, segments, counts }));
