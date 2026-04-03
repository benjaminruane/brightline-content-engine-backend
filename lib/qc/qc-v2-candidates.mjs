// lib/qc/qc-v2-candidates.mjs
// A7.13: QC V2 evidence candidate selection and evaluation (extracted — logic unchanged).

import { corePropositionConfirmed } from "./evidence-relationship.mjs";
import { countDirectSupportingBindings } from "./binding-directness.mjs";
import {
  detectClaimType,
  extractA650jContentWords,
  findA650jContentWordsInExcerpt,
  highValueWordsMissingFromExcerpt,
  findBestPassageForClaim,
  findContentWordMatchBoundsInExcerpt,
  extractConfirmingSentence,
  extractHighValueContentWords,
} from "./qc-v2-excerpt.mjs";

/**
 * A6.50j: Qualitative claim types eligible for keyword-presence confirmation.
 * other_fact is included because detectClaimType uses it for thesis-style claims not matching narrower patterns.
 */
export const A6_50J_KEYWORD_CLAIM_TYPES = new Set([
  "investment_thesis",
  "growth_strategy",
  "business_description",
  "descriptive_fact",
  "other_qualitative",
  "other_fact",
]);

/** Credibility: rejected for confirmation (cannot produce conflict). */
const REJECTED_CREDIBILITY = new Set(["LOW", "WIKIPEDIA", "AGGREGATOR", "CONTENT_FARM", "ANONYMOUS", "AI_GENERATED"]);
export function pickCorpusHitForCitation(citationRefId, hits) {
  const rid = String(citationRefId);
  if (!Array.isArray(hits) || hits.length === 0) return { hit: null, matchedKey: null };
  const poolA = hits.filter((h) => h?.refId != null && String(h.refId) === rid);
  const pool = poolA.length > 0
    ? poolA
    : hits.filter((h) => h?.docId != null && String(h.docId) === rid);
  const matchedKey = poolA.length > 0 ? "refId" : pool.length > 0 ? "docId" : null;
  if (!pool.length) return { hit: null, matchedKey: null };
  let best = pool[0];
  let bestPos = hits.indexOf(best);
  const rank = (h) => (h.matchType === "number" ? 1 : 0);
  for (let i = 1; i < pool.length; i++) {
    const cur = pool[i];
    const curPos = hits.indexOf(cur);
    if (rank(cur) > rank(best) || (rank(cur) === rank(best) && curPos < bestPos)) {
      best = cur;
      bestPos = curPos;
    }
  }
  return { hit: best, matchedKey };
}
function classifyRefUploadedVsWeb(ref, refId, uploadedLen) {
  const st = ref?.sourceType != null ? String(ref.sourceType).trim().toLowerCase() : "";
  const ty = ref?.type != null ? String(ref.type).trim().toLowerCase() : "";
  if (st === "uploaded" || ty === "uploaded") {
    return { isWeb: false, routingBasis: "authoritative_source_type", authoritativeRead: st || ty || "uploaded" };
  }
  if (ty === "web" || st === "web_search" || st === "web") {
    return { isWeb: true, routingBasis: "authoritative_source_type", authoritativeRead: st || ty || "web" };
  }
  const heuristicWeb = (Number(refId) || 0) > uploadedLen;
  return {
    isWeb: heuristicWeb,
    routingBasis: "heuristic_fallback",
    authoritativeRead: null,
  };
}
export function getCandidatesForClaim(statement, claim, refsById, uploadedLen, assignCredibilityTier, hitAssocLog = null, uploadedDocs = null, claimType = null) {
  const diagVerbose = typeof process !== "undefined" && process.env?.BRIGHTLINE_DIAG_VERBOSE === "1";
  const logAssoc = (payload) => {
    if (!diagVerbose || !hitAssocLog?.log) return;
    hitAssocLog.log("QC_V2_UPLOADED_HIT_ASSOCIATION", JSON.stringify(payload));
  };
  const logRoute = (payload) => {
    if (!diagVerbose || !hitAssocLog?.log) return;
    hitAssocLog.log("QC_V2_REF_SOURCE_ROUTING", JSON.stringify(payload));
  };
  const sentenceSpan = (typeof statement?.text === "string" ? statement.text : "").trim();
  const claimText =
    claim?.displayText != null && String(claim.displayText).trim()
      ? String(claim.displayText).trim()
      : sentenceSpan;
  const claimCites = Array.isArray(claim?.citations) ? claim.citations : [];
  const corpusResult = statement.meta?._evidenceBundleCorpusResult ?? null;
  const hits = (corpusResult?.found && Array.isArray(corpusResult.hits)) ? corpusResult.hits : [];
  const bindings = Array.isArray(statement.evidenceBundle?.supportBindings) ? statement.evidenceBundle.supportBindings : [];
  const bindingByRefId = new Map();
  bindings.forEach((b) => { if (b?.refId != null) bindingByRefId.set(String(b.refId), b); });
  const candidates = [];
  for (const cid of claimCites) {
    const refId = cid != null ? String(cid) : null;
    if (!refId || !refsById.has(refId)) continue;
    const ref = refsById.get(refId);
    const { isWeb, routingBasis, authoritativeRead } = classifyRefUploadedVsWeb(ref, refId, uploadedLen);
    logRoute({
      claimId: hitAssocLog?.claimId ?? null,
      refId,
      authoritativeSourceType: ref?.sourceType ?? ref?.type ?? null,
      routingDecision: isWeb ? "web" : "uploaded",
      routingBasis,
      uploadedLen,
      authoritativeRead: authoritativeRead ?? undefined,
    });
    let excerpt = "";
    if (isWeb) {
      excerpt = (ref?.snippet && String(ref.snippet).trim()) ? String(ref.snippet).trim() : (ref?.title && String(ref.title).trim()) ? String(ref.title).trim() : "";
      if (!excerpt) continue;
      const tier = ref?.credibilityTier ?? (assignCredibilityTier ? assignCredibilityTier(ref?.url ?? "") : "LOW");
        candidates.push({
          refId,
          rawTitle: ref?.title ?? "Web source",
          displayTitle: ref?.title ?? "Web source",
          sourceOrigin: "web",
          excerptText: excerpt,
          credibilityTier: tier,
          url: ref?.url ?? null,
          excerptOptimised: false,
        });
    } else {
      const { hit: pickedHit, matchedKey: corpusPickKey } = pickCorpusHitForCitation(refId, hits);
      let hit = pickedHit?.excerpt && String(pickedHit.excerpt).trim() ? pickedHit : null;
      let hitCorpusKey = hit ? corpusPickKey : null;
      const binding = bindingByRefId.get(refId);
      let excerptSource = null;
      if (hit) {
        excerpt = String(hit.excerpt).trim();
        excerptSource = "hit";
      } else if (binding?.excerpt && String(binding.excerpt).trim() && binding.excerpt !== "(excerpt not captured)") {
        excerpt = String(binding.excerpt).trim();
        excerptSource = "binding";
      }
      if (!excerpt && ref?.title) {
        excerpt = (ref.title || "").slice(0, 300);
        excerptSource = "title_fallback";
      }
      if (excerpt) {
        /** A6.57: True when A6.53 / A6.55b / A6.56 replaced the uploaded excerpt (verbatim display on client). */
        let excerptOptimised = false;
        /** A6.53: Weak corpus/binding excerpt → search full uploaded doc for a better 300-char passage. */
        if (
          !isWeb
          && claimType !== "numeric_finance"
          && (excerptSource === "hit" || excerptSource === "binding")
        ) {
          const contentWords = extractA650jContentWords(claimText);
          const wordsInExcerpt = findA650jContentWordsInExcerpt(contentWords, excerpt);
          const oldWordCount = wordsInExcerpt.length;
          if (oldWordCount < 2 || highValueWordsMissingFromExcerpt(claimText, excerpt).length > 0) {
            const docFullText = getUploadedDocFullTextForRef(uploadedDocs, refId);
            const bestStart = findBestPassageForClaim(claimText, claimType, docFullText);
            if (bestStart != null) {
              const newExcerpt = docFullText.slice(bestStart, bestStart + 400).trim();
              if (newExcerpt) {
                const newWords = findA650jContentWordsInExcerpt(contentWords, newExcerpt);
                excerpt = newExcerpt;
                excerptOptimised = true;
                console.log(
                  `[A6.53] excerpt replaced: refId=${refId} oldWords=${oldWordCount} newWords=${newWords.length} excerptMethod=forward claimPreview=${(claimText || "").slice(0, 50)}`,
                );
              }
            }
          }
        }
        /** A6.55b: Trim excerpt to claim content-word span (after A6.53). */
        const ct655b = claimType != null ? claimType : detectClaimType(claimText, () => {});
        if (!isWeb && ct655b !== "numeric_finance") {
          const bounds = findContentWordMatchBoundsInExcerpt(claimText, excerpt);
          if (bounds) {
            const rawMin = Math.min(...bounds.starts);
            const rawMax = Math.max(...bounds.ends);
            const spanStart = Math.max(0, rawMin - 30);
            const spanEnd = Math.min(excerpt.length, rawMax + 200);
            const trimmed655b = excerpt.slice(spanStart, spanEnd).trim();
            if (trimmed655b.length >= 60) {
              excerpt = trimmed655b;
              excerptOptimised = true;
              const wordsList = bounds.wordsFound.join(",");
              console.log(
                `[A6.55b] content-word span: refId=${refId} wordsFound=${wordsList} spanStart=${spanStart} spanEnd=${spanEnd} claimPreview=${(claimText || "").slice(0, 50)}`,
              );
            }
          }
        }
        /** A6.56: Second full-doc passage if high-value words still missing after A6.53 / A6.55b. */
        if (
          !isWeb
          && claimType !== "numeric_finance"
          && (excerptSource === "hit" || excerptSource === "binding")
        ) {
          const missingBefore = highValueWordsMissingFromExcerpt(claimText, excerpt);
          if (missingBefore.length > 0) {
            const docFullText56 = getUploadedDocFullTextForRef(uploadedDocs, refId);
            const bestStart56 = findBestPassageForClaim(claimText, claimType, docFullText56);
            if (bestStart56 != null) {
              const newExcerpt56 = docFullText56.slice(bestStart56, bestStart56 + 400).trim();
              if (newExcerpt56) {
                const hvWords = extractHighValueContentWords(claimText);
                const oldHvCount = findA650jContentWordsInExcerpt(hvWords, excerpt).length;
                const newHvCount = findA650jContentWordsInExcerpt(hvWords, newExcerpt56).length;
                if (newHvCount > oldHvCount) {
                  const recoveredWords = findA650jContentWordsInExcerpt(missingBefore, newExcerpt56);
                  excerpt = newExcerpt56;
                  excerptOptimised = true;
                  console.log(
                    `[A6.56] high-value word recovery: refId=${refId} missingBefore=${missingBefore.join(",")} recoveredWords=${recoveredWords.join(",")} excerptMethod=forward claimPreview=${(claimText || "").slice(0, 50)}`,
                  );
                }
              }
            }
          }
        }
        /** A6.59: Final sentence-focused extraction after A6.53/55b/56 optimization steps. */
        if (!isWeb && claimType !== "numeric_finance" && excerptOptimised === true) {
          const confirmingSentence = extractConfirmingSentence(excerpt, claimText);
          if (confirmingSentence && confirmingSentence.length >= 40) {
            excerpt = confirmingSentence;
            console.log(
              `[A6.59] confirming sentence extracted: sentence=${confirmingSentence.slice(0, 80)} claimPreview=${(claimText || "").slice(0, 50)}`,
            );
          }
        }
        /** A6.49g: upstream numeric truth from corpus/binding — not the V2 component matcher. */
        const BINDING_MATCH_SUPPORTS_NUMERIC = new Set([
          "exact", "rounded_equivalent", "unit_equivalent", "partial_support", "paraphrase",
        ]);
        let upstreamNumericEvidence = false;
        let upstreamNumericEvidenceSource = null;
        if (excerptSource === "hit" && hit?.matchType === "number") {
          upstreamNumericEvidence = true;
          upstreamNumericEvidenceSource = "corpus_hit_number";
        } else if (excerptSource === "binding" && binding) {
          const mt = String(binding.matchType || "none").toLowerCase();
          if (binding.reasonCode === "numeric_tuple" || BINDING_MATCH_SUPPORTS_NUMERIC.has(mt)) {
            upstreamNumericEvidence = true;
            upstreamNumericEvidenceSource = binding.reasonCode === "numeric_tuple"
              ? "binding_numeric_tuple"
              : `binding_match_${mt}`;
          }
        }
        const matchedHitKeyType =
          excerptSource === "hit"
            ? (hitCorpusKey ?? "none")
            : excerptSource === "binding"
              ? "binding"
              : excerptSource === "title_fallback"
                ? "title_fallback"
                : "none";
        logAssoc({
          claimId: hitAssocLog?.claimId ?? null,
          citationRefId: refId,
          matchedHitKeyType,
          hitDocId: hit?.docId ?? pickedHit?.docId ?? null,
          hitRefId: hit?.refId ?? pickedHit?.refId ?? null,
          excerptSource,
          upstreamNumericEvidence,
          upstreamNumericEvidenceSource,
        });
        candidates.push({
          refId,
          rawTitle: ref?.title ?? "Untitled source",
          displayTitle: ref?.title ?? "Untitled source",
          sourceOrigin: "uploaded",
          excerptText: excerpt,
          credibilityTier: "HIGH",
          url: ref?.url ?? null,
          upstreamNumericEvidence,
          upstreamNumericEvidenceSource,
          excerptOptimised,
        });
      }
    }
  }
  return candidates;
}
function getUploadedDocFullTextForRef(uploadedDocs, refId) {
  if (!Array.isArray(uploadedDocs) || uploadedDocs.length === 0) return "";
  const rid = String(refId);
  const doc = uploadedDocs.find((d) => d && String(d.id) === rid);
  return doc && typeof doc.text === "string" ? doc.text : "";
}
function evaluateCandidate(claimText, claimType, components, candidate, assignCredibilityTier, claimId = null) {
  const excerpt = (candidate?.excerptText || "").trim();
  if (!excerpt || excerpt === "(excerpt not captured)") {
    return { confirmedComponents: [], missingComponents: [], conflictingComponents: [], classification: "none" };
  }
  const tier = candidate.credibilityTier ?? assignCredibilityTier?.(candidate?.url ?? "") ?? "LOW";
  const rejected = REJECTED_CREDIBILITY.has(String(tier).toUpperCase());
  const { corePropositionConfirmed: coreOk, missingModifierComponents } = corePropositionConfirmed(claimText, excerpt, { claimType, claimId });
  const confirmedComponents = [];
  const missingComponents = [...(missingModifierComponents || [])];
  const conflictingComponents = [];
  if (components.entity && excerpt.toLowerCase().includes((components.entity || "").toLowerCase())) confirmedComponents.push("entity");
  if (coreOk) {
    confirmedComponents.push("relation");
    if (missingModifierComponents && missingModifierComponents.length > 0) {
      if (missingModifierComponents.includes("target")) missingComponents.push("target_market");
      if (missingModifierComponents.includes("degree_qualifier")) missingComponents.push("projection_or_expectation");
    }
  }
  if (claimType === "numeric_finance" && components.amount) {
    if (excerpt.includes(components.amount) || excerpt.replace(/,/g, "").includes((components.amount || "").replace(/,/g, ""))) {
      confirmedComponents.push("amount");
    } else {
      const amountMatches = [...excerpt.matchAll(/\$[\d,.]+\s*(?:million|billion|mm|m|bn|b|k|thousand)?/gi)];
      const claimAmountNormalized = normalizeAmount(components.amount);
      let formatEquivalentHandled = false;
      const hasDollarFigure = amountMatches.length > 0;
      for (const match of amountMatches) {
        const excerptAmount = match[0];
        const excerptAmountNormalized = normalizeAmount(excerptAmount);
        if (claimAmountNormalized == null || excerptAmountNormalized == null) continue;
        const tolerance = Math.max(Math.abs(claimAmountNormalized) * 0.01, 1e-9);
        if (Math.abs(claimAmountNormalized - excerptAmountNormalized) <= tolerance) {
          formatEquivalentHandled = true;
          const claimFamily = claimTypeToRoleFamily(claimType);
          const excerptFamily = excerptAmountRoleFamily(excerpt, excerptAmount);
          const roleCompatible = claimFamily === excerptFamily || claimFamily === "UNKNOWN" || excerptFamily === "UNKNOWN";
          const result = roleCompatible ? "confirmed" : "conflict";
          console.log(`[A6.50g] amount match: claimType=${claimType} claimAmount=${components.amount} excerptAmount=${excerptAmount} claimFamily=${claimFamily} excerptFamily=${excerptFamily} result=${result}`);
          if (roleCompatible) confirmedComponents.push("amount");
          else conflictingComponents.push("amount");
          break;
        }
      }
      if (!formatEquivalentHandled && hasDollarFigure) {
        conflictingComponents.push("amount");
      }
    }
  }
  if (components.location && !excerpt.toLowerCase().includes((components.location || "").toLowerCase())) {
    if (/founded|based\s+in|headquartered/.test(claimText.toLowerCase())) missingComponents.push("location");
  }
  let classification = "none";
  if (conflictingComponents.length > 0 && !rejected) classification = "conflict";
  else if (confirmedComponents.includes("entity") && coreOk && missingComponents.length === 0) classification = "full";
  else if (confirmedComponents.includes("entity") && coreOk && missingComponents.length > 0) classification = "partial";
  else if (confirmedComponents.length > 0) classification = "related";

  // A6.50j: Relaxed keyword-presence confirmation (qualitative claim types only; never numeric_finance).
  const ctNorm = String(claimType || "").trim().toLowerCase();
  if (
    ctNorm !== "numeric_finance"
    && A6_50J_KEYWORD_CLAIM_TYPES.has(ctNorm)
    && !rejected
    && (classification === "related" || classification === "none")
  ) {
    const contentWords = extractA650jContentWords(claimText);
    const wordsInExcerpt = findA650jContentWordsInExcerpt(contentWords, excerpt);
    const n = wordsInExcerpt.length;
    let keywordResult = "none";
    if (n >= 3) {
      if (!confirmedComponents.includes("relation")) confirmedComponents.push("relation");
      if (!confirmedComponents.includes("keyword_presence")) confirmedComponents.push("keyword_presence");
      classification = "partial";
      keywordResult = "partial";
    } else if (n === 2) {
      keywordResult = "related";
    }
    const wordsStr = wordsInExcerpt.join(",");
    console.log(`[A6.50j] keyword presence confirmation: claimType=${claimType} wordsFound=${n} words=${wordsStr} result=${keywordResult}`);
  }

  return { confirmedComponents, missingComponents, conflictingComponents, classification, rejected };
}

