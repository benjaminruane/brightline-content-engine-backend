/**
 * B512 Part G. One generate, one review, and a role suggestion for each drafting fixture.
 * Cache off. Ceiling USD 25. The estimate is printed before any call.
 *
 *   node scripts/diagnostic/b512/run.mjs
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { guardDiagnosticRequest } from "../lib/cost-guard.mjs";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import { SOURCES_DIR } from "../lib/paths.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, "../drafting/fixtures");
const DRAFTING_DIR = path.join(SOURCES_DIR, "drafting");
const REPO = path.resolve(__dirname, "../../..");
const RUN_JSON = path.join(__dirname, "run.json");
const RESULT_MD = path.join(__dirname, "RESULT.md");
const CEILING_USD = 25;
const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);

const UNUSED = [
  "compose.mjs no longer calls buildPgWritingScaffold. pg-writing-prompts.mjs still exports it, and the generate and rewrite cleanup still splits on ---METHODOLOGY---. A draft with no delimiter is all commentary.",
  "completeBody and publicBody on NEW_DIRECT_INVESTMENT and NEW_PRIMARY_COMMITMENT are still imported by pg-writing-prompts.mjs. The composed prompt does not use them.",
  "getPgCommentaryWordLimit still feeds the health house-word display (150 complete, 80 public for the two old scaffold types). The generate instrument now uses the output type's upper bound.",
  "DO_NOT_INVENT_FIRM_LINE and the house-identity bullet stay in pg-binding.mjs. The composed prompt no longer includes them.",
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
    getHeader() {
      return undefined;
    },
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
  return {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    unpricedCalls: 0,
    unpricedModels: [],
  };
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

async function loadFixtures() {
  const names = (await readdir(FIXTURES_DIR)).filter((name) => name.endsWith(".json")).sort();
  const rows = [];
  for (const name of names) {
    const fixture = JSON.parse(await readFile(path.join(FIXTURES_DIR, name), "utf8"));
    rows.push(fixture);
  }
  return rows;
}

async function readSource(file) {
  const base = path.basename(file);
  const draftingPath = path.join(DRAFTING_DIR, base);
  const legacyPath = path.join(SOURCES_DIR, base);
  const filePath = existsSync(draftingPath) ? draftingPath : legacyPath;
  if (!existsSync(filePath)) throw new Error(`source file is missing: ${base}`);
  if (base.endsWith(".txt")) {
    return { text: await readFile(filePath, "utf8"), filePath };
  }
  if (base.endsWith(".pdf")) {
    const { extractTextFromSource } = await import("../../../lib/extract-text-from-source.mjs");
    const extracted = await extractTextFromSource(await readFile(filePath), "application/pdf");
    const text = typeof extracted?.text === "string" ? extracted.text : "";
    if (!text.trim()) throw new Error(`no text extracted from ${base}`);
    return { text, filePath };
  }
  throw new Error(`unsupported source file: ${base}`);
}

function price(table, provider, model, inputTokens, outputTokens) {
  const row = table?.[provider]?.[model];
  if (!row) throw new Error(`no published price for ${provider}/${model}`);
  return (inputTokens * row.input + outputTokens * row.output) / 1e6;
}

export async function buildB512Estimate(fixtures) {
  const { getLlmPricingTable } = await import("../../../lib/observability.js");
  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
  const { outputTypeWordCeiling } = await import("../../../lib/prompt-library/outputTypeGuidance.js");
  const { normalizeOutputType } = await import("../../../lib/output-intent.js");
  const { estimateTokensFromChars, estimateStatementCount, countWords } = await import(
    "../../../lib/qc/token-estimate.mjs"
  );
  const { READING_MODEL } = await import("../../../lib/qc/reading-review.mjs");
  const { READING_NOTE_PROMPT } = await import("../../../lib/qc/reading-contract.mjs");
  const table = getLlmPricingTable();
  const mini = STAGE_MODELS["summarize-source"].model;
  const writer = STAGE_MODELS["writing-generate"].model;
  const reader = STAGE_MODELS["stage2-matching"].model;
  let total = 0;
  const rows = [];
  for (const fixture of fixtures) {
    const loaded = [];
    for (const source of fixture.sources) loaded.push(await readSource(source.file));
    let classify = 0;
    for (const source of loaded) {
      const input = estimateTokensFromChars(`${source.text.slice(0, 2000)}\n${"x".repeat(2200)}`);
      classify += price(table, "openai", mini, input, 180);
      classify += price(table, "openai", mini, 800, 180);
    }
    const sourceChars = loaded.reduce((sum, source) => sum + source.text.length, 0);
    const generate = price(
      table,
      "openai",
      writer,
      estimateTokensFromChars("x".repeat(18000 + sourceChars)),
      1200
    );
    const ceiling = outputTypeWordCeiling(normalizeOutputType(fixture.outputType)) || 400;
    const draft = `${"word ".repeat(ceiling)}`;
    const statements = estimateStatementCount(countWords(draft));
    const draftTokens = estimateTokensFromChars(draft);
    let stage2 = 0;
    for (const source of loaded) {
      const sourceTokens = estimateTokensFromChars(source.text);
      stage2 += statements * (4500 + sourceTokens + 80);
    }
    const editorial = statements * (9088 + draftTokens + 200);
    const compliance = statements * (3000 + 400);
    const stage5 = statements * (1600 + 200);
    const stage1 = 3000 + draftTokens + statements * 40;
    const stage1b = 2500 + statements * 200;
    const reviewInput = stage2 + editorial + compliance + stage5 + stage1 + stage1b;
    const reviewCalls = loaded.length * statements + statements * 3 + 2;
    const review = price(table, "openai", reader, reviewInput, reviewCalls * 400);
    const noteInput =
      statements *
      (estimateTokensFromChars(READING_NOTE_PROMPT) +
        loaded.reduce((sum, source) => sum + estimateTokensFromChars(source.text), 0) +
        200);
    const notes = price(table, "anthropic", READING_MODEL, noteInput, statements * 300);
    const row = usd(classify + generate + review + notes);
    rows.push({ textType: fixture.textType, usd: row, words: ceiling, statements, sources: loaded.length });
    total += row;
  }
  return { usd: usd(total), rows };
}

function bump(map, key) {
  const name = key || "(none)";
  map[name] = (map[name] || 0) + 1;
}

function raisedFrom(statements, shownState, shownLabel, sources) {
  const rows = [];
  const byRole = new Map(sources.map((source) => [source.name, source.role]));
  for (const stmt of Array.isArray(statements) ? statements : []) {
    const card = stmt?.qcCard;
    if (!card || typeof card !== "object") continue;
    const state = shownState(card);
    if (QUIET.has(state)) continue;
    const setBy = card.setBy && typeof card.setBy === "object" ? card.setBy : { branch: "" };
    const label = card.primaryRefTitle || card.matchExplanations?.find((row) => row?.sourceLabel)?.sourceLabel || "";
    const match = (card.matchExplanations || []).find((row) => row?.sourceLabel === label);
    const role = setBy.role || match?.role || byRole.get(label) || "";
    rows.push({
      statement: typeof card.statement === "string" && card.statement.trim() ? card.statement.trim() : String(stmt?.text || ""),
      state,
      shown: shownLabel(card) || state || "",
      setBy,
      noteBucket: card.readingNote?.bucket || "",
      noteText: typeof card.readingNote?.text === "string" ? card.readingNote.text.trim() : "",
      quote: typeof card.sourceQuote === "string" && card.sourceQuote.trim()
        ? card.sourceQuote.trim()
        : (typeof card.primaryExcerpt === "string" ? card.primaryExcerpt.trim() : ""),
      sourceName: typeof label === "string" ? label : "",
      sourceRole: role,
    });
  }
  return rows;
}

function tally(fixtures) {
  const byState = {};
  const byBranch = {};
  const byRole = {};
  for (const row of fixtures) {
    for (const card of row.raised || []) {
      bump(byState, card.state);
      bump(byBranch, card.setBy?.branch);
      bump(byRole, card.sourceRole);
    }
  }
  return { byState, byBranch, byRole };
}

function figuresIn(text) {
  const found = [];
  const re = /\b(?:USD|EUR|GBP|SEK|CHF|NOK|DKK)\s+[\d,'’.]+\s*(?:million|billion|thousand)?|\b\d+(?:\.\d+)?\s*(?:%|percent)\b|\b\d{1,3}(?:[',’]\d{3})+(?:\.\d+)?\b/gi;
  let match;
  while ((match = re.exec(String(text || "")))) {
    const figure = match[0].replace(/\s+/g, " ").trim();
    if (figure && !found.includes(figure)) found.push(figure);
  }
  return found;
}

function leaveOutFigures(draft, factsText, exclude) {
  const hits = [];
  const sentences = String(factsText || "").split(/(?<=[.!?])\s+/);
  for (const item of exclude) {
    const keys = item.toLowerCase().replace(/\([^)]*\)/g, "").split(/[^a-z0-9]+/).filter((word) => word.length > 4);
    if (!keys.length) continue;
    for (const sentence of sentences) {
      const low = sentence.toLowerCase();
      const overlap = keys.filter((key) => low.includes(key));
      if (overlap.length < Math.min(2, keys.length)) continue;
      for (const figure of figuresIn(sentence)) {
        if (draft.includes(figure)) hits.push({ item, figure });
      }
    }
  }
  return hits;
}

function sentencesOf(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((row) => row.trim())
    .filter(Boolean);
}

function statusLines(draft, factsText, statusReading) {
  const facts = statusReading(factsText);
  const rows = [];
  for (const sentence of sentencesOf(draft)) {
    const hit = statusReading(sentence);
    if (!hit) continue;
    rows.push({
      sentence,
      draft: `${hit.kind} (${hit.via})`,
      facts: facts ? `${facts.kind} (${facts.via})` : "the facts source states no status the reader recognises",
    });
  }
  return rows;
}

async function promptPair() {
  const { composeBasePrompt } = await import("../../../lib/prompt-library/compose.mjs");
  const opts = {
    outputType: "investor_letter",
    visibility: "complete",
    eventType: "NEW_DIRECT_INVESTMENT",
    transactionDate: "14 March 2025",
    investment: "Helvetia Precision Components AG",
    sources: [],
  };
  const after = composeBasePrompt(opts).basePromptText;
  const wt = path.join(REPO, ".b512-head");
  try {
    execSync(`git worktree remove --force ${JSON.stringify(wt)}`, { cwd: REPO, stdio: "ignore" });
  } catch {
    // No leftover worktree.
  }
  execSync(`git worktree add --detach ${JSON.stringify(wt)} HEAD`, { cwd: REPO, stdio: "ignore" });
  try {
    const mod = await import(pathToFileURL(path.join(wt, "lib/prompt-library/index.js")).href);
    const before = mod.buildBasePrompt(opts).basePromptText;
    return { before, after };
  } finally {
    execSync(`git worktree remove --force ${JSON.stringify(wt)}`, { cwd: REPO, stdio: "ignore" });
  }
}

function renderResult(doc) {
  const lines = [];
  lines.push("# B512. Review reads source roles");
  lines.push("");
  lines.push(`Estimate before the calls: USD ${money(doc.estimateUsd)}.`);
  lines.push("Ceiling USD 25. Cache off. The authoring organisation for this run was Halden Group.");
  if (doc.stopped) lines.push(`Stopped: ${doc.stopped}`);
  lines.push(
    `Total spend: USD ${money(doc.spend.costUsd)}. Calls ${doc.spend.calls}. Unpriced calls ${doc.spend.unpricedCalls}. Cached input tokens ${doc.spend.cachedInputTokens}.`
  );
  if (doc.spend.unpricedCalls > 0) {
    lines.push(`Unpriced models: ${doc.spend.unpricedModels.join(", ") || "(none named)"}. The USD figure is an undercount.`);
  }
  lines.push("");
  lines.push("## Replay");
  lines.push("");
  const replay = doc.replay;
  if (!replay) {
    lines.push("The replay did not run.");
  } else {
    lines.push(`Fixture files resolved: ${replay.fixtureFiles.length}. Missing: ${replay.missingFiles.length}.`);
    lines.push(`Not in the source before: ${replay.beforeNotInSource}. Statement verdict after: ${replay.afterNotInSource}. Shown after: ${replay.afterShownNotInSource}.`);
    lines.push(`Cards whose verdict changed: ${replay.changed}. Labelled true problems that stop being raised: ${replay.lostTrueProblems.length}. Gate: ${replay.gate}.`);
  }
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  const counts = doc.counts || { byState: {}, byBranch: {}, byRole: {} };
  lines.push(`By state: ${JSON.stringify(counts.byState)}`);
  lines.push(`By setBy branch: ${JSON.stringify(counts.byBranch)}`);
  lines.push(`By source role: ${JSON.stringify(counts.byRole)}`);
  lines.push("");
  lines.push(`Suggested roles agreed with the fixture: ${doc.agreement.agreed} of ${doc.agreement.sources}.`);
  lines.push("");
  lines.push("## Now unused");
  lines.push("");
  for (const row of UNUSED) lines.push(`- ${row}`);
  lines.push("");
  lines.push("## NEW_DIRECT_INVESTMENT investor letter, before");
  lines.push("");
  lines.push(doc.promptBefore || "(not captured)");
  lines.push("");
  lines.push("## NEW_DIRECT_INVESTMENT investor letter, after");
  lines.push("");
  lines.push(doc.promptAfter || "(not captured)");
  lines.push("");
  for (const row of doc.fixtures) {
    lines.push(`## ${row.textType}`);
    lines.push("");
    lines.push(`Words: ${row.wordCount ?? "not counted"} against ${row.range || "no range"}.`);
    lines.push("");
    lines.push("Suggested roles:");
    for (const source of row.roles || []) {
      const mark = source.agreed ? "agrees" : "does not agree";
      lines.push(`- ${source.file}: suggested ${source.suggestedRole || "(none)"}, fixture ${source.fixtureRole}, ${mark}.`);
      lines.push(`  Reason: ${source.roleReason || "(none)"}`);
    }
    lines.push("");
    lines.push("Draft:");
    lines.push("");
    lines.push(row.draft || "(no draft)");
    lines.push("");
    lines.push("Leave-out figures that appear in the draft:");
    lines.push("");
    if (!row.leaveOut || row.leaveOut.length === 0) lines.push("None.");
    else for (const hit of row.leaveOut) lines.push(`- ${hit.figure} from "${hit.item}"`);
    lines.push("");
    lines.push("Sentences that state deal status:");
    lines.push("");
    if (!row.status || row.status.length === 0) lines.push("None.");
    else {
      for (const hit of row.status) {
        lines.push(`- Draft says ${hit.draft}. Facts source: ${hit.facts}.`);
        lines.push(`  ${hit.sentence}`);
      }
    }
    lines.push("");
    lines.push("Raised cards:");
    lines.push("");
    if (!row.raised || row.raised.length === 0) {
      lines.push("None.");
    } else {
      row.raised.forEach((card, index) => {
        const setBy = card.setBy || {};
        const who = [setBy.branch || "(no branch)", setBy.sourceName || "", setBy.role || ""].filter(Boolean).join(", ");
        lines.push(`${index + 1}. ${card.shown} (${card.state}). setBy: ${who}. Quote source: ${card.sourceName || "(none)"} (${card.sourceRole || "no role"}). Note: ${card.noteBucket || "(none)"}.`);
        lines.push("");
        lines.push(card.statement || "(no statement)");
        lines.push("");
        if (card.noteText) {
          lines.push(card.noteText);
          lines.push("");
        }
        if (card.quote) {
          lines.push(card.quote);
          lines.push("");
        }
      });
    }
    lines.push("");
  }
  return `${lines.join("\n").replace(/[\u2013\u2014]/g, "-").trim()}\n`;
}

async function writeOutputs(doc) {
  await writeFile(RUN_JSON, `${JSON.stringify(doc, null, 2)}\n`);
  await writeFile(RESULT_MD, renderResult(doc));
}

async function main() {
  const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
  if (isLlmCacheEnabled()) throw new Error("QC_LLM_CACHE must be off");
  const { replay } = await import("./replay.mjs");
  const replayDoc = await replay();
  const fixtures = await loadFixtures();
  const prompts = await promptPair();
  const estimate = await buildB512Estimate(fixtures);
  console.log(`Estimate before the calls: USD ${money(estimate.usd)}`);
  console.log(`Ceiling USD ${CEILING_USD}. Cache off.`);
  const doc = {
    estimateUsd: estimate.usd,
    ceilingUsd: CEILING_USD,
    cache: "off",
    authoringOrganisation: "Halden Group",
    stopped: null,
    spend: emptySpend(),
    agreement: { agreed: 0, sources: 0 },
    counts: { byState: {}, byBranch: {}, byRole: {} },
    replay: {
      fixtureFiles: replayDoc.fixtureFiles,
      missingFiles: replayDoc.missingFiles,
      beforeNotInSource: replayDoc.beforeNotInSource,
      afterNotInSource: replayDoc.afterNotInSource,
      afterShownNotInSource: replayDoc.afterShownNotInSource,
      changed: replayDoc.changed,
      lostTrueProblems: replayDoc.lostTrueProblems,
      gate: replayDoc.gate,
    },
    promptBefore: prompts.before,
    promptAfter: prompts.after,
    fixtures: [],
  };
  if (replayDoc.gate !== "pass") {
    doc.stopped = "The free replay lost a labelled true problem or a fixture file. No calls were made.";
    await writeOutputs(doc);
    console.log(doc.stopped);
    process.exit(0);
  }
  if (estimate.usd > CEILING_USD) {
    doc.stopped = `Estimate USD ${money(estimate.usd)} is above the ceiling of USD ${CEILING_USD}. No calls were made.`;
    await writeOutputs(doc);
    console.log(doc.stopped);
    process.exit(0);
  }

  const generate = (await import("../../../api/generate.js")).default;
  const analyse = (await import("../../../api/analyse-statements.js")).default;
  const summarize = (await import("../../../api/summarize-source.js")).default;
  const { getLlmSpend, resetLlmSpend } = await import("../../../lib/observability.js");
  const { shownState, shownLabel } = await import("../../../lib/qc/shown-verdict.mjs");
  const { countWords } = await import("../../../lib/qc/token-estimate.mjs");
  const { OUTPUT_TYPE_LENGTH } = await import("../../../lib/prompt-library/outputTypeGuidance.js");
  const { normalizeOutputType } = await import("../../../lib/output-intent.js");
  const { textTypeModule } = await import("../../../lib/prompt-library/text-types/index.mjs");
  const { statusReading } = await import("../../../lib/qc/transaction-state.mjs");

  try {
    for (const fixture of fixtures) {
      if (doc.spend.costUsd >= CEILING_USD) {
        doc.stopped = `Ceiling USD ${CEILING_USD} reached before ${fixture.textType}.`;
        break;
      }
      resetLlmSpend();
      const roles = [];
      const promptSources = [];
      const loadedByFile = new Map();
      for (const source of fixture.sources) {
        const loaded = await readSource(source.file);
        loadedByFile.set(source.file, loaded.text);
        const res = resStub();
        await summarize(
          {
            method: "POST",
            headers: {},
            body: {
              name: source.file,
              type: "file",
              mimeType: "text/plain",
              text: loaded.text,
              eventType: fixture.textType,
              sourceCount: fixture.sources.length,
            },
          },
          res
        );
        if (res.statusCode !== 200 || !res.body) {
          throw new Error(`classify failed for ${source.file}: ${res.statusCode}`);
        }
        const suggestedRole = res.body.suggestedRole === "facts" || res.body.suggestedRole === "context" ? res.body.suggestedRole : "";
        const agreed = suggestedRole === source.role;
        roles.push({
          file: source.file,
          fixtureRole: source.role,
          suggestedRole,
          roleReason: typeof res.body.roleReason === "string" ? res.body.roleReason : "",
          description: typeof res.body.description === "string" ? res.body.description : "",
          agreed,
        });
        doc.agreement.sources += 1;
        if (agreed) doc.agreement.agreed += 1;
        promptSources.push({
          name: source.file,
          label: source.file,
          text: loaded.text,
          type: "file",
          role: source.role,
          publicationState: "unknown",
        });
      }
      const preClassify = getLlmSpend();
      if (usd(doc.spend.costUsd + preClassify.costUsd) >= CEILING_USD) {
        addSpend(doc.spend, preClassify);
        doc.fixtures.push({ textType: fixture.textType, roles, draft: "", raised: [], leaveOut: [], status: [] });
        doc.stopped = `Ceiling USD ${CEILING_USD} reached after classification of ${fixture.textType}.`;
        break;
      }

      const generated = resStub();
      await guardDiagnosticRequest({ kind: "generate", sources: promptSources, argv: process.argv });
      await generate(
        {
          method: "POST",
          headers: {},
          body: {
            title: fixture.investment,
            notes: fixture.specialInstructions || "",
            eventType: fixture.textType,
            outputType: fixture.outputType,
            visibility: fixture.visibility,
            transactionDate: fixture.transactionDate,
            investment: fixture.investment,
            specialInstructions: fixture.specialInstructions || "",
            publicSearch: false,
            sources: promptSources,
            bannedWords: [],
            authoringOrganisation: "Halden Group",
          },
        },
        generated
      );
      if (generated.statusCode !== 200 || generated.body?.ok !== true || typeof generated.body?.draftText !== "string") {
        throw new Error(`generate failed for ${fixture.textType}: ${generated.statusCode} ${generated.body?.error || ""}`);
      }
      const draft = generated.body.draftText;
      const preReview = getLlmSpend();
      if (usd(doc.spend.costUsd + preReview.costUsd) >= CEILING_USD) {
        addSpend(doc.spend, preReview);
        doc.fixtures.push({ textType: fixture.textType, roles, draft, raised: [], leaveOut: [], status: [] });
        doc.stopped = `Ceiling USD ${CEILING_USD} reached after the draft for ${fixture.textType}.`;
        break;
      }

      const reviewed = resStub();
      await guardDiagnosticRequest({ kind: "review", sources: promptSources, draftText: draft, argv: process.argv });
      await analyse(
        {
          method: "POST",
          headers: {},
          body: {
            draftText: draft,
            outputType: fixture.outputType,
            visibility: fixture.visibility,
            eventType: fixture.textType,
            evidenceEnabled: true,
            editorialEnabled: true,
            complianceEnabled: true,
            authoringOrganisation: "Halden Group",
            sources: promptSources.map((source) => ({
              name: source.name,
              label: source.label,
              text: source.text,
              type: "file",
              role: source.role,
              publicationState: "unknown",
            })),
          },
        },
        reviewed
      );
      if (reviewed.statusCode !== 200 || reviewed.body?.ok !== true) {
        throw new Error(`review failed for ${fixture.textType}: ${reviewed.statusCode} ${reviewed.body?.error || ""}`);
      }
      const fixtureSpend = getLlmSpend();
      addSpend(doc.spend, fixtureSpend);
      const outputType = normalizeOutputType(fixture.outputType);
      const range = OUTPUT_TYPE_LENGTH[outputType];
      const exclude = textTypeModule(fixture.textType)?.exclude || [];
      const factsText = fixture.sources
        .filter((source) => source.role !== "context")
        .map((source) => loadedByFile.get(source.file) || "")
        .join("\n\n");
      doc.fixtures.push({
        textType: fixture.textType,
        outputType: fixture.outputType,
        roles,
        draft,
        wordCount: countWords(draft),
        range: range ? `${range.min} to ${range.max}` : "",
        leaveOut: leaveOutFigures(draft, factsText, exclude),
        status: statusLines(draft, factsText, statusReading),
        raised: raisedFrom(reviewed.body?.statements, shownState, shownLabel, promptSources),
      });
      doc.counts = tally(doc.fixtures);
      await writeOutputs(doc);
      console.log(`${fixture.textType}: spend USD ${money(doc.spend.costUsd)}, roles ${doc.agreement.agreed} of ${doc.agreement.sources}`);
      if (doc.spend.costUsd >= CEILING_USD) {
        doc.stopped = `Ceiling USD ${CEILING_USD} reached after ${fixture.textType}.`;
        break;
      }
    }
  } catch (err) {
    doc.stopped = err?.message || String(err);
    doc.counts = tally(doc.fixtures);
    await writeOutputs(doc);
    throw err;
  }
  doc.counts = tally(doc.fixtures);
  await writeOutputs(doc);
  console.log(`Total spend USD ${money(doc.spend.costUsd)}`);
  console.log(`Suggested roles ${doc.agreement.agreed} of ${doc.agreement.sources}`);
  if (doc.stopped) console.log(doc.stopped);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
