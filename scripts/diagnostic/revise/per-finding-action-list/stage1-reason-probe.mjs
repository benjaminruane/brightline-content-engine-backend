#!/usr/bin/env node
/**
 * Stage 1 reason probe. One run, arm one, ACTION findings only.
 * Throwaway. Does not import revise-stage1-prompt or the stage 1 validator.
 * Does not call findingRestsOnSilence.
 *
 * Usage: node scripts/diagnostic/revise/per-finding-action-list/stage1-reason-probe.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, flushObservability, hasProviderApiKey, calculateLlmCostUsd } = await import(
  "../../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../../lib/qc/model-config.mjs");
const { ARTEFACTS, inventoryArtefact, summariseArtefact, PHRASE_RATIO_LINE } = await import(
  "./inventory.mjs"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVISE_DIR = path.join(__dirname, "..");
const TARGET_STEM = "r10-review1";
const COST_CEILING_USD = 1;
const PREFLIGHT_IN_TOKENS_PER_CALL = 2500;
const PREFLIGHT_OUT_TOKENS_PER_CALL = 400;

/**
 * Copied from the SHIPPED whole-draft reviser (lib/build-revision-prompt.mjs
 * L1099-1107, kinds conflict/unsupported/partial). Not the abandoned
 * per-statement prefix. Markers are not requested: this probe asks for an
 * action object, not a marked draft.
 */
const SHIPPED_SILENCE_AND_B134 = `SILENCE AND SOURCE-STATED VALUES (shipped principle):
If the source STATES a specific value for what the draft asserts, put that source value in the proposed change (house style). Never invent a figure the source does not state.
When the source is SILENT or vague on what the draft asserts, leave the CLAIM exactly as written. Do not soften the claim, do not drop a figure, do not cut the clause, do not substitute a different fact, do not strip the actor so that a judgement becomes an unattributed statement. Silence is the absence of evidence, not evidence against the claim, and the author decides what to do about the CLAIM.
A source that contradicts the draft, or that states a value the draft got wrong or left unsupported, is not silence. Propose the source value.
One operation is permitted on a silent card when a craft or style_guide suggestedDirection names it, and only this operation: replace a first-person subject or object (we / our / us) with the named authoring organisation as grammatical subject (or as the object, when the pronoun is an object). Change nothing else in the sentence. Never delete the actor.
  "We believe X" -> "Halden Group believes X"
  "we recommend the commitment" -> "Halden Group recommends the commitment"
  "available to us" -> "available to Halden Group"
Never "X". Never "is believed". Never "is recommended". THE ACTOR STAYS. Do not recast into an agentless or passive construction such as "was attractive", "is considered", "is expected to", "it is noted that", or "is recommended".
Preserve every hedge and modal exactly. Only the grammatical subject or object pronoun changes.
Still forbidden on a silent card: deleting evaluative language; neutralising a causal verb; removing a hedge or modal; substituting a different fact; completing a fragment; deleting a view-marker; or any other craft operation not named above.
NEVER SUBSTITUTE A DIFFERENT FACT. Where the source is silent on what the draft asserts, do not replace the draft's claim with some other statement drawn from the source.
For a conflict: if the source passage states a competing value, the proposed change must carry that source value, not a vague hedge.
For a partial: keep the confirmed portion unchanged. If the source states a specific value for the unsupported element, that value is the proposed change. If the source is silent on the unsupported element, do not propose an edit to the claim.`;

function buildPrompt(finding, authoringOrganisation) {
  const thing1 = finding.thing1?.quote || finding.statement;
  const direction =
    typeof finding.suggestedDirection === "string" && finding.suggestedDirection.trim()
      ? finding.suggestedDirection.trim()
      : "(none)";
  const excerpt = finding.primaryExcerpt || "(none)";
  return `You propose ONE revision action for ONE Review finding. You are not rewriting the rest of the draft.

${SHIPPED_SILENCE_AND_B134}

Authoring organisation: ${authoringOrganisation}

The ORIGINAL statement:
${finding.statement}

Thing 1 (offending part of the ORIGINAL, copied from Review, do not invent a different span):
${thing1}

Thing 2 (what is wrong, copied from Review):
${finding.thing2}

Finding kind: ${finding.kind}
Rule or verdict: ${finding.rule}
Review suggestedDirection (guidance, not a script you must copy word for word): ${direction}
Source excerpt, if any: ${excerpt}

Return JSON only:
{
  "proposedChange": "the exact replacement text for the offending part, or a short description of a deletion, or KEEP if the shipped silence rule forbids an edit",
  "why": "why this fix rather than another, specific to THIS finding, in plain words. Not a class label. Not 'revised this span'."
}`;
}

