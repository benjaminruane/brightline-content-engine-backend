/**
 * B510. Classify each fixture source, generate one draft, review that draft.
 * Cache off. Ceiling USD 25. The estimate is printed before any call.
 *
 *   node scripts/diagnostic/b510/run.mjs
 */
import { existsSync } from "node:fs";
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
const RUN_JSON = path.join(__dirname, "run.json");
const RESULT_MD = path.join(__dirname, "RESULT.md");
const CEILING_USD = 25;

const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);

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

export async function buildB510Estimate(fixtures) {
  const { getLlmPricingTable } = await import("../../../lib/observability.js");
  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
  const { outputTypeWordCeiling } = await import("../../../lib/prompt-library/outputTypeGuidance.js");
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
    for (const source of fixture.sources) {
      loaded.push(await readSource(source.file));
    }
    let classify = 0;
    for (const source of loaded) {
      const input = estimateTokensFromChars(`${source.text.slice(0, 2000)}\n${"x".repeat(1800)}`);
      classify += price(table, "openai", mini, input, 150);
      classify += price(table, "openai", mini, 800, 180);
    }
    const sourceChars = loaded.reduce((sum, source) => sum + source.text.length, 0);
    const generate = price(
      table,
      "openai",
      writer,
      estimateTokensFromChars("x".repeat(14000 + sourceChars)),
      1000
    );
    const limit = outputTypeWordCeiling(fixture.outputType);
    const words = typeof limit === "number" && limit > 0 ? limit : 400;
    const draft = `${"word ".repeat(words)}`;
    const statements = estimateStatementCount(countWords(draft));
    const draftTokens = estimateTokensFromChars(draft);
    let stage2 = 0;
    for (const source of loaded) {
      const sourceTokens = estimateTokensFromChars(source.text);
      stage2 += statements * (4000 + sourceTokens + 80);
    }
    const editorial = statements * (9088 + draftTokens + 200);
    const compliance = statements * (3000 + 400);
    const stage5 = statements * (1600 + 200);
    const stage1 = 3000 + draftTokens + statements * 40;
    const stage1b = 2500 + statements * 200;
    const reviewInput = stage2 + editorial + compliance + stage5 + stage1 + stage1b;
    const reviewCalls = loaded.length * statements + statements * 3 + 2;
    const review =
      price(table, "openai", reader, reviewInput, reviewCalls * 400);
    const noteInput =
      statements *
      (estimateTokensFromChars(READING_NOTE_PROMPT) +
        loaded.reduce((sum, source) => sum + estimateTokensFromChars(source.text), 0) +
        150);
    const notes = price(table, "anthropic", READING_MODEL, noteInput, statements * 300);
    const row = usd(classify + generate + review + notes);
    rows.push({ textType: fixture.textType, usd: row, words, statements, sources: loaded.length });
    total += row;
  }
  return { usd: usd(total), rows };
}

function cardReason(card) {
  const note = typeof card?.readingNote?.text === "string" ? card.readingNote.text.trim() : "";
  const summary = typeof card?.evidenceSummary === "string" ? card.evidenceSummary.trim() : "";
  const prose = typeof card?.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  const bits = [];
  if (note) bits.push(note);
  if (summary && summary !== note) bits.push(summary);
  if (!bits.length && prose) bits.push(prose);
  for (const concern of [...(card?.editorialConcerns || []), ...(card?.complianceConcerns || [])]) {
    const text = concern?.concernText || concern?.note || "";
    if (typeof text === "string" && text.trim()) bits.push(text.trim());
  }
  return bits.join("\n");
}

function raisedFrom(statements, shownState, shownLabel) {
  const rows = [];
  for (const stmt of Array.isArray(statements) ? statements : []) {
    const card = stmt?.qcCard;
    if (!card || typeof card !== "object") continue;
    const state = shownState(card);
    if (QUIET.has(state)) continue;
    const reason = cardReason(card);
    rows.push({
      statement: typeof card.statement === "string" && card.statement.trim() ? card.statement.trim() : String(stmt?.text || ""),
      shown: shownLabel(card) || state || "",
      reason,
    });
  }
  return rows;
}

function assessmentSummary(summary) {
  if (!summary || typeof summary !== "object") return "The review returned no Assessment summary.";
  const evidence = summary.evidence && typeof summary.evidence === "object" ? summary.evidence : {};
  const parts = [
    `Readiness: ${summary.readiness || "not stated"}.`,
    `Statements: ${summary.statements ?? "not stated"}.`,
  ];
  const bits = [];
  for (const key of ["conflicting", "notSupported", "partial", "beyond", "needsLook", "nothingRaised", "confirmed"]) {
    if (evidence[key]) bits.push(`${key} ${evidence[key]}`);
  }
  if (bits.length) parts.push(`Evidence: ${bits.join(", ")}.`);
  if (summary.editorial) parts.push(`Editorial concerns: ${summary.editorial.concerns ?? 0}.`);
  if (summary.compliance) parts.push(`Compliance concerns: ${summary.compliance.concerns ?? 0}.`);
  return parts.join(" ");
}

