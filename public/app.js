import { BARRIOS, completeSummary, defaultConfig, normalizeConfig, simulateMany } from "./engine/index.js";
import { num } from "./engine/report.js";

const form = document.querySelector("#panel");
const progress = document.querySelector("#progress");
const runButton = document.querySelector("#run");
const menuToggle = document.querySelector("#menu-toggle");
const siteNav = document.querySelector("#site-nav");
const headline = document.querySelector("#headline");
const scores = document.querySelector("#scores");
const table = document.querySelector("#table");
const bullets = document.querySelector("#bullets");
const letter = document.querySelector("#letter");
const letterBody = document.querySelector("#letter-body");
const mapGroup = document.querySelector("#barrios");
const mapFrame = document.querySelector("#map");
const mapTiles = document.querySelector("#map-tiles");
const mapStatus = document.querySelector("#map-status");
const dayInput = document.querySelector("#day");
const dayLabel = document.querySelector("#day-label");
const dayTotals = document.querySelector("#day-totals");
const playButton = document.querySelector("#play");
const chart = document.querySelector("#chart");
const tip = document.querySelector("#tip");
const tileCache = new Map();

const state = {
  summary: null,
  mode: "dailyNew",
  policy: "smart",
  day: 0,
  timer: 0,
  layout: null,
  running: false,
  runToken: 0,
  mapCenter: { lat: -0.96, lon: -80.72 },
  mapZoom: 11,
  mapPointer: null,
};

const policies = {
  none: { name: "No intervenir", color: "#b8b8a7" },
  random: { name: "Al azar", color: "#d93691" },
  smart: { name: "Comité", color: "#8dbb32" },
};

const fields = [
  "seed",
  "contagion",
  "dailyBudget",
  "vaccineEfficacy",
  "zeroBarrio",
  "zeroPlace",
  "runs",
  "days",
  "population",
  "incubationDays",
  "infectiousDays",
  "vectorDelay",
  "clusterSize",
];

function fillDefaults() {
  const barrio = document.querySelector("#zeroBarrio");
  for (const item of BARRIOS) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.name} · ${item.parroquia}`;
    barrio.append(option);
  }
  for (const key of fields) {
    const el = document.querySelector(`#${key}`);
    if (el && defaultConfig[key] !== undefined) el.value = defaultConfig[key];
  }
  syncHints();
}

function syncHints() {
  document.querySelector("#contagion-out").textContent = `${Number(document.querySelector("#contagion").value).toFixed(2)} × la transmisión base`;
  document.querySelector("#efficacy-out").textContent = `${Math.round(Number(document.querySelector("#vaccineEfficacy").value) * 100)} % de protección`;
}

function readConfig() {
  const raw = {};
  for (const key of fields) raw[key] = document.querySelector(`#${key}`).value;
  return normalizeConfig(raw);
}

function simulateParallel(config, onProgress, shouldContinue) {
  const cores = navigator.hardwareConcurrency || 2;
  const workers = Math.min(4, Math.max(2, cores - 1));
  if (typeof Worker === "undefined" || config.runs < 4 || workers < 2) {
    return simulateMany(config, onProgress, shouldContinue);
  }
  const size = Math.ceil(config.runs / workers);
  const chunks = [];
  for (let start = 0; start < config.runs; start += size) chunks.push([start, Math.min(config.runs, start + size)]);
  const progress = new Array(chunks.length).fill(0);
  let settled = false;
  const pool = [];
  const kill = () => {
    for (const worker of pool) worker.terminate();
    pool.length = 0;
  };
  let cancel = () => {};
  const done = new Promise((resolve, reject) => {
    const stop = () => {
      if (settled) return;
      settled = true;
      kill();
      resolve(null);
    };
    cancel = stop;
    let finished = 0;
    const parts = new Array(chunks.length);
    chunks.forEach(([start, end], index) => {
      const worker = new Worker(new URL("./engine/worker.js", import.meta.url), { type: "module" });
      pool.push(worker);
      worker.onerror = () => {
        if (settled) return;
        settled = true;
        kill();
        reject(new Error("No se pudo repartir la simulación"));
      };
      worker.onmessage = (event) => {
        if (settled) return;
        if (!shouldContinue()) {
          stop();
          return;
        }
        const message = event.data;
        if (message.type === "progress") {
          progress[index] = message.done;
          onProgress(progress.reduce((sum, value) => sum + value, 0), config.runs);
          return;
        }
        parts[index] = message.trios;
        finished += 1;
        if (finished < chunks.length) return;
        settled = true;
        kill();
        try {
          resolve(completeSummary(parts.flat(), config));
        } catch (error) {
          reject(error);
        }
      };
      worker.postMessage({ config, start, end, job: index });
    });
  });
  done.cancel = cancel;
  return done;
}

