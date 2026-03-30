#!/usr/bin/env node
/**
 * A6.49d–A6.49n regression: numeric corpus anchoring, V2 handoff, mismatch partial,
 * excerpt quality gate, corpus-hit ↔ citation association, ref routing by source metadata,
 * and canonical binding directness (A6.49m).
 */
import assert from "node:assert/strict";
import { resolveNumericCorpusHitExcerpt, findDeterministicNumericAnchorIndex } from "../lib/corpus-numeric-anchor.mjs";
import { corpusSearch } from "../lib/analyse-statements-impl.mjs";
import {
  QUANTITY_MISMATCH_SKIP_REASONS,
  countDirectSupportingBindings,
  isBindingMismatchCompatible,
  isBindingPlaceholderSynthetic,
  isDirectConfirmingSupportBinding,
} from "../lib/qc/binding-directness.mjs";
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
    typeof auth.commentaryPayload === "string"
    && auth.commentaryPayload.includes("The source refers to")
    && auth.commentaryPayload.includes("total amount raised"),
    "Run D: A6.49l editorial mismatch commentary",
  );
  const row = auth.displaySourceItems?.[0];
  assert.ok(
    row?.whatThisShows && String(row.whatThisShows).includes("The source refers to"),
    "Run D: popup whatThisShows editorial",
  );
  assert.ok(!String(auth.commentaryPayload).includes("e.g."), "Run D: no bracketed e.g. in commentary");
  assert.ok(!/\binvestment amount\b/i.test(String(auth.commentaryPayload)), "Run D: no taxonomy investment amount");
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
  const pre = getCandidatesForClaim(stmt, claim, refsById, 1, () => "LOW");
  assert.equal(pre.length, 1, "Run M: candidate built");
  assert.equal(pre[0].upstreamNumericEvidence, true, "Run M: corpus_hit_number from refId association");
  assert.equal(pre[0].upstreamNumericEvidenceSource, "corpus_hit_number");
  const uploadedDocs = [
    { id: 1, refId: 4, title: "Term sheet", text: "Investors are evaluating up to $5 million for Shopify Series A." },
  ];
  runQcV2Pipeline([stmt], {
    unifiedReferences: [{ id: 4, title: "Term sheet", url: null, sourceType: "uploaded" }],
    uploadedLen: 1,
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

/** A6.49i-A: refId > uploadedLen but sourceType uploaded → uploaded path + corpus upstream. */
function runN_a649i_highRefIdUploadedMetadata() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    meta: {
      _evidenceBundleCorpusResult: {
        found: true,
        hits: [{ docId: 1, refId: 4, excerpt: "Investors are evaluating up to $5 million.", matchType: "number" }],
      },
    },
    evidenceBundle: { supportBindings: [] },
  };
  const claim = { citations: [4], displayText: claimText };
  const refsById = new Map([["4", { id: 4, title: "Term", url: null, sourceType: "uploaded" }]]);
  const cands = getCandidatesForClaim(stmt, claim, refsById, 1, () => "LOW");
  assert.equal(cands.length, 1, "Run N: one candidate");
  assert.equal(cands[0].sourceOrigin, "uploaded", "Run N: not misrouted to web when refId > uploadedLen");
  assert.equal(cands[0].upstreamNumericEvidence, true);
  assert.equal(cands[0].upstreamNumericEvidenceSource, "corpus_hit_number");
}

/** A6.49i-B: authoritative web ref stays on web path. */
function runO_a649i_webRefAuthoritative() {
  const stmt = {
    meta: { _evidenceBundleCorpusResult: { found: true, hits: [] } },
    evidenceBundle: { supportBindings: [] },
  };
  const claim = { citations: [2], displayText: "claim" };
  const refsById = new Map([
    ["2", { id: 2, title: "Search result", url: "https://example.com/x", sourceType: "web_search" }],
  ]);
  const cands = getCandidatesForClaim(stmt, claim, refsById, 100, () => "LOW");
  assert.equal(cands.length, 1);
  assert.equal(cands[0].sourceOrigin, "web");
}

