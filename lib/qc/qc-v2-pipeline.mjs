// lib/qc/qc-v2-pipeline.mjs
// A6.40: QC V2 — orchestration (runQcV2Pipeline). Extracted helpers: qc-v2-explanation.mjs, qc-v2-excerpt.mjs, qc-v2-candidates.mjs.

import {
  computeQuantityMismatchInferencePolicy,
  countBindingPolicyMetrics,
  isQuantityMismatchStructured,
} from "./binding-directness.mjs";
import { validateLLMVerifierOutput, verifyClaimWithLLM } from "./llm-claim-verifier.mjs";
import {
  detectClaimType,
  deriveComponents,
  mismatchPartialEvaluationsOk,
  passesExcerptQualityGate,
  scoreExcerpt,
} from "./qc-v2-excerpt.mjs";
import {
  evaluateCandidate,
  getCandidatesForClaim,
  inferQuantityTypeMismatch,
} from "./qc-v2-candidates.mjs";
import {
  buildConflictEvidence,
  buildExportedAuthority,
  buildHoverPayload,
  buildPopupSectionsForDisplayItem,
  buildQuantityMismatchEditorialText,
  buildQcExplanation,
  buildTypedExplanationFromSignals,
  buildWhyItMattersFromExplanation,
  claimLevelClassification,
  computeDisplayVerdictAndConcern,
  computeV2PopupOriginalSentenceDedup,
  extractValueSummaryFromExcerpt,
  getExplanationCode,
} from "./qc-v2-explanation.mjs";

export { CLAIM_TYPES, detectClaimType, deriveComponents } from "./qc-v2-excerpt.mjs";
export { getCandidatesForClaim, pickCorpusHitForCitation } from "./qc-v2-candidates.mjs";
export { computeV2PopupOriginalSentenceDedup } from "./qc-v2-explanation.mjs";

/**
 * A6.40: Run QC V2 pipeline. Input: statements with assessment.canonicalClaims. Output: statements with meta.qcEvidenceAuthorities.
 * Legacy evidenceBundle is used only as candidate source; classification is V2-only.
 */
