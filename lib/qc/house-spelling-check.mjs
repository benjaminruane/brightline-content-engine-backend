/**
 * B601. Deterministic British/US spelling notes for house style.
 * Never changes evidence colour. No model call.
 */
import { spellingStored } from "./house-spelling.mjs";

/** Common British → US pairs. Checked both ways. */
export const SPELLING_PAIRS = Object.freeze([
  ["colour", "color"],
  ["favour", "favor"],
  ["favourable", "favorable"],
  ["behaviour", "behavior"],
  ["honour", "honor"],
  ["labour", "labor"],
  ["neighbour", "neighbor"],
  ["organise", "organize"],
  ["organised", "organized"],
  ["organising", "organizing"],
  ["organisation", "organization"],
  ["recognise", "recognize"],
  ["recognised", "recognized"],
  ["specialise", "specialize"],
  ["specialised", "specialized"],
  ["analyse", "analyze"],
  ["analysed", "analyzed"],
  ["centre", "center"],
  ["centred", "centered"],
  ["metre", "meter"],
  ["theatre", "theater"],
  ["programme", "program"],
  ["catalogue", "catalog"],
  ["travelled", "traveled"],
  ["travelling", "traveling"],
  ["cheque", "check"],
  ["licence", "license"],
  ["defence", "defense"],
  ["ageing", "aging"],
  ["judgement", "judgment"],
]);

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Mask quoted spans so spelling inside quotes is not flagged. */
export function maskQuotedSpans(text) {
  return String(text || "")
    .replace(/"[^"]*"/g, (m) => " ".repeat(m.length))
    .replace(/'[^']*'/g, (m) => " ".repeat(m.length));
}

function wordRegex(word) {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
}

/**
 * @returns {Array<{ id: string, word: string, preferred: string, message: string, kind: string }>}
 */
export function findSpellingNotes(draftText, spelling) {
  const stored = spellingStored(spelling);
  const body = maskQuotedSpans(draftText);
  if (!body.trim()) return [];
  const notes = [];
  const seen = new Set();
  for (const [british, us] of SPELLING_PAIRS) {
    const wrong = stored === "US" ? british : us;
    const preferred = stored === "US" ? us : british;
    if (!wordRegex(wrong).test(body)) continue;
    const key = wrong.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push({
      id: `spelling_${key}`,
      kind: "house_spelling",
      word: wrong,
      preferred,
      message: `House spelling is ${stored === "US" ? "US" : "British"} English: write "${preferred}", not "${wrong}".`,
      ruleId: "english_variant",
    });
  }
  return notes;
}

/** Attach spelling notes to a card from its statement text. */
export function applySpellingNotesToCard(card, spelling) {
  const statement = clean(card?.statement || card?.text || "");
  const found = findSpellingNotes(statement, spelling);
  if (!found.length) return card;
  const existing = Array.isArray(card.houseStyleConcerns) ? card.houseStyleConcerns : [];
  const ids = new Set(existing.map((row) => row?.id || row?.ruleId || row?.message));
  const added = [];
  for (const note of found) {
    if (ids.has(note.id) || ids.has(note.message)) continue;
    added.push({
      id: note.id,
      ruleId: note.ruleId,
      kind: note.kind,
      message: note.message,
      surface: note.word,
      preferred: note.preferred,
      severity: "note",
    });
  }
  if (!added.length) return card;
  return {
    ...card,
    houseStyleConcerns: [...existing, ...added],
  };
}
