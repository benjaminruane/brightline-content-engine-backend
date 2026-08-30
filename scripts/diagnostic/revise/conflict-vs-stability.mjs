#!/usr/bin/env node
/**
 * Part 4. Do cells flap when the prompt gives competing instructions?
 * Free. No model calls. Reads stored runs and built prompts.
 *
 * Usage: node scripts/diagnostic/revise/conflict-vs-stability.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { buildRevisionPrompt, gatherConcerns } = await import("../../../lib/build-revision-prompt.mjs");
const { directivesOn } = await import("../../../lib/revise-stage1.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ARTEFACTS = [
  { file: "suggest-after-r10-review1.json" },
  { file: "suggest-after-r10-review2.json" },
  { file: "condition-b-review.json" },
  { file: "coverage-gap-review.json" },
];

const KEYS_14 = [
  "suggest-after-r10-review1.json::1::marketing_language_excess",
  "suggest-after-r10-review1.json::1::voice_consistency",
  "suggest-after-r10-review1.json::3::overreach_unsupported_causal",
  "suggest-after-r10-review1.json::7::voice_consistency",
  "suggest-after-r10-review1.json::8::first_person_plural",
  "suggest-after-r10-review2.json::1::voice_consistency",
  "suggest-after-r10-review2.json::3::structural_integrity",
  "suggest-after-r10-review2.json::7::voice_consistency",
  "condition-b-review.json::1::marketing_language_excess",
  "condition-b-review.json::1::voice_consistency",
  "condition-b-review.json::7::voice_consistency",
  "condition-b-review.json::8::voice_consistency",
  "coverage-gap-review.json::3::marketing_language_excess",
  "coverage-gap-review.json::5::overreach_unsupported_causal",
];

const FIRST_PERSON_RULES = new Set(["voice_consistency", "first_person_plural"]);
const CRAFT_CLAIM_RULES = new Set(["overreach_unsupported_causal", "marketing_language_excess", "structural_integrity"]);

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function findStatementArrays(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return out;
  if (Array.isArray(node)) {
    if (node.length && node[0] && node[0].qcCard) out.push(node);
    node.forEach((n) => findStatementArrays(n, out, depth + 1));
    return out;
  }
  for (const v of Object.values(node)) findStatementArrays(v, out, depth + 1);
  return out;
}

function quotedSpans(direction) {
  const out = [];
  const re = /'([^']{3,})'/g;
  let m;
  const s = String(direction ?? "");
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

function contradictoryStyle(dirs) {
  if (dirs.length < 2) return false;
  const texts = dirs.map((d) => String(d.suggestedDirection || d.direction || ""));
  const deletes = [];
  for (const t of texts) {
    const m = /Delete '([^']+)'/i.exec(t);
    if (m) deletes.push(m[1]);
  }
  for (const span of deletes) {
    for (const t of texts) {
      if (/Replace /i.test(t) && t.includes(span)) return true;
    }
  }
  return false;
}

function extractStatementBlock(prompt, index) {
  const re = new RegExp(
    `### Statement \\[${index}\\]\\n([\\s\\S]*?)(?=\\n### Statement \\[|\\nDRAFT TO REVISE:|$)`
  );
  const m = String(prompt ?? "").match(re);
  return m ? m[1] : "";
}

function classify({ item, directive, prompt, promptHasCarveOut }) {
  const block = extractStatementBlock(prompt, item.statementIndex);
  const evidenceUnsupported =
    /Evidence gap \(no_support\)/.test(block) || /\[kind=unsupported\]/.test(block);
  const evidencePartial = /\[kind=partial\]/.test(block);
  const evidenceConflict = /\[kind=conflict\]/.test(block);
  const editors = Array.isArray(item.editorial) ? item.editorial : [];
  const reasons = [];
  let cls = "CLEAN";

  if (contradictoryStyle(editors)) {
    cls = "COMPETING";
    reasons.push("two style directions on one statement cannot both be satisfied (delete span lives in the other destination)");
  }

  const rule = directive.rule;
  if (evidenceUnsupported) {
    const silenceForbidsRewrite = !promptHasCarveOut
      ? /do not rewrite the sentence/i.test(prompt) || /LEAVE THE AUTHOR'S WORDING EXACTLY AS WRITTEN/i.test(prompt)
      : /leave the CLAIM exactly as written/i.test(prompt);
    if (silenceForbidsRewrite && FIRST_PERSON_RULES.has(rule)) {
      if (promptHasCarveOut) {
        reasons.push("silence vs first-person; carve-out names the pronoun operation, so not competing on the claim axis");
      } else {
        cls = "COMPETING";
        reasons.push("kind=unsupported rule (b) says do not rewrite the sentence; style says rewrite it");
      }
    }
    if (silenceForbidsRewrite && CRAFT_CLAIM_RULES.has(rule)) {
      cls = "COMPETING";
      reasons.push("kind=unsupported rule (b) forbids claim edits; this directive edits the claim (causal verb, evaluative delete, or fragment completion)");
    }
  }

  void evidencePartial;
  void evidenceConflict;
  if (reasons.length === 0) reasons.push("no evidence-vs-style clash and no contradictory pair");
  return {
    class: cls,
    reasons,
    evidenceUnsupported,
    editorialCount: editors.length,
    blockHasEvidence: /Evidence gap/.test(block),
    blockHasEditorial: /Editorial \/ style concerns:/.test(block),
  };
}

function hitsOf(rows) {
  const followed = rows.filter((r) => r.followed).length;
  return { followed, of: rows.length };
}

function distinctRevisions(rows) {
  return [...new Set(rows.map((r) => norm(r.revisedStatement || "")).filter(Boolean))];
}

async function loadFixture(file) {
  const json = JSON.parse(await readFile(path.join(__dirname, file), "utf8"));
  const arrays = findStatementArrays(json);
  const statements = arrays.length ? arrays.sort((a, b) => b.length - a.length)[0] : [];
  const origList = statements.map((s) => norm(s.text || s.qcCard?.statement || ""));
  const draft = origList.join("\n\n");
  const concerns = gatherConcerns(statements, null);
  const prompt = buildRevisionPrompt(draft, concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });
  const directives = concerns.flatMap((c) =>
    directivesOn(c).map((d) => ({
      file,
      statementIndex: c.statementIndex,
      statementText: norm(c.statementText),
      rule: d.rule ?? d.kind ?? "unnamed",
      direction: norm(d.suggestedDirection),
      item: c,
    }))
  );
  return { file, concerns, prompt, directives };
}

function keyOf(d) {
  return `${d.file}::${d.statementIndex}::${d.rule}`;
}

function flattenDashes(s) {
  return String(s ?? "").replace(/\u2014|\u2013|\u2212/g, "-");
}

const sweep = JSON.parse(await readFile(path.join(__dirname, "author-confusion-sweep.json"), "utf8"));
const b122 = JSON.parse(await readFile(path.join(__dirname, "b122-rescore.json"), "utf8"));
const b134 = JSON.parse(await readFile(path.join(__dirname, "b134-carve-out-gate.json"), "utf8"));

const fixtures = [];
for (const a of ARTEFACTS) fixtures.push(await loadFixture(a.file));
const allDirs = fixtures.flatMap((fx) => fx.directives);
const promptHasCarveOut = fixtures.some((fx) =>
  /leave the CLAIM exactly as written/i.test(fx.prompt)
);
const promptHasUnamendedSilence = fixtures.some((fx) =>
  /LEAVE THE AUTHOR'S WORDING EXACTLY AS WRITTEN/i.test(fx.prompt)
);

console.log("=== conflict-vs-stability (no model calls) ===\n");
console.log(`HEAD prompt carve-out present: ${promptHasCarveOut}`);
console.log(`HEAD prompt unamended silence definition present: ${promptHasUnamendedSilence}`);
console.log("Disk runs used the unamended definition (b122, b134 reference). Classification below uses that definition, not HEAD, for silence-vs-craft.");
console.log("HEAD is used only to parse per-statement blocks (evidence + editorial lines), which the carve-out does not rewrite.\n");

const classified = [];
for (const key of KEYS_14) {
  const d = allDirs.find((x) => keyOf(x) === key);
  if (!d) {
    classified.push({ key, class: "MISSING", reasons: ["directive not in current gatherConcerns"] });
    continue;
  }
  const fx = fixtures.find((f) => f.file === d.file);
  const fakeUnamendedPrompt = fx.prompt
    .replace(/leave the CLAIM exactly as written and flag it[\s\S]*?or any other craft operation not named above\./, 
      "LEAVE THE AUTHOR'S WORDING EXACTLY AS WRITTEN and flag it. Do not soften it, do not drop the figure, do not cut the clause, do not rewrite the sentence.")
    .replace(/flagged and the CLAIM is never edited\. Rule \(b\)\. A named first-person subject replacement on that statement is still followed\./,
      "flagged and never edited. Rule (b). Leave it and flag.");
  const unamended = classify({
    item: d.item,
    directive: d,
    prompt: fakeUnamendedPrompt,
    promptHasCarveOut: false,
  });
  const amended = classify({
    item: d.item,
    directive: d,
    prompt: fx.prompt,
    promptHasCarveOut: true,
  });
  classified.push({
    key,
    id: `${d.file.replace(".json", "")} S${d.statementIndex} ${d.rule}`,
    direction: d.direction,
    unamended,
    amended,
    siblings: (d.item.editorial || []).map((e) => e.rule ?? e.kind),
    evidenceKind: d.item.evidence?.kind || null,
  });
}

function sweepRows(key) {
  const [file, idx, rule] = key.split("::");
  return (sweep.directiveRuns || []).filter(
    (r) => r.arm === "OLD" && r.file === file && String(r.statementIndex) === idx && r.rule === rule
  );
}
function b122Rows(key) {
  return (b122.scoreRows || []).filter((r) => r.key === key);
}
function b134Rows(key, arm) {
  return (b134.scoreRows || []).filter((r) => r.key === key && r.arm === arm);
}

const rows = classified.map((c) => {
  const sw = sweepRows(c.key);
  const r122 = b122Rows(c.key);
  const ref = b134Rows(c.key, "reference");
  const cut = b134Rows(c.key, "carve-out");
  const swH = hitsOf(sw.map((r) => ({ followed: r.followed })));
  const h122 = hitsOf(r122.map((r) => ({ followed: r.newFollowed })));
  const hRef = hitsOf(ref);
  const hCut = hitsOf(cut);
  const followCounts = [
    ["sweep-OLD", swH],
    ["b122-new", h122],
    ["b134-ref", hRef],
    ["b134-cut", hCut],
  ].filter(([, h]) => h.of > 0);
  const counts = followCounts.map(([, h]) => `${h.followed}/${h.of}`);
  const sameScorerCounts = [
    ["b122-new", h122],
    ["b134-ref", hRef],
    ["b134-cut", hCut],
  ]
    .filter(([, h]) => h.of > 0)
    .map(([, h]) => `${h.followed}/${h.of}`);
  const followMoved = new Set(counts).size > 1;
  const sameScorerFollowMoved = new Set(sameScorerCounts).size > 1;
  const revs122 = distinctRevisions(r122);
  const revsRef = distinctRevisions(ref);
  const revsCut = distinctRevisions(cut);
  const revMoved =
    (revs122.length && revsRef.length && revs122.join("||") !== revsRef.join("||")) ||
    (revsRef.length && revsCut.length && revsRef.join("||") !== revsCut.join("||"));
  const scorerOnly =
    c.key.endsWith("::structural_integrity") ||
    c.key === "suggest-after-r10-review2.json::7::voice_consistency";
  const moved = sameScorerFollowMoved;
  return {
    ...c,
    swH,
    h122,
    hRef,
    hCut,
    followMoved,
    sameScorerFollowMoved,
    revMoved,
    moved,
    scorerOnly,
    revs122,
    revsRef,
    revsCut,
  };
});

console.log("=== 4a classification (unamended prompt, the one the disk runs used) ===\n");
for (const r of rows) {
  console.log(`${r.unamended.class.padEnd(9)} ${r.id}`);
  console.log(`  evidenceKind=${r.evidenceKind} siblings=${JSON.stringify(r.siblings)}`);
  for (const reason of r.unamended.reasons) console.log(`  ${reason}`);
  console.log(`  HEAD/amended class=${r.amended.class}`);
  console.log("");
}

console.log("=== 4b cross-tab ===\n");
for (const r of rows) {
  const move = r.scorerOnly ? "SCORER" : r.moved ? "MOVED " : r.revMoved ? "PROSE " : "STABLE";
  console.log(
    `${move} ${r.unamended.class.padEnd(9)} ${r.id}  sweep ${r.swH.followed}/${r.swH.of}  b122 ${r.h122.followed}/${r.h122.of}  b134-ref ${r.hRef.followed}/${r.hRef.of}  b134-cut ${r.hCut.followed}/${r.hCut.of}`
  );
}

const usable = rows.filter((r) => !r.scorerOnly);
const competing = usable.filter((r) => r.unamended.class === "COMPETING");
const clean = usable.filter((r) => r.unamended.class === "CLEAN");
const competingMoved = competing.filter((r) => r.moved);
const competingStable = competing.filter((r) => !r.moved);
const cleanMoved = clean.filter((r) => r.moved);
const cleanStable = clean.filter((r) => !r.moved);

console.log("\n=== 4c ===");
console.log(`COMPETING n=${competing.length} moved=${competingMoved.length} stable=${competingStable.length}`);
console.log(`CLEAN     n=${clean.length} moved=${cleanMoved.length} stable=${cleanStable.length}`);
console.log("competing-stable (breaks 'competing implies flap'):");
for (const r of competingStable) console.log(`  ${r.id}`);
console.log("clean-moved (breaks 'clean implies stable'):");
for (const r of cleanMoved) console.log(`  ${r.id}`);

let verdict = "FAIL";
if (competingMoved.length && !cleanMoved.length && competingStable.length === 0) verdict = "HOLD";
else if (competingMoved.length && (cleanMoved.length || competingStable.length)) verdict = "PARTLY";
console.log(`hypothesis: ${verdict}`);

const summary = {
  promptHasCarveOut,
  promptHasUnamendedSilence,
  verdict,
  competing: competing.map((r) => r.id),
  competingMoved: competingMoved.map((r) => r.id),
  competingStable: competingStable.map((r) => r.id),
  cleanMoved: cleanMoved.map((r) => r.id),
  cleanStable: cleanStable.map((r) => r.id),
  rows: rows.map((r) => ({
    id: r.id,
    key: r.key,
    unamended: r.unamended.class,
    amended: r.amended.class,
    reasons: r.unamended.reasons,
    evidenceKind: r.evidenceKind,
    moved: r.moved,
    scorerOnly: r.scorerOnly,
    sweep: r.swH,
    b122: r.h122,
    b134ref: r.hRef,
    b134cut: r.hCut,
  })),
};

console.log("\n=== JSON ===");
console.log(JSON.stringify(summary, null, 2));
void flattenDashes;
