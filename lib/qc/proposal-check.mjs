/**
 * B411. A proposal is offered only when the fact is not_found, the model
 * named a replacement, and that replacement is in the source by the
 * matcher's equivalence.
 * B412. The offered form is the shortest one that matches the sentence,
 * then the house rules. QC_PROPOSALS stays off: the B412 bar was not met.
 */
import { statementHasFirstPersonPronoun } from "./first-person-actor.mjs";
import { elementFound, extractElements } from "./b394-elements.mjs";
import { houseStyleOfferedToken, offeredTokenLicensedByExcerptTokens } from "../revise-actions/house-style-offer.mjs";
import { tokenizeQuantities } from "../revise-actions/conflict-engagement.mjs";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ABBREVIATIONS = [
  ["CEO", ["chief executive officer", "chief executive"]],
  ["CFO", ["chief financial officer"]],
  ["COO", ["chief operating officer"]],
  ["CIO", ["chief information officer"]],
  ["CTO", ["chief technology officer"]],
];
const CLICHES = [
  "at the end of the day",
  "needless to say",
  "it goes without saying",
  "in today's environment",
  "moving forward",
  "when all is said and done",
  "the bottom line is",
];

export function proposalsEnabled(env = process.env) {
  const raw = env?.QC_PROPOSALS;
  if (raw == null || String(raw).trim() === "") return false;
  const value = String(raw).trim().toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

export function namedReplacement(fact, note, index) {
  if (!fact || fact.status !== "not_found") return null;
  const rows = Array.isArray(note?.replacements) ? note.replacements : [];
  const row = rows.find((item) => item?.index === index);
  if (!row || typeof row.text !== "string") return null;
  const text = row.text.trim();
  if (!text || text.toLowerCase() === "none") return null;
  return text;
}

/**
 * Step 3. Same kind, then the matcher. A date or a figure that cannot be
 * parsed is not offered. A figure offered for a name is not offered.
 * There is no raw string comparison.
 */
export function replacementInSource(fact, replacement, sourceText) {
  if (!fact || fact.status !== "not_found") return false;
  if (typeof replacement !== "string" || !replacement.trim()) return false;
  if (replacement.trim().toLowerCase() === "none") return false;
  if (typeof sourceText !== "string") {
    throw new Error("replacementInSource: source text is missing");
  }
  const surface = replacement.trim();
  const parsed = extractElements(surface, surface, sourceText);
  const sameKind = parsed.filter((element) => element.kind === fact.kind);
  const otherKind = parsed.some((element) => element.kind !== fact.kind);
  if (otherKind && !sameKind.length) return false;
  const element = fact.kind === "date" || fact.kind === "figure"
    ? (sameKind[0] || null)
    : { kind: fact.kind, surface };
  if (!element || element.kind !== fact.kind) return false;
  return elementFound(element, sourceText);
}

function parsedElement(kind, surface, sourceText) {
  return extractElements(surface, surface, sourceText).find((element) => element.kind === kind) || null;
}

function dateParts(key) {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
  if (full) return { kind: "full", year: full[1], month: Number(full[2]), day: Number(full[3]) };
  const month = /^(\d{4})-(\d{2})$/.exec(key || "");
  if (month) return { kind: "month", year: month[1], month: Number(month[2]), day: null };
  if (/^\d{4}$/.test(key || "")) return { kind: "year", year: key, month: null, day: null };
  return null;
}

function isAbbreviation(surface) {
  return /^[A-Z]{2,6}$/.test(String(surface || "").trim());
}

function currencyToken(surface) {
  const match = String(surface || "").match(/^(GBP|USD|EUR|SEK|£|€|\$)\b/i);
  return match ? match[1] : "";
}

function scaleToken(surface) {
  const match = String(surface || "").match(/\b(thousand|million|billion|mn|bn)\b/i);
  return match ? match[1] : "";
}

/**
 * The shortest form that still passes the matcher and matches the shape
 * the sentence already used. A month stays a month. An abbreviation stays
 * an abbreviation. A figure keeps the draft's currency token and scale word.
 * Returns null when no form fits. The source's own longer form is not offered.
 */
export function fitReplacement(fact, named, sourceText) {
  if (!replacementInSource(fact, named, sourceText)) return null;
  if (fact.kind === "date") return fitDate(fact, named, sourceText);
  if (fact.kind === "name") return fitName(fact, named, sourceText);
  if (fact.kind === "figure") return fitFigure(fact, named, sourceText);
  return named.trim();
}

function fitDate(fact, named, sourceText) {
  const written = dateParts(parsedElement("date", fact.surface, sourceText)?.key);
  const source = dateParts(parsedElement("date", named, sourceText)?.key);
  if (!written || !source || !source.month) return null;
  let form = null;
  if (written.kind === "month") form = `${MONTHS[source.month - 1]} ${source.year}`;
  else if (written.kind === "year") form = String(source.year);
  else if (written.kind === "full" && source.day) {
    const dayFirst = /^\d/.test(fact.surface);
    form = dayFirst
      ? `${source.day} ${MONTHS[source.month - 1]} ${source.year}`
      : `${MONTHS[source.month - 1]} ${source.day}, ${source.year}`;
  }
  if (!form || !replacementInSource(fact, form, sourceText)) return null;
  return form;
}

function fitName(fact, named, sourceText) {
  const text = named.trim();
  if (!isAbbreviation(fact.surface)) return text;
  const lower = text.toLowerCase();
  for (const [abbr, phrases] of ABBREVIATIONS) {
    if (lower === abbr.toLowerCase() || phrases.includes(lower)) {
      if (replacementInSource(fact, abbr, sourceText)) return abbr;
    }
  }
  if (isAbbreviation(text) && replacementInSource(fact, text, sourceText)) return text;
  const token = text.split(/\s+/).find((word) => isAbbreviation(word.replace(/[^A-Za-z]/g, "")));
  if (token && replacementInSource(fact, token, sourceText)) return token;
  return null;
}

function fitFigure(fact, named, sourceText) {
  const draft = parsedElement("figure", fact.surface, sourceText);
  const source = parsedElement("figure", named, sourceText);
  if (!draft || !source) return null;
  if (!/\d/.test(source.surface) && !currencyToken(fact.surface) && !scaleToken(fact.surface)) {
    return replacementInSource(fact, source.surface.trim(), sourceText) ? source.surface.trim() : null;
  }
  const number = source.surface.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!number) return null;
  const percent = draft.unit === "percent" ? "%" : "";
  const scale = scaleToken(fact.surface) || scaleToken(source.surface);
  const form = [currencyToken(fact.surface), `${number[0]}${percent}`, scale].filter(Boolean).join(" ");
  return replacementInSource(fact, form, sourceText) ? form : null;
}