function renderResult(doc) {
  const lines = [];
  lines.push("# B510. One draft per text type");
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
  lines.push(
    `Suggested roles agreed with the fixture: ${doc.agreement.agreed} of ${doc.agreement.sources}.`
  );
  lines.push("");
  for (const row of doc.fixtures) {
    lines.push(`## ${row.textType}`);
    lines.push("");
    lines.push("Suggested roles:");
    for (const source of row.roles) {
      const mark = source.agreed ? "agrees" : "does not agree";
      lines.push(`- ${source.file}: suggested ${source.suggestedRole || "(none)"}, fixture ${source.fixtureRole}, ${mark}.`);
    }
    lines.push("");
    lines.push("Draft:");
    lines.push("");
    lines.push(row.draft || "(no draft)");
    lines.push("");
    lines.push("Assessment:");
    lines.push("");
    lines.push(row.assessment || "(no review)");
    lines.push("");
    lines.push("Raised cards:");
    lines.push("");
    if (!row.raised || row.raised.length === 0) {
      lines.push("None.");
    } else {
      row.raised.forEach((card, index) => {
        lines.push(`${index + 1}. ${card.shown}`);
        lines.push("");
        lines.push(card.statement || "(no statement)");
        lines.push("");
        lines.push(card.reason || "(the card did not carry a reason)");
        lines.push("");
      });
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

async function writeOutputs(doc) {
  await writeFile(RUN_JSON, `${JSON.stringify(doc, null, 2)}\n`);
  await writeFile(RESULT_MD, renderResult(doc));
}

async function main() {
  const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
  if (isLlmCacheEnabled()) throw new Error("QC_LLM_CACHE must be off");
  const fixtures = await loadFixtures();
  const estimate = await buildB510Estimate(fixtures);
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
    fixtures: [],
  };
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

  try {
  for (const fixture of fixtures) {
    if (doc.spend.costUsd >= CEILING_USD) {
      doc.stopped = `Ceiling USD ${CEILING_USD} reached before ${fixture.textType}.`;
      break;
    }
    resetLlmSpend();
    const roles = [];
    const promptSources = [];
    for (const source of fixture.sources) {
      const loaded = await readSource(source.file);
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
      doc.fixtures.push({ textType: fixture.textType, roles, draft: "", assessment: "", raised: [] });
      doc.stopped = `Ceiling USD ${CEILING_USD} reached after classification of ${fixture.textType}.`;
      break;
    }

    const generated = resStub();
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
        },
      },
      generated
    );
    if (generated.statusCode !== 200 || generated.body?.ok !== true || typeof generated.body?.draftText !== "string") {
      throw new Error(
        `generate failed for ${fixture.textType}: ${generated.statusCode} ${generated.body?.error || ""}`
      );
    }
    const draft = generated.body.draftText;
    const preReview = getLlmSpend();
    if (usd(doc.spend.costUsd + preReview.costUsd) >= CEILING_USD) {
      addSpend(doc.spend, preReview);
      doc.fixtures.push({ textType: fixture.textType, roles, draft, assessment: "", raised: [] });
      doc.stopped = `Ceiling USD ${CEILING_USD} reached after the draft for ${fixture.textType}.`;
      break;
    }

    const reviewed = resStub();
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
          sources: promptSources.map((source) => ({
            name: source.name,
            label: source.label,
            text: source.text,
            type: "file",
            publicationState: "unknown",
          })),
        },
      },
      reviewed
    );
    if (reviewed.statusCode !== 200 || reviewed.body?.ok !== true) {
      throw new Error(
        `review failed for ${fixture.textType}: ${reviewed.statusCode} ${reviewed.body?.error || ""}`
      );
    }
    const reviewSpend = getLlmSpend();
    addSpend(doc.spend, preReview);
    addSpend(doc.spend, reviewSpend);
    const summary = reviewed.body?.meta?.reviewSummary || null;
    doc.fixtures.push({
      textType: fixture.textType,
      roles,
      draft,
      assessment: assessmentSummary(summary),
      reviewSummary: summary,
      raised: raisedFrom(reviewed.body?.statements, shownState, shownLabel),
    });
    await writeOutputs(doc);
    console.log(
      `${fixture.textType}: spend USD ${money(doc.spend.costUsd)}, roles ${doc.agreement.agreed} of ${doc.agreement.sources}`
    );
    if (doc.spend.costUsd >= CEILING_USD) {
      doc.stopped = `Ceiling USD ${CEILING_USD} reached after ${fixture.textType}.`;
      break;
    }
  }
  } catch (err) {
    doc.stopped = err?.message || String(err);
    await writeOutputs(doc);
    throw err;
  }
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