function parseJsonObject(text) {
  const trimmed = String(text ?? "").trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
  const unfenced = fence.test(trimmed) ? trimmed.replace(fence, "$1").trim() : trimmed;
  try {
    const parsed = JSON.parse(unfenced);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const spec = ARTEFACTS.find((a) => a.stem === TARGET_STEM);
const raw = JSON.parse(await readFile(path.join(REVISE_DIR, spec.file), "utf8"));
const artefact = inventoryArtefact(spec.stem, spec.file, raw.payload);
const summary = summariseArtefact(artefact);
const action = artefact.findings.filter((f) => f.disposition === "ACTION");
const phraseShare = summary.actionPhraseShare;

const modelConfig = STAGE_MODELS["writing-rewrite"];
const preflightUsd =
  action.length *
  calculateLlmCostUsd(modelConfig.provider, modelConfig.model, {
    inputTokens: PREFLIGHT_IN_TOKENS_PER_CALL,
    outputTokens: PREFLIGHT_OUT_TOKENS_PER_CALL,
    cachedInputTokens: 0,
  });

const gate = {
  file: spec.file,
  actionCount: action.length,
  actionPhraseCount: summary.actionThing1.PHRASE,
  phraseShare,
  phraseLine: PHRASE_RATIO_LINE,
  phraseGate: phraseShare != null && phraseShare >= 0.5,
  preflightUsd,
  costCeilingUsd: COST_CEILING_USD,
  costGate: preflightUsd < COST_CEILING_USD,
};

if (!gate.phraseGate || !gate.costGate) {
  await writeFile(path.join(__dirname, "stage1-gate.json"), `${JSON.stringify({ ok: false, gate }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: false, blocked: true, gate }, null, 2));
  process.exit(0);
}

if (!hasProviderApiKey(modelConfig.provider)) {
  console.error("Missing provider API key for writing-rewrite");
  process.exit(1);
}

const authoringOrganisation = "Halden Group";
const rows = [];
let actualUsd = 0;

for (const finding of action) {
  const messages = [
    { role: "system", content: "You return only the JSON object requested. No markdown." },
    { role: "user", content: buildPrompt(finding, authoringOrganisation) },
  ];
  const result = await callLLM({
    provider: modelConfig.provider,
    model: modelConfig.model,
    messages,
    temperature: 0,
    seed: 1,
    responseFormat: "json",
    traceName: "per-finding-action-list-stage1",
    spanName: "reason-probe",
    metadata: { findingId: finding.id, arm: "one" },
  });
  const cost = calculateLlmCostUsd(modelConfig.provider, modelConfig.model, result.usage);
  actualUsd += cost;
  const parsed = parseJsonObject(result.text);
  rows.push({
    arm: "one",
    findingId: finding.id,
    kind: finding.kind,
    rule: finding.rule,
    thing1State: finding.thing1State,
    thing1: finding.thing1,
    thing2: finding.thing2,
    proposedChange: parsed && typeof parsed.proposedChange === "string" ? parsed.proposedChange : null,
    why: parsed && typeof parsed.why === "string" ? parsed.why : null,
    rawText: result.text,
    parseOk: Boolean(parsed && parsed.proposedChange && parsed.why),
    conditions: {
      provider: result.provider,
      model: result.model,
      temperature: 0,
      seed: 1,
      latencyMs: result.latencyMs,
      usage: result.usage,
      costUsd: cost,
      systemFingerprint:
        result.raw && typeof result.raw === "object" ? result.raw.system_fingerprint ?? null : null,
    },
  });
}

await flushObservability();

const out = {
  ranAt: new Date().toISOString(),
  gate,
  actualUsd,
  callCount: rows.length,
  rows,
};

await writeFile(path.join(__dirname, "stage1-reason-probe.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      ok: true,
      callCount: rows.length,
      actualUsd,
      preflightUsd: gate.preflightUsd,
      rows: rows.map((r) => ({
        findingId: r.findingId,
        rule: r.rule,
        proposedChange: r.proposedChange,
        why: r.why,
        parseOk: r.parseOk,
        costUsd: r.conditions.costUsd,
      })),
    },
    null,
    2
  )
);
