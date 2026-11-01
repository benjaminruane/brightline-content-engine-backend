/**
 * B464. One confirming pass. Cache off. Ceiling USD 40.
 *
 *   node --import ./scripts/diagnostic/b464/register.mjs scripts/diagnostic/b464/run.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPaidPass } from "../lib/paid-pass.mjs";

globalThis.__b464Raw = [];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

runPaidPass({ dir: __dirname, label: "B464", ceilingUsd: 40, full: true }).catch((err) => {
  console.error(err);
  process.exit(1);
});
