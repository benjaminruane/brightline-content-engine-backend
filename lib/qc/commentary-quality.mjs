// lib/qc/commentary-quality.mjs
// A6.13 / A6.20: Post-processing — dedupe, 50-word/3-sentence cap, no second action sentence.

/**
 * Collapse repeated consecutive phrases.
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
 * Remove redundant sentence openings.
 */
function collapseRedundantOpenings(text) {
  if (!text || typeof text !== "string") return text;
  const openers = [
    "The source confirms",
    "The source refers to",
    "The sources refer to",
    "The sources do not agree",
    "No source confirms",
    "The source does not",
  ];
  let t = text;
  for (const op of openers) {
    const re = new RegExp(`(${op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.]*\\.)\\s*\\1`, "gi");
    t = t.replace(re, "$1");
  }
  return t.trim();
}

/**
 * Trim exact repetition of a phrase.
 */
function trimRepetition(text) {
  if (!text || typeof text !== "string") return text;
  const phrases = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (phrases.length <= 1) return text;
  const last = phrases[phrases.length - 1];
  const prev = phrases.slice(0, -1);
  if (prev.some((p) => p === last)) return prev.join(" ").trim();
  return text.trim();
}

/**
 * If commentary already contains action guidance, remove a second action sentence (same idea).
 * Action cues: "Add a source", "Split the", "Reconcile", "Reword", "Remove the figure", "Tighten the phrasing".
 */
function removeSecondActionSentence(text) {
  if (!text || typeof text !== "string") return text;
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1) return text;
  const actionCues = /^(add a source|split the|reconcile|reword|remove the|tighten the|keep the wording)/i;
  let foundAction = false;
  const out = [];
  for (const s of sentences) {
    if (actionCues.test(s)) {
      if (foundAction) continue;
      foundAction = true;
    }
    out.push(s);
  }
  return out.join(" ");
}

function wordCount(s) {
  if (!s || typeof s !== "string") return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function sentenceCount(s) {
  if (!s || typeof s !== "string") return 0;
  const t = s.trim();
  if (!t) return 0;
  return t.split(/(?<=[.!?])\s+/).filter(Boolean).length;
}

/** Trim to max words by dropping lower-priority (later) sentences first, then trimming within last sentence. */
function enforceMaxWords(text, maxWords) {
  if (!text || typeof text !== "string") return text;
  if (maxWords == null || maxWords <= 0) return text;
  let t = text.trim();
  if (wordCount(t) <= maxWords) return t;
  const sentences = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return t;
  let out = sentences[0];
  for (let i = 1; i < sentences.length; i++) {
    const candidate = out + " " + sentences[i];
    if (wordCount(candidate) <= maxWords) out = candidate;
    else break;
  }
  if (wordCount(out) <= maxWords) return out;
  const words = out.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ").trim() + "…";
}

/** Keep at most maxSentences; drop later ones. */
function enforceMaxSentences(text, maxSentences) {
  if (!text || typeof text !== "string") return text;
  if (maxSentences == null || maxSentences <= 0) return text;
  const sentences = text.trim().split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= maxSentences) return text.trim();
  return sentences.slice(0, maxSentences).join(" ");
}

/**
 * Apply quality controls. A6.20: max 50 words, max 3 sentences, no duplicate action, no repeated idea.
 * @param {string} commentary
 * @param {Object} [opts] - { maxWords: number, maxSentences: number }
 * @returns {string}
 */
export function applyCommentaryQuality(commentary, opts = {}) {
  if (!commentary || typeof commentary !== "string") return commentary || "";
  const maxWords = opts.maxWords ?? 50;
  const maxSentences = opts.maxSentences ?? 3;
  let t = commentary.trim();
  t = dedupeConsecutivePhrases(t);
  t = collapseRedundantOpenings(t);
  t = trimRepetition(t);
  t = removeSecondActionSentence(t);
  t = enforceMaxSentences(t, maxSentences);
  t = enforceMaxWords(t, maxWords);
  return t.trim();
}
