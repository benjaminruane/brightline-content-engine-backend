/**
 * B342 throwaway. Read-only. No product writes.
 * Prints the A1 table for both drafts, then a D1 kindNameSame probe on the
 * refinancing passages named in the spec.
 */
import {
  ADDITIVE_BOUNDARIES,
  extractVerifiableAnchors,
  isCompoundCandidate,
  relationalConnectivesIn,
} from "../../../lib/qc/claim-spans.mjs";
import { annotateTokens } from "../../../lib/revise-actions/conflict-engagement.mjs";
import { hasEgregiousMagnitudeGap } from "../../../lib/qc/pipeline-v4/stage2-match-sources.mjs";

const DOCTORED = `For the six months ending 30 June 2024, Action generated record net sales and operating EBITDA. Like-for-like sales growth reached 12% for the period, driven by overall high transaction volume and robust performance in luxury goods, which offset a decline in average selling prices. Performance for the period was achieved despite a continued focus on price increases and the impact of softer seasonal sales due to adverse weather in north western Europe. Meanwhile, the company completed a USD 1.5 billion refinancing, reflecting its robust growth and strong cash generation. Following the refinancing, 3i recycled a portion of its proceeds to acquire an additional holding in the company in April 2024, increasing its stake to 56.7%. On the commercial front, Action added 119 new stores in Denmark over the period and remains on track to meet its target of 330 new stores for by end-2025.`;

const HONEST = `For the six months ending 30 June 2024, Action generated net sales and operating EBITDA ahead of budget and prior year. Like-for-like sales growth reached 9% for the period, driven by overall high transaction volume and robust performance in everyday necessities, which offset a decline in average selling prices. Performance for the period was achieved despite a continued focus on price reductions and the impact of softer seasonal sales due to adverse weather in north western Europe. Meanwhile, the company completed a EUR 2.1 billion refinancing, reflecting its robust growth and strong cash generation. Following the refinancing, 3i recycled a portion of its proceeds to acquire an additional holding in the company in July 2024, increasing its stake to 57.6%. On the commercial front, Action added 119 new stores over the period and remains on track to meet its target of 330 new stores for 2024.`;

const REFINANCE_DRAFT =
  "Meanwhile, the company completed a USD 1.5 billion refinancing, reflecting its robust growth and strong cash generation.";
const REFINANCE_CONTRADICTING =
  "In July 2024, Action successfully completed a refinancing event, raising EUR 2.1 billion in total, including a second US dollar tranche";
const REFINANCE_CONFIRMING =
  "The successful completion of another sizable refinancing reflects Action's impressive growth and strong cash generation.";
const HONEST_REFINANCE =
  "Meanwhile, the company completed a EUR 2.1 billion refinancing, reflecting its robust growth and strong cash generation.";

