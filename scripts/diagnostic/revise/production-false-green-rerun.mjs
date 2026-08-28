#!/usr/bin/env node
/**
 * Rerun of the false green diagnosis against the COMMITTED production
 * fixtures from the 2026-08-27 run. Supersedes Part 1 of 2dcc796, which ran
 * on a reconstructed draft and is void.
 *
 * Part 1  Three Reviews of the original fixture, three of the revised, same
 *         source fixture, no Suggest. Live model calls.
 * Part 2  Date the nine FALSE notes from 2dcc796 against ade84fc, the commit
 *         that shipped the marker honesty repair. Zero model calls.
 *
 * Fixture assertions run before any model call and abort on failure.
 *
 * Usage:
 *   node scripts/diagnostic/revise/production-false-green-rerun.mjs
 *   PART=2 node scripts/diagnostic/revise/production-false-green-rerun.mjs
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const FIXTURE_DIR = path.join(__dirname, "fixtures");
const OUT_DIR = __dirname;

const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL ||
  "https://brightline-content-engine-backend.vercel.app";

const RUNS_PER_ARM = 3;
const ONLY_PART = process.env.PART ? String(process.env.PART) : null;

// Ground truth from the production run.
const EXPECTED_ORIGINAL_LENGTH = 1087;
const EXPECTED_REVISED_LENGTH = 1000;
const EXPECTED_CUT_SPAN = { start: 994, end: 999, text: "funds" };
const EXPECTED_TARGET_SPAN = { start: 544, end: 757 };
const TARGET_NEEDLE = "Partners Group was attracted to this investment";
const STATEMENT_0_NEEDLE = "In June 2026, Partners Group committed to Meridian";
const HONESTY_REPAIR_COMMIT = "ade84fc";

/* ------------------------------------------------------------------ *
 * Fixture verification
 * ------------------------------------------------------------------ */

async function loadFixtures() {
  const [originalRaw, revised, source] = await Promise.all([
    readFile(path.join(FIXTURE_DIR, "meridian_production_original.txt"), "utf8"),
    readFile(path.join(FIXTURE_DIR, "meridian_production_revised.txt"), "utf8"),
    readFile(path.join(FIXTURE_DIR, "meridian_production_source.txt"), "utf8"),
  ]);
  // The original fixture carries trailing newlines from the editor; the
  // production draft is the text without them. Nothing else is touched.
  const original = originalRaw.replace(/\s+$/, "");
  return { originalRaw, original, revised, source };
}

function verifyFixtures({ originalRaw, original, revised }) {
  const targetSpan = revised.slice(EXPECTED_TARGET_SPAN.start, EXPECTED_TARGET_SPAN.end);
  const cutSpan = revised.slice(EXPECTED_CUT_SPAN.start, EXPECTED_CUT_SPAN.end);
  const targetSentence = revised.slice(EXPECTED_TARGET_SPAN.start, EXPECTED_TARGET_SPAN.end + 1);

  const assertions = [
    {
      name: "original length is 1087 (trailing newlines trimmed)",
      expected: EXPECTED_ORIGINAL_LENGTH,
      actual: original.length,
      pass: original.length === EXPECTED_ORIGINAL_LENGTH,
      note: `raw file is ${originalRaw.length} chars, ${originalRaw.length - original.length} trailing whitespace chars trimmed`,
    },
    {
      name: "revised length is 1000",
      expected: EXPECTED_REVISED_LENGTH,
      actual: revised.length,
      pass: revised.length === EXPECTED_REVISED_LENGTH,
      note: "byte for byte, untouched",
    },
    {
      name: 'revised[994:999] === "funds"',
      expected: EXPECTED_CUT_SPAN.text,
      actual: cutSpan,
      pass: cutSpan === EXPECTED_CUT_SPAN.text,
      note: "the production CUT marker anchor",
    },
    {
      name: "revised[544:757] === target sentence without its full stop",
      expected: "<target sentence minus '.'>",
      actual: targetSpan,
      pass:
        targetSpan.startsWith(TARGET_NEEDLE) &&
        !targetSpan.endsWith(".") &&
        targetSentence === `${targetSpan}.`,
      note: `${targetSpan.length} chars`,
    },
  ];
  return { assertions, allPass: assertions.every((a) => a.pass), targetSentence };
}