function normalizeAmount(str) {
  if (typeof str !== "string") return null;
  const raw = str.trim().toLowerCase();
  if (!raw) return null;
  const cleaned = raw.replace(/\$/g, "").replace(/,/g, "").trim();
  const m = cleaned.match(/^(\d+(?:\.\d+)?)\s*(million|billion|thousand|mm|bn|m|b|k)?$/i);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = (m[2] || "").toLowerCase();
  const multiplier =
    suffix === "mm" || suffix === "m" || suffix === "million" ? 1e6 :
    suffix === "bn" || suffix === "b" || suffix === "billion" ? 1e9 :
    suffix === "k" || suffix === "thousand" ? 1e3 :
    1;
  return base * multiplier;
}

/** A6.50g: Claim/canonical type to role family mapping. */
function claimTypeToRoleFamily(claimType) {
  const t = String(claimType || "").trim().toLowerCase();
  if (t === "investment_amount") return "INVESTMENT";
  if (t === "valuation_pre_money" || t === "valuation_post_money" || t === "valuation_enterprise_value" || t === "valuation_equity_value") return "VALUATION";
  if (t === "metric_amount") return "METRIC";
  return "UNKNOWN";
}

/** A6.50g: Determine local role family around a matched excerpt amount. */
function excerptAmountRoleFamily(excerpt, matchedAmountStr) {
  const text = typeof excerpt === "string" ? excerpt : "";
  const needle = typeof matchedAmountStr === "string" ? matchedAmountStr : "";
  if (!text || !needle) return "UNKNOWN";
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return "UNKNOWN";
  const center = idx + Math.floor(needle.length / 2);
  const start = Math.max(0, center - 75);
  const end = Math.min(text.length, center + 75);
  const window = text.slice(start, end).toLowerCase();
  const countMatches = (tokens) => tokens.reduce((n, token) => n + (window.includes(token) ? 1 : 0), 0);
  const investmentTokens = ["invest", "investing", "investment", "financing", "financing round", "series", "seed", "commit", "deploy", "participate", "check", "up to"];
  const valuationTokens = ["valuation", "valued", "pre-money", "post-money", "premoney", "postmoney", "enterprise value", "ev", "priced at", "cap table"];
  const metricTokens = ["revenue", "mrr", "arr", "gmv", "run rate", "annualized", "per month", "per year", "subscription", "fee", "pricing", "avg", "average", "arpu"];
  const scores = {
    INVESTMENT: countMatches(investmentTokens),
    VALUATION: countMatches(valuationTokens),
    METRIC: countMatches(metricTokens),
  };
  const ordered = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ordered.length || ordered[0][1] <= 0) return "UNKNOWN";
  if (ordered.length > 1 && ordered[0][1] === ordered[1][1]) return "UNKNOWN";
  return ordered[0][0];
}
function inferQuantityTypeMismatch(stmt, claimText, uploadedDocs, claim, directSupportingBindingsCount) {
  const fromMeta = stmt.meta?.supportMismatch;
  if (fromMeta?.kind != null && typeof fromMeta.explanation === "string" && fromMeta.explanation.trim()) {
    return fromMeta;
  }
  const bindings = Array.isArray(stmt.evidenceBundle?.supportBindings) ? stmt.evidenceBundle.supportBindings : [];
  const directCount =
    typeof directSupportingBindingsCount === "number"
      ? directSupportingBindingsCount
      : countDirectSupportingBindings(bindings, claim, claimText);
  if (directCount >= 1) return null;
  const canonicalClaimsArr = Array.isArray(stmt.assessment?.canonicalClaims) ? stmt.assessment.canonicalClaims : [];
  const moneyTypes = new Set(["investment_amount", "metric_amount", "valuation"]);
  const hasMoneyClaim = canonicalClaimsArr.some((cc) => {
    const t = (cc?.type && String(cc.type).trim().toLowerCase()) || "";
    return moneyTypes.has(t) || t.startsWith("valuation_");
  });
  const STATEMENT_CUES = ["raised", "financing round", "round", "series"];
  const stmtLower = (claimText || "").toLowerCase();
  const hasStatementCue = STATEMENT_CUES.some((cue) => stmtLower.includes(cue));
  const SOURCE_CUES = ["investing", "investment", "evaluating", "up to"];
  const docs = Array.isArray(uploadedDocs) ? uploadedDocs : [];
  const allSourceText = docs.map((d) => (d && typeof d.text === "string" ? d.text : "")).join(" ");
  const sourceLower = allSourceText.toLowerCase();
  const hasSourceCue = SOURCE_CUES.some((cue) => sourceLower.includes(cue));
  if (!hasMoneyClaim || !hasStatementCue || !hasSourceCue) return null;
  return {
    kind: "quantity_type_mismatch",
    quantityA: "round_size_raised",
    quantityB: "investor_investment_amount",
    /** Card/popup copy: buildQuantityMismatchEditorialText (A6.49l); field kept for schema compatibility. */
    explanation: "",
  };
}

export {
  classifyRefUploadedVsWeb,
  getUploadedDocFullTextForRef,
  evaluateCandidate,
  inferQuantityTypeMismatch,
};
