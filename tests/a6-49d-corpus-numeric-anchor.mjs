#!/usr/bin/env node
/**
 * A6.49d–A6.49h regression: numeric corpus anchoring, V2 handoff, mismatch partial,
 * excerpt quality gate, and corpus-hit ↔ citation association (refId vs docId).
 */
import assert from "node:assert/strict";
import { resolveNumericCorpusHitExcerpt, findDeterministicNumericAnchorIndex } from "../lib/corpus-numeric-anchor.mjs";
import { corpusSearch } from "../lib/analyse-statements-impl.mjs";
import { deriveComponents, getCandidatesForClaim, pickCorpusHitForCitation, runQcV2Pipeline } from "../lib/qc/qc-v2-pipeline.mjs";

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
  assert.equal(auth.displayVerdict, "supported_full", "Run A: clean numeric support stays supported_full");
  assert.equal(auth.concernLevel, "none", "Run A: concern none");
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

/** A6.49e / A6.49g-A: live-style mismatch — body excerpt with invest/evaluating/up to + corpus matchType number → supported_partial. */
function runD_supportMismatchPartial() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "mismatch_e",
          type: "investment_amount",
          displayText: claimText,
          citations: [1],
        },
      ],
    },
    evidenceBundle: { supportBindings: [] },
    meta: {
      _evidenceBundleCorpusResult: {
        found: true,
        hits: [
          {
            docId: 1,
            excerpt: "Investors are evaluating up to $5 million for Shopify Series A.",
            matchType: "number",
          },
        ],
      },
    },
  };
  const uploadedDocs = [
    { id: 1, title: "Term sheet", text: "Investors are evaluating up to $5 million for Shopify Series A." },
  ];
  runQcV2Pipeline([stmt], {
    unifiedReferences: [{ id: 1, title: "Term sheet", url: null, sourceType: "uploaded" }],
    uploadedLen: 1,
    assignCredibilityTier: () => "LOW",
    uploadedDocs,
  });
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "Run D: authority");
  assert.equal(auth.displayVerdict, "supported_partial", "Run D: partial verdict");
  assert.equal(auth.hasUsableExcerpt, true, "Run D: usable excerpt");
  assert.equal(auth.concernLevel, "moderate", "Run D: moderate concern");
  assert.ok(
    typeof auth.commentaryPayload === "string" && auth.commentaryPayload.toLowerCase().includes("investor"),
    "Run D: commentary describes quantity-type mismatch",
  );
  assert.ok(Array.isArray(auth.displaySourceItems) && auth.displaySourceItems.length >= 1, "Run D: surviving display items");
}

/**
 * A6.49f: No entity token in excerpt — legacy entity+keyValue gate failed; upstream corpus_hit_number + cue must pass.
 */
function runE_numericQualityGateWithoutEntityToken() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649f_gate_e",
          type: "investment_amount",
          displayText: claimText,
          citations: [1],
        },
      ],
    },
    evidenceBundle: { supportBindings: [] },
    meta: {
      _evidenceBundleCorpusResult: {
        found: true,
        hits: [
          {
            docId: 1,
            excerpt: "The investment amount is up to $5 million for the Series A round.",
            matchType: "number",
          },
        ],
      },
    },
  };
  const uploadedDocs = [
    { id: 1, title: "Term sheet", text: "The investment amount is up to $5 million for the Series A round." },
  ];
  runQcV2Pipeline([stmt], {
    unifiedReferences: [{ id: 1, title: "Term sheet", url: null, sourceType: "uploaded" }],
    uploadedLen: 1,
    assignCredibilityTier: () => "LOW",
    uploadedDocs,
  });
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "Run E: authority");
  assert.equal(auth.displayVerdict, "supported_partial", "Run E: partial verdict");
  assert.equal(auth.hasUsableExcerpt, true, "Run E: usable excerpt");
  assert.equal(auth.concernLevel, "moderate", "Run E: moderate concern");
  assert.ok(
    Array.isArray(auth.displaySourceItems) && auth.displaySourceItems.length >= 1,
    "Run E: displaySourceItems non-empty (quality gate + popup)",
  );
}

/**
 * A6.49g-B: Claim has no parsed $ amount in deriveComponents, but corpus matchType number + body excerpt still passes numeric_evidence gate.
 */
