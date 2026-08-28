#!/usr/bin/env node
/**
 * Coverage gap: how often does Suggest flag something and change nothing, and
 * how often does it ignore a Review finding entirely?
 *
 * The no-change rate cannot be measured from artefacts on disk: those notes
 * have already been through marker honesty, which rewrites pure no-change
 * notes, and 2dcc796 then kept only removal-asserting ones. Every no-change
 * case was filtered out before it could be counted. So this measures raw model
 * output on fresh runs.
 *
 * Review is run ONCE and cached to disk; re-running the script reuses it.
 * Suggest runs three times against that one Review.
 *
 * Usage: node scripts/diagnostic/revise/coverage-gap-measure.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { callLLM, flushObservability, hasProviderApiKey } = await import(
  "../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");
const { buildRevisionPrompt, finalizeSuggestRevisionText, gatherConcerns } = await import(
  "../../../lib/build-revision-prompt.mjs"
);
const { markerSpanAlignment } = await import("../../../lib/pr9-marker-span-status.mjs");
const { concernKind, resolveConcernForMarker } = await import(
  "../../../lib/pr9-note-what-from-diff.mjs"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const FIXTURES = path.join(OUT_DIR, "fixtures");
const REVIEW_CACHE = path.join(OUT_DIR, "coverage-gap-review.json");
const ROWS_PATH = path.join(OUT_DIR, "note-what-from-diff-rows.json");

const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL ||
  "https://brightline-content-engine-backend.vercel.app";

const RUNS = 3;
const modelConfig = STAGE_MODELS["writing-rewrite"];

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

/**
 * The Review for the production fixture. No stored Review of these fixtures
 * existed, so one is run and cached; it is never re-run per Suggest.
 */
