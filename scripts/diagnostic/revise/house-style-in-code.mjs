#!/usr/bin/env node
/**
 * Can the house style guide leave the stage 1 prompt?
 *
 * Classifies every rule in the live guide, weighs each class in tokens, and
 * runs fc25060's arm C raw outputs back through the real code normalisers to
 * see whether code catches what the missing guide let through.
 *
 * Zero model calls by default. `--cache-probe` sends two identical prompts to
 * measure the live prompt-cache hit rate (Part 1); it is the only thing here
 * that costs money.
 *
 * Usage: node scripts/diagnostic/revise/house-style-in-code.mjs [--cache-probe]
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;

const { buildRevisionPrompt, applyHouseStyleCharNormalizeToRevision, parseSoftenedMarkers } =
  await import("../../../lib/build-revision-prompt.mjs");
const { applyCutPunctuationNormalizeToRevision } = await import(
  "../../../lib/pr9-cut-punctuation.mjs"
);

const tokens = (s) => Math.round(s.length / 4);

// ---------------------------------------------------------------- classify

const MECHANICAL = "MECHANICAL";
const ENFORCEABLE = "ENFORCEABLE";
const JUDGEMENT = "JUDGEMENT";

/**
 * One entry per rule id in the live guide. `fn` names the existing code that
 * already enforces it; `work` is what an ENFORCEABLE rule would take.
 */
const CLASSIFICATION = {
  smart_quotes: {
    cls: MECHANICAL,
    fn: "normalizePgHouseStyleCharacters (pg-commentary-cleanup.mjs L14-15)",
    why: "Curly quotes are already rewritten to straight ones on every revision.",
  },
  em_dash: {
    cls: MECHANICAL,
    fn: "normalizePgHouseStyleCharacters (pg-commentary-cleanup.mjs L16)",
    why: "En and em dashes are already rewritten to hyphens on every revision.",
  },
  percentage_notation: {
    cls: ENFORCEABLE,
    work: "One regex: /\\b(per cent|percent)\\b/ after a number becomes '%'. No context needed.",
  },
  thousand_separator: {
    cls: ENFORCEABLE,
    work: "Digit-group regex rewriting 5,500 to 5'500. Must skip years and figures inside currency amounts already handled elsewhere.",
  },
  currency_format: {
    cls: ENFORCEABLE,
    work: "Symbol-to-ISO map plus a magnitude-suffix expander: EUR445m becomes EUR 445 million. Finite symbol set, finite suffix set.",
  },
  date_format: {
    cls: ENFORCEABLE,
    work: "Parse the four non-conforming date shapes named in the rule and re-emit DD FullMonthName YYYY. Deterministic given an unambiguous input; 05/26/2026 needs a locale assumption.",
  },
  english_variant: {
    cls: ENFORCEABLE,
    work: "British-to-US word list with a proper-noun exclusion list. The rule already enumerates the pattern; the risk is names like 'Partners Group' and 'Centre Court', which an exclusion list handles.",
  },
  number_spelling: {
    cls: ENFORCEABLE,
    work: "Spell out 0-12, numerals for 13+, with the carve-outs the rule already lists (percentages, currency, dates, ages, units). The carve-outs are all detectable from the adjacent token.",
  },
  oxford_comma: {
    cls: ENFORCEABLE,
    work: "The rule already states the counting algorithm: at least one comma plus a terminal 'and' means three or more items. Insert the comma before 'and'. Nested clauses would need care.",
  },
  defined_term_capitalisation: {
    cls: ENFORCEABLE,
    work: "Detect 'X (the Term)' to build the defined-term set, then case-correct later bare uses. The rule's own carve-outs (lowercase 'the' mid-sentence, undefined terms) are mechanical.",
  },
  active_voice_preference: {
    cls: JUDGEMENT,
    why: "Conditioned on the subject being known and stating it being appropriate. Both require reading the sentence.",
  },
  register_consistency: {
    cls: JUDGEMENT,
    why: "Consistency of tone across a document. No surface form to match on.",
  },
  sentence_structure_clarity: {
    cls: JUDGEMENT,
    why: "'Favour clarity over density' has no deterministic test. A clause-count heuristic would fire on legitimate prose.",
  },
  hyperbole_vs_qualitative: {
    cls: JUDGEMENT,
    why: "The banned word list is detectable, but the required EDIT is the remaining-clause test: delete the evaluative word only if the clause still informs, otherwise keep and flag. It also forbids milder substitution, which needs to know what the replacement would mean.",
  },
  first_person_plural: {
    cls: JUDGEMENT,
    why: "Pronoun substitution is mechanical, but the view-marker test is not: delete 'in our view' when the sentence subject is already the authoring organisation, convert it when it is not. That requires resolving the grammatical subject after substitution, and every hedge and modal must survive.",
  },
};

