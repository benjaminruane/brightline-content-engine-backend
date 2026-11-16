/**
 * B514 Part G. Three stored reviews, then three drafts with no confirmed status.
 * Cache off. Ceiling USD 10 on the measured spend. The estimate is printed and does not stop the run.
 *
 *   node scripts/diagnostic/b514/run.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { SOURCES_DIR } from "../lib/paths.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "../drafting/fixtures");
const DRAFTING_DIR = path.join(SOURCES_DIR, "drafting");
const STORED = path.resolve(__dirname, "../b513/run.json");
const RUN_JSON = path.join(__dirname, "run.json");
const RESULT_MD = path.join(__dirname, "RESULT.md");
const CEILING_USD = 10;
const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);

const G1 = [
  { textType: "NEW_PRIMARY_COMMITMENT", dealStatus: "Approved" },
  { textType: "NEW_DIRECT_INVESTMENT", dealStatus: "Signed or agreed" },
  { textType: "NEW_SECONDARY_INVESTMENT", dealStatus: "Signed or agreed" },
];

function usd(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}

function money(n) {
  return usd(n).toFixed(6);
}

function resStub() {
  return {
    statusCode: 200,
    body: undefined,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

function emptySpend() {
  return { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0, unpricedCalls: 0, unpricedModels: [] };
}

function addSpend(total, snap) {
  if (!snap) return total;
  total.calls += snap.calls || 0;
  total.inputTokens += snap.inputTokens || 0;
  total.cachedInputTokens += snap.cachedInputTokens || 0;
  total.outputTokens += snap.outputTokens || 0;
  total.costUsd = usd(total.costUsd + (snap.costUsd || 0));
  total.unpricedCalls += snap.unpricedCalls || 0;
  for (const model of snap.unpricedModels || []) {
    if (!total.unpricedModels.includes(model)) total.unpricedModels.push(model);
  }
  return total;
}

function price(table, provider, model, inputTokens, outputTokens) {
  const row = table?.[provider]?.[model];
  if (!row) throw new Error(`no published price for ${provider}/${model}`);
  return (inputTokens * row.input + outputTokens * row.output) / 1e6;
}

function bump(map, key) {
  const name = key || "(none)";
  map[name] = (map[name] || 0) + 1;
}

async function loadFixtures() {
  const names = (await readdir(FIXTURES_DIR)).filter((name) => name.endsWith(".json")).sort();
  const fixtures = [];
  for (const name of names) fixtures.push(JSON.parse(await readFile(path.join(FIXTURES_DIR, name), "utf8")));
  return fixtures;
}

async function readSource(file) {
  const drafting = path.join(DRAFTING_DIR, file);
  const general = path.join(SOURCES_DIR, file);
  const chosen = existsSync(drafting) ? drafting : general;
  if (!existsSync(chosen)) throw new Error(`source file is missing: ${file}`);
  return readFile(chosen, "utf8");
}

function storedDraft(textType, dealStatus) {
  if (!existsSync(STORED)) throw new Error(`stored drafts are missing: ${STORED}`);
  const doc = JSON.parse(readFileSync(STORED, "utf8"));
  const row = (doc.drafts || []).find((item) => item.textType === textType && item.dealStatus === dealStatus);
  if (!row || typeof row.draft !== "string" || !row.draft.trim()) {
    throw new Error(`stored draft is missing: ${textType} / ${dealStatus}`);
  }
  return row.draft;
}

function render(doc, replay) {
  const lines = ["# B514", ""];
  lines.push("## Replay");
  lines.push("");
  lines.push(replay.trim());
  lines.push("");
  lines.push("## Paid run");
  lines.push("");
  lines.push(`Estimate before the calls: USD ${money(doc.estimateUsd)}.`);
  lines.push(`Ceiling USD ${CEILING_USD}. Cache off. The authoring organisation for this run was Halden Group.`);
  if (doc.stopped) lines.push(`Stopped: ${doc.stopped}`);
  lines.push(`Total spend: USD ${money(doc.spend.costUsd)}. Calls ${doc.spend.calls}. Unpriced calls ${doc.spend.unpricedCalls}.`);
  lines.push(`Status sentences raised in G1: ${doc.statusRaised}.`);
  lines.push("");
  for (const row of doc.drafts) {
    lines.push(`## ${row.part} ${row.textType} / ${row.dealStatus || "not confirmed"}`);
    lines.push("");
    lines.push(`Commentary words: ${row.wordCount}. Range: ${row.range}.`);
    if (row.part === "G2") lines.push(`Methodology Note words: ${row.noteWords}.`);
    lines.push("");
    lines.push(row.draft || "(no draft)");
    lines.push("");
    if (row.part === "G2") {
      lines.push("Methodology Note:");
      lines.push("");
      lines.push(row.methodologyNote || "(none)");
      lines.push("");
    }
    if (!row.raised?.length) lines.push("Raised cards: none.");
    row.raised?.forEach((card, index) => {
      lines.push(`${index + 1}. ${card.state}. setBy ${card.setBy?.branch || ""}${card.setBy?.from ? ` from ${card.setBy.from}` : ""}${card.setBy?.cleared ? ` cleared ${card.setBy.cleared}` : ""}. Source role: ${card.sourceRole || "(none)"}. Note bucket: ${card.noteBucket || "(none)"}.`);
      lines.push("");
      lines.push(card.statement);
      lines.push("");
      lines.push(card.reason || "(no reason)");
      lines.push("");
    });
  }
  lines.push("## Counts");
  lines.push("");
  lines.push(`By state: ${JSON.stringify(doc.counts.byState)}`);
  lines.push(`By branch: ${JSON.stringify(doc.counts.byBranch)}`);
  lines.push("");
  return `${lines.join("\n").replace(/[\u2013\u2014]/g, "-")}\n`;
}

async function writeOutputs(doc, replay) {
  await writeFile(RUN_JSON, `${JSON.stringify(doc, null, 2)}\n`);
  await writeFile(RESULT_MD, render(doc, replay));
}

async function main() {
  const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
  if (isLlmCacheEnabled()) throw new Error("QC_LLM_CACHE must be off");
  const replay = existsSync(RESULT_MD) ? await readFile(RESULT_MD, "utf8") : "";
  const fixtures = await loadFixtures();
  const { getLlmPricingTable } = await import("../../../lib/observability.js");
  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
  const { normalizeOutputType } = await import("../../../lib/output-intent.js");
  const { estimateTokensFromChars, estimateStatementCount, countWords } = await import("../../../lib/qc/token-estimate.mjs");
  const { READING_MODEL } = await import("../../../lib/qc/reading-review.mjs");
  const { READING_NOTE_PROMPT } = await import("../../../lib/qc/reading-contract.mjs");
  const { OUTPUT_TYPE_LENGTH } = await import("../../../lib/prompt-library/outputTypeGuidance.js");
  const { confirmationSupportsStatement } = await import("../../../lib/deal-status.mjs");
  const { statusReading } = await import("../../../lib/qc/transaction-state.mjs");
  const table = getLlmPricingTable();
  const writer = STAGE_MODELS["writing-generate"].model;
  const reader = STAGE_MODELS["stage2-matching"].model;

  const jobs = [];
  for (const plan of G1) {
    const fixture = fixtures.find((row) => row.textType === plan.textType);
    if (!fixture) throw new Error(`drafting fixture is missing: ${plan.textType}`);
    jobs.push({ part: "G1", fixture, dealStatus: plan.dealStatus, draft: storedDraft(plan.textType, plan.dealStatus) });
  }
  for (const plan of G1) {
    const fixture = fixtures.find((row) => row.textType === plan.textType);
    jobs.push({ part: "G2", fixture, dealStatus: "", outputType: "investor_letter" });
  }

  let estimateUsd = 0;
  for (const job of jobs) {
    const loaded = [];
    for (const source of job.fixture.sources) loaded.push(await readSource(source.file));
    const sourceChars = loaded.reduce((sum, text) => sum + text.length, 0);
    const outputType = job.outputType || job.fixture.outputType;
    const range = OUTPUT_TYPE_LENGTH[normalizeOutputType(outputType)];
    const ceiling = range?.max || 300;
    const sample = job.draft || `${"word ".repeat(ceiling)}`;
    const statements = estimateStatementCount(countWords(sample));
    const draftTokens = estimateTokensFromChars(sample);
    let stage2 = 0;
    for (const text of loaded) stage2 += statements * (4500 + estimateTokensFromChars(text) + 80);
    const reviewInput = stage2 + statements * (9088 + draftTokens + 200) + statements * 3400 + statements * 1800 + 5500 + statements * 240;
    const reviewCalls = loaded.length * statements + statements * 3 + 2;
    estimateUsd += price(table, "openai", reader, reviewInput, reviewCalls * 400);
    const noteInput = statements * (estimateTokensFromChars(READING_NOTE_PROMPT) + sourceChars / 4 + 200);
    estimateUsd += price(table, "anthropic", READING_MODEL, noteInput, statements * 300);
    if (job.part === "G2") {
      estimateUsd += price(table, "openai", writer, estimateTokensFromChars("x".repeat(18000 + sourceChars)), 900);
    }
  }
  estimateUsd = usd(estimateUsd);
  console.log(`Estimate before the calls: USD ${money(estimateUsd)}`);
  console.log(`Ceiling USD ${CEILING_USD}. Cache off.`);

  const doc = {
    estimateUsd,
    ceilingUsd: CEILING_USD,
    cache: "off",
    authoringOrganisation: "Halden Group",
    stopped: null,
    spend: emptySpend(),
    statusRaised: 0,
    counts: { byState: {}, byBranch: {} },
    drafts: [],
  };

  const generate = (await import("../../../api/generate.js")).default;
  const analyse = (await import("../../../api/analyse-statements.js")).default;
  const { getLlmSpend, resetLlmSpend } = await import("../../../lib/observability.js");
  const { shownTrace, shownState } = await import("../../../lib/qc/shown-verdict.mjs");
  const { readerEvidenceSentence } = await import("../../../lib/qc/reader-reason.mjs");

  try {
    for (const job of jobs) {
      if (doc.spend.costUsd >= CEILING_USD) {
        doc.stopped = `Ceiling USD ${CEILING_USD} reached before ${job.part} ${job.fixture.textType}.`;
        break;
      }
      resetLlmSpend();
      const promptSources = [];
      for (const source of job.fixture.sources) {
        promptSources.push({
          name: source.file,
          label: source.file,
          text: await readSource(source.file),
          type: "file",
          role: source.role,
          publicationState: "unknown",
        });
      }
      const outputType = job.outputType || job.fixture.outputType;
      let draft = job.draft || "";
      let methodologyNote = "";
      if (job.part === "G2") {
        const generated = resStub();
        await generate({
          method: "POST",
          headers: {},
          body: {
            title: job.fixture.investment,
            notes: job.fixture.specialInstructions || "",
            eventType: job.fixture.textType,
            outputType,
            visibility: job.fixture.visibility,
            transactionDate: job.fixture.transactionDate,
            investment: job.fixture.investment,
            specialInstructions: job.fixture.specialInstructions || "",
            dealStatus: "",
            publicSearch: false,
            sources: promptSources,
            bannedWords: [],
            authoringOrganisation: "Halden Group",
          },
        }, generated);
        if (generated.statusCode !== 200 || generated.body?.ok !== true || typeof generated.body?.draftText !== "string") {
          throw new Error(`generate failed for ${job.fixture.textType}: ${generated.statusCode} ${generated.body?.error || ""}`);
        }
        draft = generated.body.draftText;
        methodologyNote = typeof generated.body.methodologyNote === "string" ? generated.body.methodologyNote : "";
        const preReview = getLlmSpend();
        if (usd(doc.spend.costUsd + preReview.costUsd) >= CEILING_USD) {
          addSpend(doc.spend, preReview);
          const range = OUTPUT_TYPE_LENGTH[normalizeOutputType(outputType)];
          doc.drafts.push({
            part: job.part,
            textType: job.fixture.textType,
            dealStatus: "",
            draft,
            methodologyNote,
            noteWords: countWords(methodologyNote),
            wordCount: countWords(draft),
            range: range ? `${range.min} to ${range.max}` : "",
            raised: [],
          });
          doc.stopped = `Ceiling USD ${CEILING_USD} reached after the draft for ${job.fixture.textType}.`;
          break;
        }
      }
      const reviewed = resStub();
      await analyse({
        method: "POST",
        headers: {},
        body: {
          draftText: draft,
          outputType,
          visibility: job.fixture.visibility,
          eventType: job.fixture.textType,
          dealStatus: job.dealStatus || "",
          authoringOrganisation: "Halden Group",
          evidenceEnabled: true,
          editorialEnabled: true,
          complianceEnabled: true,
          sources: promptSources,
        },
      }, reviewed);
      if (reviewed.statusCode !== 200 || reviewed.body?.ok !== true) {
        throw new Error(`review failed for ${job.fixture.textType}: ${reviewed.statusCode} ${reviewed.body?.error || ""}`);
      }
      addSpend(doc.spend, getLlmSpend());
      const range = OUTPUT_TYPE_LENGTH[normalizeOutputType(outputType)];
      const raised = [];
      for (const stmt of reviewed.body?.statements || []) {
        const card = stmt?.qcCard;
        if (!card) continue;
        const traced = shownTrace(card);
        const state = traced.state || shownState(card);
        if (QUIET.has(state)) continue;
        const setBy = traced.setBy || {};
        const statement = card.statement || stmt.text || "";
        raised.push({
          statement,
          state,
          setBy,
          sourceRole: setBy.role || "",
          noteBucket: card.readingNote?.bucket || "",
          reason: readerEvidenceSentence(card) || "",
        });
        bump(doc.counts.byState, state);
        bump(doc.counts.byBranch, setBy.branch);
        if (job.part === "G1" && (confirmationSupportsStatement(statement, job.dealStatus) || statusReading(statement))) {
          doc.statusRaised += 1;
        }
      }
      doc.drafts.push({
        part: job.part,
        textType: job.fixture.textType,
        dealStatus: job.dealStatus || "",
        draft,
        methodologyNote,
        noteWords: countWords(methodologyNote),
        wordCount: countWords(draft),
        range: range ? `${range.min} to ${range.max}` : "",
        raised,
      });
      await writeOutputs(doc, replay);
      console.log(`${job.part} ${job.fixture.textType}: USD ${money(doc.spend.costUsd)}`);
      if (doc.spend.costUsd >= CEILING_USD) {
        doc.stopped = `Ceiling USD ${CEILING_USD} reached after ${job.part} ${job.fixture.textType}.`;
        break;
      }
    }
  } catch (error) {
    doc.stopped = error instanceof Error ? error.message : String(error);
    await writeOutputs(doc, replay);
    console.error(doc.stopped);
    process.exit(1);
  }
  await writeOutputs(doc, replay);
  console.log(`Total spend USD ${money(doc.spend.costUsd)}. Calls ${doc.spend.calls}.`);
  if (doc.stopped) console.log(doc.stopped);
  process.exit(0);
}

main();
