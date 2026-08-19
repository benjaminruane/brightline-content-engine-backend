import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { pipelineCodeFingerprint } from "../lib/pipeline-fingerprint.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";

export const BASELINE_PATH = path.join(DIAG_ROOT, "claim-spans", ".baseline.json");

function caseFingerprint(label, draft, sources) {
  const hash = createHash("sha256");
  hash.update(String(label || ""));
  hash.update("\n");
  hash.update(typeof draft === "string" ? draft : "");
  for (const src of Array.isArray(sources) ? sources : []) {
    hash.update("\n---\n");
    hash.update(typeof src?.label === "string" ? src.label : "");
    hash.update("\n");
    hash.update(typeof src?.text === "string" ? src.text : "");
  }
  return hash.digest("hex");
}

export async function createBaselineStore({ refresh = false } = {}) {
  const fingerprint = await pipelineCodeFingerprint();
  const store = {
    fingerprint,
    cases: {},
  };
  let loaded = false;
  if (!refresh) {
    try {
      const raw = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
      if (raw && raw.fingerprint === fingerprint && raw.cases && typeof raw.cases === "object") {
        store.cases = raw.cases;
        loaded = true;
      }
    } catch {
      loaded = false;
    }
  }

  async function flush() {
    await mkdir(path.dirname(BASELINE_PATH), { recursive: true });
    const tmp = `${BASELINE_PATH}.tmp`;
    await writeFile(tmp, JSON.stringify(store), "utf8");
    await rename(tmp, BASELINE_PATH);
  }

  return {
    fingerprint,
    loaded,
    refresh,
    get(label, draft, sources) {
      const row = store.cases[label];
      if (!row) return null;
      if (row.caseFingerprint !== caseFingerprint(label, draft, sources)) return null;
      if (!Array.isArray(row.statements) || !Array.isArray(row.matches)) return null;
      return { statements: row.statements, matches: row.matches };
    },
    async set(label, draft, sources, statements, matches) {
      store.cases[label] = {
        caseFingerprint: caseFingerprint(label, draft, sources),
        statements,
        matches,
      };
      await flush();
    },
  };
}