function parseRules(block) {
  const lines = block.split("\n");
  const header = [];
  const rules = [];
  let current = null;
  const RULE_RE = /^- ([a-z_]+):/;
  for (const line of lines) {
    const m = line.match(RULE_RE);
    if (m) {
      current = { id: m[1], text: `${line}\n` };
      rules.push(current);
      continue;
    }
    if (current) current.text += `${line}\n`;
    else header.push(line);
  }
  return { header: header.join("\n"), rules };
}

// ------------------------------------------------------------- arm C test

/** Style violations we can detect deterministically in a revised statement. */
function styleViolations(text) {
  const found = [];
  if (/[\u2013\u2014]/.test(text)) found.push("en/em dash");
  if (/[\u201C\u201D\u2018\u2019]/.test(text)) found.push("smart quotes");
  if (/\b(per cent|percent)\b/.test(text)) found.push("percent spelled out");
  if (/\d,\d{3}\b/.test(text)) found.push("low-comma thousands separator");
  if (/[€$£]\s?\d/.test(text)) found.push("currency symbol instead of ISO code");
  return found;
}

async function armCThroughCode() {
  const probe = JSON.parse(await readFile(path.join(OUT_DIR, "narrow-call-probe.json"), "utf8"));
  const armC = (probe.probe?.results ?? []).filter((r) => r.arm === "C");

  return armC.map((r) => {
    const before = styleViolations(r.revised);
    // The real chain, in the real order.
    const parsed = parseSoftenedMarkers(r.revised);
    const normalised = applyHouseStyleCharNormalizeToRevision(parsed);
    const cleaned = applyCutPunctuationNormalizeToRevision(normalised);
    const after = styleViolations(cleaned.revisedDraft);
    return {
      run: r.run,
      before: r.revised,
      after: cleaned.revisedDraft,
      violationsBefore: before,
      violationsAfter: after,
      fixed: before.filter((v) => !after.includes(v)),
    };
  });
}

// ----------------------------------------------------------- cache probe

async function cacheProbe() {
  const { loadLocalEnvFiles } = await import("../lib/env.mjs");
  loadLocalEnvFiles({ liveMeasurement: true });
  const { callLLM, flushObservability, hasProviderApiKey, calculateLlmCostUsd } = await import(
    "../../../lib/observability.js"
  );
  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
  const cfg = STAGE_MODELS["writing-rewrite"];
  if (!hasProviderApiKey(cfg.provider)) return { skipped: "no provider API key" };

  const draft = (
    await readFile(path.join(OUT_DIR, "fixtures", "meridian_production_original.txt"), "utf8")
  ).trim();
  const prompt = buildRevisionPrompt(draft, [], {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });

  const runs = [];
  for (let i = 1; i <= 2; i++) {
    const r = await callLLM({
      provider: cfg.provider,
      model: cfg.model,
      temperature: 0,
      seed: 1,
      messages: [{ role: "user", content: prompt }],
      traceName: `cache-probe-${i}`,
      spanName: `cache-probe-${i}`,
    });
    runs.push({
      run: i,
      inputTokens: r.usage?.inputTokens ?? 0,
      cachedInputTokens: r.usage?.cachedInputTokens ?? 0,
      hitRate: r.usage?.cacheHitRate ?? 0,
      costUsd: calculateLlmCostUsd(cfg.provider, cfg.model, r.usage),
    });
  }
  await flushObservability();
  return { model: cfg.model, promptTokens: tokens(prompt), runs };
}

// ------------------------------------------------------------------ main

const TODAY = 8507;
const KIND_RULE = 313;
const VARIABLE = 347;
const NON_STYLE_PREFIX = 4767 - 3560; // shared prefix minus the guide
const MEDIAN = 5.5;
const MAX = 8;

