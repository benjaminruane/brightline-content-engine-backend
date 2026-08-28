#!/usr/bin/env node
/**
 * Q3 of the directive-vs-diagnosis diagnostic: does the reviser act on
 * editorial and compliance concerns but only narrate on evidence concerns?
 *
 * Zero model calls. Every Suggest artefact on disk is replayed: each marker is
 * traced to the concern it sits on, and the real-edit / no-change split is
 * recomputed from the diff rather than read from the note, because these
 * artefacts predate what-from-diff and their notes are the model's own.
 *
 * Deliberately NOT sampled from bundled-notes-rows.json: that set was filtered
 * by marker honesty and then narrowed to removal-asserting notes, which is the
 * sampling bias bf9d9e8 called out.
 *
 * Usage: node scripts/diagnostic/revise/directive-vs-diagnosis.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gatherConcerns } from "../../../lib/build-revision-prompt.mjs";
import { markerSpanAlignment } from "../../../lib/pr9-marker-span-status.mjs";
import {
  buildNoteBodyFromDiff,
  concernKind,
  resolveConcernForMarker,
} from "../../../lib/pr9-note-what-from-diff.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;

/** Artefact prefix -> the run script holding the draft it was produced from. */
const ARTEFACT_DRAFT_SOURCES = [
  { prefix: "condition-a-condition-b-suggest-rerun", script: "run-condition-a-removal.mjs" },
  { prefix: "suggest-after-r10-suggest", script: "run-suggest-after-r10.mjs" },
  { prefix: "condition-a-suggest", script: "run-condition-a-removal.mjs" },
  { prefix: "condition-b-suggest", script: "run-condition-a-removal.mjs" },
  { prefix: "reviser-noise-floor-run", script: "run-reviser-noise-floor.mjs" },
  { prefix: "deterministic-removal-", script: "run-deterministic-unsupported-removal-measure.mjs" },
];

function reviewFileFor(name) {
  if (name.startsWith("condition-b-suggest")) return "condition-b-review.json";
  if (name.startsWith("condition-a-condition-b-suggest-rerun")) return "condition-b-review.json";
  if (name.startsWith("suggest-after-r10-suggest2")) return "suggest-after-r10-review2.json";
  return "suggest-after-r10-review1.json";
}

async function loadOriginalDraftFromScript(scriptName) {
  const text = await readFile(path.join(OUT_DIR, scriptName), "utf8");
  const match = text.match(/const MERIDIAN_DRAFT = `([\s\S]*?)`;/);
  if (!match) throw new Error(`MERIDIAN_DRAFT not found in ${scriptName}`);
  return match[1];
}

async function loadConcerns(reviewFile) {
  const json = JSON.parse(await readFile(path.join(OUT_DIR, reviewFile), "utf8"));
  const statements = Array.isArray(json?.payload?.statements) ? json.payload.statements : [];
  return gatherConcerns(statements, null);
}

function revisedDraftFrom(json) {
  if (typeof json?.revisedDraft === "string") return json.revisedDraft;
  if (typeof json?.payload?.revisedDraft === "string") return json.payload.revisedDraft;
  return "";
}

function markersFrom(json) {
  if (Array.isArray(json?.markers)) return json.markers;
  if (Array.isArray(json?.payload?.markers)) return json.payload.markers;
  return [];
}

function isDeterministicRemovalNote(note) {
  return typeof note === "string" && note.startsWith("Removed this sentence:");
}

