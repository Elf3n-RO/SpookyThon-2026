import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const lambdaOut = path.join(root, "dist-lambda");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.rmSync(lambdaOut, { recursive: true, force: true });
copyDir(path.join(root, "public"), dist);
copyDir(path.join(root, "public", "engine"), path.join(lambdaOut, "engine"));
fs.copyFileSync(path.join(root, "lambda", "handler.mjs"), path.join(lambdaOut, "handler.mjs"));
console.log("Sitio en dist/ y función en dist-lambda/.");
