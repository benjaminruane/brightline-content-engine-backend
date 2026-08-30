#!/usr/bin/env node
/**
 * B122 instrument. Zero model calls. Read-only against committed sweep rows
 * and Review fixtures. Builds the real reviser prompts and traces whether
 * each directive text reaches them.
 *
 * Usage: node scripts/diagnostic/revise/b122-directive-breakdown.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildRevisionPrompt, gatherConcerns } from "../../../lib/build-revision-prompt.mjs";
import { concernKind } from "../../../lib/pr9-note-what-from-diff.mjs";
import { buildStage1Prompt } from "../../../lib/revise-stage1-prompt.mjs";
import { paragraphFor, stage1SendDecision } from "../../../lib/revise-stage1.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const SWEEP = path.join(OUT_DIR, "author-confusion-sweep.json");
const REPORT = path.join(OUT_DIR, "b122-directive-breakdown.md");

const ARM_LABEL = { OLD: "whole-draft", NEW: "per-statement" };

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

function statementsOf(json) {
  const arrays = findStatementArrays(json);
  return arrays.length ? arrays.sort((a, b) => b.length - a.length)[0] : [];
}

const nl = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[.,;:]/g, "");

/** Same quote parse the sweep used to score follow. */
function firstQuoted(direction) {
  const m = /'([^']{6,})'/.exec(String(direction ?? ""));
  return m ? m[1] : null;
}

function isWholeStatementSpan(span, statementText) {
  const raw = typeof statementText === "string" ? statementText : "";
  const stmtTrim = raw.trim();
  const text = typeof span?.text === "string" ? span.text : "";
  if (text && text.trim() === stmtTrim && stmtTrim.length > 0) return true;
  const start = span?.start ?? span?.startChar;
  const end = span?.end ?? span?.endChar;
  if (
    typeof start === "number" &&
    Number.isFinite(start) &&
    typeof end === "number" &&
    Number.isFinite(end) &&
    start === 0 &&
    end === raw.length &&
    raw.length > 0
  ) {
    return true;
  }
  return false;
}

function keyOf(r) {
  return `${r.file}::${r.statementIndex}::${r.rule}`;
}

function missPattern(hits, n) {
  if (hits === n) return "none (followed every run)";
  if (hits === 0) return "consistent (missed every run)";
  return `scattered (${hits} of ${n} followed)`;
}

function extractStatementBlock(prompt, statementIndex) {
  const needle = `### Statement [${statementIndex}]`;
  const start = prompt.indexOf(needle);
  if (start < 0) return null;
  const rest = prompt.slice(start);
  const cuts = ["\n### Statement [", "\nDRAFT TO REVISE:", "\n<<<DRAFT"];
  let end = rest.length;
  for (const cut of cuts) {
    const at = rest.indexOf(cut, needle.length);
    if (at >= 0 && at < end) end = at;
  }
  return rest.slice(0, end).trim();
}

function extractFindingBlock(prompt) {
  const start = prompt.indexOf("STATEMENT TO REVISE:");
  return start < 0 ? prompt : prompt.slice(start).trim();
}

async function loadFixture(file) {
  const json = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
  const statements = statementsOf(json);
  const draft = statements.map((s) => String(s.text ?? s.qcCard?.statement ?? "").replace(/\s+/g, " ").trim()).join("\n\n");
  const concerns = gatherConcerns(statements, null);
  const wholePrompt = buildRevisionPrompt(draft, concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });
  return { json, statements, draft, concerns, wholePrompt };
}

function cardFor(statements, statementIndex) {
  return statements.find((s) => Number(s?.qcCard?.index) === Number(statementIndex))?.qcCard || null;
}

function concernFor(concerns, statementIndex) {
  return concerns.find((c) => Number(c.statementIndex) === Number(statementIndex)) || null;
}

function editorialOn(concern, rule) {
  return (concern?.editorial || []).find((e) => e.rule === rule) || null;
}

function quoteRole(direction, statementText, storedTarget) {
  const target = storedTarget || firstQuoted(direction);
  if (!target) {
    return { target: null, role: "no-quote (scored as statement-moved)", originalContainsTarget: false };
  }
  const originalContainsTarget = nl(statementText).includes(nl(target));
  const replaceQuoted = /Replace '([^']+)' with '([^']+)'/i.exec(direction);
  const replaceBare = /Replace '([^']+)' with /i.exec(direction);
  if (replaceQuoted || replaceBare) {
    const src = (replaceQuoted || replaceBare)[1];
    const dst = replaceQuoted ? replaceQuoted[2] : String(direction).slice(replaceBare[0].length).replace(/\.$/, "");
    if (nl(dst).includes(nl(src))) {
      return {
        target,
        role: "replace-dest-contains-src (removal score cannot show a follow)",
        originalContainsTarget,
        src,
        dst,
      };
    }
    return { target, role: "replace-src (removal score is valid)", originalContainsTarget, src, dst };
  }
  if (/^Delete '/i.test(direction)) {
    return { target, role: "delete-src (removal score is valid)", originalContainsTarget };
  }
  if (!originalContainsTarget) {
    return {
      target,
      role: "destination-example (removal score inverts: presence of the rewrite is scored as a miss)",
      originalContainsTarget,
    };
  }
  if (target.length < 20 && originalContainsTarget) {
    return {
      target,
      role: "short-prefix-of-original (likely quote-parse truncation; removal score is uninformative)",
      originalContainsTarget,
    };
  }
  return { target, role: "quoted-src (removal score is valid if the quote is the span to remove)", originalContainsTarget };
}