function runH_upstreamCorpusNumericTruthWithoutEvalAmount() {
  const claimText = "Shopify raised five million dollars in its Series A funding round.";
  assert.equal(deriveComponents(claimText).amount, null, "Run H: no $ token in claim — amount component absent");
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649g_no_eval_amount",
          type: "investment_amount",
          displayText: claimText,
          citations: [1],
        },
      ],
    },
    evidenceBundle: { supportBindings: [] },
    meta: {
      _evidenceBundleCorpusResult: {
        found: true,
        hits: [
          {
            docId: 1,
            excerpt: "Investors are evaluating up to $5 million for Shopify Series A.",
            matchType: "number",
          },
        ],
      },
    },
  };
  const uploadedDocs = [
    { id: 1, title: "Term sheet", text: "Investors are evaluating up to $5 million for Shopify Series A." },
  ];
  runQcV2Pipeline([stmt], {
    unifiedReferences: [{ id: 1, title: "Term sheet", url: null, sourceType: "uploaded" }],
    uploadedLen: 1,
    assignCredibilityTier: () => "LOW",
    uploadedDocs,
  });
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "Run H: authority");
  assert.equal(auth.displayVerdict, "supported_partial", "Run H: mismatch partial without eval amount component");
  assert.equal(auth.hasUsableExcerpt, true, "Run H: usable excerpt");
  assert.equal(auth.concernLevel, "moderate", "Run H: moderate");
  assert.ok((auth.displaySourceItems?.length ?? 0) >= 1, "Run H: citation rows from corpus upstream only");
}

/** A6.49g-C: Title-only synthetic excerpt with a dollar figure must not pass numeric_evidence or produce rows. */
function runF_titleOnlyNumericStillBlocked() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649f_title_f",
          type: "investment_amount",
          displayText: claimText,
          citations: [1],
        },
      ],
    },
    evidenceBundle: { supportBindings: [] },
    meta: {
      _evidenceBundleCorpusResult: { found: false, hits: [] },
    },
  };
  const uploadedDocs = [{ id: 1, title: "Series A term sheet $5 million commitment", text: "" }];
  runQcV2Pipeline([stmt], {
    unifiedReferences: [
      { id: 1, title: "Series A term sheet $5 million commitment", url: null, sourceType: "uploaded" },
    ],
    uploadedLen: 1,
    assignCredibilityTier: () => "LOW",
    uploadedDocs,
  });
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "Run F: authority");
  assert.equal(auth.displayVerdict, "not_supported", "Run F: no supported verdict from title-only");
  assert.equal(auth.hasUsableExcerpt, false, "Run F: no usable excerpt");
  assert.ok(!auth.displaySourceItems?.length, "Run F: no citation/display rows");
}

/** Genuine unrelated excerpt: classification none — stays not_supported. */
function runG_unrelatedExcerptNoSupport() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649f_none_g",
          displayText: claimText,
          citations: [1],
        },
      ],
    },
    evidenceBundle: { supportBindings: [] },
    meta: {
      _evidenceBundleCorpusResult: {
        found: true,
        hits: [
          {
            docId: 1,
            excerpt: "The weather in Ottawa was unusually warm last week.",
            matchType: "phrase",
          },
        ],
      },
    },
  };
  runQcV2Pipeline([stmt], {
    unifiedReferences: [{ id: 1, title: "Weather report", url: null, sourceType: "uploaded" }],
    uploadedLen: 1,
    assignCredibilityTier: () => "LOW",
  });
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "Run G: authority");
  assert.equal(auth.displayVerdict, "not_supported", "Run G: unrelated body");
  assert.equal(auth.hasUsableExcerpt, false, "Run G: no usable excerpt");
  assert.ok(!auth.displaySourceItems?.length, "Run G: no rows");
}

/** A6.49h-A: refId on hit matches citation; docId differs — association via refId path. */
function runI_a649h_refIdNotEqualDocId() {
  const hits = [
    {
      docId: 1,
      refId: 4,
      excerpt: "The investment amount is up to $5 million for Series A.",
      matchType: "number",
    },
  ];
  const { hit, matchedKey } = pickCorpusHitForCitation(4, hits);
  assert.equal(matchedKey, "refId", "Run I: pick by refId");
  assert.equal(hit.docId, 1);
  assert.equal(hit.refId, 4);
  const stmt = {
    meta: { _evidenceBundleCorpusResult: { found: true, hits } },
    evidenceBundle: { supportBindings: [] },
  };
  const claim = { citations: [4], displayText: "Shopify raised $5 million in its Series A funding round." };
  const refsById = new Map([["4", { id: 4, title: "Term", url: null, sourceType: "uploaded" }]]);
  const cands = getCandidatesForClaim(stmt, claim, refsById, 10, () => "LOW");
  assert.equal(cands.length, 1, "Run I: one candidate");
  assert.equal(cands[0].upstreamNumericEvidence, true);
  assert.equal(cands[0].upstreamNumericEvidenceSource, "corpus_hit_number");
}

/** A6.49h-B: backward-compatible docId-only hit (no citation refId field on hit). */
function runJ_a649h_docIdFallbackOnly() {
  const hits = [
    {
      docId: 4,
      excerpt: "Investors are evaluating up to $5 million for Shopify Series A.",
      matchType: "number",
    },
  ];
  const { matchedKey } = pickCorpusHitForCitation(4, hits);
  assert.equal(matchedKey, "docId", "Run J: pick by docId when refId absent");
  const stmt = {
    meta: { _evidenceBundleCorpusResult: { found: true, hits } },
    evidenceBundle: { supportBindings: [] },
  };
  const claim = { citations: [4], displayText: "Shopify raised $5 million in its Series A funding round." };
  const refsById = new Map([["4", { id: 4, title: "Term", url: null, sourceType: "uploaded" }]]);
  const cands = getCandidatesForClaim(stmt, claim, refsById, 10, () => "LOW");
  assert.equal(cands[0].upstreamNumericEvidence, true);
  assert.equal(cands[0].upstreamNumericEvidenceSource, "corpus_hit_number");
}