function markPreset(name) {
  document.querySelectorAll("[data-preset]").forEach((button) => {
    const on = button.dataset.preset === name;
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
  });
}

function presetLabel() {
  return document.querySelector("[data-preset].on")?.textContent?.trim() || "Escenario";
}

function applyPreset(name) {
  const set = (id, value) => {
    document.querySelector(`#${id}`).value = value;
  };
  set("contagion", defaultConfig.contagion);
  set("dailyBudget", defaultConfig.dailyBudget);
  set("vaccineEfficacy", defaultConfig.vaccineEfficacy);
  set("zeroBarrio", defaultConfig.zeroBarrio);
  set("zeroPlace", defaultConfig.zeroPlace);
  if (name === "doble") set("contagion", 2);
  if (name === "mitad") set("dailyBudget", Math.round(defaultConfig.dailyBudget / 2));
  if (name === "mercado") {
    set("zeroPlace", "mercado-central");
    set("zeroBarrio", "centro");
  }
  if (name === "vacuna") set("vaccineEfficacy", 0.32);
  syncHints();
  markPreset(name);
  form.requestSubmit();
}

async function onSubmit(event) {
  event.preventDefault();
  const token = ++state.runToken;
  state.running = true;
  stop();
  state.job?.cancel();
  const config = readConfig();
  const label = presetLabel();
  runButton.disabled = true;
  headline.textContent = `Calculando «${label}»…`;
  progress.textContent = `${label}: preparando la ciudad…`;
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (token !== state.runToken) return;
  const job = simulateParallel(config, (done, total) => {
    if (token !== state.runToken) return;
    progress.textContent = `${label}: corrida ${done} de ${total}`;
  }, () => token === state.runToken);
  state.job = job;
  try {
    const summary = await job;
    if (!summary || token !== state.runToken) return;
    state.summary = summary;
    state.day = 0;
    render(summary);
    progress.textContent = `Listo. ${label}. Semilla ${summary.config.seed}, ${summary.runs} corridas.`;
  } catch (error) {
    if (token !== state.runToken) return;
    progress.textContent = "No se pudo simular. Revise los parámetros e intente de nuevo.";
    console.error(error);
  } finally {
    if (token === state.runToken) {
      state.running = false;
      runButton.disabled = false;
    }
  }
}

function render(summary) {
  const s = summary.strategies;
  headline.textContent = summary.report.headline;
  scores.hidden = false;
  scores.innerHTML = "";
  for (const key of ["smart", "random", "none"]) {
    const card = document.createElement("div");
    card.className = `score ${key}`;
    const count = document.createElement("b");
    count.textContent = num(s[key].everMean, 0);
    const label = document.createElement("span");
    label.textContent = policies[key].name;
    card.append(count, label);
    scores.append(card);
  }

  table.hidden = false;
  table.replaceChildren();
  const grid = document.createElement("table");
  const rows = [
    ["", "Comité", "Azar", "Nada"],
    ["Contagios", s.smart.everMean, s.random.everMean, s.none.everMean],
    ["Rango bajo", s.smart.everP10, s.random.everP10, s.none.everP10],
    ["Rango alto", s.smart.everP90, s.random.everP90, s.none.everP90],
    ["Pico de enfermos", s.smart.peakMean, s.random.peakMean, s.none.peakMean],
    ["Muertes del escenario", s.smart.deathMean, s.random.deathMean, s.none.deathMean],
    ["USD gastados", s.smart.spentMean, s.random.spentMean, s.none.spentMean],
  ];
  for (const [rowIndex, row] of rows.entries()) {
    const tr = document.createElement("tr");
    for (const [index, cell] of row.entries()) {
      const el = document.createElement(rowIndex === 0 ? "th" : "td");
      const digits = String(row[0]).startsWith("Muertes") ? 1 : 0;
      el.textContent = index === 0 || rowIndex === 0 ? String(cell) : num(cell, digits);
      tr.append(el);
    }
    grid.append(tr);
  }
  table.append(grid);

  bullets.hidden = false;
  bullets.innerHTML = "";
  for (const text of summary.report.bullets) {
    const li = document.createElement("li");
    li.textContent = text;
    bullets.append(li);
  }

  const win = document.createElement("li");
  win.textContent = `Gana en ${summary.winsVsNone} de ${summary.runs} corridas contra no intervenir y en ${summary.winsVsRandom} de ${summary.runs} contra el azar. El foco, por sí solo, contagiaría en promedio a ${num(summary.directMean, 1)} personas.`;
  bullets.append(win);

  letter.hidden = false;
  letterBody.innerHTML = "";
  for (const paragraph of summary.report.letter.split("\n\n")) {
    const p = document.createElement("p");
    p.className = "body";
    p.textContent = paragraph;
    letterBody.append(p);
  }

  dayInput.max = String(summary.config.days - 1);
  dayInput.value = "0";
  drawChart();
  drawMap();
}

