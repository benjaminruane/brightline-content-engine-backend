/**
 * B485. One pass over the frozen fixtures. Cache off. Ceiling USD 30.
 *
 *   node scripts/diagnostic/b485/run.mjs --ids 01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16,17,18,19,20,22,23,24,25
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPaidPass } from "../lib/paid-pass.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

runPaidPass({ dir: __dirname, label: "B485", ceilingUsd: 30 }).catch((err) => {
  console.error(err);
  process.exit(1);
});
