#!/usr/bin/env node
/**
 * Part 1: free checkable-particular filter over the 11 removal candidates.
 * Zero model calls.
 *
 * Usage: node scripts/diagnostic/revise/removal-particular-filter-check.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findCheckableParticulars } from "../../../lib/pr9-deterministic-unsupported-removal.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BREADTH = path.join(__dirname, "removal-breadth-rows.json");

async function main() {
  const breadth = JSON.parse(await readFile(BREADTH, "utf8"));
  const rows = (breadth.selected || []).map((r) => {
    const found = findCheckableParticulars(r.sentenceText);
    return {
      caseId: r.caseId,
      statementId: r.statementId,
      sentenceText: r.sentenceText,
      adjudication: r.adjudication,
      particularFound: found.length > 0,
      particulars: found,
    };
  });

  const correct = rows.filter((r) => r.adjudication === "CORRECT");
  const wrong = rows.filter((r) => r.adjudication === "WRONG");
  const correctWith = correct.filter((r) => r.particularFound).length;
  const wrongHas = wrong.some((r) => r.particularFound);
  const pass = correctWith === 9 && wrongHas === false;

  console.log(
    JSON.stringify(
      {
        correctWithParticularOf9: correctWith,
        wrongHasParticular: wrongHas,
        filterPasses: pass,
        rows,
      },
      null,
      2
    )
  );
  console.log(`CORRECT with particular: ${correctWith}/9`);
  console.log(`WRONG has particular: ${wrongHas}`);
  console.log(pass ? "FILTER PASSES" : "FILTER FAILS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
