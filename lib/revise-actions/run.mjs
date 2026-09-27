/**
 * Sort a stored Review card into ACTION / ACKNOWLEDGE rows.
 * Derived conflict replacements are built in code. Authored rewrites are not proposed.
 * Vercel maxDuration is 60s; concurrency is capped at 4. A long draft will not fit.
 */
import { callLLM } from "../observability.js";
import { STAGE_MODELS } from "../qc/model-config.mjs";
import {
  assertNoUnresolvedAuthoringOrganisationPlaceholder,
  identifyAuthoringOrganisation,
  isFirstPersonActorRule,
  resolveAuthoringOrganisationName,
  resultAddsUnlicensedOrganisation,
  statementHasFirstPersonPronoun,
} from "../qc/first-person-actor.mjs";
import {
  applyConflictProposal,
  isContradictedEvidenceFinding,
} from "./conflict-engagement.mjs";
import { fillDecisionCopy, GENERIC_CONTRADICTION } from "./decision-copy.mjs";
import { buildSortedEntries, NO_PROPOSAL } from "./sort.mjs";
import { findUnshippableUserCopy } from "./user-copy.mjs";
import { verifyAction } from "./verify.mjs";

export const ACTION_LIST_CONCURRENCY = 4;

async function mapPool(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const limit = Math.max(1, Math.min(Number(concurrency) || 1, list.length));
  const results = new Array(list.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      results[index] = await mapper(list[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

function publicThing1State(entry) {
  const state = entry?.thing1State;
  if (state === "PHRASE" || state === "WHOLE_STATEMENT" || state === "NONE") return state;
  return "NONE";
}

function sweepPublicText(text, fallback) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) return "";
  if (findUnshippableUserCopy(raw).length === 0) return raw;
  return typeof fallback === "string" ? fallback : "";
}

function explanationFromOutcome(explain) {
  const filled = fillDecisionCopy(explain);
  const explainCode = explain?.code || null;
  if (!filled) return { explanation: "", explainCode };
  const swept = sweepPublicText(filled, GENERIC_CONTRADICTION);
  return { explanation: swept, explainCode };
}

function publicEntry(entry) {
  const safe = enforceDerivedProposal(entry);
  const out = {
    id: safe.id,
    disposition: safe.disposition,
    statementId: safe.statementId,
    statement: safe.statement,
    kind: safe.kind,
    rule: safe.rule,
    thing1: safe.thing1,
    thing1State: publicThing1State(safe),
    thing2: safe.thing2,
    sort: safe.sort,
    provenance: safe.provenance === "derived" ? "derived" : "authored",
  };
  const explanation = sweepPublicText(safe.explanation, GENERIC_CONTRADICTION);
  if (explanation) out.explanation = explanation;
  if (safe.explainCode) out.explainCode = safe.explainCode;
  if (safe.governancePair && typeof safe.governancePair === "object") {
    out.governancePair = safe.governancePair;
  }
  if (Array.isArray(safe.disagreementPassages) && safe.disagreementPassages.length > 0) {
    const passages = [];
    for (const row of safe.disagreementPassages) {
      if (!row || typeof row !== "object") continue;
      const passage = typeof row.passage === "string" ? row.passage.trim() : "";
      if (!passage) continue;
      passages.push({
        sourceId: Number(row.sourceId),
        label: typeof row.label === "string" ? row.label.trim() : "",
        passage,
        governs: row.governs === true,
      });
    }
    if (passages.length > 0) out.disagreementPassages = passages;
  }
  if (typeof safe.confirmingPassage === "string" && safe.confirmingPassage.trim()) {
    out.confirmingPassage = safe.confirmingPassage.trim();
    out.confirmingPassageLabel =
      typeof safe.confirmingPassageLabel === "string" && safe.confirmingPassageLabel.trim()
        ? safe.confirmingPassageLabel.trim()
        : "Confirmed excerpt";
  }
  if (safe.disposition === "ACKNOWLEDGE") {
    out.noProposalReason = sweepPublicText(safe.noProposalReason, GENERIC_CONTRADICTION) || safe.noProposalReason;
  }
  if (safe.disposition === "ACTION") {
    out.proposedChange = safe.proposedChange ?? null;
    out.resultingSentence = safe.resultingSentence ?? null;
    const why = typeof safe.why === "string" ? safe.why.trim() : "";
    if (why) out.why = sweepPublicText(why, "");
    out.verification = safe.verification ?? { status: "unverified", detail: "No model result." };
  }
  return out;
}

function hasProposalText(entry) {
  const change = typeof entry?.proposedChange === "string" && entry.proposedChange.trim();
  const sentence = typeof entry?.resultingSentence === "string" && entry.resultingSentence.trim();
  return Boolean(change || sentence);
}

function enforceDerivedProposal(entry) {
  if (!hasProposalText(entry)) {
    return {
      ...entry,
      provenance: entry?.provenance === "derived" ? "derived" : "authored",
    };
  }
  if (entry?.provenance === "derived") return entry;
  return {
    ...asVisibleAcknowledge(entry, "visible_signal"),
    provenance: "authored",
  };
}

function asVisibleAcknowledge(entry, reasonCode = "visible_signal", extra = {}) {
  const code = NO_PROPOSAL[reasonCode] ? reasonCode : "visible_signal";
  const explanation = typeof extra.explanation === "string" ? extra.explanation.trim() : "";
  return {
    ...entry,
    disposition: "ACKNOWLEDGE",
    noProposalReason: explanation || NO_PROPOSAL[code],
    explanation: explanation || undefined,
    explainCode: extra.explainCode || undefined,
    governancePair: extra.governancePair,
    disagreementPassages: extra.disagreementPassages,
    provenance: extra.provenance || entry.provenance,
    sort: {
      ...entry.sort,
      policyPermit: false,
      reasonCode: code,
    },
  };
}

function corpusFromStatements(statements) {
  const texts = [];
  const seen = new Set();
  for (const row of Array.isArray(statements) ? statements : []) {
    const card = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : null;
    const text =
      (typeof card?.statement === "string" && card.statement) ||
      (typeof row?.text === "string" && row.text) ||
      (typeof row?.statement === "string" && row.statement) ||
      "";
    if (!text || seen.has(text)) continue;
    seen.add(text);
    texts.push(text);
  }
  return texts.join("\n");
}

function unlicensedWriteReason(entry) {
  return isFirstPersonActorRule(entry.rule, entry.rule) ? "first_person_unnamed" : "visible_signal";
}

function refuseUnlicensedAction(entry, proposedChange, resultingSentence, why, authoringOrganisation, corpus) {
  if (
    assertNoUnresolvedAuthoringOrganisationPlaceholder(proposedChange) ||
    assertNoUnresolvedAuthoringOrganisationPlaceholder(resultingSentence) ||
    assertNoUnresolvedAuthoringOrganisationPlaceholder(why)
  ) {
    return publicEntry(asVisibleAcknowledge(entry, unlicensedWriteReason(entry)));
  }
  if (resultAddsUnlicensedOrganisation(entry.statement, resultingSentence, authoringOrganisation, corpus)) {
    return publicEntry(asVisibleAcknowledge(entry, unlicensedWriteReason(entry)));
  }
  return null;
}

export async function fillAction(entry, { authoringOrganisation, callModel, draftText, candidateProposal, sourceRulings } = {}) {
  if (
    isFirstPersonActorRule(entry.rule, entry.rule) &&
    !statementHasFirstPersonPronoun(entry.statement)
  ) {
    return publicEntry(asVisibleAcknowledge(entry, "visible_signal", { provenance: "authored" }));
  }
  const corpus =
    typeof draftText === "string" && draftText.trim()
      ? draftText
      : String(entry?.statement ?? "");
  if (
    isFirstPersonActorRule(entry.rule, entry.rule) &&
    !identifyAuthoringOrganisation(corpus, authoringOrganisation)
  ) {
    return publicEntry(asVisibleAcknowledge(entry, "first_person_unnamed", { provenance: "authored" }));
  }
  if (isContradictedEvidenceFinding(entry)) {
    const outcome = applyConflictProposal(entry, candidateProposal || null, { sourceRulings });
    if (outcome.status !== "replace") {
      const fields = explanationFromOutcome(outcome.explain);
      return publicEntry(
        asVisibleAcknowledge(entry, "conflict_unaddressed", {
          explanation: fields.explanation,
          explainCode: fields.explainCode,
          governancePair: outcome.governancePair,
          disagreementPassages: outcome.disagreementPassages,
          provenance: "derived",
        })
      );
    }
    const { proposedChange, resultingSentence } = outcome.proposal;
    const fields = explanationFromOutcome(outcome.explain);
    const confirmingPassage =
      typeof outcome.confirming?.passage === "string" ? outcome.confirming.passage.trim() : "";
    const refused = refuseUnlicensedAction(
      entry,
      proposedChange,
      resultingSentence,
      fields.explanation,
      authoringOrganisation,
      corpus
    );
    if (refused) return refused;
    const verification = verifyAction({ proposedChange, why: "", resultingSentence });
    return publicEntry({
      ...entry,
      proposedChange,
      resultingSentence,
      why: "",
      explanation: fields.explanation,
      explainCode: fields.explainCode,
      confirmingPassage: confirmingPassage || undefined,
      confirmingPassageLabel: confirmingPassage ? outcome.confirming.label : undefined,
      governancePair: outcome.governancePair,
      disagreementPassages: outcome.disagreementPassages,
      verification,
      provenance: "derived",
    });
  }
  void callModel;
  return publicEntry(asVisibleAcknowledge(entry, "visible_signal", { provenance: "authored" }));
}

export async function runActionList(statements, options = {}) {
  const authoringOrganisation = resolveAuthoringOrganisationName(
    options.authoringOrganisation ?? options.requestName
  );
  const draftText =
    typeof options.draftText === "string" && options.draftText.trim()
      ? options.draftText
      : corpusFromStatements(statements);
  const sorted = buildSortedEntries(statements);
  const defaultModel = STAGE_MODELS["writing-rewrite"];
  const callModel =
    typeof options.callModel === "function"
      ? options.callModel
      : async (prompt, meta) => {
          const completion = await callLLM({
            provider: defaultModel.provider,
            model: defaultModel.model,
            temperature: 0,
            seed: 1,
            responseFormat: "json",
            messages: [{ role: "user", content: prompt }],
            traceName: `revise-actions-${meta.id}`,
            spanName: `revise-actions-${meta.id}`,
            metadata: { route: "revise-actions", findingId: meta.id },
          });
          return { text: completion?.text ?? "" };
        };

  const filled = await mapPool(sorted, ACTION_LIST_CONCURRENCY, async (entry) => {
    if (entry.disposition !== "ACTION") return publicEntry(entry);
    return fillAction(entry, {
      authoringOrganisation,
      callModel,
      draftText,
      sourceRulings: options.sourceRulings,
    });
  });

  return { ok: true, entries: filled };
}
