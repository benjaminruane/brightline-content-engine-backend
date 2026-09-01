/**
 * Flatten a stored Review card into finding rows. Copied counting rules.
 * Does not import scripts/diagnostic.
 */
import { isEvidenceGap } from "./silence.mjs";
import {
  concernCandidates,
  evidenceCandidates,
  excerptPassage,
  publicThing1,
  thing1FromCandidates,
} from "./thing1.mjs";

function norm(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function cardOf(row) {
  return row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : null;
}

function statementOf(row, card) {
  if (typeof card?.statement === "string" && card.statement) return card.statement;
  if (typeof row?.text === "string" && row.text) return row.text;
  return "";
}

function ruleOf(concern) {
  return (
    (typeof concern?.concernCode === "string" && concern.concernCode.trim()) ||
    (typeof concern?.ruleId === "string" && concern.ruleId.trim()) ||
    (typeof concern?.rule === "string" && concern.rule.trim()) ||
    "unnamed"
  );
}

function baseFinding({
  id,
  statementId,
  statement,
  kind,
  rule,
  thing1State,
  thing1,
  thing2,
  suggestedDirection,
  primaryExcerpt,
  card,
}) {
  return {
    id,
    statementId,
    statement,
    kind,
    rule,
    thing1State,
    thing1: publicThing1(thing1),
    thing2,
    suggestedDirection,
    primaryExcerpt,
    card,
  };
}

export function inventoryStatements(statements) {
  const rows = Array.isArray(statements) ? statements : [];
  const findings = [];

  for (const row of rows) {
    const card = cardOf(row);
    if (!card) continue;
    const statement = statementOf(row, card);
    const sid = String(row.id ?? card.index ?? "");
    const editorial = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
    const compliance = Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [];
    const framing = Array.isArray(card.framingFidelityConcerns) ? card.framingFidelityConcerns : [];
    const recency = Array.isArray(card.sourceRecencyConcerns) ? card.sourceRecencyConcerns : [];

    if (isEvidenceGap(card)) {
      const candidates = evidenceCandidates(card, statement);
      const thing1 = thing1FromCandidates(candidates, statement);
      findings.push(
        baseFinding({
          id: `S${sid}:evidence:${norm(card.supportState) || "gap"}:0`,
          statementId: sid,
          statement,
          kind: "evidence",
          rule: norm(card.supportState) || "gap",
          thing1State: thing1.state,
          thing1: thing1.chosen,
          thing2: typeof card.evidenceSummary === "string" ? card.evidenceSummary : "",
          suggestedDirection: null,
          primaryExcerpt: excerptPassage(card.primaryExcerpt),
          card,
        })
      );
    }

    editorial.forEach((concern, i) => {
      const candidates = concernCandidates(concern, statement);
      const thing1 = thing1FromCandidates(candidates, statement);
      findings.push(
        baseFinding({
          id: `S${sid}:editorial:${ruleOf(concern)}:${i}`,
          statementId: sid,
          statement,
          kind: "editorial",
          rule: ruleOf(concern),
          thing1State: thing1.state,
          thing1: thing1.chosen,
          thing2: typeof concern.note === "string" ? concern.note : "",
          suggestedDirection:
            typeof concern.suggestedDirection === "string" ? concern.suggestedDirection : null,
          primaryExcerpt: excerptPassage(card.primaryExcerpt),
          card,
        })
      );
    });

    compliance.forEach((concern, i) => {
      const candidates = concernCandidates(concern, statement);
      const thing1 = thing1FromCandidates(candidates, statement);
      findings.push(
        baseFinding({
          id: `S${sid}:compliance:${ruleOf(concern)}:${i}`,
          statementId: sid,
          statement,
          kind: "compliance",
          rule: ruleOf(concern),
          thing1State: thing1.state,
          thing1: thing1.chosen,
          thing2: typeof concern.note === "string" ? concern.note : "",
          suggestedDirection:
            typeof concern.suggestedDirection === "string" ? concern.suggestedDirection : null,
          primaryExcerpt: excerptPassage(card.primaryExcerpt),
          card,
        })
      );
    });

    framing.forEach((concern, i) => {
      const candidates = concernCandidates(concern, statement);
      const thing1 = thing1FromCandidates(candidates, statement);
      findings.push(
        baseFinding({
          id: `S${sid}:framing:${ruleOf(concern)}:${i}`,
          statementId: sid,
          statement,
          kind: "framing",
          rule: ruleOf(concern),
          thing1State: thing1.state,
          thing1: thing1.chosen,
          thing2: typeof concern.note === "string" ? concern.note : "",
          suggestedDirection: null,
          primaryExcerpt: excerptPassage(card.primaryExcerpt),
          card,
        })
      );
    });

    recency.forEach((concern, i) => {
      const candidates = concernCandidates(concern, statement);
      const thing1 = thing1FromCandidates(candidates, statement);
      findings.push(
        baseFinding({
          id: `S${sid}:recency:${ruleOf(concern)}:${i}`,
          statementId: sid,
          statement,
          kind: "recency",
          rule: ruleOf(concern),
          thing1State: thing1.state,
          thing1: thing1.chosen,
          thing2: typeof concern.note === "string" ? concern.note : "",
          suggestedDirection: null,
          primaryExcerpt: excerptPassage(card.primaryExcerpt),
          card,
        })
      );
    });
  }

  return findings;
}
