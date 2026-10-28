import test from "node:test";
import assert from "node:assert/strict";
import { BARRIOS, buildCity } from "../public/engine/city.js";
import { defaultConfig, normalizeConfig } from "../public/engine/params.js";
import { childSeed, runTrio, simulateMany } from "../public/engine/index.js";

test("la misma semilla reconstruye la misma ciudad", () => {
  const a = buildCity(20261030, 1200);
  const b = buildCity(20261030, 1200);
  assert.equal(a.n, 1200);
  assert.deepEqual(
    a.people.map((p) => [p.barrio, p.home, p.place, p.bus]),
    b.people.map((p) => [p.barrio, p.home, p.place, p.bus]),
  );
});

test("cada barrio tiene coordenadas válidas para el mapa", () => {
  assert.equal(new Set(BARRIOS.map((barrio) => barrio.id)).size, BARRIOS.length);
  for (const barrio of BARRIOS) {
    assert.ok(Number.isFinite(barrio.lat) && barrio.lat >= -90 && barrio.lat <= 90, barrio.name);
    assert.ok(Number.isFinite(barrio.lon) && barrio.lon >= -180 && barrio.lon <= 180, barrio.name);
  }

  const coordinates = new Map(BARRIOS.map(({ id, lat, lon }) => [id, { lat, lon }]));
  const referenceBounds = {
    barbasquillo: { south: -0.9616, north: -0.9415, west: -80.7628, east: -80.7427 },
    "eloy-alfaro": { south: -0.9985, north: -0.9689, west: -80.7192, east: -80.6939 },
    jocay: { south: -0.9699, north: -0.9498, west: -80.7262, east: -80.7061 },
    "santa-marianita": { south: -0.9839, north: -0.9756, west: -80.8451, east: -80.8376 },
  };
  for (const [id, bounds] of Object.entries(referenceBounds)) {
    const point = coordinates.get(id);
    assert.ok(point.lat >= bounds.south && point.lat <= bounds.north, `${id} fuera de su referencia OSM`);
    assert.ok(point.lon >= bounds.west && point.lon <= bounds.east, `${id} fuera de su referencia OSM`);
  }
});

test("una corrida es reproducible y no se pasa del presupuesto", () => {
  const config = normalizeConfig({ ...defaultConfig, seed: childSeed(20261030, 0), runs: 1, population: 1100, days: 40 });
  const first = runTrio(config, false);
  const second = runTrio(config, false);
  assert.deepEqual(first.smart.dailyCum, second.smart.dailyCum);
  assert.deepEqual(first.none.dailyNew, second.none.dailyNew);
  assert.deepEqual(first.random.dailyNew, second.random.dailyNew);
  assert.equal(first.zero.id, second.zero.id);
  const cap = config.dailyBudget * config.days;
  for (const arm of [first.none, first.random, first.smart]) {
    assert.ok(arm.spent <= cap + 1e-6);
    assert.ok(arm.ever >= 1);
    assert.ok(arm.ever <= config.population);
  }
  assert.equal(first.none.spent, 0);
  assert.equal(first.none.doses, 0);
});

test("con eficacia cero el Comité no gasta dosis", () => {
  const config = normalizeConfig({
    ...defaultConfig,
    seed: 11,
    vaccineEfficacy: 0,
    population: 900,
    days: 24,
    runs: 1,
  });
  const trio = runTrio(config, false);
  assert.equal(trio.smart.doses, 0);
  assert.equal(trio.smart.spentBy.vaccine, 0);
});

test("el Comité evita más contagios que no hacer nada y que el azar", async () => {
  const result = await simulateMany({
    ...defaultConfig,
    seed: 20261030,
    runs: 8,
    population: 1200,
    days: 60,
  });
  assert.ok(
    result.strategies.smart.everMean < result.strategies.none.everMean,
    `Comité ${result.strategies.smart.everMean} vs nada ${result.strategies.none.everMean}`,
  );
  assert.ok(
    result.strategies.smart.everMean < result.strategies.random.everMean,
    `Comité ${result.strategies.smart.everMean} vs azar ${result.strategies.random.everMean}`,
  );
  assert.ok(result.winsVsNone >= 6);
});