async function main() {
  const sweep = JSON.parse(await readFile(SWEEP, "utf8"));
  const rows = Array.isArray(sweep.directiveRuns) ? sweep.directiveRuns : [];
  if (rows.length === 0) {
    throw new Error("author-confusion-sweep.json has no directiveRuns; stop before claiming a breakdown");
  }

  const keys = [...new Set(rows.map(keyOf))];
  const arms = ["OLD", "NEW"];
  const perDirective = [];
  for (const k of keys) {
    const sample = rows.find((r) => keyOf(r) === k);
    for (const arm of arms) {
      const rs = rows.filter((r) => keyOf(r) === k && r.arm === arm).sort((a, b) => a.seed - b.seed);
      const hits = rs.filter((r) => r.followed).length;
      perDirective.push({
        key: k,
        file: sample.file,
        statementIndex: sample.statementIndex,
        statementText: sample.statementText,
        rule: sample.rule,
        direction: sample.direction,
        arm,
        armLabel: ARM_LABEL[arm],
        followed: hits,
        total: rs.length,
        seeds: rs.map((r) => ({ seed: r.seed, followed: r.followed, target: r.target, scoredOn: r.scoredOn })),
        miss: missPattern(hits, rs.length),
        storedTarget: rs[0]?.target ?? null,
      });
    }
  }

  const armScore = (arm, pred = () => true) => {
    const rs = rows.filter((r) => r.arm === arm && pred(r));
    return { followed: rs.filter((r) => r.followed).length, of: rs.length };
  };
  const oldAll = armScore("OLD");
  const newAll = armScore("NEW");
  const oldEx = armScore("OLD", (r) => r.rule !== "structural_integrity");
  const newEx = armScore("NEW", (r) => r.rule !== "structural_integrity");
  const oldSi = armScore("OLD", (r) => r.rule === "structural_integrity");
  const newSi = armScore("NEW", (r) => r.rule === "structural_integrity");

  const uniqueDirectives = keys.length;
  const runsPerKey = Math.max(...keys.map((k) => rows.filter((r) => keyOf(r) === k && r.arm === "OLD").length));
  const missingRuns = keys.filter((k) => {
    for (const arm of arms) {
      if (rows.filter((r) => keyOf(r) === k && r.arm === arm).length !== runsPerKey) return true;
    }
    return false;
  });

  const missCounts = keys.map((k) => {
    const oldM = 3 - perDirective.find((d) => d.key === k && d.arm === "OLD").followed;
    const newM = 3 - perDirective.find((d) => d.key === k && d.arm === "NEW").followed;
    const d = perDirective.find((x) => x.key === k);
    return { key: k, rule: d.rule, file: d.file, statementIndex: d.statementIndex, oldMiss: oldM, newMiss: newM, totalMiss: oldM + newM };
  });
  missCounts.sort((a, b) => b.totalMiss - a.totalMiss);

  const fixtures = {};
  for (const file of [...new Set(rows.map((r) => r.file))]) {
    fixtures[file] = await loadFixture(file);
  }

  const siKeys = keys.filter((k) => k.endsWith("::structural_integrity"));
  const siTraces = [];
  for (const k of siKeys) {
    const d = perDirective.find((x) => x.key === k);
    const fx = fixtures[d.file];
    const card = cardFor(fx.statements, d.statementIndex);
    const concern = concernFor(fx.concerns, d.statementIndex);
    const ed = editorialOn(concern, "structural_integrity");
    const finding = (card?.editorialConcerns || []).find((c) => c.concernCode === "structural_integrity") || null;
    const rawUnsupported = Array.isArray(card?.unsupportedSpans) ? card.unsupportedSpans : [];
    const gatheredSpans = concern?.evidence?.unsupportedSpans || [];
    const editorialSpans = Array.isArray(finding?.span) ? finding.span : finding?.span ? [finding.span] : [];
    const kindResolved = concernKind(concern);
    const kindSent = kindResolved || "unsupported";
    const send = concern ? stage1SendDecision(concern) : null;
    const stagePrompt = concern
      ? buildStage1Prompt(concern, kindSent, { paragraph: paragraphFor(fx.draft, concern.statementText) })
      : null;
    const stmtBlock = extractStatementBlock(fx.wholePrompt, d.statementIndex);
    const dirText = finding?.suggestedDirection || d.direction;
    siTraces.push({
      key: k,
      file: d.file,
      statementIndex: d.statementIndex,
      statementText: d.statementText,
      finding,
      editorialOnGathered: ed,
      evidenceKind: concern?.evidence?.kind ?? null,
      evidenceVerdict: card?.supportState || card?.displayVerdict || null,
      rawUnsupported,
      gatheredSpans,
      editorialSpans,
      wholeStatementOnEvidence: rawUnsupported.map((s) => isWholeStatementSpan(s, card?.statement || d.statementText)),
      wholeStatementOnEditorial: editorialSpans.map((s) =>
        isWholeStatementSpan({ ...s, start: s.startChar, end: s.endChar }, card?.statement || d.statementText)
      ),
      kindResolved,
      kindSent,
      send,
      dirInWholePrompt: fx.wholePrompt.includes(dirText),
      dirInStagePrompt: Boolean(stagePrompt && stagePrompt.includes(dirText)),
      stmtBlock,
      findingBlock: stagePrompt ? extractFindingBlock(stagePrompt) : null,
      quote: quoteRole(d.direction, d.statementText, d.storedTarget),
    });
  }

  const worstAfterSi = missCounts.filter((m) => m.rule !== "structural_integrity" && m.totalMiss > 0);
  const worstTraces = [];
  for (const w of worstAfterSi) {
    const d = perDirective.find((x) => x.key === w.key);
    const fx = fixtures[d.file];
    const card = cardFor(fx.statements, d.statementIndex);
    const concern = concernFor(fx.concerns, d.statementIndex);
    const finding = (card?.editorialConcerns || []).find((c) => c.concernCode === d.rule) || null;
    const ed = editorialOn(concern, d.rule);
    const kindResolved = concernKind(concern);
    const kindSent = kindResolved || "unsupported";
    const stagePrompt = concern
      ? buildStage1Prompt(concern, kindSent, { paragraph: paragraphFor(fx.draft, concern.statementText) })
      : null;
    const dirText = finding?.suggestedDirection || d.direction;
    const stmtBlock = extractStatementBlock(fx.wholePrompt, d.statementIndex);
    const rawUnsupported = Array.isArray(card?.unsupportedSpans) ? card.unsupportedSpans : [];
    worstTraces.push({
      key: w.key,
      file: d.file,
      statementIndex: d.statementIndex,
      rule: d.rule,
      statementText: d.statementText,
      direction: d.direction,
      oldFollowed: perDirective.find((x) => x.key === w.key && x.arm === "OLD").followed,
      newFollowed: perDirective.find((x) => x.key === w.key && x.arm === "NEW").followed,
      finding,
      editorialOnGathered: ed,
      evidenceKind: concern?.evidence?.kind ?? null,
      evidenceVerdict: card?.supportState || card?.displayVerdict || null,
      dirInWholePrompt: fx.wholePrompt.includes(dirText),
      dirInStagePrompt: Boolean(stagePrompt && stagePrompt.includes(dirText)),
      stmtBlock,
      findingBlock: stagePrompt ? extractFindingBlock(stagePrompt) : null,
      quote: quoteRole(d.direction, d.statementText, d.storedTarget),
      rawUnsupportedCount: rawUnsupported.length,
      gatheredSpanCount: (concern?.evidence?.unsupportedSpans || []).length,
      editorialSpans: Array.isArray(finding?.span) ? finding.span : [],
      kindResolved,
      kindSent,
    });
  }

  const scoreboard = [
    "SCOREBOARD (stored sweep rows, not re-scored)",
    `whole-draft (OLD)     followed ${oldAll.followed} of ${oldAll.of}   missed ${oldAll.of - oldAll.followed}`,
    `per-statement (NEW)   followed ${newAll.followed} of ${newAll.of}   missed ${newAll.of - newAll.followed}`,
    `structural_integrity  OLD ${oldSi.followed} of ${oldSi.of}    NEW ${newSi.followed} of ${newSi.of}`,
    `excluding structural_integrity`,
    `  whole-draft         followed ${oldEx.followed} of ${oldEx.of}   missed ${oldEx.of - oldEx.followed}`,
    `  per-statement       followed ${newEx.followed} of ${newEx.of}   missed ${newEx.of - newEx.followed}`,
  ].join("\n");

  const breakdownLines = [
    "directive id | arm | followed | total | miss pattern",
    ...perDirective.map((d) => {
      const id = `${d.file.replace(".json", "")} S${d.statementIndex} ${d.rule}`;
      return `${id} | ${d.armLabel} | ${d.followed} | ${d.total} | ${d.miss}`;
    }),
  ].join("\n");

  const distLines = missCounts
    .map(
      (m) =>
        `${m.file.replace(".json", "")} S${m.statementIndex} ${m.rule}  OLD misses ${m.oldMiss}/3  NEW misses ${m.newMiss}/3  total ${m.totalMiss}/6`
    )
    .join("\n");

  const quoteLines = keys
    .map((k) => {
      const d = perDirective.find((x) => x.key === k);
      const q = quoteRole(d.direction, d.statementText, d.storedTarget);
      return `${d.file.replace(".json", "")} S${d.statementIndex} ${d.rule}\n  stored target: ${JSON.stringify(q.target)}\n  original contains target: ${q.originalContainsTarget}\n  quote role: ${q.role}`;
    })
    .join("\n");

  const out = [];
  const emit = (s) => {
    out.push(s);
    console.log(s);
  };

  emit("=== B122 directive breakdown (no model calls) ===\n");
  emit(scoreboard);
  emit("\n=== PART 0 shape ===");
  emit(`unique directives: ${uniqueDirectives}`);
  emit(`runs per directive per arm: ${runsPerKey}`);
  emit(`directiveRuns rows: ${rows.length} (expect ${uniqueDirectives * runsPerKey * 2})`);
  emit(`keys with uneven run counts: ${missingRuns.length ? missingRuns.join(" | ") : "none"}`);
  emit(`structural_integrity unique findings: ${siKeys.length}`);
  emit("\n=== PART 1 per-directive ===");
  emit(breakdownLines);
  emit("\n=== PART 1 miss distribution (sorted worst first) ===");
  emit(distLines);
  emit("\n=== scorer quote parse (same regex as the sweep) ===");
  emit(quoteLines);

  emit("\n=== PART 2 structural_integrity traces ===");
  for (const t of siTraces) {
    emit(`\n-- ${t.file} S${t.statementIndex} --`);
    emit(`statement: ${t.statementText}`);
    emit(`evidence verdict: ${t.evidenceVerdict}  gathered evidence.kind: ${t.evidenceKind}`);
    emit(`finding.note: ${t.finding?.note ?? "(none)"}`);
    emit(`finding.suggestedDirection: ${t.finding?.suggestedDirection ?? "(none)"}`);
    emit(`gathered editorial: ${JSON.stringify(t.editorialOnGathered)}`);
    emit(`raw unsupportedSpans: ${JSON.stringify(t.rawUnsupported)}`);
    emit(`gathered evidence.unsupportedSpans: ${JSON.stringify(t.gatheredSpans)}`);
    emit(`editorial span(s): ${JSON.stringify(t.editorialSpans)}`);
    emit(`whole-statement on evidence spans: ${JSON.stringify(t.wholeStatementOnEvidence)}`);
    emit(`whole-statement on editorial spans: ${JSON.stringify(t.wholeStatementOnEditorial)}`);
    emit(`concernKind: ${t.kindResolved}  stage1 kind sent: ${t.kindSent}`);
    emit(`stage1 send: ${JSON.stringify(t.send)}`);
    emit(`directive text in whole-draft prompt: ${t.dirInWholePrompt}`);
    emit(`directive text in stage1 prompt: ${t.dirInStagePrompt}`);
    emit(`quote role: ${t.quote.role}  target=${JSON.stringify(t.quote.target)}`);
    emit("\nwhole-draft statement block:");
    emit(t.stmtBlock || "(statement block not found)");
    emit("\nstage1 finding block:");
    emit(t.findingBlock || "(stage1 prompt not built)");
  }

  emit("\n=== PART 3 worst after structural_integrity ===");
  for (const t of worstTraces) {
    emit(`\n-- ${t.file} S${t.statementIndex} ${t.rule}  OLD ${t.oldFollowed}/3  NEW ${t.newFollowed}/3 --`);
    emit(`statement: ${t.statementText}`);
    emit(`direction as written: ${t.finding?.suggestedDirection || t.direction}`);
    emit(`evidence verdict: ${t.evidenceVerdict}  gathered evidence.kind: ${t.evidenceKind}`);
    emit(`concernKind: ${t.kindResolved}  stage1 kind sent: ${t.kindSent}`);
    emit(`directive text in whole-draft prompt: ${t.dirInWholePrompt}`);
    emit(`directive text in stage1 prompt: ${t.dirInStagePrompt}`);
    emit(`quote role: ${t.quote.role}  target=${JSON.stringify(t.quote.target)}`);
    emit(`raw unsupportedSpans count: ${t.rawUnsupportedCount}  gathered spans: ${t.gatheredSpanCount}`);
    emit(`editorial span(s): ${JSON.stringify(t.editorialSpans)}`);
    emit("\nwhole-draft statement block:");
    emit(t.stmtBlock || "(statement block not found)");
    emit("\nstage1 finding block:");
    emit(t.findingBlock || "(stage1 prompt not built)");
  }

  const payload = {
    ranAt: new Date().toISOString(),
    modelCalls: 0,
    scoreboard: { oldAll, newAll, oldEx, newEx, oldSi, newSi },
    uniqueDirectives,
    runsPerKey,
    rowCount: rows.length,
    missingRuns,
    perDirective,
    missCounts,
    siTraces: siTraces.map((t) => ({
      ...t,
      stmtBlock: t.stmtBlock,
      findingBlock: t.findingBlock,
    })),
    worstTraces,
  };

  const report = renderReport(payload, scoreboard, breakdownLines, distLines, quoteLines);
  await writeFile(REPORT, report, "utf8");
  emit(`\nwrote ${path.relative(process.cwd(), REPORT)}`);
}

