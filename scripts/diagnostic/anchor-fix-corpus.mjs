#!/usr/bin/env node
/**
 * Measure the author-anchor fix (b55ab00) against the full graded corpus, and
 * re-baseline on the current model configuration.
 *
 * HOW FIX AND DRIFT ARE SEPARATED. The spec proposed re-running the moved
 * statements with the fix disabled. There is a cleaner separation available,
 * because of where the fix sits:
 *
 *   corePropositionConfirmed is DOWNSTREAM of the Stage 2 model call. Stage 2
 *   takes a statement and a source and returns a classification and a passage;
 *   the anchor fix then runs over that passage inside the relevance and
 *   authority gates. So the fix CANNOT change a Stage 2 classification.
 *
 * That splits the two cleanly and exactly:
 *   - any Stage 2 classification movement against the baseline is DRIFT,
 *     by construction, and is measured live here
 *   - the fix's own effect is deterministic, so it is measured by replaying
 *     the gate with the fix on and off, at zero cost and with zero model
 *     variance
 *
 * Toggling the fix needs no code change. corroborationAnchor skips a name only
 * when isAuthoringOrganisationName says so, and that returns false for
 * everything when no organisation is configured. Unsetting AUTHORING_ORGANISATION
 * therefore reproduces the pre-fix behaviour exactly.
 *
 * Usage:
 *   node scripts/diagnostic/anchor-fix-corpus.mjs            parts 1-4
 *   node scripts/diagnostic/anchor-fix-corpus.mjs --replay   free parts only
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "./lib/env.mjs";
import { loadAllFixtures } from "./lib/fixtures.mjs";
import { loadPipelineSources } from "./lib/sources.mjs";
import { DIAG_ROOT, REPO_ROOT } from "./lib/paths.mjs";
import { BASELINE_PATH } from "./claim-spans/baseline-cache.mjs";
import { fingerprintFromCompletion } from "./eval-ablation/fingerprint.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, calculateLlmCostUsd, flushObservability, hasProviderApiKey } = await import(
  "../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../lib/qc/model-config.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const EVAL_DIR = path.join(__dirname, "eval-ablation");
const STAGE2_PROMPT_PATH = path.join(REPO_ROOT, "lib/qc/pipeline-v4/prompts/stage2_v4.md");
const MANIFEST_PATH = path.join(__dirname, "fingerprint-manifest.json");

const STAGE2_SEED = 1;
const CONCURRENCY = 6;
const COST_CEILING_USD = 5;

const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const trunc = (s, n = 76) => {
  const t = norm(s);
  return t.length <= n ? t : `${t.slice(0, n - 1)}\u2026`;
};

/* ------------------------------------------------------------------ *
 * The graded corpus
 * ------------------------------------------------------------------ */

/**
 * The 29 graded cases. Replicated from run-r10-corpus-blast.mjs rather than
 * imported, because that harness exports nothing; only the CORPUS pairs are
 * built here, not the planted or probe rows, since those are a different
 * experiment.
 */
const NORDHOLT_DIR = path.join(process.env.HOME || "", "Downloads");
const SUPERSESSION_DIR = path.join(DIAG_ROOT, "supersession");
const ACCIDENT_DIR = path.join(DIAG_ROOT, "claim-spans/evaluative-accident");

async function loadNordholt() {
  const files = [
    ["source_1_ic_memo.txt", "IC memo"],
    ["source_2_press_release.txt", "press release"],
    ["source_3_fact_sheet.txt", "fact sheet"],
    ["source_4_lp_update.txt", "LP update"],
  ];
  const sources = [];
  for (const [name, label] of files) {
    sources.push({ text: await readFile(path.join(NORDHOLT_DIR, name), "utf8"), label });
  }
  return sources;
}

async function loadSupersession() {
  const names = [
    "source_A_annual_report_2019.txt",
    "source_B_fy2024_results.txt",
    "source_C_fund_update_2026.txt",
  ];
  const sources = [];
  for (const name of names) {
    sources.push({
      label: name.replace(/\.txt$/, ""),
      text: await readFile(path.join(SUPERSESSION_DIR, name), "utf8"),
    });
  }
  return sources;
}

