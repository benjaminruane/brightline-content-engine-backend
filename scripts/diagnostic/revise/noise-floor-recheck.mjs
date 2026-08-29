#!/usr/bin/env node
/**
 * Part 1  replay every run on disk that retains the model's raw output and
 *         report which what-clauses the confineRegionToOwnSentence fix moves.
 * Part 2  re-run the ORIGINAL noise-floor harness, unchanged, on the same
 *         Review it used at 45db80d and 18ac825, and score the same five
 *         dimensions, so the three numbers are comparable.
 *
 * Part 2 shells out to run-reviser-noise-floor.mjs rather than reimplementing
 * it. Reimplementing would be the one thing that makes the comparison invalid.
 *
 * Usage: node scripts/diagnostic/revise/noise-floor-recheck.mjs
 */
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const REPO = path.resolve(__dirname, "../../..");

const { buildWhatClause, diffWordSequences, renderWhatClause } = await import(
  "../../../lib/pr9-note-what-from-diff.mjs"
);
const { markerSpanAlignment } = await import("../../../lib/pr9-marker-span-status.mjs");
const { sentenceBoundsContaining } = await import("../../../lib/pr9-marker-honesty.mjs");
const { finalizeSuggestRevisionText, gatherConcerns } = await import(
  "../../../lib/build-revision-prompt.mjs"
);

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const trunc = (s, n = 70) => {
  const t = norm(s);
  return t.length <= n ? t : `${t.slice(0, n - 1)}\u2026`;
};
const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

/* ------------------------------------------------------------------ *
 * Part 1: what-clause replay
 * ------------------------------------------------------------------ */

/**
 * Every run on disk that retains the model's raw output, with the Review whose
 * statements make up the draft it was run against.
 */
const RAW_RUNS = [
  ["condition-a-suggest.json", "suggest-after-r10-review1.json"],
  ["condition-a-condition-b-suggest-rerun.json", "condition-b-review.json"],
  ["deterministic-removal-off-run1.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-off-run2.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-off-run3.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-on-run1.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-on-run2.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-on-run3.json", "suggest-after-r10-review1.json"],
  ["reviser-noise-floor-run1.json", "suggest-after-r10-review1.json"],
  ["reviser-noise-floor-run2.json", "suggest-after-r10-review1.json"],
  ["reviser-noise-floor-run3.json", "suggest-after-r10-review1.json"],
];

function findStatementArrays(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return out;
  if (Array.isArray(node)) {
    if (node.length && node[0] && node[0].qcCard) out.push(node);
    node.forEach((n) => findStatementArrays(n, out, depth + 1));
    return out;
  }
  for (const v of Object.values(node)) findStatementArrays(v, out, depth + 1);
  return out;
}

async function statementsOf(file) {
  const json = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
  const arrays = findStatementArrays(json);
  return arrays.length ? arrays.sort((a, b) => b.length - a.length)[0] : [];
}

