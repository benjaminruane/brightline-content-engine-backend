/**
 * B513 Part H. Role suggestions for every drafting fixture, then eight drafts.
 * Cache off. Ceiling USD 10. The estimate is printed before any call.
 *
 *   node scripts/diagnostic/b513/run.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { SOURCES_DIR } from "../lib/paths.mjs";

loadLocalEnvFiles({ liveMeasurement: true });
process.env.AUTHORING_ORGANISATION = "Halden Group";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "../drafting/fixtures");
const DRAFTING_DIR = path.join(SOURCES_DIR, "drafting");
const STORED = path.resolve(__dirname, "../b512/run.json");
const RUN_JSON = path.join(__dirname, "run.json");
const RESULT_MD = path.join(__dirname, "RESULT.md");
const CEILING_USD = 10;
const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);

const DELETED_FILES = [
  "lib/prompt-library/pg-writing-prompts.mjs",
  "lib/prompt-library/pg-commentary-cleanup.mjs",
  "lib/prompt-library/pg-word-limit.mjs",
  "lib/prompt-library/pg-binding.mjs",
  "tests/pg-word-limit.test.mjs",
  "tests/pg-commentary-cleanup.test.mjs",
];

const DRAFT_JOBS = [
  { textType: "NEW_PRIMARY_COMMITMENT", statuses: [null, "Approved"] },
  { textType: "NEW_DIRECT_INVESTMENT", statuses: [null, "Signed or agreed"] },
  { textType: "NEW_SECONDARY_INVESTMENT", statuses: [null, "Signed or agreed"] },
  { textType: "FUND_REVALUATION", statuses: [null] },
  { textType: "FUND_CAPITAL_CALL", statuses: [null] },
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

async function loadFixtures() {
  const names = (await readdir(FIXTURES_DIR)).filter((name) => name.endsWith(".json")).sort();
  const fixtures = [];
  for (const name of names) {
    fixtures.push(JSON.parse(await readFile(path.join(FIXTURES_DIR, name), "utf8")));
  }
  return fixtures;
}

async function readSource(file) {
  const drafting = path.join(DRAFTING_DIR, file);
  const general = path.join(SOURCES_DIR, file);
  const chosen = existsSync(drafting) ? drafting : general;
  if (!existsSync(chosen)) throw new Error(`source file is missing: ${file}`);
  return readFile(chosen, "utf8");
}

function storedDescriptions() {
  if (!existsSync(STORED)) throw new Error(`stored descriptions are missing: ${STORED}`);
  const stored = JSON.parse(readFileSync(STORED, "utf8"));
  const byType = new Map();
  for (const fixture of stored.fixtures || []) {
    const byFile = new Map();
    for (const role of fixture.roles || []) {
      if (typeof role.description === "string" && role.description.trim()) byFile.set(role.file, role.description.trim());
    }
    byType.set(fixture.textType, byFile);
  }
  return byType;
}

function bump(map, key) {
  const name = key || "(none)";
  map[name] = (map[name] || 0) + 1;
}

function render(doc, replay) {
  const lines = ["# B513", ""];
  lines.push("## Deleted files");
  lines.push("");
  for (const file of DELETED_FILES) lines.push(`- ${file}`);
  lines.push("");
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
  lines.push("");
  lines.push("## Roles");
  lines.push("");
  for (const row of doc.roles) {
    const mark = row.agreed ? "agrees" : "does not agree";
    lines.push(`- ${row.textType} / ${row.file}: suggested ${row.suggestedRole}, fixture ${row.fixtureRole}, ${mark}. ${row.roleReason}`);
  }
  lines.push("");
  lines.push(`Suggested roles agreed with the fixture: ${doc.agreement.agreed} of ${doc.agreement.sources}.`);
  lines.push("");
  for (const row of doc.drafts) {
    lines.push(`## ${row.textType} / ${row.dealStatus || "As the source states"}`);
    lines.push("");
    lines.push(`Words: ${row.wordCount}. Range: ${row.range}.`);
    lines.push("");
    lines.push(row.draft || "(no draft)");
    lines.push("");
    if (!row.raised?.length) lines.push("Raised cards: none.");
    row.raised?.forEach((card, index) => {
      lines.push(`${index + 1}. ${card.shown} (${card.state}). setBy: ${card.setBy?.branch || ""}${card.sourceName ? `, ${card.sourceName}` : ""}${card.sourceRole ? `, ${card.sourceRole}` : ""}.`);
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
  const descriptions = storedDescriptions();
  const { getLlmPricingTable } = await import("../../../lib/observability.js");
  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
  const { outputTypeWordCeiling } = await import("../../../lib/prompt-library/outputTypeGuidance.js");
  const { normalizeOutputType } = await import("../../../lib/output-intent.js");
  const { estimateTokensFromChars, estimateStatementCount, countWords } = await import("../../../lib/qc/token-estimate.mjs");
  const { READING_MODEL } = await import("../../../lib/qc/reading-review.mjs");
  const { READING_NOTE_PROMPT } = await import("../../../lib/qc/reading-contract.mjs");
  const table = getLlmPricingTable();
  const mini = STAGE_MODELS["summarize-source"].model;
  const writer = STAGE_MODELS["writing-generate"].model;
  const reader = STAGE_MODELS["stage2-matching"].model;

  let estimateUsd = 0;
  for (const fixture of fixtures) {
    if (fixture.sources.length < 2) continue;
    const input = estimateTokensFromChars(`x${"x".repeat(800 + fixture.sources.length * 400)}`);
    estimateUsd += price(table, "openai", mini, input, 250);
  }
  const jobs = [];
  for (const plan of DRAFT_JOBS) {
    const fixture = fixtures.find((row) => row.textType === plan.textType);
    if (!fixture) throw new Error(`drafting fixture is missing: ${plan.textType}`);
    for (const dealStatus of plan.statuses) jobs.push({ fixture, dealStatus });
  }
  for (const job of jobs) {
    const loaded = [];
    for (const source of job.fixture.sources) loaded.push(await readSource(source.file));
    const sourceChars = loaded.reduce((sum, text) => sum + text.length, 0);
    const generate = price(table, "openai", writer, estimateTokensFromChars("x".repeat(18000 + sourceChars)), 1200);
    const ceiling = outputTypeWordCeiling(normalizeOutputType(job.fixture.outputType)) || 400;
    const statements = estimateStatementCount(countWords(`${"word ".repeat(ceiling)}`));
    const draftTokens = estimateTokensFromChars(`${"word ".repeat(ceiling)}`);
    let stage2 = 0;
    for (const text of loaded) stage2 += statements * (4500 + estimateTokensFromChars(text) + 80);
    const reviewInput = stage2 + statements * (9088 + draftTokens + 200) + statements * 3400 + statements * 1800 + 5500 + statements * 240;
    const reviewCalls = loaded.length * statements + statements * 3 + 2;
    const review = price(table, "openai", reader, reviewInput, reviewCalls * 400);
    const noteInput = statements * (estimateTokensFromChars(READING_NOTE_PROMPT) + sourceChars / 4 + 200);
    const notes = price(table, "anthropic", READING_MODEL, noteInput, statements * 300);
    estimateUsd += generate + review + notes;
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
    agreement: { agreed: 0, sources: 0 },
    counts: { byState: {}, byBranch: {} },
    roles: [],
    drafts: [],
  };
  const suggest = (await import("../../../api/suggest-roles.js")).default;
  const generate = (await import("../../../api/generate.js")).default;
  const analyse = (await import("../../../api/analyse-statements.js")).default;
  const { getLlmSpend, resetLlmSpend } = await import("../../../lib/observability.js");
  const { roleForSingleSource } = await import("../../../lib/source-summary.mjs");
  const { shownState, shownLabel } = await import("../../../lib/qc/shown-verdict.mjs");
  const { readerEvidenceSentence } = await import("../../../lib/qc/reader-reason.mjs");
  const { OUTPUT_TYPE_LENGTH } = await import("../../../lib/prompt-library/outputTypeGuidance.js");

  try {
    resetLlmSpend();
    for (const fixture of fixtures) {
      const described = descriptions.get(fixture.textType);
      if (!described) throw new Error(`stored descriptions are missing for ${fixture.textType}`);
      if (fixture.sources.length < 2) {
        const single = roleForSingleSource(1);
        for (const source of fixture.sources) {
          doc.roles.push({
            textType: fixture.textType,
            file: source.file,
            fixtureRole: source.role,
            suggestedRole: single.suggestedRole,
            roleReason: single.roleReason,
            agreed: single.suggestedRole === source.role,
          });
          doc.agreement.sources += 1;
          if (single.suggestedRole === source.role) doc.agreement.agreed += 1;
        }
        continue;
      }
      const documents = fixture.sources.map((source) => {
        const description = described.get(source.file);
        if (!description) throw new Error(`stored description is missing for ${source.file}`);
        return { name: source.file, description };
      });
      const res = resStub();
      await suggest({ method: "POST", headers: {}, body: { eventType: fixture.textType, documents } }, res);
      if (res.statusCode !== 200 || !Array.isArray(res.body?.documents)) {
        throw new Error(`suggest roles failed for ${fixture.textType}: ${res.statusCode} ${res.body?.error || ""}`);
      }
      for (const source of fixture.sources) {
        const hit = res.body.documents.find((row) => row.name === source.file);
        if (!hit) throw new Error(`suggest roles omitted ${source.file}`);
        doc.roles.push({
          textType: fixture.textType,
          file: source.file,
          fixtureRole: source.role,
          suggestedRole: hit.suggestedRole,
          roleReason: hit.roleReason,
          agreed: hit.suggestedRole === source.role,
        });
        doc.agreement.sources += 1;
        if (hit.suggestedRole === source.role) doc.agreement.agreed += 1;
      }
    }
    addSpend(doc.spend, getLlmSpend());
    await writeOutputs(doc, replay);
    console.log(`Roles: ${doc.agreement.agreed} of ${doc.agreement.sources}. Spend USD ${money(doc.spend.costUsd)}`);

    for (const job of jobs) {
      if (doc.spend.costUsd >= CEILING_USD) {
        doc.stopped = `Ceiling USD ${CEILING_USD} reached before ${job.fixture.textType}.`;
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
      const generated = resStub();
      await generate({
        method: "POST",
        headers: {},
        body: {
          title: job.fixture.investment,
          notes: job.fixture.specialInstructions || "",
          eventType: job.fixture.textType,
          outputType: job.fixture.outputType,
          visibility: job.fixture.visibility,
          transactionDate: job.fixture.transactionDate,
          investment: job.fixture.investment,
          specialInstructions: job.fixture.specialInstructions || "",
          dealStatus: job.dealStatus || "",
          publicSearch: false,
          sources: promptSources,
          bannedWords: [],
        },
      }, generated);
      if (generated.statusCode !== 200 || generated.body?.ok !== true || typeof generated.body?.draftText !== "string") {
        throw new Error(`generate failed for ${job.fixture.textType}: ${generated.statusCode} ${generated.body?.error || ""}`);
      }
      const draft = generated.body.draftText;
      const preReview = getLlmSpend();
      if (usd(doc.spend.costUsd + preReview.costUsd) >= CEILING_USD) {
        addSpend(doc.spend, preReview);
        doc.drafts.push({ textType: job.fixture.textType, dealStatus: job.dealStatus, draft, wordCount: countWords(draft), range: "", raised: [] });
        doc.stopped = `Ceiling USD ${CEILING_USD} reached after the draft for ${job.fixture.textType}.`;
        break;
      }
      const reviewed = resStub();
      await analyse({
        method: "POST",
        headers: {},
        body: {
          draftText: draft,
          outputType: job.fixture.outputType,
          visibility: job.fixture.visibility,
          eventType: job.fixture.textType,
          dealStatus: job.dealStatus || "",
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
      const outputType = normalizeOutputType(job.fixture.outputType);
      const range = OUTPUT_TYPE_LENGTH[outputType];
      const raised = [];
      for (const stmt of reviewed.body?.statements || []) {
        const card = stmt?.qcCard;
        if (!card) continue;
        const state = shownState(card);
        if (QUIET.has(state)) continue;
        const setBy = card.setBy && typeof card.setBy === "object" ? card.setBy : {};
        raised.push({
          statement: card.statement || stmt.text || "",
          state,
          shown: shownLabel(card) || state,
          setBy,
          sourceName: setBy.sourceName || card.primaryRefTitle || "",
          sourceRole: setBy.role || "",
          reason: readerEvidenceSentence(card) || "",
        });
        bump(doc.counts.byState, state);
        bump(doc.counts.byBranch, setBy.branch);
      }
      doc.drafts.push({
        textType: job.fixture.textType,
        dealStatus: job.dealStatus,
        draft,
        wordCount: countWords(draft),
        range: range ? `${range.min} to ${range.max}` : "",
        raised,
      });
      await writeOutputs(doc, replay);
      console.log(`${job.fixture.textType} ${job.dealStatus || "default"}: USD ${money(doc.spend.costUsd)}`);
      if (doc.spend.costUsd >= CEILING_USD) {
        doc.stopped = `Ceiling USD ${CEILING_USD} reached after ${job.fixture.textType}.`;
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
