/**
 * B565. A conflict is red only when a figure, date, name, or outcome differs.
 * Any other difference is amber, and the reason names both forms.
 */

import { elementFound, extractElements } from "./b394-elements.mjs";

const OUTCOMES = [
  ["increased", "decreased"],
  ["increase", "decrease"],
  ["rose", "fell"],
  ["rise", "fall"],
  ["growth", "decline"],
  ["profit", "loss"],
  ["gain", "loss"],
  ["approved", "rejected"],
  ["approval", "rejection"],
  ["completed", "cancelled"],
  ["completed", "canceled"],
  ["above", "below"],
  ["higher", "lower"],
  ["surplus", "deficit"],
  ["beat", "missed"],
  ["won", "lost"],
];

function words(text) {
  return String(text || "")
    .replace(/[\u2018\u2019]/g, "'")
    .split(/\s+/)
    .map((token) => token.replace(/^[^A-Za-z0-9$]+|[^A-Za-z0-9%]+$/g, ""))
    .filter(Boolean);
}

function stem(word) {
  return String(word || "").toLowerCase().replace(/(?:ing|ed|es|s)$/, "");
}

function pluralPair(left, right) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (a === b) return false;
  return b === `${a}s` || b === `${a}es` || a === `${b}s` || a === `${b}es`;
}

function outcomePair(left, right) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return OUTCOMES.some(([one, two]) => (a === one && b === two) || (a === two && b === one));
}

function lcsTable(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      if (left[i].toLowerCase() === right[j].toLowerCase()) rows[i][j] = rows[i + 1][j + 1] + 1;
      else rows[i][j] = Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  return rows;
}

function aligned(sourceWords, draftWords) {
  const table = lcsTable(sourceWords, draftWords);
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < sourceWords.length && j < draftWords.length) {
    if (sourceWords[i].toLowerCase() === draftWords[j].toLowerCase()) {
      pairs.push({ kind: "same", source: sourceWords[i], draft: draftWords[j], sourceAt: i, draftAt: j });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      pairs.push({ kind: "source", source: sourceWords[i], sourceAt: i });
      i += 1;
    } else {
      pairs.push({ kind: "draft", draft: draftWords[j], draftAt: j });
      j += 1;
    }
  }
  while (i < sourceWords.length) {
    pairs.push({ kind: "source", source: sourceWords[i], sourceAt: i });
    i += 1;
  }
  while (j < draftWords.length) {
    pairs.push({ kind: "draft", draft: draftWords[j], draftAt: j });
    j += 1;
  }
  return pairs;
}

function reason(sourceForm, draftForm) {
  const source = String(sourceForm || "").trim();
  const draft = String(draftForm || "").trim();
  if (!source || !draft) return "";
  return `The source says ${source}; the draft says ${draft}.`;
}

function sharedLead(sourceWords, draftWords, sourceAt, draftAt) {
  const lead = [];
  let s = sourceAt - 1;
  let d = draftAt - 1;
  while (s >= 0 && d >= 0 && lead.length < 4) {
    if (sourceWords[s].toLowerCase() !== draftWords[d].toLowerCase()) break;
    lead.unshift(sourceWords[s]);
    s -= 1;
    d -= 1;
  }
  if (s >= 0 && lead.length && /^(?:the|a|an)$/i.test(sourceWords[s])) lead.unshift(sourceWords[s]);
  return lead.join(" ");
}

/**
 * @returns {{ kind: "wording"|"conflict", reason: string } | null}
 */
export function plainDifference(draft, source) {
  const sourceText = String(source || "").trim();
  const draftText = String(draft || "").trim();
  if (!sourceText || !draftText) return null;
  const sourceWords = words(sourceText);
  const draftWords = words(draftText);
  const pairs = aligned(sourceWords, draftWords);
  const plural = [];
  const outcome = [];
  const other = [];
  for (let index = 0; index < pairs.length; index += 1) {
    const row = pairs[index];
    const next = pairs[index + 1];
    if (row.kind === "source" && next && next.kind === "draft") {
      if (outcomePair(row.source, next.draft)) {
        outcome.push([row, next]);
      } else if (pluralPair(row.source, next.draft)) {
        plural.push([row, next]);
      } else if (stem(row.source) !== stem(next.draft)) {
        other.push([row, next]);
      }
      index += 1;
    }
  }
  if (outcome.length) {
    const [left, right] = outcome[0];
    return { kind: "conflict", reason: reason(left.source, right.draft) };
  }
  const elements = extractElements(draftText, draftText, sourceText);
  const missing = elements.find((element) => (
    (element.kind === "figure" || element.kind === "date" || element.kind === "name")
    && !elementFound(element, sourceText)
  ));
  if (missing) {
    const sourceElements = extractElements(sourceText, sourceText, sourceText)
      .filter((element) => element.kind === missing.kind);
    const counterpart = sourceElements.find((element) => element.surface !== missing.surface);
    return {
      kind: "conflict",
      reason: reason(counterpart?.surface || "a different value", missing.surface),
    };
  }
  if (plural.length) {
    const [left, right] = plural[0];
    const lead = sharedLead(sourceWords, draftWords, left.sourceAt, right.draftAt);
    const sourceForm = lead ? `${lead} ${left.source}` : left.source;
    return { kind: "wording", reason: reason(sourceForm, right.draft) };
  }
  if (other.length) {
    const [left, right] = other[0];
    return { kind: "wording", reason: reason(left.source, right.draft) };
  }
  const added = pairs.find((row) => row.kind === "draft");
  if (added) return { kind: "wording", reason: reason("nothing of that kind", added.draft) };
  return null;
}
