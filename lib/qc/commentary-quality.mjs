// lib/qc/commentary-quality.mjs
// A6.13: Lightweight post-processing for commentary text — remove duplicated phrases, trim robotic repetition, collapse redundant openings.

/**
 * Collapse repeated consecutive phrases (e.g. "The source supports X. The source supports Y." → "The source supports X and Y." or one sentence).
 */
function dedupeConsecutivePhrases(text) {
  if (!text || typeof text !== "string") return text;
  const trimmed = text.trim();
  if (trimmed.length === 0) return trimmed;
  const sentences = trimmed.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1) return trimmed;
  const seen = new Set();
  const out = [];
  for (const s of sentences) {
    const key = s.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.join(" ");
}

/**
 * Remove redundant sentence openings (e.g. "The source supports... The source supports..." → keep one).
 */
function collapseRedundantOpenings(text) {
  if (!text || typeof text !== "string") return text;
  const openers = [
    "The source supports",
    "The sources support",
    "The uploaded sources",
    "No source confirms",
    "The source confirms",
    "Sources discuss",
    "The source does not support",
    "This statement is",
    "This claim is",
  ];
  let t = text;
  for (const op of openers) {
    const re = new RegExp(`(${op}[^.]*\\.)\\s*\\1`, "gi");
    t = t.replace(re, "$1");
  }
  return t.trim();
}

/**
 * Trim robotic repetition: same short phrase repeated (e.g. "Add a source. Add a source.").
 */
function trimRepetition(text) {
  if (!text || typeof text !== "string") return text;
  const phrases = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (phrases.length <= 1) return text;
  const last = phrases[phrases.length - 1];
  const prev = phrases.slice(0, -1);
  if (prev.some((p) => p === last)) {
    return prev.join(" ").trim();
  }
  return text.trim();
}

/**
 * Apply all quality controls. Idempotent-friendly.
 * @param {string} commentary
 * @returns {string}
 */
export function applyCommentaryQuality(commentary) {
  if (!commentary || typeof commentary !== "string") return commentary || "";
  let t = commentary.trim();
  t = dedupeConsecutivePhrases(t);
  t = collapseRedundantOpenings(t);
  t = trimRepetition(t);
  if (t.length > 320) t = t.slice(0, 317).trim() + "…";
  return t.trim();
}