/** A6.49i-C: no sourceType/type → heuristic (refId 5 > uploadedLen 1 ⇒ web). */
function runP_a649i_heuristicFallback() {
  const stmt = {
    meta: { _evidenceBundleCorpusResult: { found: true, hits: [] } },
    evidenceBundle: { supportBindings: [] },
  };
  const claim = { citations: [5], displayText: "claim" };
  const refsById = new Map([["5", { id: 5, title: "Only title" }]]);
  const cands = getCandidatesForClaim(stmt, claim, refsById, 1, () => "LOW");
  assert.equal(cands.length, 1);
  assert.equal(cands[0].sourceOrigin, "web");
}

/** A6.49j-A: Quantity mismatch fixture — gate passes via numeric_mismatch_excerpt (diag when verbose). */
function runQ_a649j_numericMismatchFixture() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649j_mismatch",
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
  const prevVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE;
  const gateLines = [];
  const origLog = console.log;
  console.log = (name, payload) => {
    if (name === "QC_V2_EXCERPT_QUALITY_GATE" && typeof payload === "string") {
      try {
        gateLines.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    }
    origLog(name, payload);
  };
  process.env.BRIGHTLINE_DIAG_VERBOSE = "1";
  try {
    runQcV2Pipeline([stmt], {
      unifiedReferences: [{ id: 1, title: "Term sheet", url: null, sourceType: "uploaded" }],
      uploadedLen: 1,
      assignCredibilityTier: () => "LOW",
      uploadedDocs,
    });
  } finally {
    console.log = origLog;
    process.env.BRIGHTLINE_DIAG_VERBOSE = prevVerbose;
  }
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "A6.49j-A: authority");
  assert.equal(auth.hasUsableExcerpt, true, "A6.49j-A: hasUsableExcerpt before downgrade");
  assert.ok((auth.displaySourceItems?.length ?? 0) > 0, "A6.49j-A: displaySourceItems");
  const diagHit = gateLines.find(
    (o) => o.branch === "numeric_mismatch_excerpt" && o.pass === true && o.claimId === "a649j_mismatch",
  );
  assert.ok(diagHit, "A6.49j-A: diag numeric_mismatch_excerpt pass true");
}

/** A6.49j-D: Clean full support — entity_relation path; numeric_mismatch_excerpt not used. */
function runQ_a649j_cleanFullNoNumericMismatchBranch() {
  const statementText = "Shopify raised $5 million in its Series A funding round.";
  const uploadedDocs = [{ id: 1, title: "Pitch deck", text: "Raised $5 million Series A (Shopify)." }];
  const res = corpusSearch(statementText, uploadedDocs, { diagVerbose: false });
  const stmt = {
    text: statementText,
    assessment: {
      canonicalClaims: [{ id: "a649j_clean", displayText: statementText, citations: [1] }],
    },
    evidenceBundle: { supportBindings: [] },
    meta: { _evidenceBundleCorpusResult: res },
  };
  const prevVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE;
  const gateLines = [];
  const origLog = console.log;
  console.log = (name, payload) => {
    if (name === "QC_V2_EXCERPT_QUALITY_GATE" && typeof payload === "string") {
      try {
        gateLines.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    }
    origLog(name, payload);
  };
  process.env.BRIGHTLINE_DIAG_VERBOSE = "1";
  try {
    runQcV2Pipeline([stmt], {
      unifiedReferences: [{ id: 1, title: "Pitch deck", url: null, sourceType: "uploaded" }],
      uploadedLen: 1,
      assignCredibilityTier: () => "LOW",
    });
  } finally {
    console.log = origLog;
    process.env.BRIGHTLINE_DIAG_VERBOSE = prevVerbose;
  }
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.equal(auth.displayVerdict, "supported_full", "A6.49j-D: clean support");
  assert.ok(
    !gateLines.some((o) => o.branch === "numeric_mismatch_excerpt"),
    "A6.49j-D: numeric_mismatch_excerpt branch not used",
  );
}

/** A6.49j-E: Non-quantity meta mismatch — gate fails; numeric_mismatch_excerpt not triggered. */
function runQ_a649j_nonQuantityMismatchGateFail() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649j_nonqty",
          type: "investment_amount",
          displayText: claimText,
          citations: [1],
        },
      ],
    },
    evidenceBundle: { supportBindings: [] },
    meta: {
      supportMismatch: {
        kind: "date_mismatch",
        type: "date_mismatch",
        explanation: "Source discusses a different reporting period.",
      },
      _evidenceBundleCorpusResult: {
        found: true,
        hits: [
          {
            docId: 1,
            excerpt: "Investors are evaluating up to five million for Shopify Series A.",
            matchType: "number",
          },
        ],
      },
    },
  };
  const uploadedDocs = [
    { id: 1, title: "Term sheet", text: "Investors are evaluating up to five million for Shopify Series A." },
  ];
  const prevVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE;
  const gateLines = [];
  const origLog = console.log;
  console.log = (name, payload) => {
    if (name === "QC_V2_EXCERPT_QUALITY_GATE" && typeof payload === "string") {
      try {
        gateLines.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    }
    origLog(name, payload);
  };
  process.env.BRIGHTLINE_DIAG_VERBOSE = "1";
  try {
    runQcV2Pipeline([stmt], {
      unifiedReferences: [{ id: 1, title: "Term sheet", url: null, sourceType: "uploaded" }],
      uploadedLen: 1,
      assignCredibilityTier: () => "LOW",
      uploadedDocs,
    });
  } finally {
    console.log = origLog;
    process.env.BRIGHTLINE_DIAG_VERBOSE = prevVerbose;
  }
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "A6.49j-E: authority");
  assert.equal((auth.displaySourceItems?.length ?? 0), 0, "A6.49j-E: gate fail — no rows");
  assert.equal(auth.hasUsableExcerpt, false, "A6.49j-E: no usable excerpt");
  assert.ok(
    !gateLines.some((o) => o.branch === "numeric_mismatch_excerpt"),
    "A6.49j-E: numeric_mismatch_excerpt not emitted",
  );
}

