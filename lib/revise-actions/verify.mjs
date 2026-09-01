/**
 * Check a stated action against the resulting sentence.
 * A stated replacement of X with Y: X absent, Y present.
 * Quoted delete/remove must be absent. Quoted keep must be present.
 * No checkable claim: unverified. Do not assert an account.
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

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function extractReplacePairs(text) {
  const normalized = normalizeQuotes(text);
  const pairs = [];
  const seen = new Set();
  const rx = /\breplace\s+(["'])([^"']+)\1\s+with\s+(["'])([^"']+)\3/gi;
  let match;
  while ((match = rx.exec(normalized))) {
    const from = collapse(match[2]);
    const to = collapse(match[4]);
    if (!from || !to) continue;
    const key = `${from.toLowerCase()}=>${to.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ from, to });
  }
  const andRx = /\band\s+(["'])([^"']+)\1\s+with\s+(["'])([^"']+)\3/gi;
  while ((match = andRx.exec(normalized))) {
    const from = collapse(match[2]);
    const to = collapse(match[4]);
    if (!from || !to) continue;
    const key = `${from.toLowerCase()}=>${to.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ from, to });
  }
  return pairs;
}

const DELETE_RE =
  /\b(delet(?:e|ed|ing|ion)|remov(?:e|ed|ing|al)|drop(?:ped|ping)?|strip(?:ped|ping)?|cut(?:ting)?)\b/i;
const KEEP_RE = /\b(keep|kept|preserv(?:e|ed|ing))\b/i;

function hayHas(hay, needle) {
  const h = collapse(normalizeQuotes(hay)).toLowerCase();
  const n = collapse(normalizeQuotes(needle)).toLowerCase();
  if (!n) return true;
  if (!/\s/.test(n) && n.length <= 3) {
    return new RegExp(`\\b${escapeRe(n)}\\b`, "i").test(h);
  }
  return h.includes(n);
}

export function verifyAction({ proposedChange, why, resultingSentence } = {}) {
  const change = String(proposedChange ?? "");
  const reason = String(why ?? "");
  const result = String(resultingSentence ?? "");
  const replacePairs = extractReplacePairs(`${change} ${reason}`);

  if (replacePairs.length > 0) {
    const stillPresent = replacePairs.filter((p) => hayHas(result, p.from)).map((p) => p.from);
    const missing = replacePairs.filter((p) => !hayHas(result, p.to)).map((p) => p.to);
    if (stillPresent.length > 0 || missing.length > 0) {
      const bits = [];
      if (stillPresent.length > 0) {
        bits.push(`stated source still present: ${stillPresent.join("; ")}`);
      }
      if (missing.length > 0) {
        bits.push(`stated replacement absent: ${missing.join("; ")}`);
      }
      return { status: "mismatch", detail: bits.join(". ") };
    }
    return { status: "checked", detail: "Stated replacement matches the resulting sentence." };
  }

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
    return { status: "unverified", detail: "Quoted phrase is present but the action is not a checkable delete, keep, or replace." };
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
