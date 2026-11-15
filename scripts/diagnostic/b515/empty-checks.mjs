/**
 * B515 D. Read only. No model call.
 * Counts stored cards whose shown reason says a check came back empty,
 * then records the code paths that write those sentences.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const RUNS = ["b510", "b512", "b513", "b514"];
const MATCH_EMPTY = "This check did not run, because the match came back empty.";
const RESULT_EMPTY = "This check did not run, because the result came back empty.";
const BRANCHES = ["uncheckedLook", "statementVerdict", "refusedReading", "other"];

function rowsOf(doc) {
  if (Array.isArray(doc?.fixtures)) return doc.fixtures;
  if (Array.isArray(doc?.drafts)) return doc.drafts;
  return [];
}

function branchOf(card) {
  const name = typeof card?.setBy?.branch === "string" ? card.setBy.branch.trim() : "";
  if (name === "uncheckedLook" || name === "statementVerdict" || name === "refusedReading") return name;
  return "other";
}

function emptyKind(reason) {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text === MATCH_EMPTY) return "match";
  if (text === RESULT_EMPTY) return "result";
  return "";
}

function tally(doc) {
  const rows = rowsOf(doc);
  let statements = 0;
  let statementsStored = true;
  let raised = 0;
  let reasonStored = 0;
  let reasonMissing = 0;
  const empty = [];
  const rawKeys = new Set();
  for (const row of rows) {
    const total = row?.reviewSummary?.statements;
    if (Number.isInteger(total) && total >= 0) statements += total;
    else statementsStored = false;
    for (const card of Array.isArray(row?.raised) ? row.raised : []) {
      raised += 1;
      if (typeof card?.reason === "string") reasonStored += 1;
      else reasonMissing += 1;
      for (const key of Object.keys(card || {})) {
        if (/raw|finish|error|usage|response/i.test(key)) rawKeys.add(key);
      }
      const kind = emptyKind(card?.reason);
      if (!kind) continue;
      empty.push({
        textType: row.textType || "",
        kind,
        branch: branchOf(card),
        branchStored: typeof card?.setBy?.branch === "string" && card.setBy.branch.trim() !== "",
        noteBucket: typeof card?.noteBucket === "string" ? card.noteBucket : "",
        noteRefused: card?.readingNote?.refused === true,
        slug: typeof card?.evidenceNotReviewedReason === "string" ? card.evidenceNotReviewedReason : "",
      });
    }
  }
  const byBranch = Object.fromEntries(BRANCHES.map((name) => [name, { match: 0, result: 0 }]));
  const buckets = {};
  for (const card of empty) {
    byBranch[card.branch][card.kind] += 1;
    const bucket = card.noteBucket || "(not stored)";
    buckets[bucket] = buckets[bucket] || { match: 0, result: 0 };
    buckets[bucket][card.kind] += 1;
  }
  return {
    drafts: rows.length,
    statements,
    statementsStored: statementsStored && rows.length > 0,
    raised,
    reasonStored,
    reasonMissing,
    empty: empty.length,
    byBranch,
    buckets,
    slugStored: empty.some((card) => card.slug),
    branchMissing: empty.filter((card) => !card.branchStored).length,
    rawKeys: [...rawKeys],
  };
}

function share(count, total, stored) {
  if (!stored) return "not stored. run.json does not keep the reviewed statement total, so the share of all reviewed statements cannot be computed";
  if (!total) return "0 of 0";
  const pct = ((count / total) * 100).toFixed(1);
  return `${count} of ${total} reviewed statements (${pct}%)`;
}

function quoteStillThere(source, needle) {
  return source.includes(needle);
}

async function codePaths() {
  const stage2 = await readFile(path.join(ROOT, "lib/qc/pipeline-v4/stage2-match-sources.mjs"), "utf8");
  const assemble = await readFile(path.join(ROOT, "lib/qc/assemble-card.mjs"), "utf8");
  const worked = await readFile(path.join(ROOT, "lib/qc/worked-record.mjs"), "utf8");
  const reason = await readFile(path.join(ROOT, "lib/qc/reader-reason.mjs"), "utf8");
  const editorial = await readFile(path.join(ROOT, "lib/qc/editorial-compliance-reviewer.mjs"), "utf8");
  const sentences = await readFile(path.join(ROOT, "lib/qc/not-reviewed-reason.mjs"), "utf8");
  const checks = [
    ["stage2 empty confirmation", stage2, 'if (cls === "confirmed" && empty)'],
    ["stage2 parse returns null", stage2, "function safeJsonParse"],
    ["stage2 schema retry returns not_reviewed", stage2, "match failed validation"],
    ["stage2 thrown call returns not_reviewed", stage2, "match call failed"],
    ["assemble copies the match reason", assemble, "notReviewedReasonFromMatches"],
    ["worked record empty confirmation slug", worked, "emptyConfirmationRefused === true"],
    ["reader blank slug sentence", reason, 'NOT_CHECKED_SENTENCES[""]'],
    ["editorial empty result", editorial, "NOT_REVIEWED_REASONS.EMPTY_RESULT"],
    ["editorial empty completion", editorial, "NOT_REVIEWED_REASONS.EMPTY_COMPLETION"],
    ["sentence table", sentences, "empty_confirmation_refused"],
  ];
  return checks.map(([name, source, needle]) => ({
    name,
    present: quoteStillThere(source, needle),
    needle,
  }));
}

function render(runs, paths) {
  const lines = [];
  lines.push("# B515 empty checks");
  lines.push("");
  lines.push("Read only. No model call. Spend USD 0.");
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  for (const run of runs) {
    const row = run.tally;
    lines.push(`### ${run.id}`);
    lines.push("");
    lines.push(`Drafts stored: ${row.drafts}. Raised cards stored: ${row.raised}.`);
    if (row.reasonMissing > 0 && row.reasonStored === 0) {
      lines.push("The shown reason was not stored on these cards. The empty-reason count cannot be made from this file.");
    } else if (row.reasonMissing > 0) {
      lines.push(`Shown reason stored on ${row.reasonStored} raised cards and missing on ${row.reasonMissing}.`);
    } else {
      lines.push(`Shown reason stored on ${row.reasonStored} raised cards.`);
    }
    lines.push(`Cards whose shown reason says a check came back empty: ${row.empty}.`);
    lines.push(`Share of all reviewed statements: ${share(row.empty, row.statements, row.statementsStored)}.`);
    lines.push("By branch. Match empty, then result empty.");
    for (const name of BRANCHES) {
      const cell = row.byBranch[name];
      lines.push(`- ${name}: match ${cell.match}, result ${cell.result}`);
    }
    if (row.branchMissing > 0) {
      lines.push(`${row.branchMissing} empty cards had no stored branch and are counted under other.`);
    }
    lines.push("Reading note bucket on those cards. A stored bucket is the note that was accepted. A missing bucket means this file does not say whether the note was accepted.");
    const names = Object.keys(row.buckets);
    if (!names.length) lines.push("- none");
    for (const name of names) {
      lines.push(`- ${name}: match ${row.buckets[name].match}, result ${row.buckets[name].result}`);
    }
    lines.push(row.slugStored
      ? "The evidence-not-reviewed slug is stored on at least one empty card."
      : "The evidence-not-reviewed slug is not stored on these cards.");
    lines.push(row.rawKeys.length
      ? `Raw response fields kept on the stored cards: ${row.rawKeys.join(", ")}.`
      : "Raw responses, finish reasons, and call errors are not kept on the stored cards.");
    lines.push("");
  }

  lines.push("## Code paths");
  lines.push("");
  lines.push("The two sentences live in `NOT_CHECKED_SENTENCES` in `lib/qc/not-reviewed-reason.mjs`.");
  lines.push("");
  lines.push("`empty_confirmation_refused`: \"This check did not run, because the match came back empty.\"");
  lines.push("`empty_completion`, `empty_result`, and the blank slug: \"This check did not run, because the result came back empty.\"");
  lines.push("");
  lines.push("Match empty. `applyEmptyConfirmationRefusal` in `lib/qc/pipeline-v4/stage2-match-sources.mjs`.");
  lines.push("Condition: classification is `confirmed` and the passage is empty. The call itself returned. The writer then sets classification `not_reviewed` and `emptyConfirmationRefused: true`, and logs `[stage2] empty confirmation refused`.");
  lines.push("This is not a missing response, a parse failure, an empty array, a timeout, a token limit, or a schema refusal. Those other misses take different paths:");
  lines.push("- No provider key: `matchOnePair` returns `not_reviewed` with `matchNotReviewed: true` and does not set `emptyConfirmationRefused`.");
  lines.push("- Parse failure: `safeJsonParse` returns null when the text is empty or is not JSON. `normalizeValidResponse` then returns null. After one retry, `matchOnePair` returns `not_reviewed` with explanation \"Schema validation failed after retry\".");
  lines.push("- A thrown call, including a timeout, returns `not_reviewed` with the call error appended to \"Match call failed\".");
  lines.push("- An unknown classification, which includes a response the schema does not accept, also returns null from `normalizeValidResponse` and becomes the schema path above.");
  lines.push("`notReviewedReasonFromMatches` in `lib/qc/worked-record.mjs` returns `empty_confirmation_refused` only when a match has `emptyConfirmationRefused === true`. Otherwise a schema explanation becomes `schema_invalid`, and anything else becomes `could_not_determine`.");
  lines.push("`assemble-card.mjs` copies that slug onto `evidenceNotReviewedReason` when the display verdict is \"not reviewed\" or the support state is `skipped`, and no reason was set earlier.");
  lines.push("");
  lines.push("Result empty. Nothing on the evidence match path assigns `empty_result` or `empty_completion` to `evidenceNotReviewedReason`.");
  lines.push("`editorial-compliance-reviewer.mjs` assigns `empty_result` when an editorial result has no `editorialVerdict` string, and `empty_completion` when every schema attempt has an empty raw output. Those stamps go on the editorial or compliance reason, not on the evidence reason the card sentence reads.");
  lines.push("`readerEvidenceSentence` in `lib/qc/reader-reason.mjs` shows the blank-slug sentence when the shown state is `note_withheld`, the reading note was not refused, and `evidenceNotReviewedReason` is missing or blank. The blank entry in `NOT_CHECKED_SENTENCES` is the result-empty sentence.");
  lines.push("A stored card whose branch is `statementVerdict` and whose reason is the result-empty sentence is that fallback. The trace did not take `uncheckedLook`, which requires a non-empty evidence reason and a quiet stored state.");
  lines.push("");
  lines.push("B512 `ce1249a2` and B513 `399e3273` changed `lib/qc/reading-review.mjs` (the leave-out list and the context rule). They did not change the stage 2 match prompt, its input size, or its schema.");
  lines.push("B514 `9d673326` changed `lib/qc/pipeline-v4/stage2-match-sources.mjs`. `stage2PromptWithStatus` appends `statusPromptLine(dealStatus)` when the writer confirmed a status, and the cache hash includes that sentence. The empty-confirmation condition was not changed. The schema was not changed. A run with no confirmed status sends the same prompt as before.");
  lines.push("");
  lines.push("Source lines still present:");
  for (const row of paths) {
    lines.push(`- ${row.name}: ${row.present ? "yes" : "MISSING"} (${row.needle})`);
  }
  lines.push("");
  lines.push("## Most likely cause");
  lines.push("");
  lines.push("Two different sentences, two different causes.");
  lines.push("");
  lines.push("The match-empty sentence is a real stage 2 result: the model classified the pair as confirmed and returned an empty passage. `applyEmptyConfirmationRefusal` refuses that confirmation. The stored runs do not keep the raw response, the finish reason, or the slug, so a single card cannot be tied to a provider error. The condition that writes the slug is the empty passage, not a timeout or a token limit.");
  lines.push("");
  lines.push("The result-empty sentence on a card whose stored branch is `statementVerdict` is the blank-slug fallback in `readerEvidenceSentence`. The evidence assembler never writes `empty_result` or `empty_completion` onto the evidence reason. A note_withheld card with no stored evidence reason therefore shows \"the result came back empty\" even when no call returned an empty body. B512 and B513 made more cards note_withheld through the reading note. They did not change the match call. B514 added one status sentence to the match prompt when a status is confirmed. That sentence is not what selects the blank-slug fallback.");
  lines.push("");
  lines.push("Where the stored branch is missing, the file does not say which of the two paths produced the sentence. The rendered reason is the only record.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

const runs = [];
for (const id of RUNS) {
  const file = path.join(ROOT, "scripts/diagnostic", id, "run.json");
  const doc = JSON.parse(await readFile(file, "utf8"));
  runs.push({ id, tally: tally(doc) });
}
const paths = await codePaths();
const missing = paths.filter((row) => !row.present);
if (missing.length) {
  console.warn(`code path quotes missing: ${missing.map((row) => row.name).join(", ")}`);
}
const text = render(runs, paths);
await writeFile(path.join(__dirname, "DIAG.md"), text);
console.log(text);