/** A6.49k-A/E: partial_support binding (scoped to claim) does not block inferred quantity mismatch; rows survive suppression. */
function runA649k_nonDirectBindingPartialSupport() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649k_a",
          type: "investment_amount",
          displayText: claimText,
          citations: [4],
        },
      ],
    },
    evidenceBundle: {
      supportBindings: [
        {
          claimId: "a649k_a",
          matchType: "partial_support",
          excerpt: "Investors are evaluating up to $5 million for Shopify Series A.",
        },
      ],
    },
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
  const uploadedDocs = [
    { id: 1, title: "Term sheet", text: "Investors are evaluating up to $5 million for Shopify Series A." },
  ];
  const policyLines = [];
  const prevVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE;
  const origLog = console.log;
  console.log = (name, payload) => {
    if (name === "QC_V2_MISMATCH_BINDING_POLICY" && typeof payload === "string") {
      try {
        policyLines.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    }
    origLog(name, payload);
  };
  process.env.BRIGHTLINE_DIAG_VERBOSE = "1";
  try {
    runQcV2Pipeline([stmt], {
      unifiedReferences: [{ id: 4, title: "Term sheet", url: null, sourceType: "uploaded" }],
      uploadedLen: 1,
      assignCredibilityTier: () => "LOW",
      uploadedDocs,
    });
  } finally {
    console.log = origLog;
    process.env.BRIGHTLINE_DIAG_VERBOSE = prevVerbose;
  }
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "A6.49k-A: authority");
  const pol = policyLines.find((p) => p.claimId === "a649k_a");
  assert.ok(pol, "A6.49k-A: policy diag");
  assert.equal(pol.directSupportingBindingsCount, 0, "A6.49k-A: no direct binding");
  assert.equal(pol.quantityMismatchInferenceSkipped, false, "A6.49k-A: inference not skipped");
  assert.ok(QUANTITY_MISMATCH_SKIP_REASONS.includes(pol.skipReason), "A6.49n: skipReason in contract");
  assert.equal(pol.skipReason, "no_direct_support", "A6.49n: inferred quantity path");
  assert.equal(pol.mismatchPartialEligible, true, "A6.49k-A: mismatch partial eligible");
  assert.ok((auth.displaySourceItems?.length ?? 0) >= 1, "A6.49k-A: display rows");
  assert.equal(auth.hasUsableExcerpt, true, "A6.49k-A: hasUsableExcerpt");
  assert.equal(auth.displayVerdict, "supported_partial", "A6.49k-A: partial verdict");
  assert.equal(auth.concernLevel, "moderate", "A6.49k-A: moderate concern");
  const wts = auth.displaySourceItems?.[0]?.whatThisShows ?? "";
  assert.ok(
    wts.includes("The source refers to") && wts.includes("total amount raised"),
    "A6.49l: editorial whatThisShows (partial_support binding + mismatch)",
  );
  assert.ok(!wts.includes("Shows that"), "A6.49l: no generic Shows-that lead");
}