export function editorialFindings(sentence) {
  const text = String(sentence || "");
  const findings = [];
  const words = text.trim() ? text.trim().split(/\s+/) : [];
  if (words.length > 40) findings.push("sentence_length");
  const lower = text.toLowerCase();
  if (CLICHES.some((phrase) => lower.includes(phrase))) findings.push("cliche_and_filler");
  if (statementHasFirstPersonPronoun(text)) findings.push("voice_consistency");
  return findings;
}

export function newEditorialFindings(original, resulting) {
  const before = new Set(editorialFindings(original));
  return editorialFindings(resulting).filter((id) => !before.has(id));
}

export function introducedBannedWords(original, resulting, bannedWords) {
  const list = Array.isArray(bannedWords) ? bannedWords : [];
  const hits = (text) => {
    const found = new Set();
    for (const word of list) {
      const token = String(word || "").trim();
      if (!token) continue;
      const pattern = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (pattern.test(text)) found.add(token.toLowerCase());
    }
    return found;
  };
  const before = hits(original);
  return [...hits(resulting)].filter((word) => !before.has(word));
}

export function excerptTokens(passage) {
  if (typeof passage !== "string" || !passage.trim()) return [];
  const quantities = tokenizeQuantities(passage).map((token) => token.raw);
  const elements = extractElements(passage, passage, passage).map((element) => element.surface);
  return [...quantities, ...elements];
}

