/**
 * Check a stated action against the resulting sentence.
 * Quoted delete/remove must be absent. Quoted keep must be present.
 * No checkable quote: unverified. Do not assert an account.
 */

function normalizeQuotes(text) {
  return String(text ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

function collapse(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractQuoted(text) {
  const normalized = normalizeQuotes(text);
  const rx = /(["'])([^"']+)\1/g;
  const out = [];
  let match;
  while ((match = rx.exec(normalized))) {
    const quote = collapse(match[2]);
    if (quote.length >= 4) out.push(quote);
  }
  return out;
}

const DELETE_RE =
  /\b(delet(?:e|ed|ing|ion)|remov(?:e|ed|ing|al)|drop(?:ped|ping)?|strip(?:ped|ping)?|cut(?:ting)?)\b/i;
const KEEP_RE = /\b(keep|kept|preserv(?:e|ed|ing))\b/i;

function hayHas(hay, needle) {
  return collapse(normalizeQuotes(hay)).toLowerCase().includes(collapse(normalizeQuotes(needle)).toLowerCase());
}

export function verifyAction({ proposedChange, why, resultingSentence } = {}) {
  const change = String(proposedChange ?? "");
  const reason = String(why ?? "");
  const result = String(resultingSentence ?? "");
  const quotes = [...extractQuoted(change), ...extractQuoted(reason)];
  const unique = [];
  const seen = new Set();
  for (const q of quotes) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(q);
  }

  if (unique.length === 0) {
    return { status: "unverified", detail: "No quoted phrase to check against the resulting sentence." };
  }

  const blob = `${change} ${reason}`;
  const claimsDelete = DELETE_RE.test(blob);
  const claimsKeep = KEEP_RE.test(blob);

  if (!claimsDelete && !claimsKeep) {
    return { status: "unverified", detail: "Quoted phrase is present but the action is not a checkable delete or keep." };
  }

  if (claimsDelete) {
    const stillPresent = unique.filter((q) => hayHas(result, q));
    if (stillPresent.length > 0) {
      return {
        status: "mismatch",
        detail: `Stated delete/remove still present in the resulting sentence: ${stillPresent.join("; ")}`,
      };
    }
  }

  if (claimsKeep) {
    const missing = unique.filter((q) => !hayHas(result, q));
    if (missing.length > 0) {
      return {
        status: "mismatch",
        detail: `Stated keep is absent from the resulting sentence: ${missing.join("; ")}`,
      };
    }
  }

  return { status: "checked", detail: "Quoted action matches the resulting sentence." };
}