/** A6.49k-B: exact binding counts as direct — heuristic mismatch skipped; full support path unchanged. */
function runA649k_directBindingSkipsMismatchInference() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649k_b",
          type: "investment_amount",
          displayText: claimText,
          citations: [1],
        },
      ],
    },
    evidenceBundle: {
      supportBindings: [
        {
          claimId: "a649k_b",
          matchType: "exact",
          excerpt: "Shopify raised $5 million in its Series A funding round.",
        },
      ],
    },
    meta: {
      _evidenceBundleCorpusResult: {
        found: true,
        hits: [
          {
            docId: 1,
            refId: 1,
            excerpt: "Shopify raised $5 million in its Series A funding round.",
            matchType: "number",
          },
        ],
      },
    },
  };
  const uploadedDocs = [{ id: 1, title: "Pitch deck", text: "Shopify raised $5 million in its Series A funding round." }];
  const policyLines = [];
  const prevVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE;
  const origLog = console.log;
  console.log = (name, payload) => {
    if (name === "QC_V2_MISMATCH_BINDING_POLICY" && typeof payload === "string") {
      try {
        policyLines.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    }
    origLog(name, payload);
  };
  process.env.BRIGHTLINE_DIAG_VERBOSE = "1";
  try {
    runQcV2Pipeline([stmt], {
      unifiedReferences: [{ id: 1, title: "Pitch deck", url: null, sourceType: "uploaded" }],
      uploadedLen: 1,
      assignCredibilityTier: () => "LOW",
      uploadedDocs,
    });
  } finally {
    console.log = origLog;
    process.env.BRIGHTLINE_DIAG_VERBOSE = prevVerbose;
  }
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  const pol = policyLines.find((p) => p.claimId === "a649k_b");
  assert.ok(pol, "A6.49k-B: policy diag");
  assert.ok(pol.directSupportingBindingsCount >= 1, "A6.49k-B: direct binding count");
  assert.equal(pol.quantityMismatchInferenceSkipped, true, "A6.49k-B: inference skipped");
  assert.equal(pol.skipReason, "direct_support_found", "A6.49n: skip only via direct count");
  assert.equal(pol.mismatchPartialEligible, false, "A6.49k-B: not mismatch partial");
  assert.equal(auth.displayVerdict, "supported_full", "A6.49k-B: full support");
  const wts = auth.displaySourceItems?.[0]?.whatThisShows ?? "";
  assert.ok(wts.includes("Shows that"), "A6.49l-B: full support keeps confirming popup lead");
}

/** A6.49k-C: empty supportBindings — unchanged mismatch partial (same as run D behaviour). */
function runA649k_noBindingsUnchanged() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649k_c",
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
  const policyLines = [];
  const prevVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE;
  const origLog = console.log;
  console.log = (name, payload) => {
    if (name === "QC_V2_MISMATCH_BINDING_POLICY" && typeof payload === "string") {
      try {
        policyLines.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    }
    origLog(name, payload);
  };
  process.env.BRIGHTLINE_DIAG_VERBOSE = "1";
  try {
    runQcV2Pipeline([stmt], {
      unifiedReferences: [{ id: 1, title: "Term sheet", url: null, sourceType: "uploaded" }],
      uploadedLen: 1,
      assignCredibilityTier: () => "LOW",
      uploadedDocs,
    });
  } finally {
    console.log = origLog;
    process.env.BRIGHTLINE_DIAG_VERBOSE = prevVerbose;
  }
  const pol = policyLines.find((p) => p.claimId === "a649k_c");
  assert.ok(pol, "A6.49k-C: policy diag");
  assert.equal(pol.supportBindings, 0);
  assert.equal(pol.quantityMismatchInferenceSkipped, false);
  assert.equal(pol.skipReason, "no_direct_support");
  assert.equal(pol.mismatchPartialEligible, true);
}

