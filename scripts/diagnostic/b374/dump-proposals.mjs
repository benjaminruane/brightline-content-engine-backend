/**
 * B374. Dump Implement Changes proposals on both HICL payloads.
 * No model. Writes proposals.json.
 */
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runActionList } from "../../../lib/revise-actions/run.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const HICL = path.join(ROOT, "tests/fixtures/real-runs-2026-10-04-hicl");

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be called");
  };
}

function publicRows(result) {
  return (result.entries || []).map((row) => ({
    id: row.id,
    disposition: row.disposition,
    kind: row.kind,
    rule: row.rule,
    proposedChange: row.proposedChange || null,
    resultingSentence: row.resultingSentence || null,
    verification: row.verification || null,
    noProposalReason: row.noProposalReason || null,
  }));
}

const clean = JSON.parse(readFileSync(path.join(HICL, "clean-review.json"), "utf8"));
const doc = JSON.parse(readFileSync(path.join(HICL, "doc-review.json"), "utf8"));

const cleanResult = await runActionList(clean.statements, { callModel: throwingModel() });
const docResult = await runActionList(doc.statements, { callModel: throwingModel() });

const out = {
  clean: publicRows(cleanResult),
  doctored: publicRows(docResult),
};

writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "proposals.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
