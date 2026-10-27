import { CANTON_POPULATION, COSTS } from "./params.js";

const fmt = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmt0 = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0 });

export function num(value, digits = 1) {
  if (digits === 0) return fmt0.format(value);
  return new Intl.NumberFormat("es-EC", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function money(value) {
  return `USD ${fmt0.format(Math.round(value))}`;
}

function range(stats, keyMean, keyP10, keyP90, digits = 1) {
  return `${num(stats[keyMean], digits)} (entre ${num(stats[keyP10], digits)} y ${num(stats[keyP90], digits)})`;
}

export function buildReport(summary) {
  const { config, strategies: s, savedVsNone, savedVsRandom, winsVsNone, winsVsRandom, runs } = summary;
  const attackNone = (100 * s.none.everMean) / config.population;
  const attackSmart = (100 * s.smart.everMean) / config.population;
  const savedCity = (savedVsNone.mean / config.population) * CANTON_POPULATION;
  const noneCity = (s.none.everMean / config.population) * CANTON_POPULATION;
  const smartCity = (s.smart.everMean / config.population) * CANTON_POPULATION;

  const opening = openingLines(summary.detail);
  const where = summary.detail?.zero
    ? `${summary.detail.zero.placeName}`
    : "el punto de inicio elegido";

  const bullets = [
    `Vacunar solo a personas sanas, primero a quienes comparten casa, mercado o bus con un caso.`,
    `Aislar al infeccioso que todavía va al mercado, al colegio o al bus. Encerrar a quien ya está en su casa no corta el criadero del domicilio.`,
    `Fumigar el barrio donde el brote ya está, no el mapa entero. El efecto dura ${COSTS.fumigationDays} días y baja a la mitad la presión del mosquito en ese sector.`,
    `Cerrar un colegio o un mercado solo si el cierre evita más contagios de los que empuja de vuelta a las casas. Si no, el presupuesto se queda para vacunas y fumigación.`,
    `Si hoy no alcanza para la mejor jugada, no se malgasta el resto: el dinero pasa al día siguiente.`,
  ];

  const letter = [
    `Señor alcalde:`,
    ``,
    `Corrimos ${fmt0.format(runs)} veces el mismo brote, con la semilla ${config.seed} y la misma red de ${fmt0.format(config.population)} personas. El foco empieza en ${where}, con ${fmt0.format(config.clusterSize)} infecciosos ya en el parte. Cada corrida enfrenta tres políticas con el mismo presupuesto de ${money(config.dailyBudget)} por día: no hacer nada, gastar ese dinero al azar, y el plan del Comité.`,
    ``,
    `Sin intervenir, la plaga alcanza en promedio a ${range(s.none, "everMean", "everP10", "everP90", 0)} personas (${num(attackNone, 1)} % de la ciudad simulada). El pico de enfermos activos llega a ${range(s.none, "peakMean", "peakP10", "peakP90", 0)}. Las muertes del escenario quedan en ${range(s.none, "deathMean", "deathP10", "deathP90", 1)}.`,
    ``,
    `Gastando lo mismo al azar, los contagios bajan a ${range(s.random, "everMean", "everP10", "everP90", 0)}. El Comité los deja en ${range(s.smart, "everMean", "everP10", "everP90", 0)} (${num(attackSmart, 1)} %). Frente a no hacer nada eso son ${range(savedVsNone, "mean", "p10", "p90", 0)} contagios menos. Frente al azar, ${range(savedVsRandom, "mean", "p10", "p90", 0)} menos. El Comité gana en ${fmt0.format(winsVsNone)} de ${fmt0.format(runs)} corridas contra no intervenir, y en ${fmt0.format(winsVsRandom)} de ${fmt0.format(runs)} contra el azar.`,
    ``,
    `El Comité usa en promedio ${money(s.smart.spentMean)} de los ${money(config.dailyBudget * config.days)} disponibles. El azar usa ${money(s.random.spentMean)}. No es obligatorio vaciar la caja: una dosis puesta en alguien sin riesgo no salva a nadie.`,
    ``,
    opening,
    ``,
    `Si la misma tasa se trasladara al cantón de Manta (${fmt0.format(CANTON_POPULATION)} habitantes, INEC 2022), el orden de magnitud sería ${fmt0.format(noneCity)} contagios sin intervención y ${fmt0.format(smartCity)} con el Comité: unos ${fmt0.format(savedCity)} menos. Es una regla de tres, no un censo. Sirve para comparar políticas, no para anunciar una cifra oficial.`,
    ``,
    `Esto no es un pronóstico clínico ni una orden de vacunación. Es la comparación, dentro del modelo, de qué hacer con un presupuesto corto. Los supuestos y las fuentes están en el README.`,
  ].join("\n");

  const headline = `El Comité evita ${num(savedVsNone.mean, 0)} contagios frente a no hacer nada, y ${num(savedVsRandom.mean, 0)} frente a gastar el mismo dinero al azar.`;

  return { headline, letter, bullets };
}

function openingLines(detail) {
  if (!detail?.log?.length) {
    return "En el ejemplo reproducible todavía no hay un parte de las primeras mañanas.";
  }
  const active = detail.log.filter(
    (row) => row.vaccines || row.quarantines || row.fumigated.length || row.closed.length,
  );
  const days = (active.length ? active : detail.log).slice(0, 4);
  const bits = days.map((row) => {
    const parts = [];
    if (row.fumigated.length) parts.push(`fumigar ${row.fumigated.join(" y ")}`);
    if (row.closed.length) parts.push(`cerrar ${row.closed.join(" y ")}`);
    if (row.quarantines) parts.push(`aislar ${row.quarantines} ${row.quarantines === 1 ? "caso" : "casos"}`);
    if (row.vaccines) parts.push(`vacunar a ${row.vaccines} ${row.vaccines === 1 ? "persona sana" : "personas sanas"}`);
    if (!parts.length) return `Día ${row.day + 1}: guardar el presupuesto.`;
    return `Día ${row.day + 1}: ${parts.join("; ")}.`;
  });
  return `En la corrida de ejemplo (semilla interna ${detail.seed}) las primeras mañanas salen así. ${bits.join(" ")}`;
}
