#!/usr/bin/env node
/**
 * Two diagnostics from the first production run of deterministic removal
 * (2026-08-27).
 *
 * Part 1  Revise-then-review false green. Three Reviews of the ORIGINAL draft
 *         and three of the REVISED draft, same source, no Suggest involved.
 *         Live model calls against the production Review endpoint.
 * Part 2  Size bundled marker notes across every Suggest artefact on disk.
 *         Zero model calls.
 *
 * The production drafts were not committed to the repo. They are reconstructed
 * here from the evidence in the run: the exact draft sentence, the CHANGED
 * marker span {544, 757} and the CUT marker span {994, 999}. The script
 * asserts those offsets against the reconstruction before running Part 1.
 *
 * Usage:
 *   node scripts/diagnostic/revise/false-green-and-bundled-notes.mjs
 *   PART=2 node scripts/diagnostic/revise/false-green-and-bundled-notes.mjs
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { markerSpanAlignment } from "../../../lib/pr9-marker-span-status.mjs";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const OUT_DIR = __dirname;
const SOURCE_PATH = path.join(
  REPO_ROOT,
  "scripts/diagnostic/eval-ablation/meridian_source_production.txt"
);

const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL ||
  "https://brightline-content-engine-backend.vercel.app";

const RUNS_PER_ARM = 3;
const ONLY_PART = process.env.PART ? String(process.env.PART) : null;

/* ------------------------------------------------------------------ *
 * Part 1: reconstructed production fixture
 * ------------------------------------------------------------------ */

const TARGET_REVISED_SENTENCE =
  "Partners Group was attracted to this investment given Meridian Capital's " +
  "strong track record on its prior vintage funds, coupled with its " +
  "well-established investment team and operational approach to value creation.";

const TARGET_ORIGINAL_SENTENCE =
  "Partners Group was attracted to this investment given Meridian Capital's " +
  "strong track record on its prior vintage funds, coupled with its " +
  "well-established and highly regarded investment team and operational " +
  "approach to value creation.";

const STATEMENT_0 =
  "In June 2026, Partners Group made a commitment to Meridian Capital " +
  "Partners V, a EUR 1.2 billion fund targeting lower-mid-market buyouts in " +
  "European industrial technology and business services.";

const PARA_TRACK =
  "The fund is managed by Meridian Capital Management, which has deployed " +
  "EUR 2.8 billion across 41 platform investments over Funds I to IV and has " +
  "realised a gross MOIC of 2.4 times and a gross IRR of 21 per cent across " +
  "17 fully realised exits.";

const PARA_MARK =
  "Fund IV, the 2019 vintage fund of EUR 900 million, is currently marked at " +
  "1.9 times gross MOIC to date.";

const PARA_TEAM =
  "The investment team comprises 14 professionals across London, Munich and " +
  "Stockholm, the founding partners have worked together since 2008, and " +
  "diligence has confirmed no senior departures across the last three fund " +
  "cycles relative to peers.";

const REMOVED_SENTENCE =
  "Partners Group expects the relationship to deepen over the life of the fund.";

function buildDraft(targetSentence, { includeRemoved }) {
  const paras = [STATEMENT_0, PARA_TRACK, PARA_MARK, targetSentence, PARA_TEAM];
  if (includeRemoved) paras.push(REMOVED_SENTENCE);
  return paras.join("\n\n");
}

// ORIGINAL: what the user submitted. REVISED: what Suggest returned, i.e.
// "and highly regarded" removed and the unsupported closing sentence deleted
// by the deterministic removal path.
const ORIGINAL_DRAFT = buildDraft(TARGET_ORIGINAL_SENTENCE, { includeRemoved: true });
const REVISED_DRAFT = buildDraft(TARGET_REVISED_SENTENCE, { includeRemoved: false });

const PRODUCTION_CHANGED_MARKER = { start: 544, end: 757 };
const PRODUCTION_CUT_MARKER = { start: 994, end: 999 };