/** A6.49h-C: cited ref has no corpus row by refId or docId — title/binding only; no corpus upstream. */
function runK_a649h_unrelatedCitedRefNoHit() {
  const hits = [
    { docId: 1, refId: 1, excerpt: "Unrelated doc one excerpt.", matchType: "phrase" },
  ];
  const stmt = {
    meta: { _evidenceBundleCorpusResult: { found: true, hits } },
    evidenceBundle: { supportBindings: [] },
  };
  const claim = { citations: [4], displayText: "Shopify raised $5 million in its Series A funding round." };
  const refsById = new Map([["4", { id: 4, title: "Other doc", url: null, sourceType: "uploaded" }]]);
  const cands = getCandidatesForClaim(stmt, claim, refsById, 10, () => "LOW");
  assert.equal(cands.length, 1);
  assert.equal(cands[0].upstreamNumericEvidence, false);
  assert.equal(cands[0].upstreamNumericEvidenceSource, null);
}

/** A6.49h-D: title_fallback with numeric title — no corpus_hit_number from title alone. */
function runL_a649h_titleFallbackNumericTitle() {
  const stmt = {
    meta: { _evidenceBundleCorpusResult: { found: true, hits: [] } },
    evidenceBundle: { supportBindings: [] },
  };
  const claim = { citations: [4], displayText: "Shopify raised $5 million in its Series A funding round." };
  const refsById = new Map([["4", { id: 4, title: "Series A term sheet $5 million commitment", url: null, sourceType: "uploaded" }]]);
  const cands = getCandidatesForClaim(stmt, claim, refsById, 10, () => "LOW");
  assert.equal(cands.length, 1);
  assert.ok(String(cands[0].excerptText).includes("$5"), "Run L: title slice used as excerpt");
  assert.equal(cands[0].upstreamNumericEvidence, false);
  assert.equal(cands[0].upstreamNumericEvidenceSource, null);
}

/** A6.49h-E: end-to-end mismatch with cited ref 4 and hit { refId: 4, docId: 1 }. */
function runM_a649h_e2eMismatchRef4Doc1() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649h_e2e",
          type: "investment_amount",
          displayText: claimText,
          citations: [4],
        },
      ],
    },
    evidenceBundle: { supportBindings: [] },
    meta: {
      _evidenceBundleCorpusResult: {
        found: true,
        hits: [
          {
            docId: 1,
            refId: 4,
            excerpt: "Investors are evaluating up to $5 million for Shopify Series A.",
            matchType: "number",
          },
        ],
      },
    },
  };
  const claim = stmt.assessment.canonicalClaims[0];
  const refsById = new Map([["4", { id: 4, title: "Term sheet", url: null, sourceType: "uploaded" }]]);
  const pre = getCandidatesForClaim(stmt, claim, refsById, 10, () => "LOW");
  assert.equal(pre.length, 1, "Run M: candidate built");
  assert.equal(pre[0].upstreamNumericEvidence, true, "Run M: corpus_hit_number from refId association");
  assert.equal(pre[0].upstreamNumericEvidenceSource, "corpus_hit_number");
  const uploadedDocs = [
    { id: 1, refId: 4, title: "Term sheet", text: "Investors are evaluating up to $5 million for Shopify Series A." },
  ];
  runQcV2Pipeline([stmt], {
    unifiedReferences: [{ id: 4, title: "Term sheet", url: null, sourceType: "uploaded" }],
    uploadedLen: 10,
    assignCredibilityTier: () => "LOW",
    uploadedDocs,
  });
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "Run M: authority");
  assert.equal(auth.displayVerdict, "supported_partial", "Run M: partial");
  assert.equal(auth.hasUsableExcerpt, true);
  assert.equal(auth.concernLevel, "moderate");
  assert.ok((auth.displaySourceItems?.length ?? 0) >= 1, "Run M: display rows");
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
  runD_supportMismatchPartial();
  runE_numericQualityGateWithoutEntityToken();
  runH_upstreamCorpusNumericTruthWithoutEvalAmount();
  runF_titleOnlyNumericStillBlocked();
  runG_unrelatedExcerptNoSupport();
  runI_a649h_refIdNotEqualDocId();
  runJ_a649h_docIdFallbackOnly();
  runK_a649h_unrelatedCitedRefNoHit();
  runL_a649h_titleFallbackNumericTitle();
  runM_a649h_e2eMismatchRef4Doc1();
  console.log("a6-49d: all regression runs passed");
}

main();
