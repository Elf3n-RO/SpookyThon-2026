import { normalizeConfig, simulateMany } from "./engine/index.js";

function headers() {
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
  };
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || "POST";
  if (method === "OPTIONS") return { statusCode: 204, headers: headers(), body: "" };
  try {
    const raw = JSON.parse(event.body || "{}");
    const config = normalizeConfig(raw);
    config.runs = Math.min(config.runs, 24);
    const result = await simulateMany(config);
    return { statusCode: 200, headers: headers(), body: JSON.stringify(result) };
  } catch {
    return {
      statusCode: 400,
      headers: headers(),
      body: JSON.stringify({ error: "No se pudo simular con esa configuración." }),
    };
  }
};
