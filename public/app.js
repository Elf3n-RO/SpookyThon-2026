import { BARRIOS, defaultConfig, normalizeConfig, simulateMany } from "./engine/index.js";
import { num } from "./engine/report.js";

const form = document.querySelector("#panel");
const progress = document.querySelector("#progress");
const runButton = document.querySelector("#run");
const headline = document.querySelector("#headline");
const scores = document.querySelector("#scores");
const table = document.querySelector("#table");
const bullets = document.querySelector("#bullets");
const letter = document.querySelector("#letter");
const letterBody = document.querySelector("#letter-body");
const mapGroup = document.querySelector("#barrios");
const dayInput = document.querySelector("#day");
const dayLabel = document.querySelector("#day-label");
const dayTotals = document.querySelector("#day-totals");
const playButton = document.querySelector("#play");
const chart = document.querySelector("#chart");
const tip = document.querySelector("#tip");

const state = {
  summary: null,
  mode: "dailyNew",
  policy: "smart",
  day: 0,
  timer: 0,
  layout: null,
  running: false,
};

const policies = {
  none: { name: "No intervenir", color: "#e4533d" },
  random: { name: "Al azar", color: "#d89a55" },
  smart: { name: "Comité", color: "#d6e27a" },
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
  form.requestSubmit();
}

async function onSubmit(event) {
  event.preventDefault();
  if (state.running) return;
  state.running = true;
  stop();
  const config = readConfig();
  runButton.disabled = true;
  progress.textContent = "Preparando la ciudad…";
  try {
    const summary = await simulateMany(config, (done, total) => {
      progress.textContent = `Corrida ${done} de ${total}`;
    });
    state.summary = summary;
    state.day = 0;
    render(summary);
    progress.textContent = `Listo. Semilla ${summary.config.seed}, ${summary.runs} corridas.`;
  } catch (error) {
    progress.textContent = "No se pudo simular. Revise los parámetros e intente de nuevo.";
    console.error(error);
  } finally {
    state.running = false;
    runButton.disabled = false;
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
    g.fillStyle = "#d5e4d4";
    g.fillText(policies[key].name, legendX + 22, 16);
    legendX += 110;
  }

  g.strokeStyle = "#2c382c";
  g.fillStyle = "#8ea08a";
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
  g.fillStyle = "rgba(214, 226, 122, 0.18)";
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

function colorFor(rate) {
  const t = Math.max(0, Math.min(1, rate));
  const a = [143, 191, 106];
  const b = [228, 83, 61];
  const c = a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function drawMap() {
  const summary = state.summary;
  mapGroup.replaceChildren();
  if (!summary?.detail?.frames) return;
  const frames = summary.detail.frames[state.policy];
  const frame = frames[Math.min(state.day, frames.length - 1)];
  const sizes = summary.detail.barrioSize;
  dayLabel.textContent = `Día ${state.day + 1} · ${policies[state.policy].name}`;
  const totals = frame.totals;
  dayTotals.textContent = `${totals.s} sanos · ${totals.e} mordidos · ${totals.i} zombies · ${totals.r} exorcizados · ${totals.d} sin recuperar`;

  summary.detail.barrios.forEach((barrio, index) => {
    const size = Math.max(1, sizes[index]);
    const rate = frame.ever[index] / size;
    const radius = 16 + Math.sqrt(size) * 1.15;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", barrio.x);
    circle.setAttribute("cy", barrio.y);
    circle.setAttribute("r", radius.toFixed(1));
    circle.setAttribute("fill", colorFor(rate));
    circle.setAttribute("fill-opacity", "0.92");
    circle.setAttribute("stroke", frame.i[index] > 0 ? "#fff4d2" : "#0d1a1c");
    circle.setAttribute("stroke-width", frame.i[index] > 0 ? "3" : "1");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${barrio.name}: ${frame.i[index]} infecciosos hoy, ${frame.ever[index]} alcanzados`;
    circle.append(title);
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", barrio.x);
    label.setAttribute("y", barrio.y + radius + 12);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", "#d5e4d4");
    label.setAttribute("font-size", "11");
    label.textContent = barrio.name;
    mapGroup.append(circle, label);
  });
}

function syncDay() {
  dayInput.value = String(state.day);
  drawMap();
}

function stop() {
  if (state.timer) clearInterval(state.timer);
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
  state.timer = setInterval(() => {
    const max = state.summary.config.days - 1;
    state.day = state.day >= max ? 0 : state.day + 1;
    syncDay();
  }, 450);
}

fillDefaults();
form.addEventListener("submit", onSubmit);
form.addEventListener("input", syncHints);
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
dayInput.addEventListener("input", () => {
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
window.addEventListener("resize", () => drawChart());

if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  form.requestSubmit();
}