function checkFixtureOffsets() {
  const changedSpan = REVISED_DRAFT.slice(
    PRODUCTION_CHANGED_MARKER.start,
    PRODUCTION_CHANGED_MARKER.end
  );
  const cutSpan = REVISED_DRAFT.slice(
    PRODUCTION_CUT_MARKER.start,
    PRODUCTION_CUT_MARKER.end
  );
  return {
    changedSpan,
    cutSpan,
    changedMatches: changedSpan === TARGET_REVISED_SENTENCE.replace(/\.$/, ""),
    cutIsLastWordOfPrecedingSentence: cutSpan === "peers",
  };
}

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
        name: "meridian_source_production.txt",
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
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findStatement(statements, needle) {
  const list = Array.isArray(statements) ? statements : [];
  const key = normalizeForMatch(needle);
  return (
    list.find((s) => normalizeForMatch(s?.text) === key) ||
    list.find((s) => normalizeForMatch(s?.text).includes(key.slice(0, 60))) ||
    null
  );
}

function stage2Slices(stmt) {
  // Per-source Stage 2 classification lives on the support / unsupported
  // spans; the fingerprints sit alongside them on the card.
  const card = stmt?.qcCard || {};
  const fingerprints = card.stage2SourceFingerprints ?? null;
  const collect = (list, kind) =>
    (Array.isArray(list) ? list : []).map((entry) => ({
      kind,
      sourceRefId: entry?.sourceRefId ?? null,
      classification: entry?.classification ?? null,
      passage: entry?.passage ?? null,
      text: entry?.text ?? null,
    }));
  return {
    spans: [...collect(card.supportSpans, "support"), ...collect(card.unsupportedSpans, "unsupported")],
    stage2SourceFingerprints: fingerprints,
  };
}

function cardSummary(stmt) {
  if (!stmt) return null;
  const c = stmt.qcCard || {};
  return {
    text: stmt.text ?? "",
    supportState: c.supportState ?? null,
    displayVerdict: c.displayVerdict ?? null,
    concernLevel: c.concernLevel ?? null,
    unsupportedSpans: Array.isArray(c.unsupportedSpans) ? c.unsupportedSpans : [],
    reasoningParagraph: c.reasoningParagraph ?? c.evidenceSummary ?? null,
    stage2: stage2Slices(stmt),
  };
}

