import { AUTHORING_ORGANISATION_ENV } from "../../lib/qc/first-person-actor.mjs";
import { isClaimSpansEnabled } from "../../lib/qc/claim-spans.mjs";
import { isStage2SpanEnabled } from "../../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { isLlmCacheEnabled } from "../../lib/qc/llm-cache.mjs";
import { isMultisourceCoverageEnabled } from "../../lib/qc/coverage-union.mjs";
import { isExtractStructureEnabled, resolvePdfEngine } from "../../lib/extract-text-from-source.mjs";
import { isRaisedCharactersEnabled } from "../../lib/extract-pdf-direct.mjs";
import { isNarrativeCoherenceEnabled } from "../../lib/qc/narrative-coherence.mjs";
import { isActorOfTheActionEnabled } from "../../lib/qc/actor-of-the-action.mjs";
import { readBuildIdentity } from "../../lib/qc/build-identity.mjs";

export { readBuildIdentity };

const LOOSE_TOKENS = new Set(["1", "true", "yes", "on", "0", "false", "no", "off"]);

export function isReviseActionListEnabled(env = process.env) {
  const v = String(env?.REVISE_ACTION_LIST || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isEditorialReviewEnabled(env = process.env) {
  return String(env?.BRIGHTLINE_EDITORIAL_REVIEW || "").trim() === "1";
}

function flagReport(resolved, defaultValue) {
  return {
    resolved,
    differsFromDefault: resolved !== defaultValue,
  };
}

function rawPresent(env, name) {
  const v = env?.[name];
  if (v == null) return "";
  return String(v);
}

function unrecognisedLoose(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return false;
  return !LOOSE_TOKENS.has(trimmed.toLowerCase());
}

export function listUnrecognisedFlags(env = process.env) {
  const names = [];
  const pipelineRaw = rawPresent(env, "QC_PIPELINE_V4");
  if (pipelineRaw !== "" && pipelineRaw !== "1") names.push("QC_PIPELINE_V4");

  const editorialRaw = rawPresent(env, "BRIGHTLINE_EDITORIAL_REVIEW");
  if (editorialRaw !== "" && editorialRaw.trim() !== "1") names.push("BRIGHTLINE_EDITORIAL_REVIEW");

  if (unrecognisedLoose(rawPresent(env, "REVISE_ACTION_LIST"))) names.push("REVISE_ACTION_LIST");
  if (unrecognisedLoose(rawPresent(env, "QC_CLAIM_SPANS"))) names.push("QC_CLAIM_SPANS");
  if (unrecognisedLoose(rawPresent(env, "QC_STAGE2_SPAN"))) names.push("QC_STAGE2_SPAN");
  if (unrecognisedLoose(rawPresent(env, "QC_LLM_CACHE"))) names.push("QC_LLM_CACHE");
  if (unrecognisedLoose(rawPresent(env, "QC_MULTISOURCE_COVERAGE"))) names.push("QC_MULTISOURCE_COVERAGE");
  if (unrecognisedLoose(rawPresent(env, "QC_NARRATIVE_COHERENCE"))) names.push("QC_NARRATIVE_COHERENCE");
  if (unrecognisedLoose(rawPresent(env, "QC_ACTOR_OF_THE_ACTION"))) names.push("QC_ACTOR_OF_THE_ACTION");

  const extractRaw = rawPresent(env, "QC_EXTRACT_STRUCTURE");
  if (extractRaw !== "" && extractRaw !== "true" && extractRaw !== "1") {
    names.push("QC_EXTRACT_STRUCTURE");
  }

  const engineRaw = typeof env?.PDF_ENGINE === "string" ? env.PDF_ENGINE.trim() : "";
  if (engineRaw && engineRaw !== "direct" && engineRaw !== "officeparser") {
    names.push("PDF_ENGINE");
  }

  const raisedRaw = typeof env?.PDF_RAISED_CHARACTERS === "string" ? env.PDF_RAISED_CHARACTERS.trim() : "";
  if (raisedRaw) {
    const v = raisedRaw.toLowerCase();
    if (!["0", "false", "off", "1", "true", "yes", "on"].includes(v)) {
      names.push("PDF_RAISED_CHARACTERS");
    }
  }

  return names;
}

export function readEnvironmentSummary(env = process.env) {
  const pipelineRoute = env.QC_PIPELINE_V4 === "1" ? "v4" : "v3";
  const authoringOrganisation = (env[AUTHORING_ORGANISATION_ENV] || "").trim() || null;
  const editorialReview = isEditorialReviewEnabled(env);
  return {
    pipelineRoute,
    authoringOrganisation,
    reviseActionList: isReviseActionListEnabled(env),
    editorialReview,
    ok: pipelineRoute === "v4" && authoringOrganisation !== null && editorialReview === true,
    claimSpans: flagReport(isClaimSpansEnabled(), true),
    stage2Span: flagReport(isStage2SpanEnabled(), false),
    llmCache: flagReport(isLlmCacheEnabled(), true),
    multisourceCoverage: flagReport(isMultisourceCoverageEnabled(), false),
    pdfEngine: flagReport(resolvePdfEngine(), "direct"),
    extractStructure: flagReport(isExtractStructureEnabled(), false),
    raisedCharacters: flagReport(isRaisedCharactersEnabled(), true),
    narrativeCoherence: flagReport(isNarrativeCoherenceEnabled(env), false),
    actorOfTheAction: flagReport(isActorOfTheActionEnabled(env), false),
    unrecognisedFlags: listUnrecognisedFlags(env),
  };
}

export function withDatabaseStatus(environment, database) {
  const state =
    database && typeof database.state === "string" ? database.state : "not_configured";
  return {
    ...environment,
    database: state,
    ok: environment.ok === true && state !== "unreachable",
  };
}
