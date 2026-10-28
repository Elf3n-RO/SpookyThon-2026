import test from "node:test";
import assert from "node:assert/strict";
import { buildCity } from "../public/engine/city.js";
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

test("la configuración base y sus límites son los documentados", () => {
  assert.deepEqual(
    {
      seed: defaultConfig.seed,
      runs: defaultConfig.runs,
      population: defaultConfig.population,
      days: defaultConfig.days,
      contagion: defaultConfig.contagion,
      dailyBudget: defaultConfig.dailyBudget,
      vaccineEfficacy: defaultConfig.vaccineEfficacy,
      zeroBarrio: defaultConfig.zeroBarrio,
      zeroPlace: defaultConfig.zeroPlace,
    },
    {
      seed: 20261030,
      runs: 20,
      population: 1600,
      days: 72,
      contagion: 1,
      dailyBudget: 280,
      vaccineEfficacy: 0.65,
      zeroBarrio: "eloy-alfaro",
      zeroPlace: "hogar",
    },
  );

  const bounded = normalizeConfig({
    seed: 20261030,
    contagion: 9,
    runs: 100,
    population: 500,
    days: 200,
    vaccineEfficacy: -1,
  });
  assert.equal(bounded.contagion, 4);
  assert.equal(bounded.runs, 80);
  assert.equal(bounded.population, 700);
  assert.equal(bounded.days, 120);
  assert.equal(bounded.vaccineEfficacy, 0);
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

test("la configuración base reproduce los resultados de referencia y supera ambas líneas base", async () => {
  const result = await simulateMany(defaultConfig);
  assert.equal(result.config.seed, 20261030);
  assert.equal(result.runs, 20);
  assert.equal(result.config.population, 1600);
  assert.equal(result.config.days, 72);
  assert.equal(result.winsVsNone, 20);
  assert.equal(result.winsVsRandom, 20);
  assert.ok(Math.abs(result.strategies.none.everMean - 816.4) < 0.01);
  assert.ok(Math.abs(result.strategies.random.everMean - 373.75) < 0.01);
  assert.ok(Math.abs(result.strategies.smart.everMean - 24.15) < 0.01);
  assert.ok(result.strategies.smart.everP10 <= result.strategies.smart.everMean);
  assert.ok(result.strategies.smart.everMean <= result.strategies.smart.everP90);
  assert.ok(result.strategies.smart.spentMean <= defaultConfig.dailyBudget * defaultConfig.days);
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
