import { AUTHORING_ORGANISATION_ENV } from "../../lib/qc/first-person-actor.mjs";

export function isReviseActionListEnabled(env = process.env) {
  const v = String(env?.REVISE_ACTION_LIST || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isEditorialReviewEnabled(env = process.env) {
  return String(env?.BRIGHTLINE_EDITORIAL_REVIEW || "").trim() === "1";
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
  };
}
