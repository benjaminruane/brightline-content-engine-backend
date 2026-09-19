import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function meridianLiveFixturePath() {
  const fromEnv = String(process.env.CE_BACKEND_ROOT || "").trim();
  if (fromEnv) {
    return path.join(fromEnv, "tests/fixtures/b226/1-meridian-reporting-live-2026-09-18.json");
  }
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../fixtures/b226/1-meridian-reporting-live-2026-09-18.json"
  );
}

export function loadMeridianLiveFixture() {
  return JSON.parse(readFileSync(meridianLiveFixturePath(), "utf8"));
}

export function fixtureDraftText(payload) {
  return (Array.isArray(payload?.statements) ? payload.statements : [])
    .map((row) => row.text)
    .join(" ");
}
