#!/usr/bin/env node
/**
 * Measurements behind the Revise rebuild critique. Zero model calls.
 *
 * Q1  do the spans the stage 1 contract depends on actually exist, and in
 *     which coordinate frame
 * Q2  cases where the confirmed-span-verbatim rule would be wrong
 * Q4  flagged statements per draft, and payload sizes for a cost estimate
 *
 * Usage: node scripts/diagnostic/revise/rebuild-design-critique.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gatherConcerns } from "../../../lib/build-revision-prompt.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

const ARTEFACTS = [
  "scripts/diagnostic/eval-ablation/r10-production-verify.json",
  "scripts/diagnostic/eval-ablation/r3a-production-verify.json",
  "scripts/diagnostic/revise/suggest-after-r10-review1.json",
  "scripts/diagnostic/revise/suggest-after-r10-review2.json",
  "scripts/diagnostic/revise/condition-b-review.json",
  "scripts/diagnostic/revise/coverage-gap-review.json",
];

function findStatementArrays(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return out;
  if (Array.isArray(node)) {
    if (node.length && node[0] && node[0].qcCard) out.push(node);
    node.forEach((n) => findStatementArrays(n, out, depth + 1));
    return out;
  }
  for (const v of Object.values(node)) findStatementArrays(v, out, depth + 1);
  return out;
}

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();

function overlaps(aStart, aEnd, bStart, bEnd) {
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > 0;
}

async function main() {
  const stats = {
    statements: 0,
    flagged: 0,
    withSupportSpans: 0,
    supportSpansTotal: 0,
    supportSpansNullOffsets: 0,
    supportPassageFoundInStatement: 0,
    withUnsupportedSpans: 0,
    unsupportedSpansTotal: 0,
    unsupportedNullOffsets: 0,
    unsupportedTextVerifiedInStatement: 0,
    unsupportedTextMismatch: 0,
    withClaims: 0,
    claimsTotal: 0,
    claimsConfirmedPreserve: 0,
    withCoverageUnion: 0,
  };

  // Q2 counters
  const q2 = {
    flaggedWithNoStatementSideConfirmed: 0,
    wholeStatementIsOneConfirmedSpan: 0,
    confirmedOverlapsUnsupported: 0,
    conflictWithNoUnsupportedSpan: 0,
    conflictWithUnsupportedInsideConfirmedClaim: 0,
  };

  const perDraft = [];
  const examples = [];

  for (const rel of ARTEFACTS) {
    const json = JSON.parse(await readFile(path.join(ROOT, rel), "utf8"));
    const arrs = findStatementArrays(json);
    const statements = arrs.flat();
    if (statements.length === 0) continue;

    const concerns = gatherConcerns(statements, null);
    perDraft.push({
      artefact: rel,
      statements: statements.length,
      flagged: concerns.length,
      flaggedPct: Number(((concerns.length / statements.length) * 100).toFixed(1)),
    });

    for (const st of statements) {
      const c = st.qcCard || {};
      const text = String(st.text ?? c.originalClaimText ?? "");
      stats.statements += 1;

      const support = Array.isArray(c.supportSpans) ? c.supportSpans : [];
      const unsupported = Array.isArray(c.unsupportedSpans) ? c.unsupportedSpans : [];
      const claims = Array.isArray(c.claims) ? c.claims : [];

      if (support.length) stats.withSupportSpans += 1;
      stats.supportSpansTotal += support.length;
      for (const sp of support) {
        if (!Number.isFinite(sp?.start) || !Number.isFinite(sp?.end)) stats.supportSpansNullOffsets += 1;
        // If supportSpans were statement-frame, the passage would be locatable
        // in the statement. Measuring this settles the frame empirically.
        if (sp?.passage && norm(text).includes(norm(sp.passage))) {
          stats.supportPassageFoundInStatement += 1;
        }
      }

      if (unsupported.length) stats.withUnsupportedSpans += 1;
      stats.unsupportedSpansTotal += unsupported.length;
      for (const sp of unsupported) {
        if (!Number.isFinite(sp?.start) || !Number.isFinite(sp?.end)) {
          stats.unsupportedNullOffsets += 1;
          continue;
        }
        const sliced = text.slice(sp.start, sp.end);
        if (sp.text && norm(sliced) === norm(sp.text)) stats.unsupportedTextVerifiedInStatement += 1;
        else stats.unsupportedTextMismatch += 1;
      }

      if (claims.length) stats.withClaims += 1;
      stats.claimsTotal += claims.length;
      const confirmedClaims = claims.filter((cl) => cl?.role === "confirmed_preserve");
      stats.claimsConfirmedPreserve += confirmedClaims.length;
      if (c.coverageUnion) stats.withCoverageUnion += 1;

      const concern = concerns.find((x) => x.statementText === text);
      if (!concern) continue;
      stats.flagged += 1;

      // A statement-side CONFIRMED span exists only via claim decomposition or
      // as the complement of unsupportedSpans. supportSpans are source-frame.
      const hasStatementSideConfirmed = confirmedClaims.length > 0 || unsupported.length > 0;
      if (!hasStatementSideConfirmed) {
        q2.flaggedWithNoStatementSideConfirmed += 1;
        if (examples.length < 6) {
          examples.push({
            artefact: rel,
            kind: concern.evidence?.kind ?? "(editorial only)",
            text: text.slice(0, 110),
            supportSpans: support.length,
            unsupportedSpans: unsupported.length,
            claims: claims.length,
          });
        }
      }

      // Whole statement is one confirmed span: flagged, decomposed, and every
      // claim is confirmed_preserve.
      if (claims.length > 0 && confirmedClaims.length === claims.length) {
        q2.wholeStatementIsOneConfirmedSpan += 1;
      }

      for (const cl of confirmedClaims) {
        const cs = Number.isFinite(cl?.localStart) ? cl.localStart : null;
        const ce = Number.isFinite(cl?.localEnd) ? cl.localEnd : null;
        if (cs === null || ce === null) continue;
        for (const sp of unsupported) {
          if (!Number.isFinite(sp?.start)) continue;
          if (overlaps(cs, ce, sp.start, sp.end)) q2.confirmedOverlapsUnsupported += 1;
        }
      }

      if (concern.evidence?.kind === "conflict") {
        if (unsupported.length === 0) q2.conflictWithNoUnsupportedSpan += 1;
        if (confirmedClaims.length > 0) q2.conflictWithUnsupportedInsideConfirmedClaim += 1;
      }
    }
  }

  const flaggedCounts = perDraft.map((d) => d.flagged).sort((a, b) => a - b);
  const median =
    flaggedCounts.length === 0
      ? 0
      : flaggedCounts.length % 2
        ? flaggedCounts[(flaggedCounts.length - 1) / 2]
        : (flaggedCounts[flaggedCounts.length / 2 - 1] + flaggedCounts[flaggedCounts.length / 2]) / 2;
  const mean = flaggedCounts.reduce((a, b) => a + b, 0) / (flaggedCounts.length || 1);

  console.log("");
  console.log("Q1  span availability across real Review cards");
  console.log(`statements:                          ${stats.statements}`);
  console.log(`flagged (gatherConcerns):            ${stats.flagged}`);
  console.log("");
  console.log(`with supportSpans:                   ${stats.withSupportSpans}  (${stats.supportSpansTotal} spans)`);
  console.log(`  null offsets:                      ${stats.supportSpansNullOffsets}`);
  console.log(`  passage locatable IN THE STATEMENT:${String(stats.supportPassageFoundInStatement).padStart(3)}   <- frame check`);
  console.log(`with unsupportedSpans:               ${stats.withUnsupportedSpans}  (${stats.unsupportedSpansTotal} spans)`);
  console.log(`  null offsets:                      ${stats.unsupportedNullOffsets}`);
  console.log(`  text verified at statement offset: ${stats.unsupportedTextVerifiedInStatement}`);
  console.log(`  mismatch:                          ${stats.unsupportedTextMismatch}`);
  console.log(`with claims (decomposition ran):     ${stats.withClaims}  (${stats.claimsTotal} claims, ${stats.claimsConfirmedPreserve} confirmed_preserve)`);
  console.log(`with coverageUnion:                  ${stats.withCoverageUnion}`);

  console.log("");
  console.log("Q2  where the confirmed-span-verbatim rule breaks");
  console.log(`flagged statements with NO statement-side confirmed span: ${q2.flaggedWithNoStatementSideConfirmed} of ${stats.flagged}`);
  console.log(`whole statement is confirmed (all claims confirmed_preserve): ${q2.wholeStatementIsOneConfirmedSpan}`);
  console.log(`confirmed claim overlapping an unsupported span:          ${q2.confirmedOverlapsUnsupported}`);
  console.log(`conflict statements with NO unsupportedSpan:              ${q2.conflictWithNoUnsupportedSpan}`);
  console.log(`conflict statements carrying a confirmed claim:           ${q2.conflictWithUnsupportedInsideConfirmedClaim}`);

  console.log("");
  console.log("Q4  flagged statements per draft");
  for (const d of perDraft) {
    console.log(`  ${String(d.flagged).padStart(2)} of ${String(d.statements).padStart(2)} (${String(d.flaggedPct).padStart(5)}%)  ${d.artefact}`);
  }
  console.log(`  median ${median}   mean ${mean.toFixed(1)}   max ${Math.max(...flaggedCounts)}`);

  if (examples.length) {
    console.log("");
    console.log("examples: flagged, but no statement-side confirmed span exists");
    for (const e of examples) {
      console.log(`  [${e.kind}] support=${e.supportSpans} unsup=${e.unsupportedSpans} claims=${e.claims}`);
      console.log(`    ${e.text}`);
    }
  }

  await writeFile(
    path.join(__dirname, "rebuild-design-critique.json"),
    `${JSON.stringify({ ranAt: new Date().toISOString(), stats, q2, perDraft, median, mean, examples }, null, 2)}\n`,
    "utf8"
  );
  console.log("");
  console.log("wrote rebuild-design-critique.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