async function buildCorpusPairs() {
  const baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8"));
  const caseSources = {};

  // The six cases that do not come from the fixture pack. Nordholt lives
  // outside the repo, so it is optional; the rest are committed.
  try {
    const nord = await loadNordholt();
    caseSources["nordholt-clean"] = nord;
    caseSources["nordholt-dirty"] = nord;
  } catch {
    /* nordholt sources are not in the repo; reported as skipped */
  }
  caseSources.supersession = await loadSupersession();
  const evalSource = [
    { text: await readFile(path.join(ACCIDENT_DIR, "source_ic_memo.txt"), "utf8"), label: "ic_memo" },
  ];
  for (const id of ["E1", "E2", "E3"]) caseSources[id] = evalSource;

  const fixtures = await loadAllFixtures();
  for (const fx of fixtures) {
    const n = parseInt(String(fx.data.id), 10);
    if (!Number.isFinite(n) || n < 1 || n > 23) continue;
    caseSources[`F${String(n).padStart(2, "0")}`] = await loadPipelineSources(
      fx.data.sources || []
    );
  }

  const pairs = [];
  const skipped = [];
  for (const [caseLabel, row] of Object.entries(baseline.cases)) {
    const sources = caseSources[caseLabel];
    if (!sources || !sources.length) {
      skipped.push(caseLabel);
      continue;
    }
    const byIdx = new Map((row.statements || []).map((s) => [s.index, s]));
    for (const m of row.matches || []) {
      const st = byIdx.get(m.statementIndex);
      const src = sources[m.sourceIndex];
      if (!st?.text || !src?.text) continue;
      pairs.push({
        pairId: `${caseLabel}:S${m.statementIndex}:${m.sourceLabel}`,
        caseLabel,
        statementIndex: m.statementIndex,
        statementId: `${caseLabel}_S${m.statementIndex}`,
        statementText: st.text,
        sourceLabel: m.sourceLabel || src.label,
        sourceText: src.text,
      });
    }
  }
  return { pairs, skipped };
}

/** Baseline rows for the same corpus, on the same prompt (variant R10). */
async function baselineRows() {
  const j = JSON.parse(await readFile(path.join(EVAL_DIR, "r10-corpus-blast-rows.json"), "utf8"));
  const rows = j.corpusRows.filter((r) => r.variantId === "R10" && r.plant === "CORPUS");
  return { rows, meta: j.meta, byPair: new Map(rows.map((r) => [r.pairId, r])) };
}

/* ------------------------------------------------------------------ *
 * The fix, isolated: deterministic, zero cost
 * ------------------------------------------------------------------ */

const ORG_ENV = "AUTHORING_ORGANISATION";

/**
 * Evaluate a thunk with the anchor fix on (an organisation configured) or off
 * (none configured, so isAuthoringOrganisationName skips nothing and the anchor
 * falls back to the first Title-Case run, which is the pre-fix behaviour).
 */
function withFix(orgOrNull, fn) {
  const prev = process.env[ORG_ENV];
  if (orgOrNull) process.env[ORG_ENV] = orgOrNull;
  else delete process.env[ORG_ENV];
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[ORG_ENV];
    else process.env[ORG_ENV] = prev;
  }
}

/**
 * Which organisation would be configured when this case runs? The corpus is
 * written from more than one client's point of view, so the fix is measured
 * against every organisation the corpus actually names, not just the one in
 * .env.local. That is the fix's widest possible blast radius.
 */
const ORGANISATION_TAIL_RE =
  /\b(?:Group|Capital|Partners|Holdings|Management|Advisors|Advisers|Investments|Ventures|Asset\s+Management|LLP|LLC|Inc|Ltd|plc|AG|SA|NV|GmbH)\b/;

/**
 * Which organisation might be configured when a case runs?
 *
 * The corpus is written from more than one client's point of view, so the fix
 * is exercised against every organisation the corpus plausibly writes AS, not
 * only the one in .env.local. Sentence-leading words that merely look like names
 * ("Across", "Female", "Second") are excluded: configuring one as the authoring
 * organisation is not a state the product can be in, and testing it would
 * manufacture movements that cannot happen.
 */