async function runPart1() {
  const sourceText = await readFile(SOURCE_PATH, "utf8");
  const fixture = checkFixtureOffsets();

  console.log("PART 1  revise-then-review false green");
  console.log(`URL ${PRODUCTION_URL}`);
  console.log(
    `fixture offsets: CHANGED {544,757} matches target sentence = ${fixture.changedMatches}; ` +
      `CUT {994,999} = ${JSON.stringify(fixture.cutSpan)}`
  );
  console.log(
    `estimated cost: ${RUNS_PER_ARM * 2} Reviews of a ~${ORIGINAL_DRAFT.length}-char ` +
      "draft against a ~2.3k-char source, about $0.60 to $1.00 total"
  );

  const arms = [
    { arm: "original", draft: ORIGINAL_DRAFT, target: TARGET_ORIGINAL_SENTENCE },
    { arm: "revised", draft: REVISED_DRAFT, target: TARGET_REVISED_SENTENCE },
  ];

  const runs = [];
  for (const { arm, draft, target } of arms) {
    for (let run = 1; run <= RUNS_PER_ARM; run++) {
      process.stdout.write(`${arm}/r${run} `);
      const res = await postJson("/api/analyse-statements", reviewBody(draft, sourceText));
      const statements = Array.isArray(res.payload?.statements) ? res.payload.statements : [];
      const targetCard = cardSummary(findStatement(statements, target));
      const control = cardSummary(findStatement(statements, STATEMENT_0));
      runs.push({
        arm,
        run,
        httpStatus: res.httpStatus,
        ms: res.ms,
        traceId: res.payload?.meta?.traceId ?? null,
        statementCount: statements.length,
        target: targetCard,
        statement0: control,
        allVerdicts: statements.map((s) => ({
          text: s?.text,
          supportState: s?.qcCard?.supportState ?? null,
          displayVerdict: s?.qcCard?.displayVerdict ?? null,
        })),
      });
      console.log(
        `http=${res.httpStatus} target=${targetCard?.supportState ?? "?"}/` +
          `${targetCard?.displayVerdict ?? "?"} spans=${targetCard?.unsupportedSpans.length ?? "?"} ` +
          `s0=${control?.supportState ?? "?"}`
      );
    }
  }

  const byArm = (arm) => runs.filter((r) => r.arm === arm);
  const stateCounts = (arm, pick) => {
    const counts = {};
    for (const r of byArm(arm)) {
      const key = String(pick(r) ?? "null");
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  };

  const originalStates = stateCounts("original", (r) => r.target?.displayVerdict);
  const revisedStates = stateCounts("revised", (r) => r.target?.displayVerdict);
  const originalStable = Object.keys(originalStates).length === 1;
  const revisedStable = Object.keys(revisedStates).length === 1;

  const originalAllPartial = originalStates.supported_partial === RUNS_PER_ARM;
  const revisedAllFull = revisedStates.supported_full === RUNS_PER_ARM;

  let verdict = "OTHER";
  if (originalAllPartial && revisedAllFull) verdict = "CAUSED BY THE EDIT";
  else if (!originalStable || !revisedStable) verdict = "STAGE 2 NOISE";

  // Noise floor, stated as a count the way the reviser band is stated:
  // how many of the three runs per arm agree with that arm's modal outcome.
  const modal = (counts) =>
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? ["null", 0];
  const noiseFloor = {
    original: `${modal(originalStates)[1]} of ${RUNS_PER_ARM} (${modal(originalStates)[0]})`,
    revised: `${modal(revisedStates)[1]} of ${RUNS_PER_ARM} (${modal(revisedStates)[0]})`,
    statement0Original: `${modal(stateCounts("original", (r) => r.statement0?.displayVerdict))[1]} of ${RUNS_PER_ARM}`,
    statement0Revised: `${modal(stateCounts("revised", (r) => r.statement0?.displayVerdict))[1]} of ${RUNS_PER_ARM}`,
  };

  const out = {
    ranAt: new Date().toISOString(),
    productionUrl: PRODUCTION_URL,
    fixture: {
      note:
        "Production drafts were not on disk. Reconstructed from the run evidence; " +
        "offsets asserted against the production marker spans.",
      originalDraft: ORIGINAL_DRAFT,
      revisedDraft: REVISED_DRAFT,
      offsetCheck: fixture,
      sourcePath: "scripts/diagnostic/eval-ablation/meridian_source_production.txt",
    },
    runsPerArm: RUNS_PER_ARM,
    originalStates,
    revisedStates,
    verdict,
    noiseFloor,
    runs,
  };

  await writeFile(
    path.join(OUT_DIR, "false-green-runs.json"),
    `${JSON.stringify(out, null, 2)}\n`,
    "utf8"
  );

  console.log("");
  console.log(`VERDICT ${verdict}`);
  console.log(`original ${JSON.stringify(originalStates)}`);
  console.log(`revised  ${JSON.stringify(revisedStates)}`);
  console.log(`noise floor ${JSON.stringify(noiseFloor)}`);
  return out;
}

/* ------------------------------------------------------------------ *
 * Part 2: bundled marker notes, zero model calls
 * ------------------------------------------------------------------ */

// Every revise artefact was produced from the same original draft constant.
const ARTEFACT_DRAFT_SOURCES = [
  { prefix: "suggest-after-r10-suggest", script: "run-suggest-after-r10.mjs" },
  { prefix: "condition-a-suggest", script: "run-condition-a-removal.mjs" },
  { prefix: "condition-b-suggest", script: "run-condition-a-removal.mjs" },
  {
    prefix: "condition-a-condition-b-suggest-rerun",
    script: "run-condition-a-removal.mjs",
  },
  { prefix: "reviser-noise-floor-run", script: "run-reviser-noise-floor.mjs" },
  {
    prefix: "deterministic-removal-",
    script: "run-deterministic-unsupported-removal-measure.mjs",
  },
];

async function loadOriginalDraftFromScript(scriptName) {
  const text = await readFile(path.join(OUT_DIR, scriptName), "utf8");
  const match = text.match(/const MERIDIAN_DRAFT = `([\s\S]*?)`;/);
  if (!match) throw new Error(`MERIDIAN_DRAFT not found in ${scriptName}`);
  return match[1];
}

function markersFromArtefact(json) {
  if (Array.isArray(json?.markers)) {
    return { markers: json.markers, revisedDraft: json.revisedDraft ?? "" };
  }
  if (Array.isArray(json?.payload?.markers)) {
    return {
      markers: json.payload.markers,
      revisedDraft: json.payload.revisedDraft ?? "",
    };
  }
  return { markers: [], revisedDraft: "" };
}

const CHANGE_VERB =
  /\b(remov\w+|delet\w+|cut|drop\w+|struck|strik\w+|replac\w+|chang\w+|rewrote|rewritt\w+|revis\w+|reworded?|softened?|qualifi\w+|hedged?|added|attributed?|trimmed?)\b/i;

// Reason language. Everything from here on explains why, not what changed.
const REASON_LEAD =
  /,?\s+(?:which\b|because\b|since\b|as the source\b|the source\b|to (?:align|match|reflect|avoid|keep|stay|remain)\b|so that\b|in order to\b|while retaining\b|as it\b|as this\b)/i;

const QUOTE_RE = /['"\u2018\u201c]([^'"\u2018\u2019\u201c\u201d]{2,80})['"\u2019\u201d]/g;

// Leading verbs that describe what became of the same edited span.
const DISPOSITION_LEAD =
  /^(?:retain\w*|kept|keep\w*|left|leav\w*|preserv\w*|maintain\w*|replac\w*|substitut\w*|recast|refocus\w*|focus\w*|reworded?|rephras\w*|clarif\w*|reframed?|add\w*|introduc\w*|used?)\b/i;

// Leading verbs that assert a further, separate edit.
const REMOVAL_LEAD = /^(?:remov\w*|delet\w*|cut|drop\w*|struck|strik\w*|trimm\w*|excis\w*)\b/i;

const REPLACEMENT_RE =
  /(?:chang\w+|replac\w+|rewrote|rewritt\w+|reworded?|swapp\w+)\s+['"\u2018\u201c]([^'"\u2019\u201d]{2,80})['"\u2019\u201d]\s+(?:to|with|into|for)\s+['"\u2018\u201c]([^'"\u2019\u201d]{2,80})['"\u2019\u201d]/i;

/**
 * Claims a note asserts, split on conjunctions inside the first clause.
 * The note convention is "<what changed> - <why>. <closer>", so only the
 * first clause states changes, and reason language is trimmed off it.
 * @param {string} note
 * @returns {Array<{ text: string, quoted: string[], replacement: ?{from: string, to: string} }>}
 */
function extractClaims(note) {
  const raw = String(note || "").trim();
  if (!raw) return [];
  const sepIdx = raw.search(/\s[-\u2013\u2014]\s/);
  let first = sepIdx >= 0 ? raw.slice(0, sepIdx) : raw.split(/(?<=[.!?])\s/)[0] || raw;
  const reasonIdx = first.search(REASON_LEAD);
  if (reasonIdx > 0) first = first.slice(0, reasonIdx);
  first = first.replace(/[.,;:\s]+$/, "");
  if (!CHANGE_VERB.test(first)) return [];

  const replacement = first.match(REPLACEMENT_RE);
  if (replacement) {
    return [
      {
        text: first,
        quoted: [],
        replacement: { from: replacement[1], to: replacement[2] },
      },
    ];
  }

  const parts = first
    .split(/\s+and\s+|;\s*/i)
    .map((p) => p.replace(/[.,;:\s]+$/, "").trim())
    .filter((p) => p && /[a-z]{3}/i.test(p));

  const texts = parts.length ? parts : [first];
  // A conjunct either asserts a further edit (ADDITIONAL) or restates the
  // disposition of the same edit (DISPOSITION: "and replaced it with...",
  // "and retained only..."). Only ADDITIONAL conjuncts need their own edit in
  // the diff. A bare noun phrase inherits the kind of the conjunct before it.
  let previousKind = "ADDITIONAL";
  return texts.map((text, i) => {
    let kind;
    if (i === 0) kind = "ADDITIONAL";
    else if (DISPOSITION_LEAD.test(text)) kind = "DISPOSITION";
    else if (REMOVAL_LEAD.test(text)) kind = "ADDITIONAL";
    else kind = previousKind;
    previousKind = kind;
    return {
      text,
      kind,
      quoted: [...text.matchAll(QUOTE_RE)].map((m) => m[1]),
      replacement: null,
    };
  });
}

/**
 * Word-level edit operations between the aligned original region and the
 * revised span. Distinct contiguous runs of insertion or deletion count once.
 * @param {string} origText
 * @param {string} revText
 * @returns {{ editCount: number, removed: string[], added: string[] }}
 */
function diffOps(origText, revText) {
  const a = String(origText || "").split(/\s+/).filter(Boolean);
  const b = String(revText || "").split(/\s+/).filter(Boolean);
  const norm = (w) => w.replace(/[\u2018\u2019]/g, "'").toLowerCase();
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        norm(a[i]) === norm(b[j])
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const removed = [];
  const added = [];
  let editCount = 0;
  let i = 0;
  let j = 0;
  let inEdit = false;
  let curRemoved = [];
  let curAdded = [];
  const flush = () => {
    if (!inEdit) return;
    editCount += 1;
    if (curRemoved.length) removed.push(curRemoved.join(" "));
    if (curAdded.length) added.push(curAdded.join(" "));
    curRemoved = [];
    curAdded = [];
    inEdit = false;
  };
  while (i < n && j < m) {
    if (norm(a[i]) === norm(b[j])) {
      flush();
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      inEdit = true;
      curRemoved.push(a[i]);
      i += 1;
    } else {
      inEdit = true;
      curAdded.push(b[j]);
      j += 1;
    }
  }
  while (i < n) {
    inEdit = true;
    curRemoved.push(a[i]);
    i += 1;
  }
  while (j < m) {
    inEdit = true;
    curAdded.push(b[j]);
    j += 1;
  }
  flush();
  return { editCount, removed, added };
}

/**
 * The paragraph of `text` containing character offset `offset`.
 * @param {string} text
 * @param {number} offset
 * @returns {string}
 */
function paragraphContaining(text, offset) {
  const source = typeof text === "string" ? text : "";
  const at = Number.isFinite(offset) ? Math.max(0, Math.min(offset, source.length)) : 0;
  let start = source.lastIndexOf("\n\n", at);
  start = start < 0 ? 0 : start + 2;
  let end = source.indexOf("\n\n", at);
  if (end < 0) end = source.length;
  return source.slice(start, end);
}

function classifyNote({ note, origText, revText, originalDraft, revSentence }) {
  const claims = extractClaims(note);
  const diff = diffOps(origText, revText);
  // Presence is judged against the containing revised sentence, not the
  // aligned span alone: wording the note says it removed counts as still
  // there if it survives anywhere in the sentence the marker sits in.
  const origKey = `${normalizeForMatch(origText)} ${normalizeForMatch(originalDraft)}`;
  const revKey = normalizeForMatch(revSentence || revText);

  // Per claim: TRUE / FALSE where a quotation makes it checkable, otherwise
  // UNVERIFIABLE. A quotation absent from both sides is not evidence either
  // way: the alignment window may simply be narrower than the note's subject.
  const checks = [];
  for (const claim of claims) {
    if (claim.replacement) {
      const from = normalizeForMatch(claim.replacement.from);
      const to = normalizeForMatch(claim.replacement.to);
      const holds = !revKey.includes(from) && revKey.includes(to);
      checks.push({
        claim: claim.text,
        kind: "replacement",
        quoted: `${claim.replacement.from} -> ${claim.replacement.to}`,
        status: holds ? "TRUE" : "FALSE",
      });
      continue;
    }
    if (!claim.quoted.length) {
      checks.push({
        claim: claim.text,
        kind: claim.kind === "DISPOSITION" ? "unquoted_disposition" : "unquoted",
        quoted: null,
        status: "UNVERIFIABLE",
      });
      continue;
    }
    for (const q of claim.quoted) {
      const qk = normalizeForMatch(q);
      if (!qk) continue;
      const wasPresent = origKey.includes(qk);
      const stillPresent = revKey.includes(qk);
      let status = "UNVERIFIABLE";
      if (stillPresent) status = "FALSE";
      else if (wasPresent) status = "TRUE";
      checks.push({
        claim: claim.text,
        kind: "quoted_removal",
        quoted: q,
        wasPresent,
        stillPresent,
        status,
      });
    }
  }

  const claimCount = claims.length;
  const trueChecks = checks.filter((c) => c.status === "TRUE").length;
  const falseChecks = checks.filter((c) => c.status === "FALSE").length;
  const unverifiable = checks.filter((c) => c.status === "UNVERIFIABLE").length;
  // Claims asserting a further edit, left over once every actual edit in the
  // diff has been assigned to one of them.
  const additionalClaims = claims.filter((c) => c.kind !== "DISPOSITION").length;
  const surplusClaims = Math.max(0, additionalClaims - diff.editCount);

  let classification;
  if (!claimCount) classification = "UNCLEAR";
  else if (diff.editCount === 0) classification = "FALSE";
  else if (trueChecks > 0 && falseChecks > 0) classification = "BUNDLED";
  else if (trueChecks === 0 && falseChecks > 0) classification = "FALSE";
  else if (trueChecks > 0 && surplusClaims > 0) classification = "BUNDLED";
  else if (trueChecks > 0) classification = "ACCURATE";
  else if (unverifiable === checks.length) classification = "UNCLEAR";
  else classification = "ACCURATE";

  return {
    classification,
    claimCount,
    additionalClaims,
    claims: claims.map((c) => ({ text: c.text, kind: c.kind ?? "ADDITIONAL" })),
    quotedChecks: checks,
    trueChecks,
    falseChecks,
    unverifiable,
    editCount: diff.editCount,
    surplusClaims,
    removed: diff.removed,
    added: diff.added,
  };
}

async function runPart2() {
  console.log("");
  console.log("PART 2  bundled marker notes, zero model calls");

  const draftCache = new Map();
  const files = (await readdir(OUT_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort();

  const rows = [];
  const skipped = [];

  for (const file of files) {
    const mapping = ARTEFACT_DRAFT_SOURCES.find((m) => file.startsWith(m.prefix));
    if (!mapping) {
      skipped.push({ file, reason: "not a Suggest artefact" });
      continue;
    }
    const json = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
    const { markers, revisedDraft } = markersFromArtefact(json);
    if (!markers.length || !revisedDraft) {
      skipped.push({ file, reason: "no markers or no revisedDraft" });
      continue;
    }
    if (!draftCache.has(mapping.script)) {
      draftCache.set(mapping.script, await loadOriginalDraftFromScript(mapping.script));
    }
    const originalDraft = draftCache.get(mapping.script);

    markers.forEach((marker, index) => {
      const note = typeof marker?.note === "string" ? marker.note : "";
      const align = markerSpanAlignment(
        originalDraft,
        revisedDraft,
        marker?.start,
        marker?.end
      );
      // Paragraph scope, not sentence scope: sentenceBoundsContaining treats
      // the decimal point in "1.9" as a terminal, which would truncate the
      // window in the middle of a figure.
      const revSentence = paragraphContaining(revisedDraft, marker?.start);
      const result = classifyNote({
        note,
        origText: align.origRegionText,
        revText: align.revSpanText,
        originalDraft,
        revSentence,
      });
      // Not a removal-asserting note: the first clause states no change.
      if (!result.claimCount) return;
      rows.push({
        file,
        markerIndex: index,
        intent: marker?.intent ?? null,
        start: marker?.start ?? null,
        end: marker?.end ?? null,
        note,
        originalSpanText: align.origRegionText,
        revisedSpanText: align.revSpanText,
        revisedSentence: revSentence,
        ...result,
      });
    });
  }

  // Validation: the known BUNDLED note from the 2026-08-27 production run must
  // classify as BUNDLED, otherwise a zero count on the corpus means nothing.
  const productionNote =
    "Removed 'highly regarded' and the explicit attribution of these factors " +
    "as the reason for Partners Group's interest, which are not supported by " +
    "the source. Confirm before publishing.";
  const productionCase = {
    note: productionNote,
    marker: { ...PRODUCTION_CHANGED_MARKER, intent: "CHANGED" },
    ...classifyNote({
      note: productionNote,
      origText: TARGET_ORIGINAL_SENTENCE,
      revText: TARGET_REVISED_SENTENCE,
      originalDraft: ORIGINAL_DRAFT,
      revSentence: TARGET_REVISED_SENTENCE,
    }),
  };
  console.log(
    `validation: production marker classifies as ${productionCase.classification} ` +
      `(claims=${productionCase.claimCount}, additional=${productionCase.additionalClaims}, ` +
      `edits=${productionCase.editCount})`
  );

  const counts = { ACCURATE: 0, BUNDLED: 0, FALSE: 0, UNCLEAR: 0 };
  for (const r of rows) counts[r.classification] += 1;
  const total = rows.length;
  const bundledFraction = total ? counts.BUNDLED / total : 0;

  // Part 3A: of the BUNDLED notes, how many are caught by a quoted-claim check
  // alone (a quoted string the note says was removed is still in the span).
  const bundled = rows.filter((r) => r.classification === "BUNDLED");
  const caughtByQuotedCheck = bundled.filter((r) =>
    r.quotedChecks.some((q) => q.status === "FALSE")
  ).length;

  const out = {
    ranAt: new Date().toISOString(),
    modelCalls: 0,
    costUsd: 0,
    artefactsScanned: files.length,
    skipped,
    removalAssertingNotes: total,
    productionCase,
    counts,
    bundledFraction,
    quotedClaimCheck: {
      bundledTotal: bundled.length,
      caughtByQuotedCheck,
      fraction: bundled.length ? caughtByQuotedCheck / bundled.length : 0,
    },
    rows,
  };

  await writeFile(
    path.join(OUT_DIR, "bundled-notes-rows.json"),
    `${JSON.stringify(out, null, 2)}\n`,
    "utf8"
  );

  console.log(`removal-asserting notes: ${total}`);
  console.log(
    `ACCURATE ${counts.ACCURATE}  BUNDLED ${counts.BUNDLED}  ` +
      `FALSE ${counts.FALSE}  UNCLEAR ${counts.UNCLEAR}`
  );
  console.log(`BUNDLED fraction ${(bundledFraction * 100).toFixed(1)}%`);
  console.log(
    `quoted-claim check would catch ${caughtByQuotedCheck} of ${bundled.length} BUNDLED`
  );
  for (const r of bundled) {
    console.log(`  BUNDLED ${r.file}#${r.markerIndex} claims=${r.claimCount} edits=${r.editCount}`);
  }
  return out;
}

async function main() {
  if (ONLY_PART !== "2") await runPart1();
  if (ONLY_PART !== "1") await runPart2();
}

main().catch((err) => {
  console.error("[false-green-and-bundled-notes] fatal:", err?.stack || err);
  process.exit(1);
});
