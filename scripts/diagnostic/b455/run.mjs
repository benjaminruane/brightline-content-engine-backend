/**
 * B455. One full pass. Cache off. Frozen statements. Ceiling USD 40.
 * The matcher and the commentary report what the source contains.
 *
 *   node scripts/diagnostic/b455/run.mjs
 *   node scripts/diagnostic/b455/run.mjs --resume
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPaidPass } from "../lib/paid-pass.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

runPaidPass({ dir: __dirname, label: "B455", ceilingUsd: 40 }).catch((err) => {
  console.error(err);
  process.exit(1);
});
