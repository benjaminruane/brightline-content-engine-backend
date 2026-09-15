// api/health.js

import { VISIBILITY } from "../lib/output-intent.js";
import { getPgCommentaryWordLimit } from "../lib/prompt-library/index.js";
import { PG_WRITING_EVENT } from "../lib/prompt-library/pg-writing-prompts.mjs";
import { readEnvironmentSummary } from "./_lib/env-flags.js";

function setCorsHeaders(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://brightline-content-engine-frontend.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function buildHouseWordLimits() {
  const houseWordLimits = {};
  for (const eventKey of Object.values(PG_WRITING_EVENT)) {
    const publicLimit = getPgCommentaryWordLimit(eventKey, VISIBILITY.PUBLIC);
    const completeLimit = getPgCommentaryWordLimit(eventKey, VISIBILITY.COMPLETE);
    if (publicLimit == null && completeLimit == null) continue;
    const byVis = {};
    if (publicLimit != null) byVis.public = publicLimit;
    if (completeLimit != null) byVis.complete = completeLimit;
    houseWordLimits[eventKey] = byVis;
  }
  return houseWordLimits;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();

  return res.status(200).json({
    ok: true,
    service: "backend",
    ts: new Date().toISOString(),
    houseWordLimits: buildHouseWordLimits(),
    environment: readEnvironmentSummary(),
  });
}
