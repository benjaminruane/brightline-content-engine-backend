/**
 * Stage 0 counting rules for the per-finding action-list experiment.
 * Zero model calls. Does not import findingRestsOnSilence.
 */
import { isFirstPersonActorRule } from "../../../../lib/qc/first-person-actor.mjs";
import { classifyDirection, normalizeQuotes } from "../directive-follow-scorer.mjs";

export const ARTEFACTS = [
  {
    stem: "r10-review1",
    file: "suggest-after-r10-review1.json",
  },
  {
    stem: "r10-review2",
    file: "suggest-after-r10-review2.json",
  },
  {
    stem: "coverage-gap",
    file: "coverage-gap-review.json",
  },
  {
    stem: "condition-b",
    file: "condition-b-review.json",
  },
];

export const PHRASE_RATIO_LINE = 0.8;
const MIN_QUOTE_LEN = 4;

const GAP_SUPPORT = new Set([
  "partial",
  "partially_confirmed",
  "not_supported",
  "no_support",
  "conflicting",
]);
const GAP_DISPLAY = new Set([
  "supported_partial",
  "not_supported",
  "no_clear_support",
  "no_support",
  "conflict",
]);

const PROSE_CUES = ["does not align", "does not match", "whereas", "rather than"];

function norm(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function collapse(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cardOf(row) {
  return row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : null;
}

function statementOf(row, card) {
  if (typeof card?.statement === "string" && card.statement) return card.statement;
  if (typeof row?.text === "string" && row.text) return row.text;
  return "";
}

export function isEvidenceGap(card) {
  return GAP_SUPPORT.has(norm(card?.supportState)) || GAP_DISPLAY.has(norm(card?.displayVerdict));
}

function isNoSupportCard(card) {
  const ss = norm(card?.supportState);
  return ss === "not_supported" || ss === "no_support";
}

function extractQuotedSnippets(text, field) {
  const normalized = normalizeQuotes(String(text ?? ""));
  const rx = /(["'])([^"']+)\1/g;
  const out = [];
  let match;
  while ((match = rx.exec(normalized))) {
    const quote = collapse(match[2]);
    if (quote) out.push({ quote, field });
  }
  return out;
}

function locateInStatement(quote, statement) {
  const needle = collapse(normalizeQuotes(quote));
  if (!needle || needle.length < MIN_QUOTE_LEN) return null;
  const hay = String(statement ?? "");
  const at = hay.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return null;
  return {
    startChar: at,
    endChar: at + needle.length,
    quote: hay.slice(at, at + needle.length),
  };
}

function candidateRecord(loc, source, statement) {
  const stmtLen = String(statement ?? "").length;
  const length = loc.endChar - loc.startChar;
  return {
    quote: loc.quote,
    startChar: loc.startChar,
    endChar: loc.endChar,
    length,
    statementLength: stmtLen,
    ratio: stmtLen > 0 ? length / stmtLen : null,
    source,
  };
}

function dedupeCandidates(list) {
  const seen = new Set();
  const out = [];
  for (const row of list) {
    const key = `${row.startChar}:${row.endChar}:${row.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function thing1FromCandidates(candidates, statement) {
  const stmt = String(statement ?? "");
  const proper = candidates.filter((c) => c.length < stmt.length);
  const chosen = (proper.length ? proper : candidates).slice().sort((a, b) => a.length - b.length)[0] || null;
  if (!chosen) {
    return { state: "NONE", chosen: null };
  }
  const whole =
    chosen.length >= stmt.length ||
    chosen.ratio >= PHRASE_RATIO_LINE ||
    (chosen.startChar === 0 && chosen.endChar >= stmt.length);
  if (whole) return { state: "WHOLE_STATEMENT", chosen };
  return { state: "PHRASE", chosen };
}

function evidenceCandidates(card, statement) {
  const out = [];
  for (const span of Array.isArray(card.unsupportedSpans) ? card.unsupportedSpans : []) {
    if (typeof span?.text === "string" && span.text) {
      const loc =
        Number.isFinite(span.start) && Number.isFinite(span.end)
          ? {
              startChar: span.start,
              endChar: span.end,
              quote: statement.slice(span.start, span.end) || span.text,
            }
          : locateInStatement(span.text, statement);
      if (loc) out.push(candidateRecord(loc, "unsupportedSpan", statement));
    }
  }
  for (const { quote } of extractQuotedSnippets(card.evidenceSummary, "evidenceSummary")) {
    const loc = locateInStatement(quote, statement);
    if (loc) out.push(candidateRecord(loc, "evidenceSummary_quote", statement));
  }
  for (const { quote } of extractQuotedSnippets(card.reasoningParagraph, "reasoningParagraph")) {
    const loc = locateInStatement(quote, statement);
    if (loc) out.push(candidateRecord(loc, "reasoningParagraph_quote", statement));
  }
  return dedupeCandidates(out);
}

function concernCandidates(concern, statement) {
  const out = [];
  const spans = Array.isArray(concern?.span) ? concern.span : concern?.span ? [concern.span] : [];
  for (const span of spans) {
    if (!Number.isFinite(span?.startChar) || !Number.isFinite(span?.endChar)) continue;
    const quote = statement.slice(span.startChar, span.endChar);
    out.push(
      candidateRecord(
        { startChar: span.startChar, endChar: span.endChar, quote },
        span.source || "span_field",
        statement
      )
    );
  }
  for (const { quote } of extractQuotedSnippets(concern?.note, "note")) {
    const loc = locateInStatement(quote, statement);
    if (loc) out.push(candidateRecord(loc, "note_quote", statement));
  }
  for (const { quote } of extractQuotedSnippets(concern?.suggestedDirection, "suggestedDirection")) {
    const loc = locateInStatement(quote, statement);
    if (loc) out.push(candidateRecord(loc, "direction_quote", statement));
  }
  return dedupeCandidates(out);
}

function excerptPassage(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.passage === "string" && value.passage.trim()) {
    return value.passage.trim();
  }
  return null;
}

function nonemptyPassage(value) {
  return excerptPassage(value) != null;
}

function classificationsFrom(list, key = "classification") {
  if (!Array.isArray(list)) return [];
  return list.map((row) => norm(row?.[key])).filter(Boolean);
}

function claimRoles(card) {
  const claims = Array.isArray(card?.claims) ? card.claims : [];
  return claims.map((c) => norm(c?.role)).filter(Boolean);
}

const STRUCTURAL_TESTS = [
  {
    id: "supportState_conflicting",
    fire: (card) => norm(card.supportState) === "conflicting" || norm(card.displayVerdict) === "conflict",
  },
  {
    id: "hasConflict",
    fire: (card) => card.hasConflict === true,
  },
  {
    id: "stage2_classification_conflicting",
    fire: (card) => classificationsFrom(card.stage2SourceFingerprints).includes("conflicting"),
  },
  {
    id: "unsupportedSpan_classification_conflicting",
    fire: (card) => classificationsFrom(card.unsupportedSpans).includes("conflicting"),
  },
  {
    id: "supportSpan_classification_conflicting",
    fire: (card) => classificationsFrom(card.supportSpans).includes("conflicting"),
  },
  {
    id: "claim_role_conflict",
    fire: (card) => claimRoles(card).includes("conflict"),
  },
  {
    id: "conflictExcerpt_nonempty",
    fire: (card) => nonemptyPassage(card.conflictExcerpt),
  },
  {
    id: "conflictValues_nonempty",
    fire: (card) => card.conflictValues != null && card.conflictValues !== "",
  },
  {
    id: "conflictEvidence_nonempty",
    fire: (card) => card.conflictEvidence != null && card.conflictEvidence !== "",
  },
];

function proseCueHits(card) {
  const blob = `${card.evidenceSummary || ""} ${card.reasoningParagraph || ""}`.toLowerCase();
  return PROSE_CUES.filter((cue) => blob.includes(cue));
}

function sortEvidence(card) {
  const fired = STRUCTURAL_TESTS.filter((t) => t.fire(card)).map((t) => t.id);
  const cues = proseCueHits(card);
  if (fired.length > 0) {
    return {
      disposition: "ACTION",
      sortChannel: "structural",
      sortTestsFired: fired,
      proseCuesHit: cues,
    };
  }
  if (cues.length > 0) {
    return {
      disposition: "ACTION",
      sortChannel: "prose_cue",
      sortTestsFired: [],
      proseCuesHit: cues,
    };
  }
  return {
    disposition: "ACKNOWLEDGE",
    sortChannel: "silence_no_source_value",
    sortTestsFired: [],
    proseCuesHit: [],
  };
}

function q1Snapshot(card) {
  return {
    supportState: card.supportState ?? null,
    displayVerdict: card.displayVerdict ?? null,
    hasConflict: card.hasConflict === true,
    conflictExcerptPresent: nonemptyPassage(card.conflictExcerpt),
    conflictValues: card.conflictValues ?? null,
    conflictEvidence: card.conflictEvidence ?? null,
    stage2Classifications: classificationsFrom(card.stage2SourceFingerprints),
    unsupportedSpanClassifications: classificationsFrom(card.unsupportedSpans),
    supportSpanClassifications: classificationsFrom(card.supportSpans),
    claimRoles: claimRoles(card),
    decomposed: card.decomposed === true,
  };
}

function ruleOf(concern) {
  return (
    (typeof concern?.concernCode === "string" && concern.concernCode.trim()) ||
    (typeof concern?.ruleId === "string" && concern.ruleId.trim()) ||
    (typeof concern?.rule === "string" && concern.rule.trim()) ||
    "unnamed"
  );
}

function rangesOverlap(a, b) {
  if (!a || !b) return false;
  return a.startChar < b.endChar && b.startChar < a.endChar;
}

function unsatisfiableOnStatement(statement, editorial) {
  const withDir = editorial.filter(
    (c) => typeof c.suggestedDirection === "string" && c.suggestedDirection.trim()
  );
  if (withDir.length < 2) return [];
  const classified = withDir.map((c) => ({
    rule: ruleOf(c),
    direction: c.suggestedDirection.trim(),
    ...classifyDirection(c.suggestedDirection),
  }));
  const hits = [];
  for (let i = 0; i < classified.length; i++) {
    for (let j = i + 1; j < classified.length; j++) {
      const a = classified[i];
      const b = classified[j];
      const aDeletes = [];
      if (a.shape === "delete" && a.src) aDeletes.push(a.src);
      if (a.shape === "replace_and_delete") for (const z of a.alsoDelete || []) aDeletes.push(z);
      const bDeletes = [];
      if (b.shape === "delete" && b.src) bDeletes.push(b.src);
      if (b.shape === "replace_and_delete") for (const z of b.alsoDelete || []) bDeletes.push(z);
      const aKeep = a.shape === "replace" || a.shape === "replace_and_delete" ? a.dst : null;
      const bKeep = b.shape === "replace" || b.shape === "replace_and_delete" ? b.dst : null;
      const deleteInReplacement =
        (aKeep && bDeletes.some((d) => aKeep.toLowerCase().includes(String(d).toLowerCase()))) ||
        (bKeep && aDeletes.some((d) => bKeep.toLowerCase().includes(String(d).toLowerCase())));
      if (deleteInReplacement) {
        hits.push({
          kind: "delete_vs_keep_in_replacement",
          leftRule: a.rule,
          rightRule: b.rule,
          leftDirection: a.direction,
          rightDirection: b.direction,
        });
      }
    }
  }
  return hits;
}

function pushFinding(bucket, finding) {
  bucket.findings.push(finding);
}

export function inventoryArtefact(stem, fileName, payload) {
  const statements = Array.isArray(payload?.statements) ? payload.statements : [];
  const findings = [];
  const unsatisfiable = [];
  const artefact = { stem, file: fileName, findings, unsatisfiable };

  for (const row of statements) {
    const card = cardOf(row);
    if (!card) continue;
    const statement = statementOf(row, card);
    const sid = String(row.id ?? card.index ?? "");
    const editorial = Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [];
    const compliance = Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [];
    const framing = Array.isArray(card.framingFidelityConcerns) ? card.framingFidelityConcerns : [];
    const recency = Array.isArray(card.sourceRecencyConcerns) ? card.sourceRecencyConcerns : [];

    const siblingSeeds = [];

    if (isEvidenceGap(card)) {
      const candidates = evidenceCandidates(card, statement);
      const thing1 = thing1FromCandidates(candidates, statement);
      const sorted = sortEvidence(card);
      const id = `${stem}:S${sid}:evidence:${norm(card.supportState) || "gap"}:0`;
      siblingSeeds.push({ id, chosen: thing1.chosen });
      pushFinding(artefact, {
        id,
        artefact: stem,
        file: fileName,
        statementId: sid,
        statement,
        kind: "evidence",
        rule: norm(card.supportState) || "gap",
        disposition: sorted.disposition,
        sortChannel: sorted.sortChannel,
        sortTestsFired: sorted.sortTestsFired,
        proseCuesHit: sorted.proseCuesHit,
        withheldFromReviser: false,
        thing1State: thing1.state,
        thing1: thing1.chosen,
        thing2: typeof card.evidenceSummary === "string" ? card.evidenceSummary : "",
        suggestedDirection: null,
        primaryExcerpt: excerptPassage(card.primaryExcerpt),
        candidates,
        q1: q1Snapshot(card),
      });
    }

    editorial.forEach((concern, i) => {
      const withheld = isNoSupportCard(card) && !isFirstPersonActorRule(concern.concernCode, concern.rule);
      const candidates = concernCandidates(concern, statement);
      const thing1 = thing1FromCandidates(candidates, statement);
      const id = `${stem}:S${sid}:editorial:${ruleOf(concern)}:${i}`;
      siblingSeeds.push({ id, chosen: thing1.chosen });
      pushFinding(artefact, {
        id,
        artefact: stem,
        file: fileName,
        statementId: sid,
        statement,
        kind: "editorial",
        rule: ruleOf(concern),
        disposition: withheld ? "ACKNOWLEDGE" : "ACTION",
        sortChannel: withheld ? "b138_withheld" : "editorial_card_row",
        sortTestsFired: withheld ? ["b138_withheld"] : ["editorial_concern_visible"],
        proseCuesHit: [],
        withheldFromReviser: withheld,
        thing1State: thing1.state,
        thing1: thing1.chosen,
        thing2: typeof concern.note === "string" ? concern.note : "",
        suggestedDirection:
          typeof concern.suggestedDirection === "string" ? concern.suggestedDirection : null,
        candidates,
        q1: null,
      });
    });

    compliance.forEach((concern, i) => {
      const candidates = concernCandidates(concern, statement);
      const thing1 = thing1FromCandidates(candidates, statement);
      const id = `${stem}:S${sid}:compliance:${ruleOf(concern)}:${i}`;
      siblingSeeds.push({ id, chosen: thing1.chosen });
      pushFinding(artefact, {
        id,
        artefact: stem,
        file: fileName,
        statementId: sid,
        statement,
        kind: "compliance",
        rule: ruleOf(concern),
        disposition: "ACTION",
        sortChannel: "compliance_card_row",
        sortTestsFired: ["compliance_concern_visible"],
        proseCuesHit: [],
        withheldFromReviser: false,
        thing1State: thing1.state,
        thing1: thing1.chosen,
        thing2: typeof concern.note === "string" ? concern.note : "",
        suggestedDirection:
          typeof concern.suggestedDirection === "string" ? concern.suggestedDirection : null,
        candidates,
        q1: null,
      });
    });

    framing.forEach((concern, i) => {
      const candidates = concernCandidates(concern, statement);
      const thing1 = thing1FromCandidates(candidates, statement);
      const id = `${stem}:S${sid}:framing:${ruleOf(concern)}:${i}`;
      siblingSeeds.push({ id, chosen: thing1.chosen });
      pushFinding(artefact, {
        id,
        artefact: stem,
        file: fileName,
        statementId: sid,
        statement,
        kind: "framing",
        rule: ruleOf(concern),
        disposition: "ACKNOWLEDGE",
        sortChannel: "visible_non_reviser_signal",
        sortTestsFired: ["framing_visible"],
        proseCuesHit: [],
        withheldFromReviser: true,
        thing1State: thing1.state,
        thing1: thing1.chosen,
        thing2: typeof concern.note === "string" ? concern.note : "",
        suggestedDirection: null,
        candidates,
        q1: null,
      });
    });

    recency.forEach((concern, i) => {
      const candidates = concernCandidates(concern, statement);
      const thing1 = thing1FromCandidates(candidates, statement);
      const id = `${stem}:S${sid}:recency:${ruleOf(concern)}:${i}`;
      siblingSeeds.push({ id, chosen: thing1.chosen });
      pushFinding(artefact, {
        id,
        artefact: stem,
        file: fileName,
        statementId: sid,
        statement,
        kind: "recency",
        rule: ruleOf(concern),
        disposition: "ACKNOWLEDGE",
        sortChannel: "visible_non_reviser_signal",
        sortTestsFired: ["recency_visible"],
        proseCuesHit: [],
        withheldFromReviser: true,
        thing1State: thing1.state,
        thing1: thing1.chosen,
        thing2: typeof concern.note === "string" ? concern.note : "",
        suggestedDirection: null,
        candidates,
        q1: null,
      });
    });

    const overlaps = [];
    for (let i = 0; i < siblingSeeds.length; i++) {
      for (let j = i + 1; j < siblingSeeds.length; j++) {
        if (rangesOverlap(siblingSeeds[i].chosen, siblingSeeds[j].chosen)) {
          overlaps.push({ left: siblingSeeds[i].id, right: siblingSeeds[j].id });
        }
      }
    }
    for (const finding of findings.filter((f) => f.statementId === sid && f.artefact === stem)) {
      finding.quoteOverlapSiblings = overlaps
        .filter((o) => o.left === finding.id || o.right === finding.id)
        .map((o) => (o.left === finding.id ? o.right : o.left));
    }

    const unsat = unsatisfiableOnStatement(statement, editorial);
    for (const hit of unsat) {
      unsatisfiable.push({
        artefact: stem,
        file: fileName,
        statementId: sid,
        statement,
        ...hit,
      });
    }
  }

  return artefact;
}

export function summariseArtefact(artefact) {
  const findings = artefact.findings;
  const action = findings.filter((f) => f.disposition === "ACTION");
  const ack = findings.filter((f) => f.disposition === "ACKNOWLEDGE");
  const byKind = {};
  for (const f of findings) {
    byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  }
  const actionThing1 = { PHRASE: 0, WHOLE_STATEMENT: 0, NONE: 0 };
  for (const f of action) actionThing1[f.thing1State] = (actionThing1[f.thing1State] || 0) + 1;
  const ackThing1 = { PHRASE: 0, WHOLE_STATEMENT: 0, NONE: 0 };
  for (const f of ack) ackThing1[f.thing1State] = (ackThing1[f.thing1State] || 0) + 1;
  const proseCueAction = action.filter((f) => f.sortChannel === "prose_cue");
  const structuralAction = action.filter((f) => f.sortChannel === "structural");
  return {
    stem: artefact.stem,
    file: artefact.file,
    findingCount: findings.length,
    byKind,
    actionCount: action.length,
    acknowledgeCount: ack.length,
    actionThing1,
    acknowledgeThing1: ackThing1,
    actionPhraseShare: action.length ? actionThing1.PHRASE / action.length : null,
    proseCueActionIds: proseCueAction.map((f) => f.id),
    structuralActionIds: structuralAction.map((f) => f.id),
    otherActionIds: action
      .filter((f) => f.sortChannel !== "prose_cue" && f.sortChannel !== "structural")
      .map((f) => ({ id: f.id, sortChannel: f.sortChannel })),
    withheldAcknowledgeIds: ack.filter((f) => f.withheldFromReviser).map((f) => f.id),
    unsatisfiableCount: artefact.unsatisfiable.length,
  };
}
