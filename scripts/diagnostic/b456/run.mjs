import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPaidPass } from "../lib/paid-pass.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

runPaidPass({ dir: __dirname, label: "B456", ceilingUsd: 40 }).catch((err) => {
  console.error(err);
  process.exit(1);
});
