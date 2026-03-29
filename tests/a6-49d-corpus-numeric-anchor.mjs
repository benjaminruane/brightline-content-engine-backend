#!/usr/bin/env node
/**
 * A6.49d regression: deterministic numeric corpus anchoring + V2 handoff (no server).
 */
import assert from "node:assert/strict";
import { resolveNumericCorpusHitExcerpt, findDeterministicNumericAnchorIndex } from "../lib/corpus-numeric-anchor.mjs";
import { corpusSearch } from "../lib/analyse-statements-impl.mjs";
import { runQcV2Pipeline } from "../lib/qc/qc-v2-pipeline.mjs";

function runA_numericSupportRealExcerpt() {
  const statementText = "Shopify raised $5 million in its Series A funding round.";
  // Paraphrased body so the corpus does not take the exact-phrase path (which skips numeric anchoring).
  const uploadedDocs = [
    {
      id: 1,
      title: "Pitch deck",
      text: "Raised $5 million Series A (Shopify).",
    },
  ];
  const res = corpusSearch(statementText, uploadedDocs, { diagVerbose: false });
  assert.equal(res.found, true, "Run A: corpusSearch should find numeric match");
  assert.ok(Array.isArray(res.hits) && res.hits.length >= 1, "Run A: expected hits");
  const numHit = res.hits.find((h) => h.matchType === "number");
  assert.ok(numHit, "Run A: expected a number hit");
  assert.ok(numHit.excerpt && String(numHit.excerpt).trim().length > 0, "Run A: numeric hit excerpt must be non-empty");
  assert.ok(
    String(numHit.excerpt).includes("$5") || String(numHit.excerpt).toLowerCase().includes("million"),
    "Run A: excerpt should contain matched funding surface",
  );

  const stmt = {
    text: statementText,
    assessment: {
      canonicalClaims: [
        {
          id: "claim_a",
          displayText: statementText,
          citations: [1],
        },
      ],
    },
    evidenceBundle: { supportBindings: [] },
    meta: {
      _evidenceBundleCorpusResult: res,
    },
  };
  runQcV2Pipeline([stmt], {
    unifiedReferences: [{ id: 1, title: "Pitch deck", url: null, sourceType: "uploaded" }],
    uploadedLen: 1,
    assignCredibilityTier: () => "LOW",
  });
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "Run A: qcEvidenceAuthorities[0]");
  assert.equal(auth.hasUsableExcerpt, true, "Run A: V2 should not downgrade for lack of excerpt");
  assert.notEqual(auth.displayVerdict, "not_supported", "Run A: should not collapse to not_supported solely from empty corpus excerpt");
  assert.ok(Array.isArray(auth.displaySourceItems) && auth.displaySourceItems.length > 0, "Run A: citation popup rows");
  assert.ok(
    auth.displaySourceItems.some((i) => i.excerptText && String(i.excerptText).trim().length > 0),
    "Run A: popup backed by real excerpt",
  );
}

function runB_numericConflictRealExcerpts() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const corpusResult = {
    found: true,
    hits: [
      {
        docId: 1,
        refId: 1,
        excerpt: "Shopify raised $5 million in its Series A funding round.",
        matchType: "number",
      },
      {
        docId: 2,
        refId: 2,
        excerpt: "Shopify raised $7 million in a later financing.",
        matchType: "number",
      },
    ],
    debug: {},
  };
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "claim_b",
          displayText: claimText,
          citations: [1, 2],
        },
      ],
    },
    evidenceBundle: { supportBindings: [] },
    meta: {
      _evidenceBundleCorpusResult: corpusResult,
    },
  };
  runQcV2Pipeline([stmt], {
    unifiedReferences: [
      { id: 1, title: "Doc A", url: null, sourceType: "uploaded" },
      { id: 2, title: "Doc B", url: null, sourceType: "uploaded" },
    ],
    uploadedLen: 2,
    assignCredibilityTier: () => "LOW",
  });
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "Run B: authority");
  assert.equal(auth.displayVerdict, "conflict", "Run B: displayVerdict conflict");
  assert.ok(auth.conflictEvidence && Array.isArray(auth.conflictEvidence.sideA) && Array.isArray(auth.conflictEvidence.sideB), "Run B: conflictEvidence");
  assert.ok(auth.displaySourceItems && auth.displaySourceItems.length >= 1, "Run B: surfaced rows");
  for (const row of auth.displaySourceItems) {
    assert.ok(row.excerptText && String(row.excerptText).trim().length > 0, "Run B: row excerpt non-empty");
  }
}

function runC_anchorFailureRejection() {
  const r = resolveNumericCorpusHitExcerpt(
    "no monetary tokens in this sentence",
    5_000_000,
    5_000_000,
    "Shopify raised $5 million.",
    { diagVerbose: false, docId: 99 },
  );
  assert.equal(r.rejectionReason, "numeric_hit_rejected_no_valid_anchor");
  assert.equal(r.excerpt, "");
  assert.equal(findDeterministicNumericAnchorIndex("no digits", 5_000_000, 5_000_000, "x"), -1);

  const res = corpusSearch("Shopify raised $5 million.", [{ id: 1, title: "Empty body", text: "no digits here" }], {
    diagVerbose: false,
  });
  if (res.hits && res.hits.some((h) => h.matchType === "number")) {
    throw new Error("Run C: expected no numeric hit when anchor cannot resolve");
  }
}

function main() {
  runA_numericSupportRealExcerpt();
  runB_numericConflictRealExcerpts();
  runC_anchorFailureRejection();
  console.log("a6-49d: all regression runs passed");
}

main();