async function main() {
  const prompt = buildRevisionPrompt("x.", [], {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });
  const a = prompt.indexOf("HOUSE STYLE RULES (v4 Review canon");
  const b = prompt.indexOf("CONCERNS TO ADDRESS:");
  const block = prompt.slice(a, b).trimEnd();
  const { header, rules } = parseRules(block);

  const byClass = { [MECHANICAL]: 0, [ENFORCEABLE]: 0, [JUDGEMENT]: 0 };
  const rows = rules.map((r) => {
    const c = CLASSIFICATION[r.id];
    if (!c) throw new Error(`unclassified rule: ${r.id}`);
    const t = tokens(r.text);
    byClass[c.cls] += t;
    return { id: r.id, cls: c.cls, tokens: t, fn: c.fn, work: c.work, why: c.why };
  });

  const headerTokens = tokens(header);
  const guideTotal = tokens(block);
  const trimmed = byClass[JUDGEMENT] + headerTokens;
  const saved = guideTotal - trimmed;

  const wholeCallToday = NON_STYLE_PREFIX + guideTotal + KIND_RULE + VARIABLE;
  const wholeCallTrimmed = wholeCallToday - saved;
  const mult = (n) => (n / TODAY).toFixed(2);

  console.log("");
  console.log("PART 2  can house style leave the prompt");
  console.log(`house style guide: ${guideTotal} tokens across ${rows.length} rules + ${headerTokens} header`);
  console.log("");
  for (const r of rows.sort((x, y) => y.tokens - x.tokens)) {
    console.log(`  ${String(r.tokens).padStart(4)}  ${r.cls.padEnd(12)} ${r.id}`);
  }
  console.log("");
  console.log(`MECHANICAL   ${String(byClass[MECHANICAL]).padStart(4)} tokens  (already enforced in code)`);
  console.log(`ENFORCEABLE  ${String(byClass[ENFORCEABLE]).padStart(4)} tokens  (buildable, not built)`);
  console.log(`JUDGEMENT    ${String(byClass[JUDGEMENT]).padStart(4)} tokens  (cannot leave the prompt)`);
  console.log(`removable:   ${saved} of ${guideTotal} (${Math.round((saved / guideTotal) * 100)}%)`);

  console.log("");
  console.log("ARM C THROUGH THE REAL CODE NORMALISERS");
  const armC = await armCThroughCode();
  let totalBefore = 0;
  let totalFixed = 0;
  for (const r of armC) {
    totalBefore += r.violationsBefore.length;
    totalFixed += r.fixed.length;
    console.log(`  run ${r.run}: before=[${r.violationsBefore.join(", ") || "none"}] after=[${r.violationsAfter.join(", ") || "none"}]`);
    console.log(`    ${r.after}`);
  }
  console.log(`  style violations: ${totalBefore} found, ${totalFixed} fixed by code, ${totalBefore - totalFixed} survived`);

  console.log("");
  console.log(`stage 1 call today:   ${wholeCallToday} tokens`);
  console.log(`stage 1 call trimmed: ${wholeCallTrimmed} tokens`);
  console.log(`  at the ${MEDIAN}-statement median: ${Math.round(wholeCallTrimmed * MEDIAN)} (${mult(wholeCallTrimmed * MEDIAN)}x today)`);
  console.log(`  at the ${MAX}-statement maximum:  ${wholeCallTrimmed * MAX} (${mult(wholeCallTrimmed * MAX)}x today)`);

  const verdict =
    wholeCallTrimmed * MEDIAN <= TODAY * 1.1
      ? `GUIDE CAN BE TRIMMED TO ${trimmed} TOKENS`
      : "GUIDE MUST STAY";
  console.log(`\nVERDICT: ${verdict}`);

  let probe = null;
  if (process.argv.includes("--cache-probe")) {
    console.log("\nPART 1  live prompt-cache probe (two identical calls)");
    probe = await cacheProbe();
    if (probe.skipped) console.log(`  skipped: ${probe.skipped}`);
    else
      for (const r of probe.runs)
        console.log(
          `  run ${r.run}: input=${r.inputTokens} cached=${r.cachedInputTokens} ` +
            `hitRate=${(r.hitRate * 100).toFixed(1)}%  cost=$${r.costUsd.toFixed(5)}`
        );
  }

  await writeFile(
    path.join(OUT_DIR, "house-style-in-code.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        guideTotal,
        headerTokens,
        byClass,
        rules: rows,
        trimmed,
        saved,
        wholeCallToday,
        wholeCallTrimmed,
        verdict,
        armC,
        cacheProbe: probe,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log("\nwrote house-style-in-code.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
