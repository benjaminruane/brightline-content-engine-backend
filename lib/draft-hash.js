import { createHash } from "node:crypto";

function normalizeDraftText(value) {
  const raw = typeof value === "string" ? value : "";
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getDraftHashPrefix(draftText) {
  const normalized = normalizeDraftText(draftText);
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 8);
}