/** A6.49m-A: Shopify-style paraphrase on ref 4 — canonical predicates + policy contract (structured mismatch). */
function runA649m_shopifyParaphraseRef4Canonical() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const claim = {
    id: "a649m_shopify",
    type: "investment_amount",
    displayText: claimText,
    citations: [4],
  };
  const binding = {
    claimId: "a649m_shopify",
    refId: 4,
    matchType: "paraphrase",
    excerpt: "Investors are evaluating up to $5 million for Shopify Series A.",
  };
  assert.equal(isBindingMismatchCompatible(binding, claim, claimText), true, "A6.49m-A: mismatch-compatible");
  assert.equal(isDirectConfirmingSupportBinding(binding, claim, claimText), false, "A6.49m-A: not direct confirming");
  assert.equal(countDirectSupportingBindings([binding], claim, claimText), 0, "A6.49m-A: direct count");
  const stmt = {
    text: claimText,
    assessment: { canonicalClaims: [claim] },
    evidenceBundle: { supportBindings: [binding] },
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
  const uploadedDocs = [
    { id: 1, title: "Term sheet", text: "Investors are evaluating up to $5 million for Shopify Series A." },
  ];
  const policyLines = [];
  const prevVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE;
  const origLog = console.log;
  console.log = (name, payload) => {
    if (name === "QC_V2_MISMATCH_BINDING_POLICY" && typeof payload === "string") {
      try {
        policyLines.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    }
    origLog(name, payload);
  };
  process.env.BRIGHTLINE_DIAG_VERBOSE = "1";
  try {
    runQcV2Pipeline([stmt], {
      unifiedReferences: [{ id: 4, title: "Term sheet", url: null, sourceType: "uploaded" }],
      uploadedLen: 1,
      assignCredibilityTier: () => "LOW",
      uploadedDocs,
    });
  } finally {
    console.log = origLog;
    process.env.BRIGHTLINE_DIAG_VERBOSE = prevVerbose;
  }
  const pol = policyLines.find((p) => p.claimId === "a649m_shopify");
  assert.ok(pol, "A6.49m-A: policy diag");
  assert.equal(pol.directSupportingBindingsCount, 0);
  assert.equal(pol.quantityMismatchInferenceSkipped, false);
  assert.equal(pol.skipReason, "no_direct_support");
  assert.equal(pol.mismatchPartialEligible, true);
  assert.equal(pol.mismatchCompatibleBindingsCount, 1);
  assert.equal(pol.placeholderBindingsCount, 0);
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.equal(auth.displayVerdict, "supported_partial");
}

/** A6.49m-B: Exact direct-support — predicates match A6.49k-B behaviour. */
function runA649m_exactDirectPredicates() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const claim = { id: "a649m_exact", type: "investment_amount", displayText: claimText, citations: [1] };
  const binding = {
    claimId: "a649m_exact",
    matchType: "exact",
    excerpt: "Shopify raised $5 million in its Series A funding round.",
  };
  assert.equal(isBindingMismatchCompatible(binding, claim, claimText), false);
  assert.equal(isDirectConfirmingSupportBinding(binding, claim, claimText), true);
  assert.ok(countDirectSupportingBindings([binding], claim, claimText) >= 1);
}

/** A6.49m-C: Placeholder / empty excerpt — not direct; does not satisfy confirming support. */
function runA649m_placeholderNotDirect() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const claim = { id: "a649m_ph", type: "investment_amount", displayText: claimText, citations: [1] };
  const emptyEx = { claimId: "a649m_ph", matchType: "exact", excerpt: "" };
  assert.equal(isBindingPlaceholderSynthetic(emptyEx), true);
  assert.equal(isDirectConfirmingSupportBinding(emptyEx, claim, claimText), false);
  const flagged = { claimId: "a649m_ph", matchType: "exact", excerpt: "x", placeholder: true };
  assert.equal(isBindingPlaceholderSynthetic(flagged), true);
  assert.equal(isDirectConfirmingSupportBinding(flagged, claim, claimText), false);
}

