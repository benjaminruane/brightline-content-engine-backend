/**
 * B411. A proposal is offered only when three steps all pass.
 * The fact is not_found. The model named a replacement. That replacement
 * is in the source by the same equivalence the matcher uses, and it is the
 * same kind of element. QC_PROPOSALS defaults off.
 */
import { elementFound, extractElements } from "./b394-elements.mjs";

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

export function verifiedProposalEntries({ statements, sourceText, enabled } = {}) {
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
      if (!replacementInSource(fact, named, sourceText)) return;
      if (!passage) return;
      const resultingSentence = statementAfterSubstitution(statement, fact, named);
      if (!resultingSentence || resultingSentence === statement) return;
      const entry = {
        id: `proposal:${statementId}:${index}`,
        disposition: "ACTION",
        statementId,
        statement,
        resultingSentence,
        quotedPassage: passage,
        provenance: "verified",
      };
      proposalQuotesSamePassage(card, entry);
      entries.push(entry);
    });
  }
  return entries;
}