async function main() {
  const files = (await readdir(OUT_DIR))
    .filter((f) => f.endsWith(".json"))
    .filter((f) => ARTEFACT_DRAFT_SOURCES.some((m) => f.startsWith(m.prefix)))
    .sort();

  const draftCache = new Map();
  const concernCache = new Map();

  /**
   * kind -> tallies. The unit is a CONCERN INSTANCE (one concern in one run),
   * not a marker: a concern can attract two markers, which is why an earlier
   * marker-denominated rate exceeded 100%.
   */
  const byKind = new Map();
  const bump = (kind, field, n = 1) => {
    if (!byKind.has(kind)) {
      byKind.set(kind, {
        kind,
        opportunities: 0,
        markers: 0,
        actedWithMarker: 0,
        actedSilently: 0,
        noChangeMarker: 0,
        ignored: 0,
        detRemoval: 0,
      });
    }
    byKind.get(kind)[field] += n;
  };

  /** Did the concern's own statement text survive unchanged in the revision? */
  function statementSurvived(original, revised, statementText) {
    const needle = String(statementText || "").trim();
    if (!needle) return true;
    const collapse = (s) => s.replace(/\s+/g, " ").trim();
    return collapse(revised).includes(collapse(needle));
  }

  const artefacts = [];
  let untracedMarkers = 0;
  let totalMarkers = 0;

  for (const file of files) {
    const json = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
    const revised = revisedDraftFrom(json);
    const markers = markersFrom(json);
    if (!revised || markers.length === 0) continue;

    const mapping = ARTEFACT_DRAFT_SOURCES.find((m) => file.startsWith(m.prefix));
    if (!mapping) continue;
    if (!draftCache.has(mapping.script)) {
      draftCache.set(mapping.script, await loadOriginalDraftFromScript(mapping.script));
    }
    const original = draftCache.get(mapping.script);

    const reviewFile = reviewFileFor(file);
    if (!concernCache.has(reviewFile)) {
      concernCache.set(reviewFile, await loadConcerns(reviewFile));
    }
    const concerns = concernCache.get(reviewFile);
    const kinds = concerns.map((c) => concernKind(c) ?? "none");

    const hitConcern = new Set();
    const concernHadRealEdit = new Set();
    let artefactReal = 0;
    let artefactNoChange = 0;

    for (const m of markers) {
      totalMarkers += 1;
      const align = markerSpanAlignment(original, revised, m.start, m.end);
      const concern = resolveConcernForMarker(original, align, concerns);
      const idx = concern ? concerns.indexOf(concern) : -1;
      const kind = idx >= 0 ? kinds[idx] : "(untraced)";
      if (idx >= 0) hitConcern.add(idx);
      else untracedMarkers += 1;

      const built = buildNoteBodyFromDiff({
        original,
        revised,
        start: m.start,
        end: m.end,
        note: typeof m.note === "string" ? m.note : "",
        concerns,
      });

      bump(kind, "markers");
      if (isDeterministicRemovalNote(m.note)) {
        bump(kind, "detRemoval");
        if (idx >= 0) concernHadRealEdit.add(idx);
        artefactReal += 1;
      } else if (built.changed) {
        if (idx >= 0) concernHadRealEdit.add(idx);
        artefactReal += 1;
      } else {
        artefactNoChange += 1;
      }
    }

    for (let i = 0; i < concerns.length; i++) {
      const kind = kinds[i];
      bump(kind, "opportunities");
      if (concernHadRealEdit.has(i)) {
        bump(kind, "actedWithMarker");
      } else if (hitConcern.has(i)) {
        bump(kind, "noChangeMarker");
      } else if (!statementSurvived(original, revised, concerns[i].statementText)) {
        // Edited, but with no marker anywhere on it: the user never sees it.
        bump(kind, "actedSilently");
      } else {
        bump(kind, "ignored");
      }
    }

    artefacts.push({
      file,
      markers: markers.length,
      realEdit: artefactReal,
      noChange: artefactNoChange,
      concerns: concerns.length,
    });
  }

  // The 14 artefacts above are all evidence-only. The production fixture runs
  // are the ONLY data on disk carrying an editorial concern, so the contrast
  // the hypothesis needs exists nowhere else.
  let productionFolded = 0;
  try {
    const cg = JSON.parse(await readFile(path.join(OUT_DIR, "coverage-gap-measure.json"), "utf8"));
    const original = (
      await readFile(path.join(OUT_DIR, "fixtures", "meridian_production_original.txt"), "utf8")
    ).trim();
    const concerns = await (async () => {
      const rev = JSON.parse(await readFile(path.join(OUT_DIR, "coverage-gap-review.json"), "utf8"));
      return gatherConcerns(rev.payload?.statements ?? [], null);
    })();
    const kinds = concerns.map((c) => concernKind(c) ?? "none");

    for (const run of cg.runDetail ?? []) {
      const revised = run.revisedDraft ?? "";
      for (let i = 0; i < concerns.length; i++) {
        const id = `C${i}`;
        const own = (run.markers ?? []).filter((m) => m.concernId === id);
        const kind = kinds[i];
        bump(kind, "opportunities");
        bump(kind, "markers", own.length);
        const realEdit = own.some((m) => !m.noChange);
        if (realEdit) {
          bump(kind, "actedWithMarker");
          if (own.some((m) => m.deterministicRemoval)) bump(kind, "detRemoval");
        } else if (own.length > 0) {
          bump(kind, "noChangeMarker");
        } else if (!statementSurvived(original, revised, concerns[i].statementText)) {
          bump(kind, "actedSilently");
        } else {
          bump(kind, "ignored");
        }
      }
      productionFolded += 1;
      artefacts.push({
        file: `coverage-gap run ${run.run} (production fixture)`,
        markers: (run.markers ?? []).length,
        concerns: concerns.length,
      });
    }
  } catch (err) {
    console.log(`[warn] could not fold in production runs: ${err.message}`);
  }

  const rows = [...byKind.values()]
    .filter((r) => r.kind !== "(untraced)")
    .map((r) => {
      const acted = r.actedWithMarker + r.actedSilently;
      const o = r.opportunities;
      return {
        ...r,
        acted,
        actionRatePct: o === 0 ? 0 : Number(((acted / o) * 100).toFixed(1)),
        noChangeRatePct: o === 0 ? 0 : Number(((r.noChangeMarker / o) * 100).toFixed(1)),
      };
    })
    .sort((a, b) => b.actionRatePct - a.actionRatePct);

  const untraced = byKind.get("(untraced)");

  console.log("");
  console.log("Q3  action rate by concern kind, zero model calls");
  console.log(`artefacts replayed: ${artefacts.length}   markers: ${totalMarkers}   untraced: ${untracedMarkers}`);
  console.log("");
  console.log(`production runs folded in: ${productionFolded}`);
  console.log("");
  console.log("kind             opps  markers  acted+mkr  silent  noChange  ignored  ACTION%");
  for (const r of rows) {
    console.log(
      `${r.kind.padEnd(16)} ${String(r.opportunities).padStart(4)} ${String(r.markers).padStart(8)} ` +
        `${String(r.actedWithMarker).padStart(10)} ${String(r.actedSilently).padStart(7)} ` +
        `${String(r.noChangeMarker).padStart(9)} ${String(r.ignored).padStart(8)} ${String(r.actionRatePct).padStart(7)}`
    );
  }
  if (untraced) {
    console.log("");
    console.log(
      `(untraced markers: ${untraced.markers} — no concern statement overlapped their original region)`
    );
  }

  // Directive-carrying kinds vs evidence kinds.
  const DIRECTIVE_KINDS = new Set(["soften", "deletion", "craft", "compliance_add", "compliance_claim", "compliance_strip"]);
  const EVIDENCE_KINDS = new Set(["unsupported", "conflict", "partial"]);
  const agg = (set) =>
    rows
      .filter((r) => set.has(r.kind))
      .reduce(
        (a, r) => ({
          opps: a.opps + r.opportunities,
          acted: a.acted + r.acted,
          noChange: a.noChange + r.noChangeMarker,
        }),
        { opps: 0, acted: 0, noChange: 0 }
      );
  const directive = agg(DIRECTIVE_KINDS);
  const evidence = agg(EVIDENCE_KINDS);
  const rate = (x) => (x.opps === 0 ? "n/a" : `${((x.acted / x.opps) * 100).toFixed(1)}%`);

  console.log("");
  console.log(`directive-carrying kinds (editorial + compliance): ${directive.acted}/${directive.opps} acted = ${rate(directive)}`);
  console.log(`evidence kinds (unsupported/conflict/partial):     ${evidence.acted}/${evidence.opps} acted = ${rate(evidence)}`);

  await writeFile(
    path.join(OUT_DIR, "directive-vs-diagnosis.json"),
    `${JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        artefactsReplayed: artefacts.length,
        totalMarkers,
        untracedMarkers,
        byKind: rows,
        untraced: untraced ?? null,
        directiveKinds: { ...directive, actionRate: rate(directive) },
        evidenceKinds: { ...evidence, actionRate: rate(evidence) },
        artefacts,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log("");
  console.log("wrote directive-vs-diagnosis.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