/* ------------------------------------------------------------------ *
 * Part 1
 * ------------------------------------------------------------------ */

function reviewBody(draftText, sourceText) {
  return {
    draftText,
    outputType: "reporting_commentary",
    requiredVersion: "complete",
    authoringOrganisation: "Partners Group",
    options: {
      pipelineRoute: "v4",
      evidenceEnabled: true,
      editorialEnabled: false,
      complianceEnabled: false,
    },
    sources: [
      {
        text: sourceText,
        label: "Meridian Fund V summary",
        name: "meridian_production_source.txt",
        title: "Meridian Fund V summary",
        sourceType: "uploaded",
      },
    ],
  };
}

async function postJson(urlPath, body) {
  const url = `${PRODUCTION_URL.replace(/\/$/, "")}${urlPath}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { parseError: true, rawText: text.slice(0, 2000) };
  }
  return { url, httpStatus: res.status, ms: Date.now() - t0, payload };
}

function normalizeForMatch(text) {
  return String(text || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findStatement(statements, needle) {
  const list = Array.isArray(statements) ? statements : [];
  const key = normalizeForMatch(needle);
  return list.find((s) => normalizeForMatch(s?.text).includes(key)) || null;
}

function cardSummary(stmt) {
  if (!stmt) return null;
  const c = stmt.qcCard || {};
  const collect = (list, kind) =>
    (Array.isArray(list) ? list : []).map((entry) => ({
      kind,
      sourceRefId: entry?.sourceRefId ?? null,
      classification: entry?.classification ?? null,
      text: entry?.text ?? null,
      passage: entry?.passage ?? null,
    }));
  return {
    text: stmt.text ?? "",
    supportState: c.supportState ?? null,
    displayVerdict: c.displayVerdict ?? null,
    concernLevel: c.concernLevel ?? null,
    unsupportedSpans: Array.isArray(c.unsupportedSpans) ? c.unsupportedSpans : [],
    reasoningParagraph: c.reasoningParagraph ?? c.evidenceSummary ?? null,
    stage2SourceFingerprints: c.stage2SourceFingerprints ?? null,
    supportSpans: collect(c.supportSpans, "support"),
  };
}

async function runPart1(fixtures, targetSentence) {
  console.log("");
  console.log("PART 1  Review on the committed production fixtures");
  console.log(`URL ${PRODUCTION_URL}`);
  console.log(
    `estimated cost: ${RUNS_PER_ARM * 2} Reviews of a ~1.0k-char draft against a ` +
      "~2.5k-char source, about $0.60 to $1.00. Stage 2 alone would be cheaper " +
      "but cannot produce supportState, displayVerdict or unsupportedSpans, " +
      "which are the fields under test."
  );

  const arms = [
    { arm: "original", draft: fixtures.original },
    { arm: "revised", draft: fixtures.revised },
  ];

  const runs = [];
  for (const { arm, draft } of arms) {
    for (let run = 1; run <= RUNS_PER_ARM; run++) {
      process.stdout.write(`${arm}/r${run} `);
      const res = await postJson(
        "/api/analyse-statements",
        reviewBody(draft, fixtures.source)
      );
      const statements = Array.isArray(res.payload?.statements) ? res.payload.statements : [];
      const target = cardSummary(findStatement(statements, TARGET_NEEDLE));
      const statement0 = cardSummary(findStatement(statements, STATEMENT_0_NEEDLE));
      runs.push({
        arm,
        run,
        httpStatus: res.httpStatus,
        ms: res.ms,
        traceId: res.payload?.meta?.traceId ?? null,
        statementCount: statements.length,
        target,
        statement0,
      });
      console.log(
        `http=${res.httpStatus} stmts=${statements.length} ` +
          `target=${target?.displayVerdict ?? "?"} spans=${target?.unsupportedSpans.length ?? "?"} ` +
          `s0=${statement0?.displayVerdict ?? "?"}`
      );
    }
  }

  const counts = (arm, pick) => {
    const out = {};
    for (const r of runs.filter((x) => x.arm === arm)) {
      const key = String(pick(r) ?? "null");
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  };

  const originalTarget = counts("original", (r) => r.target?.displayVerdict);
  const revisedTarget = counts("revised", (r) => r.target?.displayVerdict);
  const originalS0 = counts("original", (r) => r.statement0?.displayVerdict);
  const revisedS0 = counts("revised", (r) => r.statement0?.displayVerdict);

  const originalStable = Object.keys(originalTarget).length === 1;
  const revisedStable = Object.keys(revisedTarget).length === 1;
  const originalAllPartial = originalTarget.supported_partial === RUNS_PER_ARM;
  const revisedAllFull = revisedTarget.supported_full === RUNS_PER_ARM;

  let verdict;
  if (originalAllPartial && revisedAllFull) verdict = "CAUSED BY THE EDIT";
  else if (!originalStable || !revisedStable) verdict = "STAGE 2 NOISE";
  else verdict = "CANNOT REPRODUCE";

  const stage2Class = (arm) =>
    counts(
      arm,
      (r) => r.target?.stage2SourceFingerprints?.[0]?.classification ?? null
    );
  const modal = (c) => Object.entries(c).sort((a, b) => b[1] - a[1])[0] ?? ["null", 0];

  const stability = {
    originalTargetStage2: `${modal(stage2Class("original"))[1]} of ${RUNS_PER_ARM} (${modal(stage2Class("original"))[0]})`,
    revisedTargetStage2: `${modal(stage2Class("revised"))[1]} of ${RUNS_PER_ARM} (${modal(stage2Class("revised"))[0]})`,
    originalTargetVerdict: `${modal(originalTarget)[1]} of ${RUNS_PER_ARM} (${modal(originalTarget)[0]})`,
    revisedTargetVerdict: `${modal(revisedTarget)[1]} of ${RUNS_PER_ARM} (${modal(revisedTarget)[0]})`,
    originalStatement0: `${modal(originalS0)[1]} of ${RUNS_PER_ARM} (${modal(originalS0)[0]})`,
    revisedStatement0: `${modal(revisedS0)[1]} of ${RUNS_PER_ARM} (${modal(revisedS0)[0]})`,
  };

  console.log("");
  console.log(`VERDICT ${verdict}`);
  console.log(`original target ${JSON.stringify(originalTarget)}`);
  console.log(`revised  target ${JSON.stringify(revisedTarget)}`);
  console.log(`stability ${JSON.stringify(stability)}`);

  return {
    runsPerArm: RUNS_PER_ARM,
    targetSentence,
    originalTarget,
    revisedTarget,
    originalStatement0: originalS0,
    revisedStatement0: revisedS0,
    verdict,
    stability,
    runs,
  };
}

/* ------------------------------------------------------------------ *
 * Part 2: date the nine FALSE notes against ade84fc
 * ------------------------------------------------------------------ */

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: REPO_ROOT });
  return stdout.trim();
}

async function runPart2() {
  console.log("");
  console.log("PART 2  dating the nine FALSE notes against ade84fc");

  const rows = JSON.parse(
    await readFile(path.join(OUT_DIR, "bundled-notes-rows.json"), "utf8")
  ).rows.filter((r) => r.classification === "FALSE");

  const repairIso = await git([
    "log",
    "-1",
    "--format=%cI",
    HONESTY_REPAIR_COMMIT,
  ]);
  const repairSha = await git(["rev-parse", HONESTY_REPAIR_COMMIT]);
  const repairAt = new Date(repairIso);

  const artefactCache = new Map();
  const dated = [];
  for (const row of rows) {
    const rel = `scripts/diagnostic/revise/${row.file}`;
    if (!artefactCache.has(rel)) {
      const iso = await git([
        "log",
        "-1",
        "--format=%cI",
        "--",
        rel,
      ]);
      const sha = await git(["log", "-1", "--format=%h", "--", rel]);
      const subject = await git(["log", "-1", "--format=%s", "--", rel]);
      artefactCache.set(rel, { iso, sha, subject });
    }
    const meta = artefactCache.get(rel);
    // The artefact's own ranAt is when the Suggest actually executed, which is
    // what decides whether the honesty repair was in the path. The commit date
    // is kept alongside it as corroboration.
    const artefact = JSON.parse(await readFile(path.join(OUT_DIR, row.file), "utf8"));
    const honestyEvents =
      artefact.honestyEvents ?? artefact.payload?.honestyEvents ?? [];
    const producedAt = new Date(artefact.ranAt ?? meta.iso);
    const predatesRepair = producedAt < repairAt;
    dated.push({
      file: row.file,
      markerIndex: row.markerIndex,
      note: row.note,
      ranAt: artefact.ranAt ?? null,
      artefactCommit: meta.sha,
      artefactCommitSubject: meta.subject,
      artefactCommittedAt: meta.iso,
      honestyEventCount: honestyEvents.length,
      honestyContradictions: honestyEvents.map((e) => e?.contradiction ?? null),
      predatesHonestyRepair: predatesRepair,
      status: predatesRepair ? "historical" : "live",
    });
  }

  const historical = dated.filter((d) => d.status === "historical").length;
  const live = dated.filter((d) => d.status === "live").length;

  console.log(`honesty repair ${repairSha.slice(0, 7)} committed ${repairIso}`);
  for (const d of dated) {
    console.log(
      `  ${d.file}#${d.markerIndex} ranAt ${d.ranAt} (commit ${d.artefactCommit}) ` +
        `honestyEvents=${d.honestyEventCount} -> ${d.status}`
    );
  }
  console.log(`historical ${historical}, live ${live}, of ${dated.length}`);

  return {
    honestyRepair: { sha: repairSha, short: HONESTY_REPAIR_COMMIT, committedAt: repairIso },
    total: dated.length,
    historical,
    live,
    notes: dated,
  };
}

