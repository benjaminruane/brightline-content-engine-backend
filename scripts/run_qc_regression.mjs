#!/usr/bin/env node
/**
 * T1.1: QC regression runner. Loads tests/qc_regression_suite.json, POSTs each run to
 * /api/test/run-qc, saves full JSON to tests/output/<runName>.json, compares supportState, prints PASS/FAIL.
 * Exit non-zero if any run fails.
 * Base URL: QC_REGRESSION_BASE_URL or http://localhost:3000
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUITE_PATH = path.join(ROOT, "tests", "qc_regression_suite.json");
const OUTPUT_DIR = path.join(ROOT, "tests", "output");
const BASE_URL = process.env.QC_REGRESSION_BASE_URL || "http://localhost:3000";
const RUN_QC_URL = `${BASE_URL.replace(/\/$/, "")}/api/test/run-qc`;

function parseExpectSupportState(expect) {
  const v = expect?.supportState;
  if (v == null) return null;
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return [v];
  return null;
}

function primarySupportState(payload) {
  const statements = payload?.statements;
  if (!Array.isArray(statements) || statements.length === 0) return null;
  const first = statements[0];
  const qc = first?.qcCard;
  return qc?.supportState ?? null;
}

function checkPass(actual, expectedList) {
  if (expectedList == null || expectedList.length === 0) return { pass: true, note: "no expectation" };
  if (actual == null) return { pass: false, note: "no primary statement or qcCard" };
  const pass = expectedList.includes(actual);
  return { pass, note: pass ? "match" : `expected one of [${expectedList.join(", ")}], got ${actual}` };
}

async function runOne(spec) {
  const res = await fetch(RUN_QC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draft: spec.draft,
      sourceFiles: spec.sourceFiles,
      options: { webEnabled: false },
    }),
  });
  const payload = await res.json();
  const actual = primarySupportState(payload);
  const expectedList = parseExpectSupportState(spec.expect);
  const { pass, note } = checkPass(actual, expectedList);
  return {
    name: spec.name,
    expected: expectedList ? (expectedList.length === 1 ? expectedList[0] : expectedList.join("|")) : "-",
    actual: actual ?? "(none)",
    pass,
    note,
    payload,
    status: res.status,
  };
}

async function main() {
  let suite;
  try {
    const raw = await readFile(SUITE_PATH, "utf8");
    suite = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load suite:", SUITE_PATH, e?.message);
    process.exit(1);
  }

  const runs = Array.isArray(suite?.runs) ? suite.runs : [];
  if (runs.length === 0) {
    console.error("No runs in suite.");
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (const run of runs) {
    try {
      const result = await runOne(run);
      results.push(result);
      const outPath = path.join(OUTPUT_DIR, `${run.name}.json`);
      await writeFile(outPath, JSON.stringify(result.payload, null, 2), "utf8");
    } catch (e) {
      results.push({
        name: run.name,
        expected: run.expect?.supportState ?? "-",
        actual: "(error)",
        pass: false,
        note: e?.message || String(e),
        payload: null,
        status: null,
      });
    }
  }

  const passCount = results.filter((r) => r.pass).length;
  const failCount = results.length - passCount;

  console.log("\nrun\t\texpected\tactual\t\tpass\tnote");
  console.log("-".repeat(72));
  for (const r of results) {
    const run = r.name.padEnd(24);
    const exp = (r.expected ?? "-").toString().padEnd(16);
    const act = (r.actual ?? "-").toString().padEnd(16);
    const pass = r.pass ? "PASS" : "FAIL";
    const note = (r.note ?? "").slice(0, 32);
    console.log(`${run}\t${exp}\t${act}\t${pass}\t${note}`);
  }
  console.log("-".repeat(72));
  console.log(`Total: ${passCount} passed, ${failCount} failed. Outputs saved to ${OUTPUT_DIR}\n`);

  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
