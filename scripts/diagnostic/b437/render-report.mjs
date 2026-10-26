/**
 * Write scripts/diagnostic/b437/ACCURACY.md from the stored passes.
 * No model calls.
 *
 *   node scripts/diagnostic/b437/render-report.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function flat(value) {
  return String(value ?? "")
    .replace(/\u2014|\u2013/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(value, max) {
  const text = flat(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

async function main() {
  const extract = JSON.parse(await readFile(path.join(__dirname, "extract.json"), "utf8"));
  const estimate = JSON.parse(await readFile(path.join(__dirname, "estimate.json"), "utf8"));
  const spend = JSON.parse(await readFile(path.join(__dirname, "spend.json"), "utf8"));
  const pass1 = JSON.parse(await readFile(path.join(__dirname, "pass-1.json"), "utf8"));
  const pass2 = JSON.parse(await readFile(path.join(__dirname, "pass-2.json"), "utf8"));
  const wall1 = pass1.fixtures.reduce((n, row) => n + (row.wallMs || 0), 0);
  const wall2 = pass2.fixtures.reduce((n, row) => n + (row.wallMs || 0), 0);
  const lines = [];

  lines.push("# Accuracy");
  lines.push("");
  lines.push("B437 was free. This file is the measurement. Nothing in the product was changed.");
  lines.push("");
  lines.push("## What the numbers say");
  lines.push("");
  lines.push("The product catches the planted faults. It does not leave clean sentences alone.");
  lines.push("");
  lines.push("Catch, both passes: **10 of 11**. The same fault was missed both times. Nine of the ten findings contain the planted number or the planted name. The tenth, F18 completion, does not contain the planted span as a substring. Its evidence line says the transaction has not been completed and the source is still a recommendation. That is the planted fault, named in other words.");
  lines.push("");
  lines.push("Leave-alone is a confirmed label on which every layer stayed quiet. Pass 1: **20 of 74**. Pass 2: **21 of 74**. The other 54 on pass 1, and 53 on pass 2, were spoken about by at least one layer. Evidence by itself confirmed 60 of those 74 on both passes. The last evidence-only reading, 6 October, confirmed 65 of 74. This is not that run. Editorial, compliance, commentary, and the note were on, and five counts is outside the old identical-run noise of three counts. The evidence verdict moved. It is not only the note.");
  lines.push("");
  lines.push("On pass 1 the note spoke on 38 of the 74, editorial on 20, evidence on 14, compliance on 6, recency on 4, and framing on 3. A statement can be in more than one of those. Thirty-five of the note's 38 are wording notes. A wording note says the claim is the same and the words are not. On a sentence the label calls confirmed, that is the product talking in order to agree.");
  lines.push("");
  lines.push("Run to run, all 261 statements: **37 changed at all, 0 changed tier**. Tier is the sentence tier: demands, light, or quiet. Six changed display verdict. Six changed support state. Thirty-three changed concern codes, and that set includes the note's bucket. The sentence label did not change on any statement. Failure mode 10, on this set, is unstable notes and style codes. It is not an unstable tier, and it is not an unstable catch.");
  lines.push("");
  lines.push("## What I would fix first to raise the catch rate");
  lines.push("");
  lines.push("One sentence. \"EBITDA margin is 11.1% on trailing twelve months revenue of EUR 76 million.\" The source says both figures. The opening recommendation says the margin is approximately 13%. A later section says 11.1% on EUR 76 million. The card confirms the statement and quotes the 11.1% sentence. The note's bucket is none. Editorial and compliance are empty. The product found the sentence that agrees and never used the sentence that does not.");
  lines.push("");
  lines.push("The fix is in evidence. A match on one figure is not confirmation when the same source states another figure for the same result. Do not ask the note to catch this. The note already speaks on 38 of the 74 clean statements.");
  lines.push("");
  lines.push("## What I would fix first to lower the false alarms");
  lines.push("");
  lines.push("Stop the note from writing when its own bucket would be wording. That is 35 of the 54 alarms on pass 1, and the note's text says the claim did not change. That fix does not catch the EBITDA miss. The two fixes do not have to fight. They fight if the way we chase the miss is to make the note more willing to dispute a number the evidence has already confirmed. That is the same note, pointed at the sentences it already comments on.");
  lines.push("");
  lines.push("Editorial is the next pile, 20 of 74, and it is not catching the planted faults. On the two planted sentences where editorial spoke, it flagged \"leading\" and \"meaningful capacity\". It did not name Halden. Compliance spoke once, to ask for a hedge on \"will support\", and did not name Halden either. Style rules will keep firing on clean claims for as long as quiet includes style. That is a real tension with leave-alone, and it is a smaller one than the wording notes.");
  lines.push("");
  lines.push("## How this was scored");
  lines.push("");
  lines.push("Fixtures 01 to 20. Frozen statements from `scripts/diagnostic/accuracy/statements.json`, 261 of them. Stage 1 was not re-run. Labels from `labels.json`, unchanged. Group A from `group-a-design.json`, 11 planted spans, each mapping to one statement. Clean means the existing label `confirmed`: 74 statements, all in Group B. The other 26 labelled statements are partial, conflicting, or no support. They are not in the leave-alone rate. Nothing was relabelled.");
  lines.push("");
  lines.push("A planted fault is caught when any layer raises it. Evidence raises it when the display verdict is not a confirmation, including `not reviewed`. Editorial, compliance, framing, and recency raise it when they have a concern. The note raises it when the bucket is conflicts, beyond, or wording. Naming the words means the finding contains the planted span, or a number or a capitalised name taken from that span. F18 completion is the one finding that names the fault without containing the span.");
  lines.push("");
  lines.push("A clean statement is quiet when evidence confirms it and every other layer is empty and the note is `none` or absent. `not reviewed` is not quiet. On the two clean cards with that verdict, the summary says no source addresses the claim, and the excerpt is a source sentence that contains the figures. The reason field on both cards is empty.");
  lines.push("");
  lines.push("The two passes are compared on sentence label, support state, display verdict, and concern codes. Concern codes include editorial, compliance, framing, and recency codes, plus `note:<bucket>`. Tier is `card.tier`.");
  lines.push("");
  lines.push("The run used the local `AUTHORING_ORGANISATION` environment value. The log resolved it as Halden Group. One voice concern still said the authoring organisation is not identified in the draft.");
  lines.push("");
  lines.push("Build under test: `dab9268`. Cache off (`QC_LLM_CACHE=0`, no disk cache). Evidence, editorial, compliance, and commentary on. The reader's note is the default, on.");
  lines.push("");
  lines.push("## Estimate, then what it cost");
  lines.push("");
  lines.push("The estimate uses `estimateReviewWork` with the system-token constants `api/analyse-statements.js` passes to preflight: editorial 9088, compliance 3000, stage 2 4000, stage 5 1600. Tokens are `ceil(chars/4)`. The scheduler's statement count from words was 273. The freeze is 261, and Stage 1 did not run, so the estimate is a little high on that part. The note step is not inside `estimateReviewWork`. Its tokens use the same `ceil(chars/4)` helper, priced at the opus rates in `lib/observability.js` (input 5.00, output 25.00 per million). Pipeline output is an allowance of 400 tokens a call. Note output is an allowance of 300 tokens a call. The scheduler does not estimate output.");
  lines.push("");
  lines.push(`Both passes, before any call: **USD ${estimate.twoPasses.usd}**. Pipeline USD ${estimate.twoPasses.pipelineUsd}. Note USD ${estimate.twoPasses.noteUsd}. That is under the USD 250 gate, so the passes ran.`);
  lines.push("");
  lines.push("One pass, scheduler request tokens, then the output allowance:");
  lines.push("");
  lines.push("| Part | Tokens |");
  lines.push("|---|---:|");
  const parts = estimate.onePass.parts;
  for (const [name, tokens] of Object.entries(parts)) {
    lines.push(`| ${name} | ${tokens} |`);
  }
  lines.push(`| note input | ${estimate.onePass.noteInputTokens} |`);
  lines.push(`| pipeline output allowance | ${estimate.onePass.pipelineOutputTokens} |`);
  lines.push(`| note output allowance | ${estimate.onePass.noteOutputTokens} |`);
  lines.push("");
  lines.push(`Scheduler wall for both passes is a TPM floor of ${estimate.twoPasses.wallClockMinutes} minutes at 2,000,000 tokens a minute. That is a rate-limit floor. The note step is one call after another, so the clock runs longer than the floor.`);
  lines.push("");
  const combined = spend.combined;
  lines.push(`Actual, both stored passes: list **USD ${combined.listUsd.toFixed(6)}**, discounted **USD ${combined.costUsd.toFixed(6)}**, ${combined.calls} calls, 0 unpriced calls inside the meter. Input ${combined.inputTokens}, cached input ${combined.cachedInputTokens}, output ${combined.outputTokens}. Local cache was off. The provider still cached input, which is why discounted is below list. Opus has no cached rate, so its list equals its discounted figure.`);
  lines.push("");
  lines.push("By model, both passes:");
  lines.push("");
  lines.push("| Model | Calls | Input | Cached input | Output | Discounted USD |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const [model, bucket] of Object.entries(combined.byModel)) {
    lines.push(`| ${model} | ${bucket.calls} | ${bucket.inputTokens} | ${bucket.cachedInputTokens} | ${bucket.outputTokens} | ${bucket.costUsd.toFixed(6)} |`);
  }
  lines.push("");
  lines.push(`Stored wall: pass 1 ${Math.round(wall1 / 1000)} seconds, pass 2 ${Math.round(wall2 / 1000)} seconds, sum ${Math.round((wall1 + wall2) / 1000)} seconds. Pass 1 includes the first fixture from the attempt that was stopped, because those cards were kept.`);
  lines.push("");
  lines.push("A first process was killed during fixture 02, after fixture 01 had been written. Fixture 02 was run again on resume, and that rerun is in the meter. The killed tail logged 9 stage 2 calls, 9 editorial completions, and 9 compliance completions. Commentary had been scheduled and the note had not started. Those calls were billed and the process died before it wrote their tokens. They are not in the 3481. Unpriced calls: at least 27, model `gpt-4o-2024-08-06`, tokens not stored.");
  lines.push("");
  lines.push("## The miss");
  lines.push("");
  const miss = extract.faults.find((fault) => fault.id === "F13-ebitda");
  lines.push(`**${miss.id}.** ${miss.statement}`);
  lines.push("");
  lines.push(`Planted fault: ${miss.why}`);
  lines.push("");
  lines.push(`Pass 1 and pass 2: display verdict \`${miss.displayVerdict}\`, sentence state \`${miss.sentenceState}\`, note bucket none, editorial empty, compliance empty. The excerpt is: "Trailing twelve months revenue stands at EUR 76 million, with EBITDA of EUR 8.4 million representing an EBITDA margin of 11.1%." The summary says both figures are directly supported. The source's recommendation, earlier in the same file, says the margin is approximately 13%. Nothing in the card mentions 13. The matcher returned the agreeing sentence. No later layer reopened it.`);
  lines.push("");
  lines.push("## Caught faults");
  lines.push("");
  lines.push("| Fault | Display verdict | Sentence state | Layers that spoke | Named the planted words |");
  lines.push("|---|---|---|---|---|");
  for (const fault of extract.faults) {
    if (!fault.caught) continue;
    const layers = fault.raised.map((row) => `${row.layer} (${row.label})`).join("; ");
    const named = fault.id === "F18-completion"
      ? "yes, in other words"
      : fault.named
        ? "yes"
        : "no";
    lines.push(`| ${fault.id} | ${fault.displayVerdict} | ${fault.sentenceState} | ${layers} | ${named} |`);
  }
  lines.push("");
  lines.push("F05 Halden support was a miss on the 6 October evidence-only run. It is a catch here: partial on the evidence, conflicts on the note, and the note names Halden. F13 employees was caught by evidence alone. The note stayed on none.");
  lines.push("");
  lines.push("Editorial on F05-acquirer said 'leading' is an unsubstantiated superlative. Editorial on F05-forward-support said 'meaningful capacity to grow share' is unsubstantiated. Compliance on that same sentence asked for a hedge on 'will support'. None of those three findings name Halden or the missing actor. The fault was caught by evidence and by the note.");
  lines.push("");
  lines.push("## False alarms");
  lines.push("");
  lines.push("Every confirmed statement that a layer spoke on, pass 1. 54 statements. The sentence is the labelled statement. What it said is the finding, shortened.");
  lines.push("");
  for (const row of extract.falseAlarms) {
    lines.push(`**F${row.fixtureId}.** ${flat(row.statement)}`);
    lines.push("");
    for (const spoke of row.spoke) {
      const codes = Array.isArray(spoke.codes) && spoke.codes.length ? ` [${spoke.codes.join(", ")}]` : "";
      lines.push(`- ${spoke.layer} (${spoke.label})${codes}: ${clip(spoke.said, 500)}`);
    }
    lines.push("");
  }
  lines.push("## Per layer");
  lines.push("");
  lines.push("Catch is out of 11 planted faults. False alarms are out of 74 confirmed statements. Pass 1.");
  lines.push("");
  lines.push("| Layer | Caught | Named the planted words | False alarms |");
  lines.push("|---|---:|---:|---:|");
  for (const [name, row] of Object.entries(extract.perLayer)) {
    const named = name === "evidence" ? row.named + 1 : row.named;
    const namedNote = name === "evidence" ? `${named} (F18 completion counted by reading)` : String(named);
    lines.push(`| ${name} | ${row.caught} | ${namedNote} | ${row.falseAlarms} |`);
  }
  lines.push("");
  lines.push("The misses do not cluster in editorial or compliance. Those layers almost never raise the planted fault, and when they do they raise a style or a hedge point on the same sentence. The one miss is evidence, and the note did not rescue it. The false alarms cluster in the note, then editorial, then evidence.");
  lines.push("");
  lines.push("Note false alarms by bucket: wording 35, beyond 3. The three beyond notes are on sentences the label calls confirmed: a user base that is \"unusual in two respects\", a downside that adds the founder team, and \"strong fundamentals\".");
  lines.push("");
  lines.push("Evidence false alarms: 4 conflicting, 7 partially confirmed, 1 no support, 2 not reviewed. The no-support card is \"We recommend approval.\" The label calls it confirmed. The summary says no source addresses the recommendation. A wording note on the same card says the source says \"We recommend this investment\" and the statement is the same claim. The two layers disagree with each other.");
  lines.push("");
  lines.push("## Run to run");
  lines.push("");
  lines.push(`261 statements in both passes. **${extract.movement.changedAtAll} changed at all. ${extract.movement.changedTier} changed tier.**`);
  lines.push("");
  lines.push("Changed at all means sentence label, support state, display verdict, or concern codes differed. Changed tier means `demands`, `light`, or `quiet` differed. No sentence label changed.");
  lines.push("");
  lines.push("| Fixture | What changed | Statement |");
  lines.push("|---|---|---|");
  for (const row of extract.movement.rows) {
    const bits = [];
    if (row.tierChanged) bits.push(`tier ${row.tier?.[0]} -> ${row.tier?.[1]}`);
    for (const change of row.changed || []) {
      bits.push(`${change.field}: ${flat(change.pass1) || "(empty)"} -> ${flat(change.pass2) || "(empty)"}`);
    }
    if (row.missing) bits.push(`missing from ${row.missing}`);
    lines.push(`| ${row.fixtureId || ""} | ${bits.join("; ").replaceAll("|", " / ")} | ${clip(row.statement, 180).replaceAll("|", "/")} |`);
  }
  lines.push("");
  lines.push("## Files");
  lines.push("");
  lines.push("- `scripts/diagnostic/b437/estimate.mjs` prints the estimate. `estimate.json` is that print.");
  lines.push("- `scripts/diagnostic/b437/run.mjs` is the harness. Two passes, cache off, frozen statements, all four layers on.");
  lines.push("- `scripts/diagnostic/b437/pass-1.json` and `pass-2.json` are the cards and the spend.");
  lines.push("- `scripts/diagnostic/b437/spend.json` is the combined meter.");
  lines.push("- `scripts/diagnostic/b437/score.mjs` joins the labels. `extract.json` is that join.");
  lines.push("- `scripts/diagnostic/b437/render-report.mjs` writes this file from those extracts.");
  lines.push("- `scripts/diagnostic/b437/ACCURACY.md` is this report.");
  lines.push("");
  lines.push("The clean ledger was not recomputed and not edited. The label files were not edited.");
  lines.push("");

  const text = `${lines.join("\n")}\n`;
  if (/[\u2014\u2013]/.test(text)) {
    throw new Error("Report contains an em dash or an en dash");
  }
  await writeFile(path.join(__dirname, "ACCURACY.md"), text);
  console.log(`wrote ${text.length} chars, ${lines.length} lines`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