export function proposalHouseChecks({ statement, fact, replacement, sourceText, passage, bannedWords } = {}) {
  const styled = houseStyleOfferedToken(replacement);
  const reasons = [];
  if (!styled || !replacementInSource(fact, styled, sourceText)) reasons.push("equivalence");
  const resulting = statementAfterSubstitution(statement, fact, styled);
  if (!resulting || resulting === statement) reasons.push("substitution");
  const banned = introducedBannedWords(statement, resulting || statement, bannedWords);
  if (banned.length) reasons.push(`banned:${banned.join(",")}`);
  const editorial = newEditorialFindings(statement, resulting || statement);
  if (editorial.length) reasons.push(`editorial:${editorial.join(",")}`);
  const licensed = offeredTokenLicensedByExcerptTokens(styled, excerptTokens(passage));
  if (!licensed) reasons.push(passage ? "excerpt" : "no_passage");
  return { styled, resulting, reasons, offered: reasons.length === 0 };
}

export function statementAfterSubstitution(statement, fact, replacement) {
  const text = typeof statement === "string" ? statement : "";
  const surface = typeof fact?.surface === "string" ? fact.surface : "";
  const start = Number(fact?.start);
  const end = Number(fact?.end);
  if (!surface || !Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
  const raw = text.slice(start, end);
  let at = 0;
  if (raw !== surface) {
    at = raw.indexOf(surface);
    if (at < 0) return null;
  }
  const from = start + at;
  return text.slice(0, from) + replacement + text.slice(from + surface.length);
}

export function cardPassage(card) {
  const passage = card?.primaryExcerpt;
  return typeof passage === "string" ? passage.trim() : "";
}

/**
 * P38. The proposal quotes the card's passage. A different line throws.
 */
export function proposalQuotesSamePassage(card, proposal) {
  const passage = cardPassage(card);
  const quoted = typeof proposal?.quotedPassage === "string" ? proposal.quotedPassage.trim() : "";
  const statementId = card?.index ?? proposal?.statementId ?? "?";
  if (!passage || !quoted) {
    throw new Error(`proposal on statement ${statementId} is missing the card passage`);
  }
  if (passage !== quoted) {
    throw new Error(`proposal on statement ${statementId} quotes a different line from the card`);
  }
  return true;
}

export function verifiedProposalEntries({ statements, sourceText, enabled, bannedWords } = {}) {
  if (!enabled) return [];
  if (typeof sourceText !== "string" || !sourceText.trim()) {
    throw new Error("verifiedProposalEntries: source text is missing");
  }
  const entries = [];
  for (const row of Array.isArray(statements) ? statements : []) {
    const card = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : row;
    const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
    const statement = (typeof card?.statement === "string" && card.statement) || (typeof row?.text === "string" ? row.text : "");
    const statementId = String(card?.index ?? row?.id ?? "");
    const passage = cardPassage(card);
    facts.forEach((fact, index) => {
      const named = namedReplacement(fact, card?.readingNote, index);
      if (!named) return;
      const fitted = fitReplacement(fact, named, sourceText);
      if (!fitted) return;
      const check = proposalHouseChecks({
        statement,
        fact,
        replacement: fitted,
        sourceText,
        passage,
        bannedWords,
      });
      if (!check.offered) return;
      const entry = {
        id: `proposal:${statementId}:${index}`,
        disposition: "ACTION",
        statementId,
        statement,
        resultingSentence: check.resulting,
        quotedPassage: passage,
        provenance: "verified",
      };
      proposalQuotesSamePassage(card, entry);
      entries.push(entry);
    });
  }
  return entries;
}
