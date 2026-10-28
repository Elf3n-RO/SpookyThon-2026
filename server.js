import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeConfig, simulateMany } from "./public/engine/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "public");
const port = Number(process.env.PORT) || 8787;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

const security = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; style-src 'self'; script-src 'self'",
};

function send(res, status, body, extra = {}) {
  res.writeHead(status, { ...security, ...extra });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("cuerpo demasiado grande"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname === "/api/simular") {
    if (req.method === "OPTIONS") {
      send(res, 204, "", { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" });
      return;
    }
    if (req.method !== "POST") {
      send(res, 405, "Use POST");
      return;
    }
    try {
      const raw = JSON.parse((await readBody(req)) || "{}");
      const config = normalizeConfig(raw);
      config.runs = Math.min(config.runs, 30);
      const result = await simulateMany(config);
      send(res, 200, JSON.stringify(result), {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      });
    } catch {
      send(res, 400, JSON.stringify({ error: "No se pudo simular con esa configuración." }), {
        "content-type": "application/json; charset=utf-8",
      });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Método no permitido");
    return;
  }

  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    send(res, 403, "No");
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      send(res, 404, "No está");
      return;
    }
    const type = types[path.extname(file)] || "application/octet-stream";
    send(res, 200, req.method === "HEAD" ? "" : data, { "content-type": type });
  });
});

server.listen(port, () => {
  console.log(`Plaga Z en http://localhost:${port}`);
});
