/**
 * Layer B: one document-level editorial call for rules that need the whole draft (B275).
 * Findings bind by quote-locate. A miss is unplaced, never a guessed sentence, never a silent clean.
 */

import editorialRules from "../rulebook/editorialRules.js";
import { callLLM, hasProviderApiKey } from "../observability.js";
import {
  getOutputTypeLabel,
  getVisibilityLabel,
  normalizeOutputType,
  normalizeVisibility,
  OUTPUT_TYPE,
  VISIBILITY,
} from "../output-intent.js";
import { STAGE_MODELS } from "./model-config.mjs";
import {
  FIRST_PERSON_ACTOR_INSTRUCTION,
  buildFirstPersonActorInstruction,
  formatAuthoringOrganisationPromptBlock,
  houseVoiceIsThirdPerson,
  identifyAuthoringOrganisation,
  resolveAuthoringOrganisationName,
} from "./first-person-actor.mjs";
import { attachDocumentFindings } from "./quote-locate.mjs";

export const DOCUMENT_LEVEL_EDITORIAL_RULE_IDS = Object.freeze([
  "materiality",
  "audience_calibration_jargon",
  "voice_consistency",
]);

const DOCUMENT_LEVEL_RULE_SET = new Set(DOCUMENT_LEVEL_EDITORIAL_RULE_IDS);

export function isDocumentLevelEditorialRule(id) {
  return DOCUMENT_LEVEL_RULE_SET.has(id);
}

export function sentenceLocalEditorialRules(rules) {
  return (Array.isArray(rules) ? rules : []).filter((r) => !isDocumentLevelEditorialRule(r?.id));
}

export function documentLevelEditorialRules(rules) {
  return (Array.isArray(rules) ? rules : []).filter((r) => isDocumentLevelEditorialRule(r?.id));
}

const CANONICAL_TO_RULEBOOK_OUTPUT = {
  [OUTPUT_TYPE.REPORTING_COMMENTARY]: "reporting_commentary",
  [OUTPUT_TYPE.INVESTOR_LETTER]: "investor_letter",
  [OUTPUT_TYPE.PRESS_RELEASE]: "press_release",
  [OUTPUT_TYPE.LINKEDIN_POST]: "linkedin_post",
};

function rulebookOutputSlug(canonicalOt) {
  return CANONICAL_TO_RULEBOOK_OUTPUT[canonicalOt] ?? "reporting_commentary";
}

function rulebookVersionSlug(visibility) {
  return visibility === VISIBILITY.PUBLIC ? "public" : "complete";
}

function filterRulesForRun(rules, outputSlug, versionSlug) {
  return (Array.isArray(rules) ? rules : []).filter((r) => {
    if (!Array.isArray(r.appliesTo) || !r.appliesTo.includes(outputSlug)) return false;
    if (r.appliesToVersion == null) return true;
    if (Array.isArray(r.appliesToVersion) && r.appliesToVersion.includes(versionSlug)) return true;
    return false;
  });
}

function emptyResult(status, extra = {}) {
  return {
    status,
    attached: [],
    unplaced: [],
    attachedCount: 0,
    unplacedCount: 0,
    cardsWithFindings: 0,
    ...extra,
  };
}

function summarize(result) {
  const attached = Array.isArray(result.attached) ? result.attached : [];
  const unplaced = Array.isArray(result.unplaced) ? result.unplaced : [];
  const indexes = new Set(attached.map((row) => row.index));
  return {
    status: result.status,
    attachedCount: attached.length,
    unplacedCount: unplaced.length,
    cardsWithFindings: indexes.size,
    unplaced,
  };
}

export function attachedByIndex(attached) {
  const map = new Map();
  for (const row of Array.isArray(attached) ? attached : []) {
    if (!Number.isFinite(row?.index)) continue;
    const list = map.get(row.index) || [];
    list.push(row);
    map.set(row.index, list);
  }
  return map;
}

export function mergeDocumentLevelConcerns(qcCard, attachedRows) {
  if (!qcCard || typeof qcCard !== "object") return qcCard;
  const add = (Array.isArray(attachedRows) ? attachedRows : [])
    .map((row) => row?.concern)
    .filter((c) => c && c.concernCode && c.note && c.suggestedDirection);
  if (add.length === 0) return qcCard;
  const existing = Array.isArray(qcCard.editorialConcerns) ? qcCard.editorialConcerns.slice() : [];
  const seen = new Set(existing.map((c) => c.concernCode));
  for (const concern of add) {
    if (seen.has(concern.concernCode)) continue;
    existing.push(concern);
    seen.add(concern.concernCode);
  }
  qcCard.editorialConcerns = existing;
  if (existing.length > 0) {
    qcCard.editorialVerdict = "concern";
    qcCard.editorialNote = null;
    if (typeof qcCard.editorialSuggestedDirection !== "string" || !qcCard.editorialSuggestedDirection.trim()) {
      qcCard.editorialSuggestedDirection = existing.find((c) => c.source === "document_level")
        ?.suggestedDirection
        || existing[0].suggestedDirection;
    }
  }
  return qcCard;
}