function seriesOf(summary, key) {
  return summary.curves[key][state.mode];
}

function drawChart() {
  const summary = state.summary;
  if (!summary) return;
  const dpr = window.devicePixelRatio || 1;
  const width = chart.clientWidth || 640;
  const height = 280;
  chart.width = Math.round(width * dpr);
  chart.height = Math.round(height * dpr);
  const g = chart.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, width, height);

  const pad = { l: 48, r: 12, t: 28, b: 28 };
  const days = summary.config.days;
  let max = 1;
  for (const key of ["none", "random", "smart"]) {
    const pack = seriesOf(summary, key);
    for (const value of pack.p90) max = Math.max(max, value);
    for (const value of pack.mean) max = Math.max(max, value);
  }
  max *= 1.08;
  const xOf = (day) => pad.l + (day / Math.max(1, days - 1)) * (width - pad.l - pad.r);
  const yOf = (value) => pad.t + (1 - value / max) * (height - pad.t - pad.b);
  state.layout = { xOf, yOf, width, height, pad, max, days };

  g.font = "12px Segoe UI, sans-serif";
  let legendX = pad.l;
  for (const key of ["smart", "random", "none"]) {
    g.fillStyle = policies[key].color;
    g.fillRect(legendX, 8, 16, 8);
    g.fillStyle = "#ffffff";
    g.fillText(policies[key].name, legendX + 22, 16);
    legendX += 110;
  }

  g.strokeStyle = "#45483c";
  g.fillStyle = "#b8b8a7";
  g.lineWidth = 1;
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = (max * tick) / 4;
    const y = yOf(value);
    g.beginPath();
    g.moveTo(pad.l, y);
    g.lineTo(width - pad.r, y);
    g.stroke();
    g.fillText(num(value, 0), 0, y + 4);
  }
  g.fillText("Día 1", pad.l, height - 8);
  g.fillText(`Día ${days}`, width - 48, height - 8);

  const band = seriesOf(summary, "smart");
  g.beginPath();
  for (let day = 0; day < days; day += 1) {
    const x = xOf(day);
    const y = yOf(band.p90[day]);
    if (day === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  for (let day = days - 1; day >= 0; day -= 1) g.lineTo(xOf(day), yOf(band.p10[day]));
  g.closePath();
  g.fillStyle = "rgba(141, 187, 50, 0.18)";
  g.fill();

  for (const key of ["none", "random", "smart"]) {
    const pack = seriesOf(summary, key);
    g.beginPath();
    g.strokeStyle = policies[key].color;
    g.lineWidth = key === "smart" ? 2.5 : 1.6;
    for (let day = 0; day < days; day += 1) {
      const x = xOf(day);
      const y = yOf(pack.mean[day]);
      if (day === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
}

function onChartMove(event) {
  if (!state.layout || !state.summary) return;
  const rect = chart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const { xOf, days, pad, width } = state.layout;
  if (x < pad.l || x > width - pad.r) {
    tip.hidden = true;
    return;
  }
  let best = 0;
  let bestDist = Infinity;
  for (let day = 0; day < days; day += 1) {
    const dist = Math.abs(xOf(day) - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = day;
    }
  }
  const parts = [`Día ${best + 1}`];
  for (const key of ["smart", "none", "random"]) {
    const value = seriesOf(state.summary, key).mean[best];
    parts.push(`${policies[key].name}: ${num(value, 1)}`);
  }
  tip.hidden = false;
  tip.textContent = parts.join(" · ");
}

function colorFor(severity) {
  const t = Math.max(0, Math.min(1, severity));
  const green = [141, 187, 50];
  const orange = [230, 162, 60];
  const red = [217, 64, 48];
  const mix = (from, to, amount) => from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
  const rgb = t <= 0.5 ? mix(green, orange, t / 0.5) : mix(orange, red, (t - 0.5) / 0.5);
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function worldPixel(lat, lon, zoom) {
  const scale = 256 * 2 ** zoom;
  const boundedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin((boundedLat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function geographicPoint(x, y, zoom) {
  const scale = 256 * 2 ** zoom;
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat, lon };
}

function getMapOrigin() {
  const center = worldPixel(state.mapCenter.lat, state.mapCenter.lon, state.mapZoom);
  return {
    x: center.x - mapFrame.clientWidth / 2,
    y: center.y - mapFrame.clientHeight / 2,
  };
}

function renderMapTiles(origin) {
  const tileCount = 2 ** state.mapZoom;
  const firstX = Math.floor(origin.x / 256);
  const firstY = Math.floor(origin.y / 256);
  const lastX = Math.floor((origin.x + mapFrame.clientWidth) / 256);
  const lastY = Math.floor((origin.y + mapFrame.clientHeight) / 256);
  const visible = new Set();

  for (let tileY = firstY; tileY <= lastY; tileY += 1) {
    if (tileY < 0 || tileY >= tileCount) continue;
    for (let tileX = firstX; tileX <= lastX; tileX += 1) {
      const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
      const key = `${state.mapZoom}/${wrappedX}/${tileY}`;
      visible.add(key);
      let tile = tileCache.get(key);
      if (!tile) {
        tile = document.createElement("img");
        tile.className = "map-tile";
        tile.dataset.key = key;
        tile.alt = "";
        tile.draggable = false;
        tile.decoding = "async";
        tile.addEventListener("load", () => {
          mapStatus.textContent = "Si un barrio está muy afectado, el más cercano entra en la cadena y el área sigue hacia él.";
        }, { once: true });
        tile.addEventListener("error", () => {
          mapStatus.textContent = "No se pudieron cargar las teselas de OpenStreetMap. Los puntos simulados siguen visibles; compruebe su conexión.";
        }, { once: true });
        tile.src = `https://tile.openstreetmap.org/${state.mapZoom}/${wrappedX}/${tileY}.png`;
        tileCache.set(key, tile);
      }
      tile.style.left = `${tileX * 256 - origin.x}px`;
      tile.style.top = `${tileY * 256 - origin.y}px`;
      if (tile.parentElement !== mapTiles) mapTiles.append(tile);
    }
  }

  for (const tile of [...mapTiles.children]) {
    if (!visible.has(tile.dataset.key)) tile.remove();
  }
  if (tileCache.size > 100) {
    for (const [key, tile] of tileCache) {
      if (!visible.has(key)) {
        tileCache.delete(key);
        if (tileCache.size <= 80) break;
      }
    }
  }
}

function metersPerPixel(lat, zoom) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom);
}

let distanceRank = null;

function rankByDistance() {
  if (distanceRank) return distanceRank;
  distanceRank = BARRIOS.map((barrio, index) =>
    BARRIOS.map((other, otherIndex) => {
      const cos = Math.cos((((barrio.lat + other.lat) / 2) * Math.PI) / 180);
      const dLat = (other.lat - barrio.lat) * 111320;
      const dLon = (other.lon - barrio.lon) * 111320 * cos;
      return { index: otherIndex, distance: index === otherIndex ? Infinity : Math.hypot(dLat, dLon) };
    }).sort((a, b) => a.distance - b.distance),
  );
  return distanceRank;
}

function spreadChain(own) {
  const rank = rankByDistance();
  const shown = own.slice();
  const from = BARRIOS.map(() => -1);
  for (let index = 0; index < own.length; index += 1) {
    if (own[index] < 0.02) continue;
    let current = index;
    let previous = -1;
    let level = own[index];
    for (let step = 0; step < 4; step += 1) {
      const next = rank[current].find((item) => item.index !== previous);
      if (!next) break;
      level *= 0.68;
      if (level < 0.02) break;
      if (level > shown[next.index]) {
        shown[next.index] = level;
        from[next.index] = current;
      }
      previous = current;
      current = next.index;
    }
  }
  return { shown, from };
}

function zoneDiameterMeters(barrio, severity) {
  if (severity < 0.02) return 0;
  const nearest = rankByDistance()[BARRIOS.indexOf(barrio)][0].distance;
  return Math.min(nearest * 4, 3200) * Math.sqrt(severity);
}

function renderMap() {
  if (!mapFrame.clientWidth || !mapFrame.clientHeight) return;
  const origin = getMapOrigin();
  renderMapTiles(origin);
  for (const marker of mapGroup.children) {
    const barrio = BARRIOS.find((item) => item.id === marker.dataset.barrioId);
    if (!barrio) continue;
    const point = worldPixel(barrio.lat, barrio.lon, state.mapZoom);
    const x = point.x - origin.x;
    const y = point.y - origin.y;
    const severity = Number(marker.dataset.severity) || 0;
    const dot = marker.querySelector(".map-marker-dot");
    const zone = marker.querySelector(".map-zone");
    const diameterM = zoneDiameterMeters(barrio, severity);
    const spread = diameterM / metersPerPixel(barrio.lat, state.mapZoom);
    zone.style.width = `${spread}px`;
    zone.style.height = `${spread}px`;
    zone.style.borderRadius = "50%";
    dot.style.width = "16px";
    dot.style.height = "16px";
    dot.style.borderRadius = "50%";
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    marker.style.zIndex = String(Math.round((1 - severity) * 30) + 2);
    const reach = Math.max(16, spread);
    marker.hidden = x < -reach || y < -reach || x > mapFrame.clientWidth + reach || y > mapFrame.clientHeight + reach;
  }
  document.querySelector("#zoom-in").disabled = state.mapZoom >= 18;
  document.querySelector("#zoom-out").disabled = state.mapZoom <= 8;
}

function setMapCenter(lat, lon) {
  state.mapCenter = { lat, lon };
  renderMap();
}

function zoomMap(amount) {
  state.mapZoom = Math.max(8, Math.min(18, state.mapZoom + amount));
  renderMap();
}

function drawMap() {
  const summary = state.summary;
  if (!summary?.detail?.frames) return;
  const frames = summary.detail.frames[state.policy];
  const maxDay = frames.length - 1;
  const day = Math.max(0, Math.min(maxDay, state.day));
  const lo = Math.floor(day);
  const hi = Math.min(maxDay, lo + 1);
  const blend = day - lo;
  const frame = frames[lo];
  const sizes = summary.detail.barrioSize;
  dayLabel.textContent = `Día ${lo + 1} · ${policies[state.policy].name}`;
  const totals = frame.totals;
  dayTotals.textContent = `${totals.s} sanos · ${totals.e} mordidos · ${totals.i} zombies · ${totals.r} exorcizados · ${totals.d} sin recuperar`;

  const own = [];
  const infectedCounts = [];
  summary.detail.barrios.forEach((barrio, index) => {
    const size = Math.max(1, sizes[index]);
    const infected = frames[lo].i[index] * (1 - blend) + frames[hi].i[index] * blend;
    infectedCounts[index] = infected;
    own[index] = Math.min(1, infected / size / 0.15);
  });
  const chain = spreadChain(own);

  summary.detail.barrios.forEach((barrio, index) => {
    const size = Math.max(1, sizes[index]);
    const infected = infectedCounts[index];
    const severity = chain.shown[index];
    let marker = mapGroup.querySelector(`[data-barrio-id="${barrio.id}"]`);
    if (!marker) {
      marker = document.createElement("button");
      marker.type = "button";
      marker.className = "map-marker";
      marker.dataset.barrioId = barrio.id;
      const zone = document.createElement("span");
      zone.className = "map-zone";
      const dot = document.createElement("span");
      dot.className = "map-marker-dot";
      const label = document.createElement("span");
      label.className = "map-marker-label";
      marker.append(zone, dot, label);
      marker.addEventListener("click", () => setMapCenter(barrio.lat, barrio.lon));
      mapGroup.append(marker);
    }
    marker.dataset.severity = String(severity);
    marker.classList.toggle("is-active", severity >= 0.02);
    marker.style.setProperty("--marker-color", colorFor(severity));
    const shown = Math.max(0, Math.round(infected));
    const noun = shown === 1 ? "zombie" : "zombies";
    const inherited = shown < 1 && chain.from[index] >= 0 && severity > own[index] + 0.01;
    const text = inherited
      ? `${barrio.name} · sigue a ${BARRIOS[chain.from[index]].name}`
      : `${barrio.name} · ${shown} hoy`;
    marker.querySelector(".map-marker-label").textContent = text;
    marker.setAttribute(
      "aria-label",
      inherited
        ? `${barrio.name}: entra en la cadena desde ${BARRIOS[chain.from[index]].name}. Enfocar en el mapa.`
        : `${barrio.name}: ${shown} ${noun} hoy, ${Math.round((infected / size) * 100)} % del barrio. Enfocar en el mapa.`,
    );
    marker.title = text;
  });
  renderMap();
}

function stop() {
  if (state.timer) cancelAnimationFrame(state.timer);
  state.timer = 0;
  playButton.textContent = "Reproducir";
}

function play() {
  if (state.timer) {
    stop();
    return;
  }
  if (!state.summary) return;
  playButton.textContent = "Pausa";
  const origin = state.day;
  const started = performance.now();
  const tick = (now) => {
    const max = state.summary.config.days - 1;
    const day = Math.min(max, origin + (now - started) / 700);
    state.day = day;
    dayInput.value = String(Math.floor(day));
    drawMap();
    if (day >= max) {
      stop();
      return;
    }
    state.timer = requestAnimationFrame(tick);
  };
  state.timer = requestAnimationFrame(tick);
}

fillDefaults();
form.addEventListener("submit", onSubmit);
form.addEventListener("input", () => {
  syncHints();
  markPreset(null);
});
menuToggle.addEventListener("click", () => {
  const expanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!expanded));
  menuToggle.querySelector(".sr-only").textContent = expanded ? "Abrir menú" : "Cerrar menú";
  siteNav.classList.toggle("is-open", !expanded);
});
siteNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.querySelector(".sr-only").textContent = "Abrir menú";
    siteNav.classList.remove("is-open");
  });
});
document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});
document.querySelectorAll("[data-policy]").forEach((button) => {
  button.addEventListener("click", () => {
    state.policy = button.dataset.policy;
    document.querySelectorAll("[data-policy]").forEach((item) => item.classList.toggle("on", item === button));
    drawMap();
  });
});
document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((item) => item.classList.toggle("on", item === button));
    drawChart();
  });
});
document.querySelector("#zoom-in").addEventListener("click", () => zoomMap(1));
document.querySelector("#zoom-out").addEventListener("click", () => zoomMap(-1));
document.querySelector("#map-reset").addEventListener("click", () => {
  state.mapZoom = 11;
  setMapCenter(-0.96, -80.72);
});
mapFrame.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button, a")) return;
  state.mapPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  mapFrame.setPointerCapture(event.pointerId);
  mapFrame.classList.add("is-dragging");
});
mapFrame.addEventListener("pointermove", (event) => {
  if (!state.mapPointer || state.mapPointer.id !== event.pointerId) return;
  const dx = event.clientX - state.mapPointer.x;
  const dy = event.clientY - state.mapPointer.y;
  state.mapPointer.x = event.clientX;
  state.mapPointer.y = event.clientY;
  const center = worldPixel(state.mapCenter.lat, state.mapCenter.lon, state.mapZoom);
  state.mapCenter = geographicPoint(center.x - dx, center.y - dy, state.mapZoom);
  renderMap();
});
function stopMapDrag(event) {
  if (!state.mapPointer || state.mapPointer.id !== event.pointerId) return;
  state.mapPointer = null;
  mapFrame.classList.remove("is-dragging");
}
mapFrame.addEventListener("pointerup", stopMapDrag);
mapFrame.addEventListener("pointercancel", stopMapDrag);
mapFrame.addEventListener("wheel", (event) => {
  event.preventDefault();
  zoomMap(event.deltaY < 0 ? 1 : -1);
}, { passive: false });
dayInput.addEventListener("input", () => {
  stop();
  state.day = Number(dayInput.value);
  drawMap();
});
playButton.addEventListener("click", play);
chart.addEventListener("mousemove", onChartMove);
chart.addEventListener("mouseleave", () => {
  tip.hidden = true;
});
document.querySelector("#copy").addEventListener("click", async () => {
  const text = letterBody.innerText;
  try {
    await navigator.clipboard.writeText(text);
    progress.textContent = "Informe copiado.";
  } catch {
    progress.textContent = "No se pudo copiar. Seleccione el informe y cópielo a mano.";
  }
});
window.addEventListener("resize", () => {
  drawChart();
  renderMap();
});
mapStatus.textContent = "Cargando mapa base de OpenStreetMap… Ubicaciones barriales referenciales.";

markPreset("base");
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  form.requestSubmit();
}
