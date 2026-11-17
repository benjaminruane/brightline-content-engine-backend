// api/health.js

import { applyCors } from "../lib/http/frontend-origins.mjs";
import { OUTPUT_TYPE_LENGTH } from "../lib/prompt-library/outputTypeGuidance.js";
import { readDatabaseStatus } from "../lib/db/client.mjs";
import { authMode } from "../lib/auth/require-account.mjs";
import { readBuildIdentity, readEnvironmentSummary, withDatabaseStatus } from "./_lib/env-flags.js";


function buildHouseWordLimits() {
  const houseWordLimits = {};
  for (const [outputType, range] of Object.entries(OUTPUT_TYPE_LENGTH)) {
    houseWordLimits[outputType] = { min: range.min, max: range.max };
  }
  return houseWordLimits;
}

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS" })) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");

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