async function loadOrRunReview(originalDraft) {
  try {
    const cached = JSON.parse(await readFile(REVIEW_CACHE, "utf8"));
    if (Array.isArray(cached?.payload?.statements) && cached.payload.statements.length > 0) {
      console.log(`[review] reusing cached Review from ${cached.ranAt}`);
      return { review: cached, ranReview: false };
    }
  } catch {
    // no cache yet
  }

  const captured = JSON.parse(
    await readFile(path.join(FIXTURES, "meridian_production_request.json"), "utf8")
  );
  const body = { ...captured, draftText: originalDraft };
  console.log("[review] no cached Review for these fixtures; running one (cached for reuse)...");
  const review = await postJson("/api/analyse-statements", body);
  const doc = { ranAt: new Date().toISOString(), ...review };
  await writeFile(REVIEW_CACHE, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return { review: doc, ranReview: true };
}

function isDeterministicRemovalNote(note) {
  return typeof note === "string" && note.startsWith("Removed this sentence:");
}

function isNoChangeNote(note) {
  return typeof note === "string" && /^No change was made\b/i.test(note);
}

function concernLabel(concern, index) {
  const kind = concernKind(concern) ?? "none";
  const text = String(concern?.statementText || "").replace(/\s+/g, " ").trim();
  return {
    id: `C${index}`,
    kind,
    statementIndex: concern?.statementIndex ?? index,
    statementText: text,
    preview: text.length > 90 ? `${text.slice(0, 90)}…` : text,
  };
}

async function reportPart1() {
  let rows = null;
  try {
    rows = JSON.parse(await readFile(ROWS_PATH, "utf8"));
  } catch {
    console.log("[part1] note-what-from-diff-rows.json not found; run the replay first.");
    return null;
  }
  const f = rows.reasonFallback;
  console.log("");
  console.log("PART 1  reason fallback, 84-row replay (zero model calls)");
  console.log(`carry a reason:           ${f.carryAReason} of ${rows.notesReplayed}`);
  console.log(`  from the model:         ${f.fromModel}`);
  console.log(`  from the concern class: ${f.fromConcern}  <- rescued by the fallback`);
  console.log(`carry none:               ${f.carryNone}`);
  return rows;
}

async function main() {
  if (!hasProviderApiKey(modelConfig.provider)) {
    console.error("Missing provider API key for writing-rewrite");
    process.exit(1);
  }
  await mkdir(OUT_DIR, { recursive: true });

  await reportPart1();

  const originalDraft = (await readFile(path.join(FIXTURES, "meridian_production_original.txt"), "utf8")).trim();

  const { review, ranReview } = await loadOrRunReview(originalDraft);
  const statements = Array.isArray(review.payload?.statements) ? review.payload.statements : [];
  const concerns = gatherConcerns(statements, null);

  console.log("");
  console.log("PART 2  coverage gap, live");
  console.log(`URL:          ${PRODUCTION_URL}`);
  console.log(`statements:   ${statements.length}`);
  console.log(`findings:     ${concerns.length}`);
  console.log(`Review:       ${ranReview ? "run once now, cached" : "reused from cache"}`);

  const labels = concerns.map((c, i) => concernLabel(c, i));
  const prompt = buildRevisionPrompt(originalDraft, concerns, {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });

  const runs = [];
  for (let r = 1; r <= RUNS; r++) {
    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      seed: 1,
      messages: [{ role: "user", content: prompt }],
      traceName: `coverage-gap-run${r}`,
      spanName: `coverage-gap-run${r}`,
      metadata: { route: "coverage-gap-measure", run: r },
    });
    const raw = String(completion?.text ?? "").replace(/^```[a-z]*\n?|\n?```$/g, "");
    const finalized = finalizeSuggestRevisionText(raw, {
      originalDraft,
      concerns,
      deterministicUnsupportedRemoval: true,
      traceId: `coverage-gap-run${r}`,
    });

    const markers = (finalized.markers || []).map((m, mi) => {
      const align = markerSpanAlignment(originalDraft, finalized.revisedDraft, m.start, m.end);
      const concern = resolveConcernForMarker(originalDraft, align, concerns);
      const idx = concern ? concerns.indexOf(concern) : -1;
      return {
        markerIndex: mi,
        intent: m.intent ?? null,
        note: m.note,
        concernId: idx >= 0 ? labels[idx].id : null,
        concernKind: idx >= 0 ? labels[idx].kind : null,
        deterministicRemoval: isDeterministicRemovalNote(m.note),
        noChange: isNoChangeNote(m.note),
      };
    });

    runs.push({
      run: r,
      markerCount: markers.length,
      markers,
      // Persisted so a later diagnostic can ask whether a span changed without
      // a marker, which marker data alone cannot answer.
      revisedDraft: finalized.revisedDraft,
    });
    console.log(
      `run ${r}: markers=${markers.length} noChange=${markers.filter((x) => x.noChange).length} ` +
        `removals=${(finalized.removalEvents || []).length}`
    );
  }

  const allMarkers = runs.flatMap((r) => r.markers);
  const noChangeMarkers = allMarkers.filter((m) => m.noChange);

  // Per finding, across the three runs.
  const perFinding = labels.map((label, i) => {
    const runsWithMarker = runs.filter((r) => r.markers.some((m) => m.concernId === label.id));
    const runsWithNoChange = runs.filter((r) =>
      r.markers.some((m) => m.concernId === label.id && m.noChange)
    );
    const runsWithRealEdit = runs.filter((r) =>
      r.markers.some((m) => m.concernId === label.id && !m.noChange)
    );
    return {
      ...label,
      // "craft" is forbidden from emitting a marker by the prompt, so its
      // absence is correct behaviour rather than a coverage gap.
      markerForbidden: label.kind === "craft" || label.kind === "none",
      runsWithMarker: runsWithMarker.length,
      runsWithNoChange: runsWithNoChange.length,
      runsWithRealEdit: runsWithRealEdit.length,
      status:
        runsWithRealEdit.length > 0
          ? "acted"
          : runsWithMarker.length > 0
            ? "no_change_only"
            : "ignored",
    };
  });

  const eligible = perFinding.filter((f) => !f.markerForbidden);
  const acted = eligible.filter((f) => f.status === "acted");
  const noChangeOnly = eligible.filter((f) => f.status === "no_change_only");
  const ignored = eligible.filter((f) => f.status === "ignored");

  const noChangeAllThree = eligible.filter((f) => f.runsWithNoChange === RUNS);
  const noChangeSome = eligible.filter((f) => f.runsWithNoChange > 0 && f.runsWithNoChange < RUNS);
  const noChangeNone = eligible.filter((f) => f.runsWithNoChange === 0);

  const pct = (n, d) => (d === 0 ? "0.0" : ((n / d) * 100).toFixed(1));

  const headline =
    `Of ${eligible.length} findings Review raised, Suggest acted on ${acted.length}, ` +
    `produced a no-change note on ${noChangeOnly.length}, and ignored entirely ${ignored.length}.`;

  console.log("");
  console.log("HEADLINE");
  console.log(headline);
  console.log("");
  console.log(`total markers across ${RUNS} runs:      ${allMarkers.length}`);
  console.log(
    `say no change was made:            ${noChangeMarkers.length} (${pct(noChangeMarkers.length, allMarkers.length)}%)`
  );
  console.log("");
  console.log(`findings with a no-change marker in ALL ${RUNS} runs: ${noChangeAllThree.length}`);
  console.log(`                                   in SOME runs: ${noChangeSome.length}`);
  console.log(`                                   in NO runs:   ${noChangeNone.length}`);
  console.log("");
  console.log(`findings that produced NO marker at all:  ${ignored.length}`);
  for (const f of ignored) console.log(`  - ${f.id} [${f.kind}] ${f.preview}`);

  const summary = {
    ranAt: new Date().toISOString(),
    productionUrl: PRODUCTION_URL,
    reviewWasRun: ranReview,
    runs: RUNS,
    model: modelConfig.model,
    headline,
    statements: statements.length,
    findingsTotal: perFinding.length,
    findingsEligible: eligible.length,
    findingsMarkerForbidden: perFinding.length - eligible.length,
    totalMarkers: allMarkers.length,
    noChangeMarkers: noChangeMarkers.length,
    noChangePercent: Number(pct(noChangeMarkers.length, allMarkers.length)),
    acted: acted.length,
    noChangeOnly: noChangeOnly.length,
    ignored: ignored.length,
    noChangeAllThree: noChangeAllThree.map((f) => f.id),
    noChangeSome: noChangeSome.map((f) => f.id),
    noChangeNone: noChangeNone.length,
    perFinding,
    runDetail: runs,
  };
  await writeFile(
    path.join(OUT_DIR, "coverage-gap-measure.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );
  console.log("");
  console.log("wrote coverage-gap-measure.json");

  await flushObservability();
}

main().catch(async (err) => {
  console.error(err);
  await flushObservability();
  process.exit(1);
});