/** A6.49m-E: Loose binding for another claimId — ignored for direct count and inference skip. */
function runA649m_looseBindingIgnoredForDirectCount() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const claim = { id: "a649m_scope", type: "investment_amount", displayText: claimText, citations: [4] };
  const bindings = [
    {
      claimId: "some_other_claim",
      matchType: "exact",
      excerpt: "Shopify raised $5 million in its Series A funding round.",
    },
    {
      claimId: "a649m_scope",
      matchType: "paraphrase",
      excerpt: "Investors are evaluating up to $5 million for Shopify Series A.",
    },
  ];
  assert.equal(countDirectSupportingBindings(bindings, claim, claimText), 0, "A6.49m-E: other-claim exact ignored");
  const stmt = {
    text: claimText,
    assessment: { canonicalClaims: [claim] },
    evidenceBundle: { supportBindings: bindings },
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
  const uploadedDocs = [
    { id: 1, title: "Term sheet", text: "Investors are evaluating up to $5 million for Shopify Series A." },
  ];
  const policyLines = [];
  const prevVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE;
  const origLog = console.log;
  console.log = (name, payload) => {
    if (name === "QC_V2_MISMATCH_BINDING_POLICY" && typeof payload === "string") {
      try {
        policyLines.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    }
    origLog(name, payload);
  };
  process.env.BRIGHTLINE_DIAG_VERBOSE = "1";
  try {
    runQcV2Pipeline([stmt], {
      unifiedReferences: [{ id: 4, title: "Term sheet", url: null, sourceType: "uploaded" }],
      uploadedLen: 1,
      assignCredibilityTier: () => "LOW",
      uploadedDocs,
    });
  } finally {
    console.log = origLog;
    process.env.BRIGHTLINE_DIAG_VERBOSE = prevVerbose;
  }
  const pol = policyLines.find((p) => p.claimId === "a649m_scope");
  assert.ok(pol);
  assert.equal(pol.supportBindings, 2);
  assert.equal(pol.supportBindingsLength, 1);
  assert.equal(pol.directSupportingBindingsCount, 0);
  assert.equal(pol.quantityMismatchInferenceSkipped, false);
  assert.equal(pol.skipReason, "no_direct_support");
  assert.equal(pol.mismatchPartialEligible, true);
}

/** A6.49n-D: Paraphrase binding (mismatch-compatible) but no structured quantity mismatch — partial path off; suppression clears. */
function runA649n_paraphraseNoStructuredMismatchSuppressed() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649n_d",
          type: "investment_amount",
          displayText: claimText,
          citations: [1],
        },
      ],
    },
    evidenceBundle: {
      supportBindings: [
        {
          claimId: "a649n_d",
          matchType: "paraphrase",
          excerpt: "Board materials discussed Series A financing.",
        },
      ],
    },
    meta: {
      _evidenceBundleCorpusResult: {
        found: true,
        hits: [
          {
            docId: 1,
            excerpt: "Shopify Series A financing was discussed in the board materials.",
            matchType: "phrase",
          },
        ],
      },
    },
  };
  const uploadedDocs = [{ id: 1, title: "Board deck", text: "Shopify Series A financing was discussed in the board materials." }];
  const policyLines = [];
  const prevVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE;
  const origLog = console.log;
  console.log = (name, payload) => {
    if (name === "QC_V2_MISMATCH_BINDING_POLICY" && typeof payload === "string") {
      try {
        policyLines.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    }
    origLog(name, payload);
  };
  process.env.BRIGHTLINE_DIAG_VERBOSE = "1";
  try {
    runQcV2Pipeline([stmt], {
      unifiedReferences: [{ id: 1, title: "Board deck", url: null, sourceType: "uploaded" }],
      uploadedLen: 1,
      assignCredibilityTier: () => "LOW",
      uploadedDocs,
    });
  } finally {
    console.log = origLog;
    process.env.BRIGHTLINE_DIAG_VERBOSE = prevVerbose;
  }
  const pol = policyLines.find((p) => p.claimId === "a649n_d");
  assert.ok(pol, "A6.49n-D: policy diag");
  assert.equal(pol.mismatchCompatibleBindingsCount, 1, "A6.49n-D: tier-1 paraphrase");
  assert.equal(pol.skipReason, "structured_quantity_mismatch_absent");
  assert.equal(pol.mismatchPartialEligible, false, "A6.49n-D: no partial without structured quantity mismatch");
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.equal(auth.displayVerdict, "not_supported");
  assert.ok(!auth.displaySourceItems?.length, "A6.49n-D: related/none suppression");
}

/** A6.49n-F: Exact matchType but mismatch-compatible by Tier-2 metadata — precedence over direct. */
function runA649n_overlapPrecedenceExactWithMetadata() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const claim = { id: "a649n_f", type: "investment_amount", displayText: claimText, citations: [1] };
  const binding = {
    claimId: "a649n_f",
    matchType: "exact",
    excerpt: "Shopify raised $5 million in its Series A funding round.",
    reasonCode: "quantity mismatch",
  };
  assert.equal(isBindingMismatchCompatible(binding, claim, claimText), true, "A6.49n-F: tier-2 metadata");
  assert.equal(isDirectConfirmingSupportBinding(binding, claim, claimText), false, "A6.49n-F: mismatch wins first");
  assert.equal(countDirectSupportingBindings([binding], claim, claimText), 0);
}

