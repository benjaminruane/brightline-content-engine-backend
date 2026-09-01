/**
 * Banned internal vocabulary in user-facing action-list strings.
 * Scans acknowledge reasons and model explanations. Not the draft sentence.
 */

const BANNED_PHRASES = [
  "silent card",
  "silent cards",
  "silence never edits",
  "the policy",
  "the rule",
  "editorial policy",
  "carve-out",
  "carve out",
  "the reviser",
  "the directive",
  "suggesteddirection",
  "voice_consistency",
  "first_person_plural",
  "marketing_language_excess",
  "overreach_unsupported_causal",
  "no_support",
  "partially_confirmed",
  "supported_partial",
];

const BANNED_WORD_RE = /\b(?:silence|silent|reviser|directive|carve-?out)\b/i;
const TICKET_RE = /\b(?:B\d{2,}(?:\.\d+)*[a-z]?|Pr\d+[a-z]?|PR\d+|R\d+(?:\.\d+)*[a-z]?)\b/;

function normalize(text) {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function findBannedUserCopy(text) {
  const raw = String(text ?? "");
  if (!raw.trim()) return [];
  const lowered = normalize(raw).toLowerCase();
  const hits = [];
  const seen = new Set();
  function add(term) {
    const key = String(term).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(term);
  }
  for (const phrase of BANNED_PHRASES) {
    if (lowered.includes(phrase)) add(phrase);
  }
  const word = raw.match(BANNED_WORD_RE);
  if (word) add(word[0]);
  const ticket = raw.match(TICKET_RE);
  if (ticket) add(ticket[0]);
  return hits;
}