function formatRules(rules, outputSlug, houseName) {
  return rules
    .map((r, i) => {
      let description = String(r.description || "").trim();
      if (r.id === "voice_consistency" && !houseVoiceIsThirdPerson(outputSlug)) {
        if (description.includes(FIRST_PERSON_ACTOR_INSTRUCTION)) {
          description = description.replace(FIRST_PERSON_ACTOR_INSTRUCTION, "").trimEnd();
        }
      } else if (description.includes(FIRST_PERSON_ACTOR_INSTRUCTION) && houseName) {
        description = description.replace(
          FIRST_PERSON_ACTOR_INSTRUCTION,
          buildFirstPersonActorInstruction(houseName)
        );
      }
      let block = `${i + 1}. ${r.id}: ${description}`;
      if (typeof r.fixDirection === "string" && r.fixDirection.trim()) {
        if (!(r.id === "voice_consistency" && !houseVoiceIsThirdPerson(outputSlug))) {
          block += `\n   fixDirection: ${r.fixDirection.trim()}`;
        }
      }
      const byOutput = r.reviewerNoteByOutput && typeof r.reviewerNoteByOutput === "object"
        ? r.reviewerNoteByOutput[outputSlug]
        : null;
      const reviewerNote =
        typeof byOutput === "string" && byOutput.trim()
          ? byOutput.trim()
          : typeof r.reviewerNote === "string" && r.reviewerNote.trim()
            ? r.reviewerNote.trim()
            : null;
      if (reviewerNote) block += `\n   reviewerNote: ${reviewerNote}`;
      return block;
    })
    .join("\n\n");
}

function numberedSentenceList(sentences) {
  return (Array.isArray(sentences) ? sentences : [])
    .map((row) => {
      const index = Number.isFinite(row?.index) ? row.index : "";
      const text = typeof row?.text === "string" ? row.text : "";
      return `[${index}] ${text}`;
    })
    .join("\n");
}

export function buildDocumentLevelSystemPrompt({ outputTypeLabel, rules, outputSlug, houseName }) {
  const firstPerson = houseVoiceIsThirdPerson(outputSlug)
    ? `FIRST-PERSON REMOVAL (applies to voice_consistency)\n${buildFirstPersonActorInstruction(houseName)}\n\n`
    : "";
  return `You are a senior editor at a top-tier financial publication. You are reviewing a whole draft against a short list of document-level rules only. You are not reviewing grammar, style mechanics, or compliance.

You are reviewing for output type: ${outputTypeLabel}.

${firstPerson}MATERIALITY AND INFORMATION-VALUE EVALUATION
Flag immateriality only when a sentence adds nothing relative to the rest of the draft: it restates a point already made, introduces an incidental fact with no bearing on the thesis, or fails to advance the argument given its position.

BINDING RULE
Every finding MUST quote the exact words from the draft that the finding is about. The quote is the bind. Do not return a sentence index as the way to attach a finding. If you cannot quote the exact words, omit the finding.

Return JSON only:
{
  "findings": [
    {
      "quote": "<exact words from the draft>",
      "ruleId": "<one of the rule ids below>",
      "note": "<one-to-two-sentence explanation>",
      "suggestedDirection": "<imperative sentence that quotes the same words>"
    }
  ]
}

If no rule is violated, return {"findings":[]}.

RULES:
${formatRules(rules, outputSlug, houseName)}`;
}

export function buildDocumentLevelUserPayload({
  draftText,
  sentences,
  outputTypeLabel,
  requiredVersion,
  authoringOrganisation,
}) {
  const visLabel = getVisibilityLabel(requiredVersion);
  const houseName = resolveAuthoringOrganisationName(authoringOrganisation);
  return `OUTPUT TYPE: ${outputTypeLabel}
VERSION: ${visLabel} (${String(requiredVersion)})

${formatAuthoringOrganisationPromptBlock(draftText, houseName)}

NUMBERED SENTENCES:
${numberedSentenceList(sentences)}
`;
}

function parseFindings(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };
  let parsed = tryParse(text);
  if (!parsed) {
    const fenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    parsed = tryParse(fenced);
  }
  if (!parsed) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) parsed = tryParse(text.slice(start, end + 1));
  }
  if (!parsed || typeof parsed !== "object") return null;
  const list = Array.isArray(parsed.findings)
    ? parsed.findings
    : Array.isArray(parsed.violations)
      ? parsed.violations
      : Array.isArray(parsed.concerns)
        ? parsed.concerns
        : null;
  if (!list) return null;
  return list;
}