function splitSentences(draft) {
  return draft
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function boundariesIn(text) {
  return ADDITIVE_BOUNDARIES.filter((b) => text.includes(b));
}

function kindKey(token) {
  const base = token.scale ? `${token.kind}:${token.scale}` : token.kind;
  if (token.kind === "money") {
    return token.currency ? `${base}:${token.currency}` : `${base}:bare`;
  }
  return base;
}

function namesMatch(a, b) {
  if (a.abbrevs.size === 0 && a.content.size === 0) return false;
  if (b.abbrevs.size === 0 && b.content.size === 0) return false;
  if (a.abbrevs.size > 0 || b.abbrevs.size > 0) {
    for (const key of a.abbrevs) {
      if (b.abbrevs.has(key)) return true;
    }
    return false;
  }
  let inter = 0;
  for (const word of a.content) {
    if (b.content.has(word)) inter += 1;
  }
  if (inter === 0) return false;
  const union = new Set([...a.content, ...b.content]);
  return inter / union.size >= 0.6;
}

/** Same body as private kindNameSame in conflict-engagement.mjs. */
function kindNameSame(draft, source) {
  if (kindKey(draft) !== kindKey(source)) return false;
  if (draft.kind === "money" && Boolean(draft.currency) !== Boolean(source.currency)) return false;
  if (draft.component) return false;
  if (source.component) return false;
  if (!namesMatch(draft.names, source.names)) return false;
  return true;
}

function tokenBrief(token) {
  return {
    raw: token.raw,
    kind: token.kind,
    value: token.value,
    currency: token.currency,
    kindKey: kindKey(token),
    names: {
      abbrevs: [...token.names.abbrevs],
      content: [...token.names.content],
    },
    component: token.component === true,
  };
}

function figureDisagreements(statement, passage) {
  const draftTokens = annotateTokens(statement);
  const sourceTokens = annotateTokens(passage);
  const hits = [];
  for (const draft of draftTokens) {
    if (draft.kind === "date") continue;
    for (const source of sourceTokens) {
      if (source.kind === "date") continue;
      const same = kindNameSame(draft, source);
      const namesOnly =
        !draft.component &&
        !source.component &&
        namesMatch(draft.names, source.names) &&
        draft.kind === "money" &&
        source.kind === "money";
      if (same && draft.value !== source.value) {
        hits.push({
          rule: "kindNameSame",
          draft: tokenBrief(draft),
          source: tokenBrief(source),
        });
      } else if (namesOnly && (draft.value !== source.value || kindKey(draft) !== kindKey(source))) {
        hits.push({
          rule: "namesMatch_money_not_kindNameSame",
          draft: tokenBrief(draft),
          source: tokenBrief(source),
          kindNameSame: false,
        });
      }
    }
  }
  return hits;
}

function rowFor(label, sentence) {
  const anchors = extractVerifiableAnchors(sentence).map((a) => `${a.kind}:${a.text}`);
  const boundary = boundariesIn(sentence);
  const connectives = relationalConnectivesIn(sentence);
  return {
    label,
    sentence,
    anchors,
    boundary,
    connectives,
    compound: isCompoundCandidate(sentence),
  };
}

function printTable(title, draft) {
  const sentences = splitSentences(draft);
  console.log(`\n## ${title} (${sentences.length} sentences)\n`);
  sentences.forEach((sentence, i) => {
    const row = rowFor(`S${i + 1}`, sentence);
    console.log(`### ${row.label}`);
    console.log(`sentence: ${row.sentence}`);
    console.log(`anchors (${row.anchors.length}): ${row.anchors.join(" | ") || "(none)"}`);
    console.log(`boundary: ${row.boundary.length ? JSON.stringify(row.boundary) : "(none)"}`);
    console.log(`connectives: ${row.connectives.length ? JSON.stringify(row.connectives) : "(none)"}`);
    console.log(`isCompoundCandidate: ${row.compound}`);
    console.log("");
  });
}

printTable("DOCTORED DRAFT", DOCTORED);
printTable("HONEST DRAFT", HONEST);

console.log("## A1 boundary list (does every token begin with comma or semicolon?)\n");
for (const b of ADDITIVE_BOUNDARIES) {
  const starts = b.startsWith(",") || b.startsWith(";");
  console.log(JSON.stringify(b), "startsWithCommaOrSemicolon=", starts);
}

console.log("\n## D1 kindNameSame on refinancing passages\n");
const cases = [
  ["doctored vs contradicting figure passage", REFINANCE_DRAFT, REFINANCE_CONTRADICTING],
  ["doctored vs confirming qualitative passage", REFINANCE_DRAFT, REFINANCE_CONFIRMING],
  ["honest vs contradicting figure passage (EUR 2.1bn draft vs EUR 2.1bn source)", HONEST_REFINANCE, REFINANCE_CONTRADICTING],
  ["honest vs confirming qualitative passage", HONEST_REFINANCE, REFINANCE_CONFIRMING],
];
for (const [name, statement, passage] of cases) {
  const hits = figureDisagreements(statement, passage);
  const gap = hasEgregiousMagnitudeGap(statement, passage);
  console.log(`### ${name}`);
  console.log(`magnitudeForce would fire: ${gap}`);
  console.log(`draft tokens: ${JSON.stringify(annotateTokens(statement).map(tokenBrief))}`);
  console.log(`passage tokens: ${JSON.stringify(annotateTokens(passage).map(tokenBrief))}`);
  console.log(`disagreements: ${JSON.stringify(hits)}`);
  console.log("");
}
