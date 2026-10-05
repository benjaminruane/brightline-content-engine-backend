#!/usr/bin/env node
/**
 * B377. Diagnostic only. Does not change product code.
 * Asks writing-rewrite whether it can bridge a conflict-free partial,
 * then runs the four existing checks in lib/revise-stage1.mjs.
 *
 * Usage: node scripts/diagnostic/b377/bridge.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { isConflictFreePartial } = await import("../../../lib/revise-actions/silence.mjs");
const {
  locateSpan,
  checkOutsideSpanUnchanged,
  checkNoInventedFacts,
  checkNoSpanEntitiesKept,
} = await import("../../../lib/revise-stage1.mjs");
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { calculateLlmCostUsd, getLlmPricingTable } = await import("../../../lib/observability.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

const CEILING_USD = 0.15;
const PASSES = 3;
const SEED = 1;
const TEMPERATURE = 0;
const MAX_COMPLETION_TOKENS = 512;

const FILES = [
  ["hicl-doc", "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json"],
  ["hicl-clean", "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json"],
  ["3i-sep-doc", "tests/fixtures/real-runs-2026-09-29/doc-review.json"],
  ["3i-sep-clean", "tests/fixtures/real-runs-2026-09-29/clean-review.json"],
  ["3i-oct-doc", "tests/fixtures/real-runs-2026-10-02/doc-review.json"],
];

const EXPECTED = [
  ["hicl-doc", "1"],
  ["hicl-doc", "2"],
  ["hicl-clean", "6"],
  ["3i-sep-doc", "8"],
  ["3i-sep-doc", "14"],
  ["3i-sep-clean", "1"],
  ["3i-oct-doc", "14"],
];

const cfg = STAGE_MODELS["writing-rewrite"];

function listUsd(usage) {
  const rate = getLlmPricingTable()?.openai?.[cfg.model];
  if (!rate || !usage) return null;
  const input = Number(usage.inputTokens) || 0;
  const output = Number(usage.outputTokens) || 0;
  return (input / 1_000_000) * rate.input + (output / 1_000_000) * rate.output;
}

function discountedUsd(usage) {
  if (!usage) return null;
  return calculateLlmCostUsd(cfg.provider, cfg.model, usage);
}

function enumerate() {
  const hits = [];
  for (const [name, rel] of FILES) {
    const data = JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
    for (const row of data.statements || []) {
      const card = row.qcCard;
      if (!card || !isConflictFreePartial(card)) continue;
      const unsupported = (Array.isArray(card.unsupportedSpans) ? card.unsupportedSpans : [])
        .filter((s) => typeof s?.text === "string" && s.text.trim())
        .map((s) => s.text);
      const confirmed = (Array.isArray(card.supportSpans) ? card.supportSpans : [])
        .filter((s) => s?.classification === "confirmed" && typeof s.passage === "string" && s.passage.trim())
        .map((s) => s.passage);
      const confirmedEmpty = (Array.isArray(card.supportSpans) ? card.supportSpans : []).filter(
        (s) => s?.classification === "confirmed" && !(typeof s.passage === "string" && s.passage.trim())
      ).length;
      hits.push({
        name,
        file: rel,
        sid: String(row.id ?? card.index ?? ""),
        statement: typeof card.statement === "string" ? card.statement : "",
        displayVerdict: card.displayVerdict ?? null,
        supportState: card.supportState ?? null,
        hasConflict: card.hasConflict === true,
        unsupported,
        confirmed,
        confirmedEmpty,
        claims: Array.isArray(card.claims) ? card.claims : [],
        hasEvidenceObject: card.evidence != null && typeof card.evidence === "object",
      });
    }
  }
  return hits;
}

function populationMatches(hits) {
  if (hits.length !== EXPECTED.length) return false;
  const got = hits.map((h) => `${h.name}:${h.sid}`).sort();
  const want = EXPECTED.map(([n, id]) => `${n}:${id}`).sort();
  return got.every((g, i) => g === want[i]);
}

function buildUserPayload(card) {
  const flagged =
    card.unsupported.length === 0
      ? "FLAGGED PHRASE: none on this card."
      : card.unsupported.map((t, i) => `FLAGGED PHRASE ${i + 1}: ${t}`).join("\n");
  const passages = card.confirmed.map((p, i) => `PASSAGE ${i + 1}: ${p}`).join("\n\n");
  return [
    "STATEMENT:",
    card.statement,
    "",
    flagged,
    "",
    "CONFIRMED PASSAGES:",
    passages,
  ].join("\n");
}

const SYSTEM = [
  "You repair one sentence, or you refuse.",
  "Prefer deleting words. A restatement is allowed only if every fact in it appears in the passages supplied.",
  "Never substitute a milder evaluative word for a stronger one. Never approximate an unbacked figure into a vaguer word.",
  "Never introduce a figure, date or name that is not in the statement or the supplied passages.",
  "Never remove a name.",
  "Change nothing outside the flagged phrase, except a connector left dangling by the cut.",
  "Refusing is a correct answer. Say so rather than inventing a repair.",
  "Reply as JSON with exactly these keys: offer (boolean), removed (string), resultingSentence (string), reason (one line).",
  "If you refuse, offer is false and removed and resultingSentence are empty strings.",
  "resultingSentence is the full sentence after the change, so it can be checked with no inference.",
  "Do not write anything outside that JSON object.",
].join("\n");

function parseReply(text) {
  const raw = typeof text === "string" ? text : "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return { parseOk: false, error: err instanceof Error ? err.message : String(err), raw };
  }
  if (!parsed || typeof parsed !== "object") {
    return { parseOk: false, error: "JSON was not an object", raw };
  }
  if (typeof parsed.offer !== "boolean") {
    return { parseOk: false, error: `offer was ${typeof parsed.offer}, not a boolean`, raw, parsed };
  }
  return {
    parseOk: true,
    offer: parsed.offer,
    removed: typeof parsed.removed === "string" ? parsed.removed : null,
    resultingSentence: typeof parsed.resultingSentence === "string" ? parsed.resultingSentence : null,
    reason: typeof parsed.reason === "string" ? parsed.reason : null,
    raw,
  };
}

function judge(card, reply) {
  if (!reply.parseOk || reply.offer !== true) return null;
  if (typeof reply.resultingSentence !== "string" || !reply.resultingSentence.trim()) {
    return {
      runnable: false,
      why: "offer was true and resultingSentence was empty or not a string, so the checks had no sentence to judge",
    };
  }
  const revised = reply.resultingSentence;
  const spans = card.unsupported.map((text) => ({ text }));
  const located = card.unsupported.map((text) => ({
    text,
    span: locateSpan(card.statement, text),
  }));
  const outside = checkOutsideSpanUnchanged(card.statement, revised, spans);
  const sourceText = card.confirmed.join("\n\n");
  const invented = checkNoInventedFacts(card.statement, revised, sourceText);
  const entities = checkNoSpanEntitiesKept(card.statement, revised, { claims: card.claims });
  return {
    runnable: true,
    locateSpan: located,
    locateSpanNote:
      card.unsupported.length === 0
        ? "not called: unsupportedSpans on this card has no text"
        : null,
    outside,
    invented,
    entities,
    entitiesNote: card.hasEvidenceObject
      ? null
      : "called with claims from the card and no evidence object. The card has no evidence.reason, evidence.excerpt, or evidence.sourcePassage, so the finding-named exception is empty.",
  };
}

async function complete(user) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !String(key).trim()) {
    throw new Error("OPENAI_API_KEY is missing. Refusing to call.");
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(key).trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: TEMPERATURE,
      seed: SEED,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    const message = body?.error?.message || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  const choice = body?.choices?.[0] ?? {};
  const text = choice?.message?.content ?? "";
  const usage = {
    inputTokens: Number(body?.usage?.prompt_tokens) || 0,
    outputTokens: Number(body?.usage?.completion_tokens) || 0,
    cachedInputTokens: Number(body?.usage?.prompt_tokens_details?.cached_tokens) || 0,
    reasoningTokens: Number(body?.usage?.completion_tokens_details?.reasoning_tokens) || 0,
  };
  return {
    text,
    usage,
    finishReason: choice.finish_reason ?? null,
    model: typeof body?.model === "string" ? body.model : null,
    systemFingerprint: typeof body?.system_fingerprint === "string" ? body.system_fingerprint : null,
  };
}

function mdCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function checkLine(name, result) {
  if (!result) return `${name}: not run`;
  const ok = result.ok === true ? "pass" : "fail";
  const detail = typeof result.detail === "string" && result.detail ? result.detail : "(none)";
  return `${name}: ${ok}. ${detail}`;
}

function writeStopReport(hits) {
  const lines = [];
  lines.push("# B377. Can a model bridge the gap the matcher found");
  lines.push("");
  lines.push("## Scoreboard");
  lines.push("");
  lines.push("| Repo | SHA | verify:ship |");
  lines.push("|------|-----|-------------|");
  lines.push("| backend | pending | not yet run |");
  lines.push("| frontend | not touched | |");
  lines.push("");
  lines.push("## Part 1 stopped the run");
  lines.push("");
  lines.push(`Expected 7 conflict-free partials. Found ${hits.length}. No model call was made.`);
  lines.push("");
  lines.push("Expected:");
  for (const [name, id] of EXPECTED) lines.push(`- ${name} S${id}`);
  lines.push("");
  lines.push("Found:");
  for (const h of hits) {
    lines.push(`- ${h.name} S${h.sid} display=${h.displayVerdict} support=${h.supportState}`);
  }
  lines.push("");
  lines.push("## Cost report");
  lines.push("");
  lines.push("USD 0. No calls.");
  lines.push("");
  lines.push("## Technical summary");
  lines.push("");
  lines.push("The population check in `scripts/diagnostic/b377/bridge.mjs` did not match the seven cards named in the brief. The model was not called. No product code changed.");
  lines.push("");
  lines.push("## Plain-language summary");
  lines.push("");
  lines.push("The measurement did not run. The set of partial cards on disk was not the seven this diagnostic was written for.");
  writeFileSync(path.join(__dirname, "REPORT.md"), lines.join("\n") + "\n");
}

function writeReport(doc) {
  const lines = [];
  lines.push("# B377. Can a model bridge the gap the matcher found");
  lines.push("");
  lines.push("## Scoreboard");
  lines.push("");
  lines.push("| Repo | SHA | verify:ship |");
  lines.push("|------|-----|-------------|");
  lines.push("| backend | pending | not yet run |");
  lines.push("| frontend | not touched | |");
  lines.push("");
  lines.push("Ids used: B377. No product code. `lib/` unchanged.");
  lines.push("");
  lines.push("Browser: skipped. No visible surface.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Part 1. The population");
  lines.push("");
  lines.push("`isConflictFreePartial` returned 7 cards. That is the expected seven, in this order:");
  lines.push("");
  lines.push("| Payload | S | displayVerdict | supportState | hasConflict | Flagged phrases | Confirmed passages | Called |");
  lines.push("|---------|---|----------------|--------------|-------------|-----------------|--------------------|--------|");
  for (const card of doc.cards) {
    lines.push(
      `| ${card.name} | ${card.sid} | ${mdCell(card.displayVerdict)} | ${mdCell(card.supportState)} | ${card.hasConflict} | ${card.unsupported.length} | ${card.confirmed.length} | ${card.called ? "yes" : "no"} |`
    );
  }
  lines.push("");
  lines.push("Model: `" + cfg.model + "`. Provider: `" + cfg.provider + "`. Temperature " + TEMPERATURE + ". Seed " + SEED + " on every pass. `max_completion_tokens` " + MAX_COMPLETION_TOKENS + ".");
  lines.push("");
  lines.push("Context sent: the statement, the flagged phrase text from `unsupportedSpans`, and `supportSpans` passages whose `classification` is `confirmed`. Nothing else. The full source document was not sent.");
  lines.push("");
  if (doc.stopped) {
    lines.push("The run stopped early. Reason: " + doc.stopReason);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("## Part 2 and Part 3. Passes and checks");
  lines.push("");
  lines.push("Checks are the functions in `lib/revise-stage1.mjs`. `checkNoInventedFacts` received the confirmed passages joined, not the document. `checkNoSpanEntitiesKept` was called with `{ claims }` from the card. These cards have no `evidence` object, so the finding-named exception is empty. That is recorded on each pass. No new validator was written.");
  lines.push("");
  lines.push("A refusal is not a proposal. The four checks run only when `offer` is true and `resultingSentence` is a non-empty string.");
  lines.push("");

  for (const card of doc.cards) {
    lines.push(`### ${card.name} S${card.sid}`);
    lines.push("");
    lines.push("Statement: " + card.statement);
    lines.push("");
    if (card.unsupported.length === 0) {
      lines.push("Flagged phrase: none.");
    } else {
      for (const t of card.unsupported) lines.push("Flagged phrase: " + t);
    }
    lines.push("");
    if (!card.called) {
      lines.push("Not called. " + card.skipReason);
      lines.push("");
      lines.push("Stability: not called.");
      lines.push("");
      continue;
    }
    lines.push("Confirmed passages sent: " + card.confirmed.length + ".");
    lines.push("");
    for (const pass of card.passes) {
      lines.push(`#### Pass ${pass.n}`);
      lines.push("");
      if (pass.error) {
        lines.push("Call failed. " + pass.error);
        lines.push("");
        continue;
      }
      lines.push("Finish reason: " + (pass.finishReason || "(none)") + ".");
      if (!pass.reply.parseOk) {
        lines.push("Reply did not parse. " + pass.reply.error);
        lines.push("");
        lines.push("Raw reply:");
        lines.push("");
        lines.push("```");
        lines.push(pass.reply.raw || "");
        lines.push("```");
        lines.push("");
        lines.push("Checks not run. There is no parsed proposal.");
        lines.push("");
        continue;
      }
      lines.push("Offer: " + String(pass.reply.offer) + ".");
      lines.push("");
      lines.push("Removed text: " + (pass.reply.removed === null ? "(field was not a string)" : JSON.stringify(pass.reply.removed)));
      lines.push("");
      lines.push("Resulting sentence: " + (pass.reply.resultingSentence === null ? "(field was not a string)" : JSON.stringify(pass.reply.resultingSentence)));
      lines.push("");
      lines.push("Reason: " + (pass.reply.reason === null ? "(field was not a string)" : pass.reply.reason));
      lines.push("");
      if (!pass.checks) {
        lines.push("Checks not run. " + (pass.reply.offer ? "No sentence to judge." : "The model refused."));
        lines.push("");
        continue;
      }
      if (pass.checks.runnable === false) {
        lines.push("Checks not run. " + pass.checks.why);
        lines.push("");
        continue;
      }
      if (pass.checks.locateSpanNote) {
        lines.push("locateSpan: " + pass.checks.locateSpanNote);
      } else {
        for (const row of pass.checks.locateSpan) {
          const span = row.span;
          lines.push(
            span
              ? `locateSpan: pass. start ${span.start}, end ${span.end}. text ${JSON.stringify(row.text)}`
              : `locateSpan: fail. not found in the statement. text ${JSON.stringify(row.text)}`
          );
        }
      }
      lines.push(checkLine("checkOutsideSpanUnchanged", pass.checks.outside));
      lines.push(checkLine("checkNoInventedFacts", pass.checks.invented));
      lines.push(checkLine("checkNoSpanEntitiesKept", pass.checks.entities));
      if (pass.checks.entitiesNote) lines.push(pass.checks.entitiesNote);
      lines.push("");
    }
    lines.push("Stability: " + card.stability);
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Cost");
  lines.push("");
  lines.push("Rates from `getLlmPricingTable()` for `" + cfg.model + "`: input " + doc.rate.input + " USD per million, cached input " + doc.rate.cachedInput + ", output " + doc.rate.output + ". List USD counts every input token at the input rate. Discounted USD is `calculateLlmCostUsd` on the recorded usage, which prices cached input at the cached rate.");
  lines.push("");
  lines.push("Calls made: " + doc.calls + ". Unpriced calls: " + doc.unpriced + ".");
  lines.push("");
  lines.push("List USD " + doc.listUsd.toFixed(6) + ". Discounted USD " + doc.discountedUsd.toFixed(6) + ".");
  lines.push("");
  lines.push("Input tokens " + doc.inputTokens + ". Cached input tokens " + doc.cachedInputTokens + ". Output tokens " + doc.outputTokens + ". Reasoning tokens " + doc.reasoningTokens + ".");
  lines.push("");
  if (doc.stopped) lines.push("Ceiling: stopped. " + doc.stopReason);
  else lines.push("Ceiling USD " + CEILING_USD.toFixed(2) + " was not crossed.");
  lines.push("");
  lines.push("| Card | Pass | Input | Cached | Output | Reasoning | List USD |");
  lines.push("|------|------|------:|-------:|-------:|----------:|---------:|");
  for (const row of doc.usageRows) {
    lines.push(
      `| ${row.card} | ${row.pass} | ${row.input} | ${row.cached} | ${row.output} | ${row.reasoning} | ${row.list.toFixed(6)} |`
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Technical summary");
  lines.push("");
  lines.push(doc.technical);
  lines.push("");
  lines.push("## Plain-language summary");
  lines.push("");
  lines.push(doc.plain);
  lines.push("");
  writeFileSync(path.join(__dirname, "REPORT.md"), lines.join("\n"));
}

function stabilityOf(passes) {
  const usable = passes.filter((p) => !p.error);
  if (usable.length < PASSES) return "incomplete. A pass did not return.";
  const kinds = usable.map((p) => {
    if (!p.reply.parseOk) return "unparsed";
    return p.reply.offer ? "offer" : "refuse";
  });
  const unique = [...new Set(kinds)];
  if (unique.length !== 1) {
    return "the three passes did not agree on whether an offer exists (" + kinds.join(", ") + ")";
  }
  if (unique[0] === "unparsed") return "all three replies failed to parse. No offer to compare.";
  if (unique[0] === "refuse") return "the three passes agree: no offer.";
  const keys = usable.map((p) => JSON.stringify(p.reply.removed) + "\n" + JSON.stringify(p.reply.resultingSentence));
  const same = keys.every((k) => k === keys[0]);
  if (same) return "the three passes agree: an offer exists, and it is the same offer.";
  return "the three passes agree that an offer exists. The offers are not the same.";
}

function summaries(cards) {
  const called = cards.filter((c) => c.called);
  const bits = [];
  for (const card of called) {
    const offers = (card.passes || []).filter((p) => p.reply?.parseOk && p.reply.offer).length;
    bits.push(`${card.name} S${card.sid} offers ${offers} of ${(card.passes || []).length}`);
  }
  const technical =
    "Diagnostic script `scripts/diagnostic/b377/bridge.mjs` calls `" +
    cfg.model +
    "` three times on each conflict-free partial that has a confirmed passage, then runs `locateSpan`, `checkOutsideSpanUnchanged`, `checkNoInventedFacts`, and `checkNoSpanEntitiesKept`. No file under `lib/` changed. Population " +
    cards.length +
    ". Called " +
    called.length +
    ". " +
    bits.join(". ") +
    ".";
  const plain =
    "Nothing in the product changed. This run asked the writing model, three times, whether it could propose a small repair on each partial card that already shows a confirmed passage, and then let the existing revision checks accept or reject that proposal. The offers are listed verbatim in this report for a separate read.";
  return { technical, plain };
}

async function main() {
  const hits = enumerate();
  if (!populationMatches(hits)) {
    writeStopReport(hits);
    console.error("B377 STOP. Population " + hits.length + " is not the expected 7. Report written. No calls.");
    process.exit(2);
  }

  const order = new Map(EXPECTED.map(([name, id], i) => [`${name}:${id}`, i]));
  hits.sort((a, b) => order.get(`${a.name}:${a.sid}`) - order.get(`${b.name}:${b.sid}`));

  const rate = getLlmPricingTable()?.openai?.[cfg.model];
  if (!rate) {
    writeStopReport(hits);
    console.error("B377 STOP. No price for " + cfg.model + ". Refusing to call unpriced.");
    process.exit(2);
  }

  const cards = hits.map((h) => {
    let called = true;
    let skipReason = null;
    if (h.confirmed.length === 0) {
      called = false;
      skipReason =
        h.confirmedEmpty > 0
          ? "classification confirmed is present but the passage text is empty."
          : "no supportSpan with classification confirmed.";
    }
    return { ...h, called, skipReason, passes: [] };
  });

  let listTotal = 0;
  let discountedTotal = 0;
  let calls = 0;
  let unpriced = 0;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  const usageRows = [];
  let stopped = false;
  let stopReason = null;

  for (const card of cards) {
    if (!card.called) continue;
    const user = buildUserPayload(card);
    card.userPayload = user;
    for (let n = 1; n <= PASSES; n += 1) {
      if (listTotal > CEILING_USD) {
        stopped = true;
        stopReason = "running list total " + listTotal.toFixed(6) + " passed USD " + CEILING_USD.toFixed(2) + " before " + card.name + " S" + card.sid + " pass " + n;
        break;
      }
      let result;
      try {
        result = await complete(user);
      } catch (err) {
        card.passes.push({ n, error: err instanceof Error ? err.message : String(err) });
        stopped = true;
        stopReason = "call failed on " + card.name + " S" + card.sid + " pass " + n + ": " + (err instanceof Error ? err.message : String(err));
        break;
      }
      const reply = parseReply(result.text);
      const checks = judge(card, reply);
      const list = listUsd(result.usage);
      const discounted = discountedUsd(result.usage);
      if (list === null) {
        unpriced += 1;
        stopped = true;
        stopReason = "usage on " + card.name + " S" + card.sid + " pass " + n + " did not price. Stopping so the total is not a silent undercount.";
        card.passes.push({
          n,
          error: null,
          finishReason: result.finishReason,
          model: result.model,
          systemFingerprint: result.systemFingerprint,
          usage: result.usage,
          reply,
          checks,
        });
        break;
      }
      listTotal += list;
      discountedTotal += discounted || 0;
      calls += 1;
      inputTokens += result.usage.inputTokens;
      cachedInputTokens += result.usage.cachedInputTokens;
      outputTokens += result.usage.outputTokens;
      reasoningTokens += result.usage.reasoningTokens;
      usageRows.push({
        card: card.name + " S" + card.sid,
        pass: n,
        input: result.usage.inputTokens,
        cached: result.usage.cachedInputTokens,
        output: result.usage.outputTokens,
        reasoning: result.usage.reasoningTokens,
        list,
      });
      card.passes.push({
        n,
        error: null,
        finishReason: result.finishReason,
        model: result.model,
        systemFingerprint: result.systemFingerprint,
        usage: result.usage,
        reply,
        checks,
      });
      console.log(
        card.name + " S" + card.sid + " pass " + n +
          " offer=" + (reply.parseOk ? reply.offer : "unparsed") +
          " list=" + list.toFixed(6) +
          " running=" + listTotal.toFixed(6)
      );
      if (listTotal > CEILING_USD) {
        stopped = true;
        stopReason = "running list total " + listTotal.toFixed(6) + " passed USD " + CEILING_USD.toFixed(2) + " after " + card.name + " S" + card.sid + " pass " + n;
        break;
      }
    }
    card.stability = card.called ? stabilityOf(card.passes) : "not called";
    if (stopped) break;
  }

  for (const card of cards) {
    if (!card.stability) card.stability = card.called ? "not run. The ceiling or a failure stopped the script before this card." : "not called";
  }

  const { technical, plain } = summaries(cards);
  const doc = {
    cards: cards.map(({ userPayload, ...rest }) => rest),
    stopped,
    stopReason,
    calls,
    unpriced,
    listUsd: listTotal,
    discountedUsd: discountedTotal,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    usageRows,
    rate: { input: rate.input, cachedInput: rate.cachedInput, output: rate.output },
    technical,
    plain,
  };

  writeFileSync(path.join(__dirname, "results.json"), JSON.stringify({ system: SYSTEM, cards }, null, 2));
  writeReport(doc);
  console.log("B377 done. calls=" + calls + " listUSD=" + listTotal.toFixed(6) + " stopped=" + stopped);
}

await main();