function normalizeFinding(entry, allowedIds) {
  if (!entry || typeof entry !== "object") return null;
  const ruleId =
    typeof entry.ruleId === "string"
      ? entry.ruleId.trim()
      : typeof entry.concernCode === "string"
        ? entry.concernCode.trim()
        : typeof entry.rule === "string"
          ? entry.rule.trim()
          : "";
  if (!allowedIds.has(ruleId)) return null;
  const quote = typeof entry.quote === "string" ? entry.quote : "";
  const note = typeof entry.note === "string" ? entry.note.trim() : "";
  const suggestedDirection =
    typeof entry.suggestedDirection === "string" ? entry.suggestedDirection.trim() : "";
  if (!quote || !note || !suggestedDirection) return null;
  const out = { ruleId, quote, note, suggestedDirection };
  if (typeof entry.concernText === "string" && entry.concernText.trim()) {
    out.concernText = entry.concernText.trim();
  }
  return out;
}

/**
 * One LLM call. Quote-locate attaches each finding to a sentence.
 */
export async function runDocumentLevelReview({
  draftText,
  sentences,
  outputType,
  requiredVersion,
  authoringOrganisation,
  traceId,
} = {}) {
  const draft = typeof draftText === "string" ? draftText : "";
  const rows = Array.isArray(sentences) ? sentences : [];
  if (!draft.trim() || rows.length === 0) {
    console.warn("[DOCUMENT_LEVEL] missing draft or sentences; not_reviewed");
    return emptyResult("not_reviewed", { reason: "missing_input" });
  }

  const canonicalOt = normalizeOutputType(outputType);
  const visibility = normalizeVisibility(requiredVersion);
  const outputSlug = rulebookOutputSlug(canonicalOt);
  const versionSlug = rulebookVersionSlug(visibility);
  const outputTypeLabel = getOutputTypeLabel(canonicalOt);
  const rules = documentLevelEditorialRules(
    filterRulesForRun(editorialRules, outputSlug, versionSlug)
  );
  if (rules.length === 0) {
    console.warn("[DOCUMENT_LEVEL] no applicable document-level rules; not_reviewed");
    return emptyResult("not_reviewed", { reason: "no_applicable_rules" });
  }

  const modelConfig = STAGE_MODELS["document-level-review"];
  if (!hasProviderApiKey(modelConfig.provider)) {
    console.warn("[DOCUMENT_LEVEL] missing LLM provider API key");
    return emptyResult("not_reviewed", { reason: "missing_api_key" });
  }

  const houseName = identifyAuthoringOrganisation(
    draft,
    resolveAuthoringOrganisationName(authoringOrganisation)
  );
  const systemPrompt = buildDocumentLevelSystemPrompt({
    outputTypeLabel,
    rules,
    outputSlug,
    houseName,
  });
  const userContent = buildDocumentLevelUserPayload({
    draftText: draft,
    sentences: rows,
    outputTypeLabel,
    requiredVersion: visibility,
    authoringOrganisation,
  });

  let raw = "";
  try {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      responseFormat: "json",
      traceId,
      traceName: "qc-run",
      spanName: "document-level-review",
      metadata: { stage: "document-level-review", ruleCount: rules.length },
    });
    raw = typeof completion?.text === "string" ? completion.text : "";
  } catch (err) {
    console.warn("[DOCUMENT_LEVEL] call failed", err?.message || String(err));
    return emptyResult("not_reviewed", { reason: "call_failed" });
  }

  const parsed = parseFindings(raw);
  if (!parsed) {
    console.warn("[DOCUMENT_LEVEL] malformed response; not_reviewed");
    return emptyResult("not_reviewed", { reason: "malformed" });
  }

  const allowedIds = new Set(rules.map((r) => r.id));
  const findings = [];
  for (const entry of parsed) {
    const n = normalizeFinding(entry, allowedIds);
    if (!n) continue;
    findings.push(n);
  }

  const bound = attachDocumentFindings({ findings, sentences: rows, draftText: draft });
  const attached = bound.attached;
  const unplaced = bound.unplaced;
  const indexes = new Set(attached.map((row) => row.index));
  return {
    status: "reviewed",
    attached,
    unplaced,
    attachedCount: attached.length,
    unplacedCount: unplaced.length,
    cardsWithFindings: indexes.size,
  };
}

export function documentLevelMeta(result) {
  if (!result || typeof result !== "object") return null;
  return summarize(result);
}