const INTERNAL_SENTENCE_BREAK_RE = /[.!?]["'\u201d\u2019)]*\s+\S/;

/**
 * confineRegionToOwnSentence EXACTLY as it stood before this fix: the rescue
 * set built by splitting the raw slice, and no token-for-token short-circuit.
 * Kept here so the replay is a true before-and-after of the same markers,
 * rather than a comparison against notes later stages have already rewritten.
 */
function confineBefore(original, revised, start, end, origRegion) {
  const region = Array.isArray(origRegion) ? origRegion : [];
  if (region.length === 0) return region;
  const span = String(revised ?? "").slice(start, end);
  if (INTERNAL_SENTENCE_BREAK_RE.test(span)) return region;
  const spanWords = new Set(String(span).split(/\s+/).filter(Boolean));
  const bounds = sentenceBoundsContaining(original, region[0].start, region[0].end);
  const clipped = region.filter(
    (t) => (t.start >= bounds.start && t.end <= bounds.end) || spanWords.has(t.text)
  );
  return clipped.length > 0 ? clipped : region;
}

function clauseBefore(original, revised, start, end) {
  const align = markerSpanAlignment(original, revised, start, end);
  const edits = diffWordSequences(
    confineBefore(original, revised, start, end, align.origRegion).map((t) => t.text),
    align.revSpan.map((t) => t.text)
  );
  return { clause: renderWhatClause(edits), changed: edits.length > 0 };
}

/**
 * Every marker's what-clause under the old clip and the new one. The note is
 * carried for context only; it is not the comparison, because later stages
 * rewrite it.
 */
function clausesFor(draft, revised, markers) {
  return markers.map((m) => {
    const before = clauseBefore(draft, revised, m.start, m.end);
    const after = buildWhatClause(draft, revised, m.start, m.end);
    return {
      span: revised.slice(m.start, m.end),
      note: m.note,
      clauseBefore: before.clause,
      clauseNow: after.clause,
      changedBefore: before.changed,
      changedNow: after.changed,
    };
  });
}

/**
 * A clause is WRONG when it claims a change on a span the alignment says did
 * not change. That is the defect class this fix addresses, and it is decidable
 * without a human.
 */
const claimsAChange = (clause) => /^(Added|Removed|Replaced|Deleted)\b/.test(norm(clause));

/** Did this span actually change? The alignment is the arbiter, not the note. */
const spanReallyChanged = (original, revised, start, end) =>
  markerSpanAlignment(original, revised, start, end).spanStatus === "CHANGED";

async function replay() {
  const byReview = new Map();
  for (const file of ["suggest-after-r10-review1.json", "condition-b-review.json"]) {
    byReview.set(file, await statementsOf(file));
  }

  const rows = [];
  for (const [runFile, reviewFile] of RAW_RUNS) {
    if (!existsSync(path.join(OUT_DIR, runFile))) continue;
    const run = JSON.parse(await readFile(path.join(OUT_DIR, runFile), "utf8"));
    if (typeof run.raw !== "string" || !run.raw.trim()) continue;
    const statements = byReview.get(reviewFile);
    const draft = statements.map((s) => norm(s.text)).join(" ");
    const finalized = finalizeSuggestRevisionText(run.raw, {
      originalDraft: draft,
      concerns: gatherConcerns(statements, null),
      deterministicUnsupportedRemoval: false,
      log: () => {},
    });
    for (const [i, c] of clausesFor(draft, finalized.revisedDraft, finalized.markers).entries()) {
      const m = finalized.markers[i];
      rows.push({
        run: runFile.replace(/\.json$/, ""),
        reallyChanged: spanReallyChanged(draft, finalized.revisedDraft, m.start, m.end),
        ...c,
      });
    }
  }

  // The live Meridian runs, which are where the defect was observed.
  try {
    const live = JSON.parse(await readFile(path.join(OUT_DIR, "register-coexistence.json"), "utf8"));
    const meridianDraft = (
      await readFile(path.join(OUT_DIR, "fixtures/meridian_production_original.txt"), "utf8")
    ).trim();
    for (const r of live.liveRuns.filter((x) => x.arm === "MERIDIAN")) {
      for (const m of r.markers) {
        const start = r.revised.indexOf(m.span);
        if (start < 0) continue;
        const end = start + m.span.length;
        const [c] = clausesFor(meridianDraft, r.revised, [{ start, end, note: m.note }]);
        rows.push({
          run: `live-MERIDIAN-run${r.seed}`,
          reallyChanged: spanReallyChanged(meridianDraft, r.revised, start, end),
          ...c,
        });
      }
    }
  } catch {
    /* no live artefact */
  }

  const moved = rows.filter((r) => norm(r.clauseBefore) !== norm(r.clauseNow));
  // A clause claiming a change on a span that did not change is wrong. Fixed
  // means that was true before and is not now; regressed is the reverse.
  const wrong = (r, clause) => claimsAChange(clause) && !r.reallyChanged;
  const fixed = moved.filter((r) => wrong(r, r.clauseBefore) && !wrong(r, r.clauseNow));
  const regressed = moved.filter((r) => !wrong(r, r.clauseBefore) && wrong(r, r.clauseNow));

  return { rows, moved, fixed, regressed };
}

/* ------------------------------------------------------------------ *
 * Part 2: re-run the original harness, unchanged
 * ------------------------------------------------------------------ */

/** Keep the 18ac825 artefacts, which the harness is about to overwrite. */
async function snapshotPriorArtefacts() {
  const files = [
    "reviser-noise-floor-meta.json",
    "reviser-noise-floor-run1.json",
    "reviser-noise-floor-run2.json",
    "reviser-noise-floor-run3.json",
  ];
  const kept = [];
  for (const f of files) {
    const from = path.join(OUT_DIR, f);
    if (!existsSync(from)) continue;
    const to = path.join(OUT_DIR, f.replace(/\.json$/, ".18ac825.json"));
    if (!existsSync(to)) await copyFile(from, to);
    kept.push(path.basename(to));
  }
  return kept;
}

function runHarness() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/diagnostic/revise/run-reviser-noise-floor.mjs"],
      { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      out += d;
      process.stderr.write(d);
    });
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`harness exited ${code}`))
    );
  });
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  console.log("=== PART 1, WHAT-CLAUSE REPLAY ===\n");
  const replayed = await replay();
  console.log(`  ${replayed.rows.length} markers replayed across the runs on disk`);
  console.log(`  clauses that moved:      ${replayed.moved.length}`);
  console.log(`  false change-claims now gone: ${replayed.fixed.length}`);
  console.log(`  previously right, now wrong:  ${replayed.regressed.length}`);
  for (const r of replayed.fixed) {
    console.log(`\n    FIXED ${r.run}`);
    console.log(`      span: ${trunc(r.span, 78)}`);
    console.log(`      was:  ${trunc(r.clauseBefore, 78)}`);
    console.log(`      now:  ${trunc(r.clauseNow, 78)}`);
  }
  for (const r of replayed.regressed) {
    console.log(`\n    REGRESSED ${r.run}`);
    console.log(`      span: ${trunc(r.span, 78)}`);
    console.log(`      was:  ${trunc(r.clauseBefore, 78)}`);
    console.log(`      now:  ${trunc(r.clauseNow, 78)}`);
  }

  console.log("\n\n=== PART 2, NOISE FLOOR, ORIGINAL HARNESS UNCHANGED ===\n");
  const kept = await snapshotPriorArtefacts();
  if (kept.length) console.log(`  kept the 18ac825 artefacts as ${kept.join(", ")}\n`);
  await runHarness();

  const meta = JSON.parse(
    await readFile(path.join(OUT_DIR, "reviser-noise-floor-meta.json"), "utf8")
  );
  const s = meta.stability;
  console.log("\n  --- like for like ---");
  console.log("  45db80d, no seed              7 of 10");
  console.log("  18ac825, seed 1               8 of 10");
  console.log(`  now, after the prompt change  ${s.unstable.length} of ${s.total}`);
  console.log(
    `\n  identical=${s.identical.length} intent=${s.intentVaried.length} ` +
      `note-only=${s.noteOnlyVaried.length} prose=${s.proseVaried.length}`
  );
  if (s.unstable.length) console.log(`  unstable cards: ${s.unstable.join(", ")}`);

  const verdict =
    s.unstable.length <= 1 ? "STABLE" : s.unstable.length < 8 ? "IMPROVED" : "UNCHANGED";
  console.log(`\n  VERDICT: ${verdict}`);

  await writeFile(
    path.join(OUT_DIR, "noise-floor-recheck.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        replay: {
          markersReplayed: replayed.rows.length,
          moved: replayed.moved.length,
          fixed: replayed.fixed,
          regressed: replayed.regressed,
        },
        noiseFloor: {
          previous: { "45db80d_no_seed": 7, "18ac825_seed1": 8, of: 10 },
          now: s.unstable.length,
          of: s.total,
          buckets: {
            identical: s.identical,
            intent: s.intentVaried,
            noteOnly: s.noteOnlyVaried,
            prose: s.proseVaried,
          },
          verdict,
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const cardTable = [
    "| card | verdict |",
    "| --- | --- |",
    ...s.identical.map((id) => `| ${mdCell(id)} | identical |`),
    ...s.intentVaried.map((id) => `| ${mdCell(id)} | **intent** |`),
    ...s.noteOnlyVaried.map((id) => `| ${mdCell(id)} | **note-only** |`),
    ...s.proseVaried.map((id) => `| ${mdCell(id)} | **prose** |`),
  ].join("\n");
  await writeFile(path.join(OUT_DIR, "noise-floor-recheck.tables.md"), `${cardTable}\n`, "utf8");
  console.log("\nwrote noise-floor-recheck.json and .tables.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
