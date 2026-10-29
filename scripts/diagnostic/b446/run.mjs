/**
 * B446. The paid pass that confirms the mechanics scan, the craft-note ban,
 * and the split leave-alone number. Cache off. Frozen statements. Ceiling USD 40.
 *
 *   node scripts/diagnostic/b446/run.mjs
 *   node scripts/diagnostic/b446/run.mjs --resume
 *
 * Prints the one-pass estimate first. A stored fixture is skipped on resume.
 * The craft note text is stored on the fixture. A shown note with no text is refused.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPaidPass } from "../lib/paid-pass.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

runPaidPass({ dir: __dirname, label: "B446", ceilingUsd: 40 }).catch((err) => {
  console.error(err);
  process.exit(1);
});