export async function runQcV2Pipeline(statements, context) {
  const {
    unifiedReferences = [],
    uploadedLen = 0,
    assignCredibilityTier = () => "LOW",
    runId = null,
    reqSig = null,
    uploadedDocs: contextUploadedDocs = [],
  } = context || {};
  const refsById = new Map();
  (unifiedReferences || []).forEach((r) => { if (r?.id != null) refsById.set(String(r.id), r); });
  const log = (name, payload) => {
    if (typeof payload === "string") console.log(name, payload);
    else console.log(name, JSON.stringify(payload));
  };
  for (let idx = 0; idx < (statements || []).length; idx++) {
    const stmt = statements[idx];
    if (!stmt || typeof stmt !== "object") continue;
    if (stmt.__dealTermsCanonical === true) {
      const preview = (typeof stmt.text === "string" ? stmt.text : "").slice(0, 60);
      console.log(`[A6.50h] skipping QC authority emission for dealTermsCanonical statement: ${preview}`);
      stmt.meta = { ...(stmt.meta || {}), qcEvidenceAuthorities: [] };
      continue;
    }
    const canonicalClaims = Array.isArray(stmt?.assessment?.canonicalClaims) ? stmt.assessment.canonicalClaims : [];
    const sentenceSpan = (typeof stmt.text === "string" ? stmt.text : "").trim();
    const originalSentenceText = sentenceSpan;
    if (canonicalClaims.length === 0) {
      log("QC_V2_ZERO_CLAIM_SENTENCE", { statementIndex: idx, statementPreview: sentenceSpan.substring(0, 80) });
      stmt.meta = { ...(stmt.meta || {}), qcEvidenceAuthorities: [] };
      continue;
    }
    const authorities = [];
    for (let cIdx = 0; cIdx < canonicalClaims.length; cIdx++) {
      const claim = canonicalClaims[cIdx];
      if (!claim || typeof claim !== "object") continue;
      const claimId = claim.id ?? `claim_${idx}_${cIdx}`;
      const claimText = claim.displayText || sentenceSpan;
      const claimType = detectClaimType(claimText, (name, payload) => log(name, payload));
      const components = deriveComponents(claimText);
      const candidates = getCandidatesForClaim(
        stmt,
        claim,
        refsById,
        uploadedLen,
        assignCredibilityTier,
        { log, claimId },
        contextUploadedDocs,
        claimType,
      );
      const webCandCount = candidates.filter((c) => c.sourceOrigin === "web").length;
      if (webCandCount > 0) log("QC_V2_WEB_FILTER", { claimId, webCandidatesIncluded: webCandCount });
      const evaluations = candidates.map((c) => {
        const ev = evaluateCandidate(claimText, claimType, components, c, assignCredibilityTier, claimId);
        const score = scoreExcerpt(components, c?.excerptText, ev, claimType);
        log("QC_V2_EXCERPT_SCORE", { claimId, refId: c?.refId ?? null, excerptScore: score, selected: false });
        return { candidate: c, ...ev, excerptScore: score };
      });
      log("QC_V2_CANDIDATE_EVALUATION", { claimId, claimPreview: claimText.substring(0, 60), candidateCount: candidates.length, evaluations: evaluations.map((e) => ({ refId: e.candidate?.refId, classification: e.classification })) });
      const classification = claimLevelClassification(evaluations);
      const uploadedDocsForMismatch = Array.isArray(contextUploadedDocs) ? contextUploadedDocs : [];
      const supportBindingsArr = Array.isArray(stmt.evidenceBundle?.supportBindings) ? stmt.evidenceBundle.supportBindings : [];
      const {
        supportBindingsLength,
        directSupportingBindingsCount,
        mismatchCompatibleBindingsCount,
        placeholderBindingsCount,
      } = countBindingPolicyMetrics(supportBindingsArr, claim, claimText);
      const supportMismatchEffective = inferQuantityTypeMismatch(
        stmt,
        claimText,
        uploadedDocsForMismatch,
        claim,
        directSupportingBindingsCount,
      );
      const { quantityMismatchInferenceSkipped, skipReason } = computeQuantityMismatchInferencePolicy({
        directSupportingBindingsCount,
        metaSupportMismatch: stmt.meta?.supportMismatch,
        supportMismatchEffective,
      });
      /** A6.49n: mismatch-compatible alone is insufficient — requires structured quantity mismatch + excerpt-backed partial path. */
      const mismatchPartialEligible =
        classification !== "conflict"
        && isQuantityMismatchStructured(supportMismatchEffective)
        && mismatchPartialEvaluationsOk(evaluations, refsById, components, claimType, { log, claimId }, supportMismatchEffective);
      const diagVerbosePolicy = typeof process !== "undefined" && process.env?.BRIGHTLINE_DIAG_VERBOSE === "1";
      if (diagVerbosePolicy) {
        log("QC_V2_MISMATCH_BINDING_POLICY", JSON.stringify({
          claimId,
          supportBindings: supportBindingsArr.length,
          supportBindingsLength,
          directSupportingBindingsCount,
          mismatchCompatibleBindingsCount,
          placeholderBindingsCount,
          quantityMismatchInferenceSkipped,
          skipReason,
          mismatchPartialEligible,
        }));
      }
      const verdictBasisClassification =
        classification === "conflict"
          ? "conflict"
          : mismatchPartialEligible && (classification === "related" || classification === "none")
            ? "partial"
            : classification;
      if (mismatchPartialEligible) {
        log("QC_V2_MISMATCH_PARTIAL", { claimId, fromClassification: classification, verdictBasisClassification });
      }

      /** A7.3: LLM verifier for excerpt-only interpretation (commentary + popover). */
      let a71Applied = null;

      const originalClassification = classification;
      const sameClass = evaluations.filter((e) => e.classification === classification);
      const best = sameClass.length > 0
        ? sameClass.reduce((a, b) => {
            if ((b.excerptScore ?? -99) > (a.excerptScore ?? -99)) return b;
            if ((b.excerptScore ?? -99) < (a.excerptScore ?? -99)) return a;
            const lenA = (a.candidate?.excerptText || "").length;
            const lenB = (b.candidate?.excerptText || "").length;
            return lenB < lenA ? b : a;
          })
        : evaluations.find((e) => e.classification === "related") || evaluations[0];
      if (best) log("QC_V2_EXCERPT_SCORE", { claimId, refId: best.candidate?.refId ?? null, excerptScore: best.excerptScore ?? null, selected: true });
      const selectedCandidate = best?.candidate ?? null;
      const selectedExcerptText = selectedCandidate?.excerptText ?? null;
      if (
        (verdictBasisClassification === "full"
          || verdictBasisClassification === "partial"
          || verdictBasisClassification === "conflict")
        && typeof process !== "undefined"
        && typeof process.env?.OPENAI_API_KEY === "string"
        && String(process.env.OPENAI_API_KEY).trim()
      ) {
        const excerptForLLM = typeof selectedExcerptText === "string" ? selectedExcerptText : "";
        if (excerptForLLM.trim()) {
          const verdictHintMap = {
            full: "confirmed",
            partial: "partially_confirmed",
            conflict: "conflict",
          };
          const verdictHint = verdictHintMap[verdictBasisClassification];
          let resultA71 = null;
          try {
            resultA71 = await Promise.race([
              verifyClaimWithLLM(claimText, excerptForLLM, verdictHint, { claimId: String(claimId) }),
              new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
            ]);
          } catch {
            resultA71 = null;
          }
          const validatedA71 = validateLLMVerifierOutput(resultA71);
          if (validatedA71.valid) {
            console.log("[A7.3] verifier used", { claimId });
            a71Applied = { explanation: validatedA71.explanation };
          } else {
            console.log("[A7.3] verifier fallback", { claimId, failReason: validatedA71.failReason });
          }
        }
      }
      const selectedExcerptReason = selectedCandidate ? "proposition_match" : "no_direct_excerpt";
      const confirmedComponents = best?.confirmedComponents ?? [];
      const missingComponents = best?.missingComponents ?? [];
      const conflictingComponents = best?.conflictingComponents ?? [];
      const conflictEvidence = classification === "conflict" ? buildConflictEvidence(evaluations, components, claimType, log, claimId) : null;
      const conflictOpts = conflictEvidence && conflictEvidence.sideA?.length && conflictEvidence.sideB?.length
        ? { component: conflictEvidence.conflictingComponent ?? "amount", valueA: conflictEvidence.sideA[0]?.valueSummary ?? "one value", valueB: conflictEvidence.sideB[0]?.valueSummary ?? "another value" }
        : {};
      const evidenceOrigin = !selectedCandidate ? "none" : (selectedCandidate.sourceOrigin === "web" ? "web" : "uploaded");
      let verdictPayload =
        verdictBasisClassification === "conflict"
          ? "conflicting_sources"
          : verdictBasisClassification === "full"
            ? "confirmed"
            : verdictBasisClassification === "partial"
              ? "partially_confirmed"
              : "no_clear_support";
      const qcExplanation = buildQcExplanation(components, confirmedComponents, missingComponents, conflictingComponents, verdictBasisClassification);
      log("QC_V2_EXPLANATION_BUILD", { claimId, entityStatus: qcExplanation.entityStatus, relationStatus: qcExplanation.relationStatus, modifierStatus: qcExplanation.modifierStatus, contradictionStatus: qcExplanation.contradictionStatus });
      const displaySourceItems = [];
      evaluations.forEach((ev) => {
        const c = ev.candidate;
        const excerptText = (c?.excerptText && String(c.excerptText).trim()) ? String(c.excerptText).trim() : "";
        log("QC_V2_CITATION_EXCERPT", { claimId, refId: c?.refId ?? null, hasExcerpt: !!excerptText });
        if (!excerptText) return;
        if (!passesExcerptQualityGate(ev, components, claimType, refsById, { log, claimId }, supportMismatchEffective)) {
          log("QC_V2_CITATION_FILTER", { claimId, refId: c?.refId ?? null, filteredReason: "excerpt_quality_gate" });
          return;
        }
        const itemCode = getExplanationCode(ev.classification, ev.confirmedComponents, ev.missingComponents, ev.conflictingComponents);
        const itemValueSummary = ev.classification === "conflict" ? extractValueSummaryFromExcerpt(excerptText, ev.conflictingComponents?.[0], components) : null;
        const itemWhyItMatters = buildWhyItMattersFromExplanation(itemCode, itemValueSummary);
        displaySourceItems.push({
          refId: c.refId,
          sourceOrigin: c.sourceOrigin,
          displaySourceName: c.displayTitle ?? `Source [${displaySourceItems.length + 1}]`,
          displayTitle: c.displayTitle ?? `Source [${displaySourceItems.length + 1}]`,
          rawTitle: c.rawTitle ?? null,
          citationIndex: displaySourceItems.length,
          excerptText,
          classification: ev.classification,
          confirmedComponents: ev.confirmedComponents ?? [],
          missingComponents: ev.missingComponents ?? [],
          conflictingComponents: ev.conflictingComponents ?? [],
          whyItMattersText: itemWhyItMatters,
          explanationCode: itemCode,
          valueSummary: itemValueSummary ?? undefined,
          excerptOptimised: c.excerptOptimised === true,
        });
      });
      if (classification === "conflict" && conflictEvidence && displaySourceItems.length > 0) {
        const refIdsIn = new Set(displaySourceItems.map((i) => String(i?.refId ?? "")));
        for (const side of [conflictEvidence.sideA, conflictEvidence.sideB]) {
          for (const entry of side || []) {
            if (!entry?.refId || refIdsIn.has(String(entry.refId))) continue;
            const cand = evaluations.find((e) => String(e.candidate?.refId) === String(entry.refId))?.candidate;
            const displayName = cand?.displayTitle ?? `Source [${displaySourceItems.length + 1}]`;
            const whyItMatters = buildWhyItMattersFromExplanation("CONFLICT_VALUE", entry.valueSummary || null);
            displaySourceItems.push({
              refId: entry.refId,
              sourceOrigin: cand?.sourceOrigin ?? "uploaded",
              displaySourceName: displayName,
              displayTitle: displayName,
              rawTitle: cand?.rawTitle ?? null,
              citationIndex: displaySourceItems.length,
              excerptText: entry.excerptText || "",
              classification: "conflict",
              confirmedComponents: [],
              missingComponents: [],
              conflictingComponents: conflictEvidence.conflictingComponent ? [conflictEvidence.conflictingComponent] : [],
              whyItMattersText: whyItMatters,
              explanationCode: "CONFLICT_VALUE",
              valueSummary: entry.valueSummary ?? undefined,
              excerptOptimised: cand?.excerptOptimised === true,
            });
            refIdsIn.add(String(entry.refId));
          }
        }
      }
      // A6.46 / A6.49e: Suppress related/none display rows unless quantity mismatch + excerpt-backed partial path applies.
      if ((classification === "related" || classification === "none") && !mismatchPartialEligible) {
        displaySourceItems.length = 0;
      }
      // A6.46: Conflict cards — only sources that sit on a disagreement side with a usable excerpt.
      if (classification === "conflict" && conflictEvidence) {
        const conflictRefSet = new Set();
        for (const side of [conflictEvidence.sideA, conflictEvidence.sideB]) {
          for (const e of side || []) {
            if (e?.refId != null && e.excerptText && String(e.excerptText).trim()) {
              conflictRefSet.add(String(e.refId));
            }
          }
        }
        if (conflictRefSet.size > 0) {
          const onlyConflictSides = displaySourceItems.filter((i) => conflictRefSet.has(String(i.refId)));
          displaySourceItems.length = 0;
          displaySourceItems.push(...onlyConflictSides);
        }
      }
      if (displaySourceItems.length > 5) displaySourceItems.length = 5;
      const enrichedItems = [];
      for (const raw of displaySourceItems) {
        const popup = buildPopupSectionsForDisplayItem(
          raw,
          claimText,
          verdictBasisClassification,
          mismatchPartialEligible ? supportMismatchEffective : null,
          components,
          { log, claimId },
          a71Applied?.explanation ?? null,
        );
        if (!popup.whatThisShows) continue;
        enrichedItems.push({
          ...raw,
          originalClaimText: popup.originalClaimText,
          whatThisShows: popup.whatThisShows,
          whatIsNotShown: popup.whatIsNotShown,
        });
      }
      displaySourceItems.length = 0;
      displaySourceItems.push(...enrichedItems);
      // A6.47: Citation integrity — drop rows missing excerpt or whatThisShows (non-downgraded path only).
      const integrityFiltered = displaySourceItems.filter((i) =>
        i.excerptText && String(i.excerptText).trim()
        && i.whatThisShows && String(i.whatThisShows).trim(),
      );
      displaySourceItems.length = 0;
      displaySourceItems.push(...integrityFiltered);

      // A6.47: hasUsableExcerpt AFTER popup enrichment, BEFORE verdict eligibility
      let hasUsableExcerpt = displaySourceItems.length > 0;
      const downgradeIfNoExcerpt = new Set(["full", "partial", "conflict", "related"]);
      let effectiveClassification = verdictBasisClassification;
      let conflictEvidenceOut = conflictEvidence;
      let downgradedForNoExcerpt = false;
      if (!hasUsableExcerpt && downgradeIfNoExcerpt.has(originalClassification)) {
        downgradedForNoExcerpt = true;
        effectiveClassification = "none";
        verdictPayload = "no_clear_support";
        conflictEvidenceOut = null;
        displaySourceItems.length = 0;
        hasUsableExcerpt = false;
        log("QC_V2_DOWNGRADE_APPLIED", JSON.stringify({
          claimId,
          originalClassification,
          downgradedTo: "not_supported",
          clearedEvidence: true,
        }));
      }
      const typedExplanation = buildTypedExplanationFromSignals({
        qcExplanation,
        confirmedComponents,
        missingComponents,
        conflictingComponents,
        conflictOpts,
        components,
        downgradedForNoExcerpt,
        claimText,
      });
      let commentaryPayload = typedExplanation.text;
      if (!downgradedForNoExcerpt && mismatchPartialEligible && supportMismatchEffective?.kind) {
        const exFor =
          (displaySourceItems[0]?.excerptText && String(displaySourceItems[0].excerptText).trim())
          || selectedExcerptText
          || "";
        commentaryPayload = buildQuantityMismatchEditorialText(exFor, claimText, components);
      }
      if (!downgradedForNoExcerpt && a71Applied) {
        commentaryPayload = a71Applied.explanation;
      }
      log("QC_V2_EXPLANATION_SELECTED", JSON.stringify({
        claimId,
        explanationType: typedExplanation.explanationType,
        priorityLevel: typedExplanation.priorityLevel,
        signalsUsed: typedExplanation.signalsUsed,
      }));
      if (typedExplanation.explanationType === "partial") {
        log("QC_V2_PARTIAL_FRAGMENT_BUILD", JSON.stringify({
          claimId,
          supportedFragment: typedExplanation.supportedFragment,
          missingFragment: typedExplanation.missingFragment,
          fragmentSource: typedExplanation.fragmentSource,
        }));
      }
      const explanationCode = getExplanationCode(effectiveClassification, confirmedComponents, missingComponents, conflictingComponents);
      log("QC_V2_COMMENTARY_CODE", { claimId, explanationCode });
      const primaryValueSummary = effectiveClassification === "conflict" && selectedCandidate
        ? extractValueSummaryFromExcerpt(selectedExcerptText, conflictingComponents[0], components)
        : null;
      const whyItMattersText = buildWhyItMattersFromExplanation(explanationCode, primaryValueSummary);
      const mayShowSelectedEvidence =
        hasUsableExcerpt
        && selectedCandidate
        && !downgradedForNoExcerpt
        && effectiveClassification !== "related"
        && effectiveClassification !== "none";
      let authoritySelectedEvidence = mayShowSelectedEvidence ? {
        refId: selectedCandidate.refId,
        sourceType: selectedCandidate.sourceOrigin === "web" ? "web_search" : "uploaded",
        title: selectedCandidate.displayTitle,
        url: refsById.get(String(selectedCandidate.refId))?.url ?? null,
      } : null;
      let authoritySelectedExcerptText = mayShowSelectedEvidence ? selectedExcerptText : null;

      let hoverPayload = null;
      if (!downgradedForNoExcerpt && authoritySelectedEvidence && authoritySelectedExcerptText) {
        hoverPayload = buildHoverPayload(
          effectiveClassification,
          selectedCandidate ? { ...selectedCandidate, displayTitle: selectedCandidate.displayTitle } : null,
          authoritySelectedExcerptText,
          whyItMattersText,
          originalSentenceText,
        );
      }
      const { displayVerdict, concernLevel } = computeDisplayVerdictAndConcern(verdictPayload, effectiveClassification);
      log("QC_V2_VERDICT_ELIGIBILITY", JSON.stringify({
        claimId,
        classification: effectiveClassification,
        hasUsableExcerpt,
        displayVerdict,
      }));
      log("QC_V2_CONCERN_ASSIGNMENT", JSON.stringify({
        claimId,
        displayVerdict,
        concernLevel,
      }));
      for (const item of displaySourceItems) {
        log("QC_V2_POPUP_BUILD", JSON.stringify({
          claimId,
          refId: item?.refId ?? null,
          hasOriginalClaim: !!(item?.originalClaimText && String(item.originalClaimText).trim()),
          hasExcerpt: !!(item?.excerptText && String(item.excerptText).trim()),
          hasWhatThisShows: !!(item?.whatThisShows && String(item.whatThisShows).trim()),
          hasWhatIsNotShown: !!(item?.whatIsNotShown && String(item.whatIsNotShown).trim()),
        }));
      }
      const sentenceSubclaimCountForDedup =
        typeof stmt.sentence_subclaim_count === "number"
          ? stmt.sentence_subclaim_count
          : canonicalClaims.length;
      const popupDedup = computeV2PopupOriginalSentenceDedup({
        originalSentenceText,
        originalClaimText: claimText,
        sentenceSubclaimCount: sentenceSubclaimCountForDedup,
      });
      log("QC_V2_POPUP_DEDUP", JSON.stringify({
        claimId,
        originalSentenceShown: popupDedup.originalSentenceShown,
        reason: popupDedup.reason,
      }));
      const authority = buildExportedAuthority({
        claimId,
        claimText,
        sentenceSpan,
        sentenceIndex: idx,
        subclaimIndex: cIdx,
        originalSentenceText,
        displayVerdict,
        concernLevel,
        commentaryPayload,
        displaySourceItems,
        selectedEvidence: authoritySelectedEvidence,
        selectedExcerptText: authoritySelectedExcerptText,
        hoverPayload,
        conflictEvidence: conflictEvidenceOut,
        hasUsableExcerpt,
        typedExplanationType: typedExplanation.explanationType,
      }, log);
      authorities.push(authority);
      log("QC_V2_AUTHORITY_BUILD", { claimId, displayVerdict: authority.displayVerdict, hasUsableExcerpt: authority.hasUsableExcerpt });
      log("QC_V2_COMMENTARY_BUILD", { claimId, commentaryPreview: (commentaryPayload || "").substring(0, 60) });
      log("QC_V2_HOVER_BUILD", { claimId, hasHoverPayload: !!(authority.hoverPayload && Object.keys(authority.hoverPayload).length) });
    }
    stmt.meta = { ...(stmt.meta || {}), qcEvidenceAuthorities: authorities };
  }
  return statements;
}
