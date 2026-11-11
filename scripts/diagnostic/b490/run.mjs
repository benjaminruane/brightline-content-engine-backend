/**
 * B490. One pass over the frozen fixtures. Cache off. Ceiling USD 35.
 * A second run of the same build is --pass 2.
 *
 *   node scripts/diagnostic/b490/run.mjs --ids 01,02,03,04,05,06,07,08,09,10,11,12,13,14,15,16,17,18,19,20,22,23,24,25
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPaidPass } from "../lib/paid-pass.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

runPaidPass({ dir: __dirname, label: "B490", ceilingUsd: 35 }).catch((err) => {
  console.error(err);
  process.exit(1);
});
