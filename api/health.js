// api/health.js

import { OUTPUT_TYPE_LENGTH } from "../lib/prompt-library/outputTypeGuidance.js";
import { readDatabaseStatus } from "../lib/db/client.mjs";
import { authMode } from "../lib/auth/require-account.mjs";
import { readBuildIdentity, readEnvironmentSummary, withDatabaseStatus } from "./_lib/env-flags.js";

function setCorsHeaders(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://brightline-content-engine-frontend.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

function buildHouseWordLimits() {
  const houseWordLimits = {};
  for (const [outputType, range] of Object.entries(OUTPUT_TYPE_LENGTH)) {
    houseWordLimits[outputType] = { min: range.min, max: range.max };
  }
  return houseWordLimits;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();

  const database = await readDatabaseStatus();
  const environment = withDatabaseStatus(readEnvironmentSummary(), database);
  const build = readBuildIdentity();
  return res.status(200).json({
    ok: true,
    service: "backend",
    ts: new Date().toISOString(),
    houseWordLimits: buildHouseWordLimits(),
    environment,
    database,
    build,
    authMode: authMode(),
  });
}
