#!/usr/bin/env node
/**
 * Phase 2 recordings. One analyse-statements call per named state.
 * Writes tests/fixtures/b247/*.json
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = path.join(ROOT, "tests/fixtures/b247");
const URL =
  process.env.QC_REGRESSION_BASE_URL ||
  "https://brightline-content-engine-backend.vercel.app";

const OAKFIELD_SOURCE = [
  "Oakfield Partners closed Fund III at EUR 400 million in March 2025.",
  "The fund invests in European manufacturing companies.",
  "This note is for internal reporting only.",
].join(" ");

const R1_DRAFT =
  "Oakfield Partners closed Fund III at EUR 400 million in March 2025. The fund invests in European manufacturing companies.";

const R2_DRAFT = "Oakfield Partners closed Fund III at EUR 400 million in March 2025.";
const R2_SOURCE_A = "Oakfield Partners closed Fund III at EUR 400 million in March 2025.";
const R2_SOURCE_B = "Oakfield Partners closed Fund III at EUR 450 million in March 2025.";

const R4_DRAFT =
  "We closed Fund III at EUR 400 million in March 2025. The fund invests in European manufacturing companies.";

const R6_DRAFT = [
  "Oakfield Partners closed Fund III at EUR 400 million in March 2025.",
  "The fund invests in European manufacturing companies across Germany, France, and the Nordics.",
  "The investment committee approved the close after a six month fundraising period that began in September 2024.",
  "Existing limited partners accounted for most of the commitments recorded at close.",
  "The remaining capital came from two new European pension funds that completed diligence in February 2025.",
  "Fund III will pursue control investments in lower mid market manufacturing businesses with export revenue.",
  "Hold periods are expected to run between four and six years depending on the exit route available.",
  "Oakfield will not invest more than twenty five percent of commitments in a single country.",
  "Reporting to limited partners will follow the quarterly cycle already used for Fund II.",
  "The close completed in March 2025 after the last remaining commitment was signed in Zurich.",
  "This note covers the March 2025 close.",
].join(" ");

const R6_UNSUPPORTED_DRAFT =
  "Northaven Logistics sold its Scandinavian depot network for EUR 90 million in January 2026. The buyer was a listed industrial group based in Milan.";

function source(label, text) {
  return { text, label, name: label, title: label, sourceType: "uploaded" };
}

function body({ draftText, sources, evidence = true, editorial = true, compliance = true, extra = {} }) {
  return {
    draftText,
    outputType: "reporting_commentary",
    requiredVersion: "complete",
    authoringOrganisation: "Halden Group",
    evidenceEnabled: evidence,
    editorialEnabled: editorial,
    complianceEnabled: compliance,
    options: {
      pipelineRoute: "v4",
      evidenceEnabled: evidence,
      editorialEnabled: editorial,
      complianceEnabled: compliance,
    },
    sources,
    ...extra,
  };
}

function wordCount(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

async function postAnalyse(name, payload) {
  const started = Date.now();
  console.log(`\n${name} POST ${URL}/api/analyse-statements words=${wordCount(payload.draftText)}`);
  const res = await fetch(`${URL.replace(/\/$/, "")}/api/analyse-statements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(300000),
  });
  const json = await res.json().catch(() => null);
  const ms = Date.now() - started;
  const statements = Array.isArray(json?.statements) ? json.statements : [];
  const summary = json?.meta?.reviewSummary ?? null;
  console.log(
    `${name} http=${res.status} ok=${json?.ok} statements=${statements.length} readiness=${summary?.readiness ?? "none"} ms=${ms}`
  );
  if (!json || json.ok !== true) {
    console.log(`${name} body keys=${json ? Object.keys(json).join(",") : "null"}`);
  }
  return { httpStatus: res.status, payload: json, ms };
}

function cardSketch(json) {
  const statements = Array.isArray(json?.statements) ? json.statements : [];
  return statements.map((row) => {
    const card = row?.qcCard ?? {};
    return {
      id: row?.id,
      displayVerdict: card.displayVerdict ?? null,
      editorialVerdict: card.editorialVerdict ?? null,
      complianceVerdict: card.complianceVerdict ?? null,
      statement: card.statement ?? row?.text ?? "",
    };
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const log = [];

  const jobs = [
    {
      id: "r1-ready",
      reachedGoal: "Ready with all checks on",
      used: "Two-sentence Oakfield close, source is the same text plus one internal-reporting line.",
      payload: body({
        draftText: R1_DRAFT,
        sources: [source("oakfield-close.txt", OAKFIELD_SOURCE)],
      }),
    },
    {
      id: "r2-conflict-first",
      reachedGoal: "Two sources disagreeing on the close size",
      used: "Draft EUR 400 million. Source A 400. Source B 450.",
      payload: body({
        draftText: R2_DRAFT,
        sources: [
          source("oakfield-400.txt", R2_SOURCE_A),
          source("oakfield-450.txt", R2_SOURCE_B),
        ],
      }),
    },
    {
      id: "r3-evidence-only",
      reachedGoal: "Evidence on, editorial and compliance off",
      used: "Same Oakfield pair as R1 with editorialEnabled and complianceEnabled false.",
      payload: body({
        draftText: R1_DRAFT,
        sources: [source("oakfield-close.txt", OAKFIELD_SOURCE)],
        editorial: false,
        compliance: false,
      }),
    },
    {
      id: "r4-editorial-only",
      reachedGoal: "Editorial on, evidence off",
      used: "First-person 'We closed Fund III' so editorial has something to say. evidenceEnabled false.",
      payload: body({
        draftText: R4_DRAFT,
        sources: [source("oakfield-close.txt", OAKFIELD_SOURCE)],
        evidence: false,
      }),
    },
    {
      id: "r5-excluded-source",
      reachedGoal: "One excluded source beside a good one",
      used: "Good Oakfield source plus empty-memo.txt with empty text. Thin fragment source oakfield-thin.txt with two words.",
      payload: body({
        draftText: R1_DRAFT,
        sources: [
          source("oakfield-close.txt", OAKFIELD_SOURCE),
          source("empty-memo.txt", ""),
          source("oakfield-thin.txt", "Oakfield Partners."),
        ],
      }),
    },
    {
      id: "r6-near-limit",
      reachedGoal: "Long multi-source draft near the 150 word limit",
      used: `Nine-sentence Oakfield draft (${wordCount(R6_DRAFT)} words). Two sources: close facts, and a second note on hold periods and country cap.`,
      payload: body({
        draftText: R6_DRAFT,
        sources: [
          source("oakfield-close.txt", OAKFIELD_SOURCE),
          source(
            "oakfield-policy.txt",
            "Hold periods run between four and six years. Oakfield will not invest more than twenty five percent of commitments in a single country. Reporting follows the Fund II quarterly cycle."
          ),
        ],
      }),
    },
    {
      id: "r6-unsupported",
      reachedGoal: "A draft where nothing is supported",
      used: "Northaven Logistics sale. Source is the Oakfield close note, which does not mention Northaven.",
      payload: body({
        draftText: R6_UNSUPPORTED_DRAFT,
        sources: [source("oakfield-close.txt", OAKFIELD_SOURCE)],
      }),
    },
  ];

  for (const job of jobs) {
    const result = await postAnalyse(job.id, job.payload);
    const outPath = path.join(OUT_DIR, `${job.id}.json`);
    await writeFile(outPath, `${JSON.stringify(result.payload, null, 2)}\n`);
    log.push({
      id: job.id,
      file: path.relative(ROOT, outPath),
      used: job.used,
      reachedGoal: job.reachedGoal,
      httpStatus: result.httpStatus,
      ok: result.payload?.ok === true,
      ms: result.ms,
      readiness: result.payload?.meta?.reviewSummary?.readiness ?? null,
      reviewOptions: result.payload?.meta?.reviewOptions ?? null,
      statementCount: Array.isArray(result.payload?.statements) ? result.payload.statements.length : 0,
      excludedSources: result.payload?.excludedSources ?? [],
      sourceCount: Array.isArray(result.payload?.sources) ? result.payload.sources.length : 0,
      cards: cardSketch(result.payload),
      draftWordCount: wordCount(job.payload.draftText),
    });
  }

  const first = log.find((row) => row.id === "r2-conflict-first");
  const secondBody = body({
    draftText: R2_DRAFT,
    sources: [
      source("oakfield-400.txt", R2_SOURCE_A),
      source("oakfield-450.txt", R2_SOURCE_B),
    ],
    extra: {
      sourceRulings: [{ a: 0, b: 1, governs: 0 }],
    },
  });
  const second = await postAnalyse("r2-conflict-second", secondBody);
  const secondPath = path.join(OUT_DIR, "r2-conflict-second.json");
  await writeFile(secondPath, `${JSON.stringify(second.payload, null, 2)}\n`);
  log.push({
    id: "r2-conflict-second",
    file: path.relative(ROOT, secondPath),
    used: "Same as r2-conflict-first, plus sourceRulings a=0 b=1 governs=0 on the request body. analyse-statements does not read that field.",
    reachedGoal: "Second Review after a governing ruling",
    httpStatus: second.httpStatus,
    ok: second.payload?.ok === true,
    ms: second.ms,
    readiness: second.payload?.meta?.reviewSummary?.readiness ?? null,
    reviewOptions: second.payload?.meta?.reviewOptions ?? null,
    statementCount: Array.isArray(second.payload?.statements) ? second.payload.statements.length : 0,
    excludedSources: second.payload?.excludedSources ?? [],
    sourceCount: Array.isArray(second.payload?.sources) ? second.payload.sources.length : 0,
    cards: cardSketch(second.payload),
    firstReadiness: first?.readiness ?? null,
    draftWordCount: wordCount(R2_DRAFT),
  });

  const logPath = path.join(OUT_DIR, "recording-log.json");
  await writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`);
  console.log(`\nwrote ${logPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
