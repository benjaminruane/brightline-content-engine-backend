#!/usr/bin/env node
/**
 * R6.11a — VERIFY via runEditorialStyleReview (mocked LLM payloads matching B21 failure shape).
 * Run: node --experimental-loader ./scripts/diagnostic/verify-r6-11a-loader.mjs scripts/diagnostic/verify-r6-11a.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "./lib/env.mjs";
import { FIXTURES_DIR } from "./lib/paths.mjs";

loadLocalEnvFiles();
process.env.BRIGHTLINE_EDITORIAL_REVIEW = "1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { default: editorialRules } = await import("../../lib/rulebook/editorialRules.js");
const {
  getOutputTypeLabel,
  normalizeOutputType,
  normalizeVisibility,
  VISIBILITY,
} = await import("../../lib/output-intent.js");
const { normalizeEventType } = await import("../../lib/event-type.js");
const { runEditorialStyleReview } = await import("../../lib/qc/editorial-compliance-reviewer.mjs");
const { extractStatements } = await import("../../lib/extract-statements.mjs");

const CANONICAL_TO_RULEBOOK_OUTPUT = {
  REPORTING_COMMENTARY: "reporting_commentary",
  INVESTOR_LETTER: "investor_letter",
  PRESS_RELEASE: "press_release",
  LINKEDIN_POST: "linkedin_post",
};

function rulebookOutputSlug(canonicalOt) {
  return CANONICAL_TO_RULEBOOK_OUTPUT[canonicalOt] ?? "reporting_commentary";
}

function rulebookVersionSlug(visibility) {
  return visibility === VISIBILITY.PUBLIC ? "public" : "complete";
}

function filterRulesForRun(rules, outputSlug, versionSlug) {
  return rules.filter((r) => {
    if (!Array.isArray(r.appliesTo) || !r.appliesTo.includes(outputSlug)) return false;
    if (r.appliesToVersion == null) return true;
    if (Array.isArray(r.appliesToVersion) && r.appliesToVersion.includes(versionSlug)) return true;
    return false;
  });
}

async function loadFixture(id) {
  const name =
    id === "14" ? "14_synth_thesis_only_memo.json" : "20_synth_fund_close_announcement.json";
  const raw = await readFile(path.join(FIXTURES_DIR, name), "utf8");
  return JSON.parse(raw);
}

function statementAt(fixture, index) {
  const { candidates } = extractStatements({
    mode: "draft",
    text: fixture.draft,
    opts: { engine: "v2" },
  });
  if (!candidates[index]) {
    throw new Error(`fixture ${fixture.id} has no statement index ${index}`);
  }
  return candidates[index];
}

function buildReviewArgs(fixture, sentenceText, statementIndex) {
  const cfg = fixture.config ?? {};
  const outputType = normalizeOutputType(cfg.outputType);
  const requiredVersion = normalizeVisibility(cfg.requiredVersion);
  const outputSlug = rulebookOutputSlug(outputType);
  const versionSlug = rulebookVersionSlug(requiredVersion);
  const editorialFiltered = filterRulesForRun(editorialRules, outputSlug, versionSlug);
  const draft = typeof fixture.draft === "string" ? fixture.draft : "";
  return {
    sentenceText,
    outputType,
    outputTypeLabel: getOutputTypeLabel(outputType),
    requiredVersion,
    draftText: draft,
    eventType: normalizeEventType(cfg.eventType),
    evidenceExcerpt: null,
    contextBefore: null,
    contextAfter: null,
    evidenceBlock: "(No excerpt text available for this statement.)",
    editorialRules: editorialFiltered,
    outputSlug,
    traceId: "verify-r6-11a",
    statementIndex,
  };
}

const MOCK = {
  case1: JSON.stringify({
    concerns: [
      {
        category: "editorial",
        ruleId: "first_person_plural",
        note: "The statement uses 'We expect' which is first-person plural voice.",
        suggestedDirection:
          "Replace 'We expect' with 'Partners Group expects' or third-person framing.",
      },
      {
        category: "editorial",
        ruleId: "overreach_unsupported_causal",
        note: "The phrase 'bring a specific potential investment' implies a committed deal without support.",
        suggestedDirection:
          "Replace with hedged language that does not imply a named or specific investment is forthcoming.",
      },
    ],
    verdict: "concern",
    verdictNote: "",
  }),
  case2: JSON.stringify({
    concerns: [
      {
        category: "editorial",
        ruleId: "first_person_plural",
        note: "The statement uses 'Fund V' in a first-person deployment framing inconsistent with reporting commentary voice.",
        suggestedDirection:
          "Replace 'Fund V will be deployed' with third-person institutional voice (e.g. 'The Fund will deploy').",
      },
    ],
    verdict: "concern",
    verdictNote: "",
  }),
  case3: JSON.stringify({
    concerns: [
      {
        category: "style_guide",
        ruleId: "percentage_notation",
        rule: "percentage_notation",
        note: "The statement uses '96 percent' instead of the % symbol.",
        suggestedDirection: "Replace '96 percent' with '96%'.",
      },
      {
        category: "editorial",
        ruleId: "oxford_comma",
        note: "The list lacks an Oxford comma before 'and' in a three-or-more-item list.",
        suggestedDirection:
          "Insert a comma before 'and' in 'three of the largest US public pension funds, two Asian sovereign wealth funds, and a number'.",
      },
    ],
    verdict: "concern",
    verdictNote: "",
  }),
  case4: JSON.stringify({
    concerns: [
      {
        category: "editorial",
        ruleId: "made_up_rule",
        note: "Fabricated concern for control test.",
        suggestedDirection: "Remove the fabricated violation.",
      },
    ],
    verdict: "concern",
    verdictNote: "",
  }),
};

const capturedUserPayloads = [];
const editorialLogs = [];
const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);

function hookConsole() {
  const capture = (write, args) => {
    const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (
      line.includes("[EDITORIAL_STYLE_REVIEW] concern reclassified") ||
      line.includes("[EDITORIAL_STYLE_REVIEW] concern dropped")
    ) {
      editorialLogs.push(line);
    }
    write(...args);
  };
  console.log = (...args) => capture(origLog, args);
  console.warn = (...args) => capture(origWarn, args);
}

function printCaseHeader(n, label) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`CASE ${n}: ${label}`);
  console.log("=".repeat(72));
}

function printResult(result, canaries) {
  console.log("\n--- editorialConcerns (final array) ---");
  console.log(JSON.stringify(result?.editorialConcerns ?? null, null, 2));
  console.log("\n--- resolved fields ---");
  console.log("editorialVerdict:", JSON.stringify(result?.editorialVerdict ?? null));
  console.log("editorialNote:", JSON.stringify(result?.editorialNote ?? null));
  console.log("schemaValid:", JSON.stringify(result?.schemaValid ?? null));
  console.log("retried:", JSON.stringify(result?.retried ?? null));
  console.log("\n--- [reclassified]/[dropped] log lines ---");
  if (editorialLogs.length === 0) {
    console.log("(none)");
  } else {
    for (const line of [...new Set(editorialLogs)]) console.log(line);
  }
  console.log("\n--- canaries ---");
  if (!canaries.length) {
    console.log("(none)");
  } else {
    for (const c of canaries) console.log(JSON.stringify(c));
  }
}

async function runCase({ n, label, fixture, statementIndex, mockKey, sentenceOverride }) {
  editorialLogs.length = 0;
  globalThis.__R611A_CANARIES = [];
  capturedUserPayloads.length = 0;

  globalThis.__R611A_MOCK_HANDLER = async ({ messages, metadata }) => {
    const attempt = (metadata?.attempt ?? capturedUserPayloads.length) + 1;
    const user = messages?.find((m) => m.role === "user")?.content ?? "";
    capturedUserPayloads.push({ attempt, user });
    return MOCK[mockKey];
  };

  const sentenceText = sentenceOverride ?? statementAt(fixture, statementIndex);
  console.log("\n--- sentenceText ---");
  console.log(sentenceText);

  const args = buildReviewArgs(fixture, sentenceText, statementIndex);
  const result = await runEditorialStyleReview(args);
  printCaseHeader(n, label);
  printResult(result, globalThis.__R611A_CANARIES);
  return { result, capturedUserPayloads, editorialLogs };
}

async function main() {
  hookConsole();

  const f14 = await loadFixture("14");
  const f20 = await loadFixture("20");

  // B21 F14.S11 — diagnostic index 11 = investment expectation sentence (not v2 split S11 fragment).
  const f14s11 =
    "We expect to bring a specific potential investment to consider over the coming months.";

  await runCase({
    n: 1,
    label: "F14 S11 — first_person_plural (mis editorial) + overreach_unsupported_causal",
    fixture: f14,
    statementIndex: 11,
    mockKey: "case1",
    sentenceOverride: f14s11,
  });

  // B21 F20.S6 — use pipeline-index sentence with first-person (v2 S8 has Our/we; B21 may map to S6 deploy line — run mock on S6 text per spec).
  await runCase({
    n: 2,
    label: "F20 S6 — first_person_plural mis-tagged editorial",
    fixture: f20,
    statementIndex: 6,
    mockKey: "case2",
  });

  // B21 F20.S4 — percentage_notation + oxford_comma mis-tagged
  await runCase({
    n: 3,
    label: "F20 S4 — percentage_notation + oxford_comma (mis editorial)",
    fixture: f20,
    statementIndex: 4,
    mockKey: "case3",
  });

  const case4 = await runCase({
    n: 4,
    label: "FORCED TOTAL FAILURE — made_up_rule",
    fixture: f20,
    statementIndex: 0,
    mockKey: "case4",
    sentenceOverride: "Synthetic control statement for unknown ruleId.",
  });

  printCaseHeader(5, "RETRY FEEDBACK — attempt 2 user content vs attempt 1 (case 4)");
  console.log("\n--- attempt 1 user content (tail) ---");
  const u1 = case4.capturedUserPayloads[0]?.user ?? "";
  console.log(u1.length > 400 ? u1.slice(-400) : u1);
  console.log("\n--- attempt 2 user content (full appended section) ---");
  const u2 = case4.capturedUserPayloads[1]?.user ?? "";
  if (!u2) {
    console.log("(missing — only one LLM call recorded)");
  } else {
    const marker = "made_up_rule";
    const idx = u2.indexOf(marker);
    if (idx >= 0) {
      console.log(u2.slice(Math.max(0, idx - 80)));
    } else {
      console.log(u2);
    }
  }
  console.log("\n--- diff summary ---");
  console.log("attempt2 longer than attempt1:", u2.length > u1.length);
  console.log("attempt2 includes made_up_rule correction:", u2.includes("made_up_rule"));
}

main().catch((err) => {
  console.error("[verify-r6-11a] fatal:", err?.message || err);
  process.exit(1);
});
