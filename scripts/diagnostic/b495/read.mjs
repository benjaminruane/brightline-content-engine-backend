/**
 * B495. What the held-back line would show on the two saved B490 passes,
 * and what editorial and compliance say on labelled-correct text.
 * No model call. Imports the B494 replay. Does not copy it.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { joinKey } from "../accuracy/lib.mjs";
import { layerSpoken } from "../lib/leave-alone.mjs";
import {
  keyOf,
  loadCards,
  loadGateContext,
  leaveAloneCards,
  pad,
} from "../b494/replay.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const FRONT = path.resolve(ROOT, "../brightline-content-engine-frontend");
const PASS = [
  ["pass 1", path.join(ROOT, "scripts/diagnostic/b490/pass-1.json")],
  ["pass 2", path.join(ROOT, "scripts/diagnostic/b490/pass-2.json")],
];
const OUT = path.join(HERE, "READ.md");
const DASH = /[\u2013\u2014]/;
const INTERNAL = /\brungs?\b|\bmodality\b/i;
const STOP = new Set([
  "draft", "source", "section", "both", "same", "during", "where", "which",
  "there", "their", "about", "after", "before", "still", "uses", "names",
]);

function shownConcernText(buildConcernText, concern) {
  if (concern?.concernText || concern?.note) return buildConcernText(concern);
  const stored = typeof concern?.text === "string" ? concern.text.trim() : "";
  if (!stored) return null;
  return buildConcernText({ concernText: stored });
}

function concernCode(concern) {
  const code = concern?.concernCode || concern?.rule || concern?.ruleId || "";
  const text = typeof code === "string" ? code.trim() : String(code || "").trim();
  return text || "(no code)";
}

function listedConcerns(card, layer, buildConcernText, storedFormConcernStands, restored, causal) {
  const stored = Array.isArray(card?.[layer]) ? card[layer] : [];
  const extra = layer === "editorialConcerns" ? restored(card) : [];
  return [...stored, ...extra]
    .filter((concern) => (concern?.concernCode || concern?.rule || concern?.ruleId) !== causal)
    .filter((concern) => storedFormConcernStands(concern, card?.statement))
    .map((concern) => ({
      code: concernCode(concern),
      text: shownConcernText(buildConcernText, concern),
    }))
    .filter((row) => row.text);
}

function ascii(text) {
  return String(text || "")
    .replace(/\u2014/g, "[em dash]")
    .replace(/\u2013/g, "[en dash]");
}

function draftCounts(cards, heldBackItems) {
  const byDraft = new Map();
  for (const card of cards) {
    const id = pad(card.fixtureId);
    if (!byDraft.has(id)) byDraft.set(id, []);
    byDraft.get(id).push(card);
  }
  return [...byDraft.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, rows]) => ({ id, count: heldBackItems(rows).length, items: heldBackItems(rows) }));
}

function offending(items) {
  const rows = [];
  for (const item of items) {
    const dash = DASH.test(item.text);
    const internal = INTERNAL.test(item.text);
    if (dash || internal) rows.push({ text: item.text, dash, internal });
  }
  return rows;
}

function indexCards(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = joinKey(card.fixtureId, card.statement, card.occurrence);
    if (map.has(key)) throw new Error(`b495: two cards share ${keyOf(card)}`);
    map.set(key, card);
  }
  return map;
}

function distinctive(why, statement) {
  const note = String(why || "");
  const stmt = String(statement || "").toLowerCase();
  const tokens = [];
  for (const match of note.matchAll(/\d+(?:\.\d+)?%?/g)) {
    if (!stmt.includes(match[0].toLowerCase())) tokens.push(match[0]);
  }
  for (const match of note.matchAll(/\b[A-Z][a-zA-Z]{3,}\b/g)) {
    const word = match[0];
    if (STOP.has(word.toLowerCase())) continue;
    if (stmt.toLowerCase().includes(word.toLowerCase())) continue;
    tokens.push(word);
  }
  return [...new Set(tokens)];
}

function namesFault(text, why, statement) {
  if (!String(why || "").trim()) return "no fault note";
  const tokens = distinctive(why, statement);
  if (!tokens.length) return "does not name";
  const body = String(text || "").toLowerCase();
  const hit = tokens.filter((token) => body.includes(token.toLowerCase()));
  return hit.length ? "names" : "does not name";
}

function faultWhy(statement, faults) {
  return faults
    .filter((fault) => statement.includes(fault.span))
    .map((fault) => fault.why)
    .join(" ");
}

function sectionB(rows, other, listFor) {
  const otherByKey = new Map(other.map((row) => [row.key, row.card]));
  const lines = [];
  let statements = 0;
  for (const row of rows) {
    const layers = layerSpoken(row.card);
    if (layers.evidence.raised) continue;
    if (!layers.editorial.raised && !layers.compliance.raised) continue;
    statements += 1;
    const concerns = [
      ...listFor(row.card, "editorialConcerns").map((item) => ({ ...item, layer: "editorial" })),
      ...listFor(row.card, "complianceConcerns").map((item) => ({ ...item, layer: "compliance" })),
    ];
    const pass2 = otherByKey.get(row.key);
    const pass2Codes = new Set(
      pass2
        ? [
            ...listFor(pass2, "editorialConcerns").map((item) => `editorial:${item.code}`),
            ...listFor(pass2, "complianceConcerns").map((item) => `compliance:${item.code}`),
          ]
        : []
    );
    if (!concerns.length) {
      lines.push(`- ${row.key} | ${ascii(row.card.statement)} | (no shown concern text)`);
      continue;
    }
    for (const concern of concerns) {
      const mark = pass2Codes.has(`${concern.layer}:${concern.code}`) ? "SAME" : "DIFFERS";
      lines.push(`- ${row.key} | ${concern.layer} | ${concern.code} | ${mark}`);
      lines.push(`  statement: ${ascii(row.card.statement)}`);
      lines.push(`  concern: ${ascii(concern.text)}`);
    }
  }
  return { statements, lines };
}

function sectionC(cards, listFor) {
  const counts = new Map();
  const examples = new Map();
  for (const card of cards) {
    for (const concern of listFor(card, "editorialConcerns")) {
      counts.set(concern.code, (counts.get(concern.code) || 0) + 1);
      if (!examples.has(concern.code)) examples.set(concern.code, []);
      const list = examples.get(concern.code);
      if (list.length < 3 && !list.some((item) => item.statement === card.statement)) {
        list.push({ statement: card.statement, text: concern.text });
      }
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { ranked, examples };
}

function sectionD(cards, ctx, listFor) {
  const index = indexCards(cards);
  const faults = ctx.design.faults;
  const lines = [];
  const faulty = ctx.labels.filter((row) => {
    if (row.kind && row.kind !== "statement") return false;
    return row.label === "conflicting" || row.label === "no_support";
  });
  lines.push(`Labelled faulty: ${faulty.length}`);
  for (const row of faulty) {
    const key = joinKey(row.fixtureId, row.statementText, row.occurrence);
    const card = index.get(key);
    lines.push(plantedLine(card, key, row.statementText, faultWhy(row.statementText, faults), listFor));
  }
  lines.push("");
  lines.push(`Group A: ${faults.length}`);
  for (const fault of faults) {
    const mapped = ctx.mapped.mapping.find((item) => item.id === fault.id);
    const key = mapped?.keys?.[0] || "";
    const card = key ? index.get(key) : null;
    if (!key) throw new Error(`b495: group A ${fault.id} has no statement`);
    lines.push(plantedLine(card, `${fault.id} ${key}`, card?.statement || fault.span, fault.why, listFor));
  }
  return lines;
}

function plantedLine(card, id, statement, why, listFor) {
  if (!card) return `- ${id} | card missing`;
  const concerns = [
    ...listFor(card, "editorialConcerns").map((item) => ({ ...item, layer: "editorial" })),
    ...listFor(card, "complianceConcerns").map((item) => ({ ...item, layer: "compliance" })),
  ];
  if (!concerns.length) return `- ${id} | no editorial or compliance concern`;
  const rows = concerns.map((concern) => {
    const named = namesFault(concern.text, why, statement);
    return `${concern.layer} ${concern.code} ${named}: ${ascii(concern.text)}`;
  });
  return `- ${id} | ${rows.join(" || ")}`;
}

async function main() {
  const front = async (file) => import(pathToFileURL(path.join(FRONT, file)).href);
  const { heldBackItems } = await front("src/modules/reading/heldBackLine.js");
  const { buildConcernText } = await front("src/utils/concernDisplayText.js");
  const { storedFormConcernStands } = await front("src/modules/drafting/formConcern.js");
  const { restoredSourceAwarenessConcerns } = await front("src/modules/drafting/sourceAwarenessScope.js");
  const { CAUSAL_EVIDENCE_RULE } = await front("src/modules/drafting/displayVerdictLabels.js");
  const listFor = (card, layer) => listedConcerns(
    card,
    layer,
    buildConcernText,
    storedFormConcernStands,
    restoredSourceAwarenessConcerns,
    CAUSAL_EVIDENCE_RULE
  );
  const ctx = await loadGateContext();
  const loaded = PASS.map(([name, file]) => ({ name, cards: loadCards(file) }));
  const alone = loaded.map((pass) => ({
    name: pass.name,
    rows: leaveAloneCards(pass.cards, ctx.labels, ctx.sourcesByFixture),
  }));

  const lines = [];
  lines.push("# B495 read");
  lines.push("");
  lines.push("Saved B490 passes, read through the current code. No model call. USD 0.");
  lines.push("");
  lines.push("A held-back card is a quiet shown tier that carries wordingNoteWithheld. The count is the line the screen would show.");
  lines.push("A dash is an em dash or an en dash. An internal word is rung, rungs, or modality.");
  lines.push("Section b is a labelled-correct statement whose evidence layer is quiet and whose editorial or compliance layer is raised.");
  lines.push("The concern text is the sentence the card shows. The saved pass stores that sentence on concern.text, and this read passes it through the card's own display function.");
  lines.push("SAME means pass 2 shows that same concern code on that statement. DIFFERS means it does not.");
  lines.push("A planted concern names the fault when its text contains a number or a capitalised name from the fault note that the statement itself does not contain. Otherwise it does not name the fault. The labelled-faulty set uses a group A note when the statement contains that fault's span. Otherwise the label records no fault note.");
  lines.push("");

  const allItems = [];
  const bad = [];
  lines.push("## a. Held back");
  lines.push("");
  for (const pass of loaded) {
    const drafts = draftCounts(pass.cards, heldBackItems);
    const items = drafts.flatMap((draft) => draft.items);
    allItems.push(...items);
    const hits = offending(items);
    bad.push(...hits);
    lines.push(`### ${pass.name}`);
    lines.push("");
    lines.push(`Held-back texts: ${items.length}`);
    for (const draft of drafts) {
      if (draft.count === 0) continue;
      lines.push(`- ${draft.id}: ${draft.count}`);
      for (const item of draft.items) lines.push(`  - ${ascii(item.text)}`);
    }
    lines.push("");
  }
  const dashCount = bad.filter((row) => row.dash).length;
  const internalCount = bad.filter((row) => row.internal).length;
  lines.push(`Dash or internal word: ${bad.length}`);
  lines.push(`Dash: ${dashCount}`);
  lines.push(`Internal word: ${internalCount}`);
  if (bad.length) {
    lines.push("");
    lines.push("Offending texts:");
    for (const row of bad) lines.push(`- ${ascii(row.text)}`);
  }
  lines.push("");

  lines.push("## b. Editorial and compliance on correct text");
  lines.push("");
  const bCounts = [];
  for (let i = 0; i < alone.length; i += 1) {
    const other = alone[i === 0 ? 1 : 0].rows;
    const section = sectionB(alone[i].rows, other, listFor);
    bCounts.push({ name: alone[i].name, count: section.statements });
    lines.push(`### ${alone[i].name}: ${section.statements}`);
    lines.push("");
    if (i === 0) lines.push(...section.lines);
    lines.push("");
  }

  lines.push("## c. Editorial across all cards");
  lines.push("");
  const tops = [];
  for (const pass of loaded) {
    const section = sectionC(pass.cards, listFor);
    tops.push({ name: pass.name, ranked: section.ranked });
    lines.push(`### ${pass.name}`);
    lines.push("");
    for (const [code, count] of section.ranked) lines.push(`- ${code}: ${count}`);
    lines.push("");
    for (const [code] of section.ranked.slice(0, 5)) {
      lines.push(`#### ${code}`);
      lines.push("");
      for (const example of section.examples.get(code) || []) {
        lines.push(`- ${ascii(example.statement)}`);
        lines.push(`  ${ascii(example.text)}`);
      }
      lines.push("");
    }
  }

  lines.push("## d. Editorial on the planted faults");
  lines.push("");
  lines.push("Pass 1.");
  lines.push("");
  lines.push(...sectionD(loaded[0].cards, ctx, listFor));
  lines.push("");

  writeFileSync(OUT, `${lines.join("\n")}\n`);
  console.log(`dash ${dashCount}`);
  console.log(`internal ${internalCount}`);
  console.log(`either ${bad.length}`);
  for (const row of bCounts) console.log(`section b ${row.name}: ${row.count}`);
  for (const pass of tops) {
    const five = pass.ranked.slice(0, 5).map(([code, count]) => `${code} ${count}`).join(", ");
    console.log(`top ${pass.name}: ${five}`);
  }
  console.log(bad.length ? "GATE: frontend blocked" : "GATE: frontend clear");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