/** A6.49n-C: Placeholder binding — placeholderBindingsCount >= 1; inference not blocked by direct count. */
function runA649n_placeholderBindingPolicyCounts() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649n_ph_pol",
          type: "investment_amount",
          displayText: claimText,
          citations: [1],
        },
      ],
    },
    evidenceBundle: {
      supportBindings: [
        {
          claimId: "a649n_ph_pol",
          matchType: "exact",
          placeholder: true,
          excerpt: "Shopify raised $5 million in its Series A funding round.",
        },
      ],
    },
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
  const policyLines = [];
  const prevVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE;
  const origLog = console.log;
  console.log = (name, payload) => {
    if (name === "QC_V2_MISMATCH_BINDING_POLICY" && typeof payload === "string") {
      try {
        policyLines.push(JSON.parse(payload));
      } catch {
        /* ignore */
      }
    }
    origLog(name, payload);
  };
  process.env.BRIGHTLINE_DIAG_VERBOSE = "1";
  try {
    runQcV2Pipeline([stmt], {
      unifiedReferences: [{ id: 1, title: "Term sheet", url: null, sourceType: "uploaded" }],
      uploadedLen: 1,
      assignCredibilityTier: () => "LOW",
      uploadedDocs,
    });
  } finally {
    console.log = origLog;
    process.env.BRIGHTLINE_DIAG_VERBOSE = prevVerbose;
  }
  const pol = policyLines.find((p) => p.claimId === "a649n_ph_pol");
  assert.ok(pol, "A6.49n-C: policy diag");
  assert.ok(pol.placeholderBindingsCount >= 1, "A6.49n-C: placeholder count");
  assert.equal(pol.directSupportingBindingsCount, 0);
  assert.equal(pol.quantityMismatchInferenceSkipped, false);
}

/** A6.49k-D: related + no structured mismatch (no inference cues in uploaded docs) — suppression still clears. */
function runA649k_relatedNoStructuredMismatchSuppressed() {
  const claimText = "Shopify raised $5 million in its Series A funding round.";
  const stmt = {
    text: claimText,
    assessment: {
      canonicalClaims: [
        {
          id: "a649k_d",
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
            excerpt: "Shopify Series A financing was discussed in the board materials.",
            matchType: "phrase",
          },
        ],
      },
    },
  };
  const uploadedDocs = [{ id: 1, title: "Board deck", text: "Shopify Series A financing was discussed in the board materials." }];
  runQcV2Pipeline([stmt], {
    unifiedReferences: [{ id: 1, title: "Board deck", url: null, sourceType: "uploaded" }],
    uploadedLen: 1,
    assignCredibilityTier: () => "LOW",
    uploadedDocs,
  });
  const auth = stmt.meta.qcEvidenceAuthorities?.[0];
  assert.ok(auth, "A6.49k-D: authority");
  assert.equal(auth.displayVerdict, "not_supported", "A6.49k-D: not_supported");
  assert.equal(auth.hasUsableExcerpt, false, "A6.49k-D: no usable excerpt");
  assert.ok(!auth.displaySourceItems?.length, "A6.49k-D: no display rows");
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
  runN_a649i_highRefIdUploadedMetadata();
  runO_a649i_webRefAuthoritative();
  runP_a649i_heuristicFallback();
  runQ_a649j_numericMismatchFixture();
  runQ_a649j_cleanFullNoNumericMismatchBranch();
  runQ_a649j_nonQuantityMismatchGateFail();
  runA649k_nonDirectBindingPartialSupport();
  runA649k_directBindingSkipsMismatchInference();
  runA649k_noBindingsUnchanged();
  runA649k_relatedNoStructuredMismatchSuppressed();
  runA649m_shopifyParaphraseRef4Canonical();
  runA649m_exactDirectPredicates();
  runA649m_placeholderNotDirect();
  runA649m_looseBindingIgnoredForDirectCount();
  runA649n_paraphraseNoStructuredMismatchSuppressed();
  runA649n_overlapPrecedenceExactWithMetadata();
  runA649n_placeholderBindingPolicyCounts();
  console.log("a6-49d: all regression runs passed");
}

main();