async function main() {
  const fixtures = await loadFixtures();
  const { assertions, allPass, targetSentence } = verifyFixtures(fixtures);

  console.log("FIXTURE ASSERTIONS");
  for (const a of assertions) {
    console.log(
      `  [${a.pass ? "PASS" : "FAIL"}] ${a.name}\n` +
        `         actual: ${JSON.stringify(String(a.actual).slice(0, 120))}\n` +
        `         ${a.note}`
    );
  }
  if (!allPass) {
    console.error("FIXTURE ASSERTION FAILED. Stopping. Nothing measured on this counts.");
    process.exit(1);
  }
  console.log("  all assertions pass");

  const part1 = ONLY_PART === "2" ? null : await runPart1(fixtures, targetSentence);
  const part2 = ONLY_PART === "1" ? null : await runPart2();

  const existing = await readFile(path.join(OUT_DIR, "production-false-green-rerun.json"), "utf8")
    .then((t) => JSON.parse(t))
    .catch(() => ({}));

  await writeFile(
    path.join(OUT_DIR, "production-false-green-rerun.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        productionUrl: PRODUCTION_URL,
        fixtureAssertions: assertions,
        part1: part1 ?? existing.part1 ?? null,
        part2: part2 ?? existing.part2 ?? null,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

main().catch((err) => {
  console.error("[production-false-green-rerun] fatal:", err?.stack || err);
  process.exit(1);
});
