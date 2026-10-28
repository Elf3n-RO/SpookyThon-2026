import { childSeed, normalizeConfig } from "./index.js";
import { runTrio } from "./simulate.js";

self.onmessage = (event) => {
  const { config, start, end, job } = event.data;
  const normalized = normalizeConfig(config);
  const trios = [];
  for (let i = start; i < end; i += 1) {
    trios.push(runTrio({ ...normalized, seed: childSeed(normalized.seed, i) }, false));
    self.postMessage({ job, type: "progress", done: trios.length, total: end - start });
  }
  self.postMessage({ job, type: "done", trios });
};
