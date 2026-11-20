/**
 * B540. The one automatic first-person change: we, our, and us become the
 * organisation's name. A following verb agrees. A hedge stays.
 */

import { quotationRanges } from "./mechanics-scan.mjs";

const MODAL = new Set(["would", "should", "could", "may", "might", "can", "will", "must", "shall"]);
const BE = { are: "is", were: "was", am: "is" };
const HAVE = { have: "has" };

function sameCase(sample, next) {
  if (sample[0] === sample[0].toUpperCase()) return next[0].toUpperCase() + next.slice(1);
  return next;
}

function conjugate(verb) {
  const lower = verb.toLowerCase();
  if (BE[lower]) return sameCase(verb, BE[lower]);
  if (HAVE[lower]) return sameCase(verb, HAVE[lower]);
  if (MODAL.has(lower)) return verb;
  if (/s$/i.test(verb)) return verb;
  if (/ed$/i.test(verb)) return verb;
  if (/[^aeiou]y$/i.test(verb)) return `${verb.slice(0, -1)}ies`;
  if (/(?:s|sh|ch|x|z|o)$/i.test(verb)) return `${verb}es`;
  return `${verb}s`;
}

function possessive(name) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function shownName(pronoun, name) {
  if (pronoun[0] === pronoun[0].toUpperCase() && name[0] === name[0].toLowerCase()) {
    return name[0].toUpperCase() + name.slice(1);
  }
  return name;
}

function insideQuote(offset, ranges) {
  return ranges.some(([from, to]) => offset >= from && offset < to);
}

/**
 * @param {string} text
 * @param {string} name
 * @returns {{ text: string, changes: Array<{ from: string, to: string }> }}
 */
export function replaceFirstPerson(text, name) {
  if (typeof text !== "string") throw new Error("replaceFirstPerson: draft is missing");
  const org = typeof name === "string" ? name.trim() : "";
  if (!org) throw new Error("replaceFirstPerson: the organisation name is missing");
  const ranges = quotationRanges(text);
  const owned = possessive(org);
  const changes = [];
  let out = text.replace(/\b(We|we)\s+([A-Za-z]+)\b/g, (full, pronoun, verb, offset) => {
    if (pronoun === "US" || insideQuote(offset, ranges)) return full;
    const next = `${shownName(pronoun, org)} ${conjugate(verb)}`;
    if (next !== full) changes.push({ from: full, to: next });
    return next;
  });
  out = out.replace(/\b(Our|our)\b/g, (full, pronoun, offset) => {
    if (insideQuote(offset, ranges)) return full;
    const next = shownName(pronoun, owned);
    changes.push({ from: full, to: next });
    return next;
  });
  out = out.replace(/\b(Us|us)\b/g, (full, pronoun, offset) => {
    if (full === "US" || insideQuote(offset, ranges)) return full;
    const next = shownName(full, org);
    changes.push({ from: full, to: next });
    return next;
  });
  return { text: out, changes };
}