function flattenDashes(s) {
  return String(s ?? "").replace(/\u2014|\u2013|\u2212/g, "-");
}

function fence(s) {
  return "```\n" + flattenDashes(s).trimEnd() + "\n```";
}

function renderReport(payload, scoreboard, breakdownLines, distLines, quoteLines) {
  const si = payload.siTraces[0];
  const worst = payload.worstTraces;
  const lines = [];
  const p = (...a) => lines.push(...a);

  p("# B122 directive follow breakdown");
  p("");
  p("Instrument only. Zero model calls. No production changes.");
  p("Harness `b122-directive-breakdown.mjs`. Measurement rows `author-confusion-sweep.json`.");
  p("");
  p("## Scoreboard");
  p("");
  p(fence(scoreboard));
  p("");
  p("CONFIRMED against `author-confusion-sweep.json` totals.old 29/42 and totals.nw 30/42, and against a recount of `directiveRuns`.");
  p("");

  p("## PART 0. Spec claims, checked against disk");
  p("");
  p("0a. The 29 of 42 and 30 of 42 measurement lives in two places:");
  p("");
  p("- `scripts/diagnostic/revise/author-confusion-sweep.md` lines 104-135 (prose plus the 14-row table).");
  p("- `scripts/diagnostic/revise/author-confusion-sweep.json` `directiveRuns` (84 rows, starting at the first object with `file` `suggest-after-r10-review1.json`) and `totals` (`old.followed` 29 `of` 42, `nw.followed` 30 `of` 42).");
  p("");
  p("The rows are reusable. This harness reads them. It does not re-run Suggest.");
  p("");
  p("0b. 14 directives at three runs is 42 observations per arm. CONFIRMED. Every directive key appears in all three seeds of both arms. `directiveRuns.length` is 84. No directive is missing from a run.");
  p("");
  p("0c. `structural_integrity` is 0 of 3 per arm, not 0 of some other denominator. CONFIRMED. There is one such directive in the corpus (`suggest-after-r10-review2.json` statement 3), observed three times per arm.");
  p("");
  p("Spec errors, not worked around:");
  p("");
  p("- The spec asked for at least two cases carrying a `structural_integrity` directive. The measurement corpus has one unique finding. Part 2 traces both reviser prompts (whole-draft and per-statement) for that one finding.");
  p("- The spec named D2 at L369. The skip itself is `lib/build-revision-prompt.mjs` L374 (`if (norm(rule) === \"underreach_hedging\") continue;`). L368-369 is the start of `collectEditorialConcerns`.");
  p("- OLD in the sweep is the whole-draft path. NEW is per-statement stage 1. The backlog text that says 29 of 42 whole-draft against 30 of 42 per-statement matches those labels.");
  p("");

  p("## PART 1. Per-directive breakdown");
  p("");
  p("From the stored `followed` flags. Not re-judged.");
  p("");
  p(fence(breakdownLines));
  p("");
  p("### Do the misses cluster or spread?");
  p("");
  p("They CLUSTER. Distribution, worst first:");
  p("");
  p(fence(distLines));
  p("");
  p("Eight of fourteen directives are followed on every run of both arms (0 misses of 6). All stored misses sit on the other six:");
  p("");
  p("- `structural_integrity` r10-review2 S3: 6 of 6 misses");
  p("- `voice_consistency` r10-review2 S7: 6 of 6 misses");
  p("- `marketing_language_excess` r10-review1 S1: 5 of 6 misses");
  p("- `voice_consistency` r10-review1 S1: 3 of 6 misses (all on per-statement)");
  p("- `overreach_unsupported_causal` coverage-gap S5: 3 of 6 misses (all on whole-draft)");
  p("- `voice_consistency` r10-review1 S7: 2 of 6 misses (scattered on whole-draft)");
  p("");
  p("Follow rate including `structural_integrity`: whole-draft 29/42 (69%), per-statement 30/42 (71%).");
  p("Follow rate excluding it: whole-draft 29/39 (74%), per-statement 30/39 (77%).");
  p("That one rule is 3 of 13 whole-draft misses and 3 of 12 per-statement misses. Removing it does not close the gap. The remaining misses still cluster, they do not spread evenly over the other thirteen.");
  p("");
  p("### Scorer quote parse, before anyone treats 0/3 as a model miss");
  p("");
  p("The sweep scores follow as 'the first quoted span of 6 or more characters is gone from the revised draft' (`author-confusion-sweep.mjs` `scoreDirective`, the regex `/'([^']{6,})'/`). Stored `target` values:");
  p("");
  p(fence(quoteLines));
  p("");
  p("CONFIRMED: for `structural_integrity` the stored target is `The team`, not the suggested rewrite. The direction quotes `The team's stability is demonstrated...`. The apostrophe in `team's` closes the regex. `The team` is already the opening of the original statement, and of any rewrite that keeps the subject. A follow and a no-op both leave `The team` in the draft, so both score as a miss. The 0 of 3 per arm does not mean the reviser ignored the instruction. The revised drafts were not stored, so this pass cannot say whether the rewrite happened. A billed re-run that keeps the revised text would be required to score this directive honestly.");
  p("");
  p("CONFIRMED: for r10-review2 S7 `voice_consistency` the stored target is `recommends`. The direction is Replace `recommends` with `Halden Group recommends`. The replacement still contains the source word. Follow and ignore both leave `recommends` in the sentence. Same uninformative 0 of 3.");
  p("");

  p("## PART 2. Does `structural_integrity` reach the reviser?");
  p("");
  p("One unique finding in the measurement corpus. Both prompt builders are traced below.");
  p("");
  if (si) {
    p("### 2a. Directive as it exists on the evidence finding, verbatim");
    p("");
    p("File `scripts/diagnostic/revise/suggest-after-r10-review2.json`, statement 3, `qcCard.editorialConcerns[0]`.");
    p("");
    p(fence(
      [
        `concernCode: ${si.finding?.concernCode}`,
        `note: ${si.finding?.note}`,
        `category: ${si.finding?.category}`,
        `suggestedDirection: ${si.finding?.suggestedDirection}`,
        `suggestedRewrite: ${si.finding?.suggestedRewrite}`,
        `span: ${JSON.stringify(si.editorialSpans)}`,
      ].join("\n")
    ));
    p("");
    p("Parent card evidence: `supportState` supported, `displayVerdict` supported_full, `unsupportedSpans` []. This is not an evidence gap. CONFIRMED on the fixture card.");
    p("");
    p("### 2b. Prompts actually built");
    p("");
    p("Whole-draft, `buildRevisionPrompt` in `lib/build-revision-prompt.mjs`. Relevant section:");
    p("");
    p(fence(si.stmtBlock));
    p("");
    p(
      "Directive text appears in the whole-draft prompt: " +
        si.dirInWholePrompt +
        ". CONFIRMED by building the prompt from the committed fixture and searching for the verbatim suggestedDirection."
    );
    p("");
    p(
      "Per-statement, buildStage1Prompt in lib/revise-stage1-prompt.mjs. runStage1 (lib/revise-stage1.mjs L435) sends concernKind(concern) || \"unsupported\". concernKind (lib/pr9-note-what-from-diff.mjs L226-236) skips editorial kind craft and, with no evidence kind on this card, returns null. Kind sent: " +
        si.kindSent +
        ". Send decision: " +
        JSON.stringify(si.send) +
        "."
    );
    p("");
    p(fence(si.findingBlock));
    p("");
    p(
      "Directive text appears in the stage 1 prompt: " +
        si.dirInStagePrompt +
        ". CONFIRMED. It is on the DIRECTION: line. The kind rule wrapped around it is kind \"unsupported\" (leave the author's wording exactly as written when the source is silent), not kind \"craft\" (follow suggestedDirection). That is a competing instruction, not a missing one."
    );
    p("");
    p("### 2c. It is not lost");
    p("");
    p("The directive is not dropped on the way to either prompt. There is no loss function to name. What changes is classification, not presence.");
    p("");
    p("### Named suspect: whole-statement unsupportedSpans stripped by `extractUnsupportedSpansForRevision`");
    p("");
    p("KILLED for this finding.");
    p("");
    p("- `extractUnsupportedSpansForRevision` (`lib/build-revision-prompt.mjs` L285-348) reads `card.unsupportedSpans` and is called from `gatherConcerns` L485 only inside `if (evidenceIsGap)`.");
    p("- This card is not an evidence gap. The call does not run. Gathered `evidence` is null. Gathered `unsupportedSpans` are absent.");
    p("- Raw `unsupportedSpans` on the card are `[]`.");
    p("- The editorial span is `{ startChar: 0, endChar: 8, source: \"note_quote\" }`, which is `The team` (8 characters of an 82-character statement), not a whole-statement span. `collectEditorialConcerns` does not pass spans into the prompt anyway. Only `kind`, `rule`, `note`, `suggestedDirection` are copied (L379-380).");
    p("");
    p("The 40% whole-statement figure is a historical evidence-span fact from `reviser-input-diagnosis.md` (22 of 55 validated spans). It is not a property of this editorial directive.");
    p("");
    p("What the rendered prompt shows instead: the full `suggestedDirection` is present, classified as `kind=craft` on the whole-draft path, and as a `DIRECTION:` line under kind `unsupported` on the per-statement path.");
    p("");
    p("### D2 (`collectEditorialConcerns`)");
    p("");
    p("KILLED as a filter on `structural_integrity`.");
    p("");
    p("`collectEditorialConcerns` (`lib/build-revision-prompt.mjs` L368-382) walks `card.editorialConcerns` only. The only rule-ID skip is L374: `if (norm(rule) === \"underreach_hedging\") continue;`. `structural_integrity` is not `underreach_hedging`. It is classified by `classifyEditorialKind` L350-354: not style_guide, not `marketing_language_excess`, not `materiality`, not a deletion-verb direction, so `kind` is `craft`. It is pushed at L380. D2 does not gate, filter, or reshape this rule.");
    p("");
  }

  p("## PART 3. The other worst directives");
  p("");
  p("Worst after `structural_integrity`, by stored misses. Observation, not cause. Every prompt claim is from `buildRevisionPrompt` / `buildStage1Prompt` on the committed fixture.");
  p("");
  for (const t of worst) {
    p(`### ${t.file.replace(".json", "")} S${t.statementIndex} ${t.rule}  (OLD ${t.oldFollowed}/3, NEW ${t.newFollowed}/3)`);
    p("");
    p("Directive as written:");
    p("");
    p(fence(
      [
        `note: ${t.finding?.note ?? "(none)"}`,
        `suggestedDirection: ${t.finding?.suggestedDirection || t.direction}`,
      ].join("\n")
    ));
    p("");
    p("Directive as it appears in the whole-draft prompt:");
    p("");
    p(fence(t.stmtBlock));
    p("");
    p(`Verbatim direction in whole-draft prompt: ${t.dirInWholePrompt}. In stage 1 prompt: ${t.dirInStagePrompt}.`);
    p(`Evidence on the parent card: ${t.evidenceVerdict}. Gathered evidence.kind: ${t.evidenceKind}. Stage 1 kind sent: ${t.kindSent} (concernKind=${t.kindResolved}).`);
    p(`Quote role: ${t.quote.role}. Stored target: ${JSON.stringify(t.quote.target)}.`);
    p(`unsupportedSpans on the card: ${t.rawUnsupportedCount}. After extractUnsupportedSpansForRevision: ${t.gatheredSpanCount}. Editorial span(s): ${JSON.stringify(t.editorialSpans)}.`);
    p("");
    p("Stage 1 finding block:");
    p("");
    p(fence(t.findingBlock));
    p("");
  }

  p("### Correlations, marked");
  p("");
  p("CONFIRMED: stored misses cluster on six of fourteen directives, not evenly (`author-confusion-sweep.json` `directiveRuns`, Part 1 table).");
  p("");
  p("CONFIRMED: the two 6-of-6 stored misses are the two directives whose quote parse cannot show a follow (`structural_integrity` truncated to `The team`; `voice_consistency` S7 replacement contains `recommends`). File `author-confusion-sweep.json` rows for those keys, field `target`.");
  p("");
  p("CONFIRMED: both of those 6-of-6 directives still have their `suggestedDirection` copied into both prompts (Part 2 and Part 3 traces). A missing instruction is not the stored miss.");
  p("");
  p("CONFIRMED: r10-review2 S7 already names Halden Group in the third person (`On balance, Halden Group believes... and recommends the commitment.`). The Review note calls `recommends` first-person plural, which it is not. Fixture `suggest-after-r10-review2.json` statement 7.");
  p("");
  p("CONFIRMED: r10-review1 S1 carries two directives on one statement (`marketing_language_excess` and `voice_consistency`). Per-statement 0/3 on `voice_consistency` was already explained in `author-confusion-sweep.md` lines 137-158 as a validator rejection (`changed_text_outside_unsupported_span`), not as a missing prompt line. HYPOTHESIS: the 1/3 whole-draft follow on the marketing delete on the same statement is model variance, not a prompt omission. The direction is in the prompt.");
  p("");
  p("CONFIRMED: coverage-gap S5 `overreach_unsupported_causal` is the original 2528a32 0/3-vs-3/3 case. Evidence is `not_supported` with empty `unsupportedSpans`. Stage 1 therefore treats the whole statement as the target (`buildStage1Prompt` L119-122: no named element). Whole-draft kind handling for unsupported silence says leave the wording. HYPOTHESIS: the whole-draft miss is the silence-never-edits rule winning over the editorial direction in a crowded kind-handling block, which is why splitting the call moved this one directive and almost nothing else.");
  p("");
  p("HYPOTHESIS: parent evidence class is not a clean predictor. `structural_integrity` sits on a supported card and still stores 0/3. `voice_consistency` S7 sits on a not_supported card and stores 0/3. Several 3/3 directives also sit on not_supported cards (condition-b S7 and S8). Do not treat verdict class as the cause on this sample.");
  p("");
  p("HYPOTHESIS: directive length is not predictive. The longest direction in the corpus (r10-review1 S1 `voice_consistency`) is 3/3 whole-draft. The shortest (`recommends`) is 0/3 both, and that 0/3 is unscoreable.");
  p("");

  p("## PART 4. Critique");
  p("");
  p("### 4a. What to check about fixtures and controls before any billed run is designed against this finding");
  p("");
  p("Do not design a billed run against the stored 0/3 on `structural_integrity` or on r10-review2 S7 `voice_consistency`. Those two scores cannot move in the direction of 'followed' under the current scorer, even if the model does exactly what the direction says. A new run that reuses `scoreDirective` will reprint the same 0/3 and look like a failed fix.");
  p("");
  p("Fix the scorer first, offline, against the stored directions, with no model call. For `Replace 'X' with 'Y'`, follow means Y is present and the leftover of X is gone. For `Rewrite ... such as 'Y'`, follow means the original fragment is gone or Y is present, and parse quotes so a possessive apostrophe does not close the span. Then, and only then, re-score. If the revised drafts from 2026-08-29 were not kept, the honest next step is one cheap re-run that writes `revisedDraft` per seed, not a 42-cell grid against a broken metric.");
  p("");
  p("Check the Review artefacts themselves. r10-review2 S7 is a bad directive: the sentence is already third-person Halden Group, and the note mis-tags `recommends` as first-person plural. Following it would insert a second `Halden Group`. A follow-rate target that includes this row is a target on Review quality, not on Suggest. r10-review2 S3 `structural_integrity` is a real fragment, but the direction's example is quoted with a possessive, which also truncates the Review span to `The team` (startChar 0, endChar 8). That is a Review quoting bug sitting under the Suggest measurement.");
  p("");
  p("Keep the 8/14 always-followed set as a control, not as padding. If a billed run changes the scorer, re-score those eight first. If any of them drop, the new scorer is wrong.");
  p("");
  p("Do not put per-statement back on the table as the intervention. The original measurement already ruled out competition inside a crowded call, and this pass shows the two 0/3-both rows never measured follow in the first place. The one real arm split that remains is coverage-gap S5 and the r10-review1 S1 validator rejection, both already explained.");
  p("");
  p("### 4b. What in this diagnostic plan would fail or mislead, and what I would have done instead");
  p("");
  p("The plan treated the stored follow flags as a property of the model. They are a property of a regex. Part 1 as specified (reprint the flags, ask cluster vs spread) is still worth doing, and the cluster is real, but two of the six clustered 'misses' are scorer-shaped. A reader who stops at the Part 1 table will walk into a fix for a directive the model may already be following.");
  p("");
  p("The named suspect (whole-statement span stripping) was the right thing to kill, and it is dead here. It was also the wrong first suspect for an editorial rule on a supported card. I would have started with: print the stored `target` field, run the quote regex on every direction, and only then open `extractUnsupportedSpansForRevision`. That is a five-minute check. It would have shown `The team` before any prompt trace.");
  p("");
  p("Asking for two `structural_integrity` cases padded a sample of one. Tracing both prompt builders for the one case is the useful move; inventing a second case from F12 LinkedIn would have mixed a social-format Review watch item (W2) into a Suggest follow measurement.");
  p("");
  p("Building the real prompt is the part of the plan I would keep exactly. The directive does reach the reviser. The interesting residue is not loss, it is kind: whole-draft labels it `craft` and says follow `suggestedDirection`; stage 1 falls through `concernKind` skipping `craft` and sends kind `unsupported`, whose rule says do not touch silent wording. That competing instruction is a real defect in the per-statement path, but it is not what B122's 29/42 number is made of, and production does not enable that path.");
  p("");
  p("I would not have billed a run from this spec. The next unpaid step is a scorer that can tell a follow from a no-op on a possessive rewrite and on a replacement that contains its source. The next billed step, if any, is three seeds on the two unscoreable rows with the revised draft kept.");
  p("");
  p("## Files");
  p("");
  p("- `scripts/diagnostic/revise/b122-directive-breakdown.mjs` this harness");
  p("- `scripts/diagnostic/revise/b122-directive-breakdown.md` this report");
  p("- Reads, does not modify: `author-confusion-sweep.json`, the four Review fixtures, `lib/build-revision-prompt.mjs`, `lib/revise-stage1-prompt.mjs`, `lib/revise-stage1.mjs`, `lib/pr9-note-what-from-diff.mjs`");
  p("");
  p(`Ran at ${payload.ranAt}. Model calls: 0.`);
  p("");

  return flattenDashes(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