function candidateOrganisations(pairs) {
  const counts = new Map();
  for (const p of pairs) {
    for (const m of String(p.statementText).match(/\b[A-Z][a-zA-Z&'-]+(?:\s+[A-Z][a-zA-Z&'-]+){0,3}\b/g) ?? []) {
      if (!ORGANISATION_TAIL_RE.test(m)) continue;
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Replay the two gates the anchor feeds, with the fix on and off.
 *
 * Only the relevance gate can move what a user sees: it turns a partial_support
 * excerpt from weak/not-displayable into acceptable/displayable. The authority
 * gate uses the same call only to choose commentary wording for an already
 * partial verdict, so it is recorded but cannot move a verdict.
 */
async function replayFix(pairs, passageFor, organisations) {
  const { corePropositionConfirmed, inferClaimTypeForRelation } = await import(
    "../../lib/qc/evidence-relationship.mjs"
  );
  const { evaluateSupportRelevance } = await import("../../lib/qc/evidence-relevance.mjs");

  const moved = [];
  let evaluated = 0;

  for (const org of organisations) {
    for (const p of pairs) {
      const passage = passageFor(p);
      if (!passage || passage === "(excerpt not captured)") continue;
      evaluated += 1;

      const core = (o) =>
        withFix(o, () =>
          corePropositionConfirmed(p.statementText, passage, {
            claimType: inferClaimTypeForRelation(p.statementText),
          }).corePropositionConfirmed
        );
      const on = core(org);
      const off = core(null);
      if (on === off) continue;

      // The gate the user feels: partial_support with compatible roles.
      const gate = (o) =>
        withFix(o, () =>
          evaluateSupportRelevance({
            statementText: p.statementText,
            candidateExcerpt: passage,
            matchType: "partial_support",
            statementRole: "fact",
            evidenceRole: "fact",
          })
        );
      const gOn = gate(org);
      const gOff = gate(null);

      moved.push({
        org,
        pairId: p.pairId,
        caseLabel: p.caseLabel,
        statementId: p.statementId,
        statementText: norm(p.statementText),
        sourceLabel: p.sourceLabel,
        passage: norm(passage),
        coreBefore: off,
        coreAfter: on,
        displayEligibleBefore: gOff.displayEligible,
        displayEligibleAfter: gOn.displayEligible,
        reasonBefore: gOff.reasonCode,
        reasonAfter: gOn.reasonCode,
        direction:
          gOn.displayEligible && !gOff.displayEligible
            ? "towards supported"
            : !gOn.displayEligible && gOff.displayEligible
              ? "away from supported"
              : "no display change",
      });
    }
  }
  return { moved, evaluated };
}

/* ------------------------------------------------------------------ *
 * Part 1: the live corpus run
 * ------------------------------------------------------------------ */

function safeJsonParse(text) {
  const t = String(text ?? "").replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

async function matchOnce({ systemPrompt, pair }) {
  const stageModel = STAGE_MODELS["stage2-matching"];
  const completion = await callLLM({
    provider: stageModel.provider,
    model: stageModel.model,
    temperature: 0,
    seed: STAGE2_SEED,
    responseFormat: "json",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Statement:\n${pair.statementText}\n\nSource:\n${pair.sourceText}` },
    ],
    traceName: "diag-anchor-fix-corpus",
    spanName: "stage2-anchor-fix-corpus",
    metadata: { pairId: pair.pairId },
  });
  const parsed = safeJsonParse(completion?.text ?? "");
  return {
    classification: parsed?.classification ?? null,
    explanation: parsed?.explanation ?? "",
    passage: parsed?.passage ?? parsed?.excerpt ?? "",
    systemFingerprint: fingerprintFromCompletion(completion),
    costUsd: Number(calculateLlmCostUsd(stageModel.provider, stageModel.model, completion?.usage)) || 0,
  };
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  const { pairs, skipped } = await buildCorpusPairs();
  const cases = new Set(pairs.map((p) => p.caseLabel));
  const statements = new Set(pairs.map((p) => p.statementId));
  console.log("=== THE GRADED CORPUS ===\n");
  console.log(`  ${cases.size} cases, ${statements.size} statements, ${pairs.length} pairs`);
  if (skipped.length) console.log(`  cases without loadable sources, skipped: ${skipped.join(", ")}`);

  const base = await baselineRows();
  console.log(
    `  committed baseline: r10-corpus-blast-rows.json variant R10, ${base.rows.length} CORPUS rows`
  );
  const liveSha = sha256((await readFile(STAGE2_PROMPT_PATH, "utf8")).trim());
  console.log(`  live stage2_v4.md sha ${liveSha.slice(0, 12)}`);
  console.log(
    `  baseline R10 prompt sha ${String(base.meta?.promptMeta?.R10?.sha256 ?? "?").slice(0, 12)}` +
      `  (same prompt: ${liveSha === base.meta?.promptMeta?.R10?.sha256})`
  );
  console.log(
    `  baseline fingerprints: ${[...new Set(base.rows.map((r) => r.systemFingerprint))].join(", ")}\n`
  );

  const orgs = candidateOrganisations(pairs);
  console.log("  organisations the corpus writes as:");
  for (const [name, n] of orgs.slice(0, 8)) console.log(`    ${String(n).padStart(3)}  ${name}`);
  const orgNames = [...new Set([...orgs.map(([n]) => n), process.env[ORG_ENV]].filter(Boolean))];
  console.log(`  testing the fix under ${orgNames.length} candidate organisations`);

  /* ---- the fix, on the baseline's own passages: free and exact ---- */
  console.log("\n=== THE FIX, REPLAYED ON THE BASELINE PASSAGES (zero cost) ===\n");
  const basePassage = (p) => base.byPair.get(p.pairId)?.passage ?? "";
  const replayBaseline = await replayFix(pairs, basePassage, orgNames);
  console.log(
    `  evaluated ${replayBaseline.evaluated} statement-passage pairs across ${orgNames.length} organisations`
  );
  console.log(`  core-proposition results the fix changed: ${replayBaseline.moved.length}`);
  for (const m of replayBaseline.moved) {
    console.log(
      `    [${m.org}] ${m.pairId}  core ${m.coreBefore}->${m.coreAfter}  display ${m.displayEligibleBefore}->${m.displayEligibleAfter}  (${m.direction})`
    );
    console.log(`       stmt: ${trunc(m.statementText)}`);
    console.log(`       pass: ${trunc(m.passage)}`);
  }

  if (process.argv.includes("--replay")) {
    await writeFile(
      path.join(OUT_DIR, "anchor-fix-corpus.json"),
      `${JSON.stringify({ ranAt: new Date().toISOString(), pairs: pairs.length, orgs, replayBaseline }, null, 2)}\n`,
      "utf8"
    );
    console.log("\nwrote anchor-fix-corpus.json (replay only)");
    return;
  }

  /* ---- Part 1: the live corpus run ---- */
  const stageModel = STAGE_MODELS["stage2-matching"];
  const perPair =
    base.rows.reduce((a, r) => a + (r.costUsd || 0), 0) / Math.max(1, base.rows.length);
  const estimate = perPair * pairs.length;
  console.log("\n=== PART 1, LIVE CORPUS RUN ON THE CURRENT CONFIGURATION ===\n");
  console.log(`  model ${stageModel.provider}/${stageModel.model}, seed ${STAGE2_SEED}, cache off`);
  console.log(
    `  estimated cost $${estimate.toFixed(2)} for ${pairs.length} calls, ceiling $${COST_CEILING_USD.toFixed(2)}\n`
  );
  if (estimate > COST_CEILING_USD) throw new Error(`estimate exceeds the $${COST_CEILING_USD} ceiling`);
  if (!hasProviderApiKey(stageModel.provider)) {
    console.log("  no provider API key; cannot run");
    return;
  }

  const systemPrompt = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  let done = 0;
  let cost = 0;
  const results = await mapPool(pairs, CONCURRENCY, async (pair) => {
    const r = await matchOnce({ systemPrompt, pair });
    cost += r.costUsd;
    done += 1;
    if (done % 50 === 0 || done === pairs.length) {
      console.log(`  progress ${done}/${pairs.length}  accrued $${cost.toFixed(2)}`);
    }
    return { ...pair, ...r };
  });

  const fingerprints = [...new Set(results.map((r) => r.systemFingerprint).filter(Boolean))];
  console.log(`\n  fingerprints observed: ${fingerprints.join(", ")}`);
  console.log(`  cost $${cost.toFixed(4)}`);

  /* ---- drift: any Stage 2 movement, which the fix cannot cause ---- */
  const drift = [];
  for (const r of results) {
    const b = base.byPair.get(r.pairId);
    if (!b) continue;
    if (b.classification !== r.classification) {
      drift.push({
        pairId: r.pairId,
        caseLabel: r.caseLabel,
        statementText: norm(r.statementText),
        from: b.classification,
        to: r.classification,
        baselineFingerprint: b.systemFingerprint,
        fingerprint: r.systemFingerprint,
      });
    }
  }
  const towards = (from, to) => {
    const rank = { no_support: 0, conflicting: 0, partially_confirmed: 1, confirmed: 2 };
    return (rank[to] ?? 0) - (rank[from] ?? 0);
  };
  const driftUp = drift.filter((d) => towards(d.from, d.to) > 0);
  const driftDown = drift.filter((d) => towards(d.from, d.to) < 0);
  console.log(`\n  Stage 2 classifications moved: ${drift.length} of ${results.length}`);
  console.log(`    towards supported: ${driftUp.length}`);
  console.log(`    away from supported: ${driftDown.length}`);
  console.log(`    lateral: ${drift.length - driftUp.length - driftDown.length}`);
  for (const d of drift) {
    console.log(`      ${d.pairId}  ${d.from} -> ${d.to}`);
  }

  /* ---- the fix, replayed on today's passages too ---- */
  console.log("\n=== THE FIX, REPLAYED ON TODAY'S PASSAGES ===\n");
  const todayPassage = new Map(results.map((r) => [r.pairId, r.passage]));
  const replayToday = await replayFix(pairs, (p) => todayPassage.get(p.pairId) ?? "", orgNames);
  console.log(`  core-proposition results the fix changed: ${replayToday.moved.length}`);
  for (const m of replayToday.moved) {
    console.log(
      `    [${m.org}] ${m.pairId}  display ${m.displayEligibleBefore}->${m.displayEligibleAfter} (${m.direction})`
    );
    console.log(`       stmt: ${trunc(m.statementText)}`);
    console.log(`       pass: ${trunc(m.passage)}`);
  }

  const allMoved = [...replayBaseline.moved, ...replayToday.moved];
  const fixTowards = allMoved.filter((m) => m.direction === "towards supported");
  console.log(
    `\n  FIX SUMMARY: ${allMoved.length} core changes, ${fixTowards.length} of them move a statement towards supported`
  );

  await writeFile(
    path.join(OUT_DIR, "anchor-fix-corpus.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        model: `${stageModel.provider}/${stageModel.model}`,
        promptSha: liveSha,
        cases: cases.size,
        statements: statements.size,
        pairs: pairs.length,
        fingerprints,
        costUsd: cost,
        orgs,
        drift,
        driftUp,
        driftDown,
        replayBaseline,
        replayToday,
        fixTowards,
        results: results.map((r) => ({
          pairId: r.pairId,
          caseLabel: r.caseLabel,
          statementId: r.statementId,
          statementIndex: r.statementIndex,
          statementText: r.statementText,
          sourceLabel: r.sourceLabel,
          classification: r.classification,
          passage: r.passage,
          explanation: r.explanation,
          systemFingerprint: r.systemFingerprint,
          costUsd: r.costUsd,
        })),
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log("\nwrote anchor-fix-corpus.json");

  /* ---- Part 4: promote only on zero WRONG, which Part 2 adjudicates ---- */
  if (fixTowards.length === 0) {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8").catch(() => "{}"));
    manifest.corpusBaseline = {
      promotedAt: new Date().toISOString(),
      source: "scripts/diagnostic/anchor-fix-corpus.json",
      model: `${stageModel.provider}/${stageModel.model}`,
      promptSha: liveSha,
      fingerprints,
      cases: cases.size,
      statements: statements.size,
      pairs: pairs.length,
      note:
        "Single current configuration. Supersedes the three-fingerprint baseline in " +
        "r10-corpus-blast-rows.json. Promoted because the author-anchor fix moved no " +
        "statement towards supported anywhere in the graded corpus.",
    };
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log("PART 4: baseline promoted, fingerprint recorded in fingerprint-manifest.json");
  } else {
    console.log(
      `PART 4: NOT promoted. ${fixTowards.length} statements move towards supported and need adjudicating first.`
    );
  }

  await flushObservability();
}

main().catch(async (err) => {
  console.error(err);
  await flushObservability();
  process.exit(1);
});
