/**
 * B354 Part 2. The comment must account for every claim in the sentence.
 *
 * Hard rule: this module never asserts confirmation the evidence layer
 * did not establish. The only reason a clause is added is that the item
 * is present word for word in a passage already matched as confirming
 * for this card.
 *
 * No new extraction logic. Anchors come from extractVerifiableAnchors.
 */
import { extractVerifiableAnchors } from "./claim-spans.mjs";
import { splitSentences } from "./card-honesty.mjs";
import { extractScaleCauseClaims } from "./scale-cause.mjs";
import { normalizePassageForComparison } from "./pipeline-v4/stage2-match-sources.mjs";

const INVENTORY_CAP = 8;
const APPEND_CAP = 2;

function asText(value) {
  return typeof value === "string" ? value : "";
}

function fold(text) {
  return normalizePassageForComparison(text).toLowerCase();
}

/**
 * Anchor texts as a deduped array of strings, order preserved, capped at 8.
 */
export function buildClaimInventory(statementText) {
  const spans = extractVerifiableAnchors(statementText);
  const out = [];
  const seen = new Set();
  function add(item) {
    const t = asText(item).trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  }
  for (const span of Array.isArray(spans) ? spans : []) {
    add(span?.text);
    if (out.length >= INVENTORY_CAP) return out;
  }
  for (const claim of extractScaleCauseClaims(statementText)) {
    add(claim);
    if (out.length >= INVENTORY_CAP) return out;
  }
  return out;
}

/**
 * Inventory items not present in the commentary. Normalised,
 * case-insensitive substring.
 */
export function unaddressedInventory(commentary, inventory) {
  const hay = fold(commentary);
  const items = Array.isArray(inventory) ? inventory : [];
  if (!hay) return items.filter((item) => asText(item).trim());
  const out = [];
  for (const item of items) {
    const needle = fold(item);
    if (!needle) continue;
    if (!hay.includes(needle)) out.push(item);
  }
  return out;
}

function itemInPassages(item, passages) {
  const needle = fold(item);
  if (!needle) return false;
  for (const passage of Array.isArray(passages) ? passages : []) {
    if (fold(passage).includes(needle)) return true;
  }
  return false;
}

function isFigureOrDateItem(item) {
  const t = asText(item).trim();
  if (!t) return false;
  if (/^\d[\d,]*(?:\.\d+)?%$/.test(t)) return true;
  if (/^[£€$]/.test(t)) return true;
  if (/^(?:USD|EUR|GBP)\s*\d/i.test(t)) return true;
  if (/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(t)) return true;
  if (
    /^(?:Q[1-4]\s*20\d{2}|FY\s*20\d{2}|H[12]\s*20\d{2}|20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

function matchSentence(items) {
  if (items.length === 1) {
    if (isFigureOrDateItem(items[0])) return `${items[0]} matches the source.`;
    return `The phrase '${items[0]}' matches the source.`;
  }
  if (items.length === 2) {
    const aFig = isFigureOrDateItem(items[0]);
    const bFig = isFigureOrDateItem(items[1]);
    if (aFig && bFig) return `${items[0]} and ${items[1]} match the source.`;
    if (!aFig && !bFig) {
      return `The phrases '${items[0]}' and '${items[1]}' match the source.`;
    }
    const left = aFig ? items[0] : `The phrase '${items[0]}'`;
    const right = bFig ? items[1] : `the phrase '${items[1]}'`;
    return `${left} and ${right} match the source.`;
  }
  return "";
}

function placeMatchSentence(commentary, clause) {
  const sentences = splitSentences(commentary);
  if (sentences.length === 0) return clause;
  const last = sentences[sentences.length - 1];
  if (/\breviewer should\b/i.test(last)) {
    const before = sentences.slice(0, -1).join("");
    const spacer = before ? " " : "";
    const gap = /^\s/.test(last) ? "" : " ";
    return `${before}${spacer}${clause}${gap}${last}`;
  }
  return `${commentary.replace(/\s+$/, "")} ${clause}`;
}

/**
 * Drop sentences whose only job is to say an inventory item matches the
 * source. Used on non-green cards so a finding is not followed by
 * reassurance (B363 R3).
 */
export function dropMatchTheSourceSentences(commentary) {
  const raw = asText(commentary);
  if (!raw.trim()) return raw;
  const kept = [];
  for (const sentence of splitSentences(raw)) {
    if (/\bmatch(?:es)? the source\.\s*$/i.test(sentence.trim())) continue;
    kept.push(sentence);
  }
  return kept.join("").replace(/^\s+/, "").replace(/\s+$/, "").trim();
}

/**
 * For unaddressed items that appear verbatim in a confirming passage,
 * add one sentence naming at most two of them in inventory order.
 * A trailing reviewer-instruction sentence stays last.
 */
export function appendSourceStatedClauses({ commentary, inventory, confirmingPassages } = {}) {
  const original = asText(commentary);
  const items = Array.isArray(inventory) ? inventory : [];
  if (!original.trim()) {
    return {
      commentary: original,
      appended: [],
      unaddressed: items.filter((item) => asText(item).trim()),
    };
  }
  const missing = unaddressedInventory(original, items);
  const appended = [];
  const unaddressed = [];
  for (const item of missing) {
    const inConfirming = itemInPassages(item, confirmingPassages);
    if (inConfirming && appended.length < APPEND_CAP) {
      appended.push(item);
      continue;
    }
    unaddressed.push(item);
  }
  if (appended.length === 0) {
    return { commentary: original, appended, unaddressed };
  }
  return {
    commentary: placeMatchSentence(original, matchSentence(appended)),
    appended,
    unaddressed,
  };
}
