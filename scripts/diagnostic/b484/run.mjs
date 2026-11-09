/**
 * B484. Fixtures 18, 22, 23, 24, and 25. Cache off.
 * Abort if cumulative spend passes USD 5. The freeze guard is the shared one.
 *
 *   node scripts/diagnostic/b484/run.mjs --ids 18,22,23,24,25
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPaidPass } from "../lib/paid-pass.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

runPaidPass({ dir: __dirname, label: "B484", ceilingUsd: 5 }).catch((err) => {
  console.error(err);
  process.exit(1);
});
