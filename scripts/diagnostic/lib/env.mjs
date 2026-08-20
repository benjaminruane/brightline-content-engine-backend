import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths.mjs";
import { applyDiagnosticDiskCache, forceLiveMeasurementCacheOff } from "./llm-cache-disk.mjs";

/**
 * Load KEY=VALUE lines from .env.local / .env (no dependency). Does not override existing env.
 * Diagnostic scripts then pick up the disk LLM cache unless liveMeasurement is set.
 *
 * @param {{ liveMeasurement?: boolean }} [options]
 */
export function loadLocalEnvFiles(options = {}) {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.join(REPO_ROOT, name);
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
  if (options.liveMeasurement === true) {
    forceLiveMeasurementCacheOff();
    return;
  }
  applyDiagnosticDiskCache(process.argv);
}

export { applyDiagnosticDiskCache, forceLiveMeasurementCacheOff };
