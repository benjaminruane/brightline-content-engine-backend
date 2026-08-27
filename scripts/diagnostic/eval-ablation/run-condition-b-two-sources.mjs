#!/usr/bin/env node
/**
 * Condition B: Halden Meridian draft vs GP pack + Halden IC note.
 * Production Review (evidence only) then Suggest. No second Review.
 * Expected cost: ~$0.80.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../revise");
const GP_PATH = path.join(__dirname, "meridian_source.txt");
const HALDEN_PATH = path.join(__dirname, "meridian_halden_note.txt");

const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL ||
  "https://brightline-content-engine-backend.vercel.app";

const MERIDIAN_DRAFT = `In June 2025, Halden Group made a lead commitment to Meridian Capital Partners V, a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.

We were attracted to Meridian on the strength of a track record that is, in our view, genuinely exceptional.

It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.

The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.

Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.

Meridian Capital Partners V is a EUR 1.2 billion fund targeting lower-mid-market buyouts in European industrial technology and business services.

The fund will hold investments for four to six years and will not deploy more than 30 per cent of commitments outside the EU.

On balance, we believe the fund should deliver returns broadly in line with its predecessor and we recommend the commitment.

The GP provided access to co-investments that would not otherwise have been available to us.

Halden Group expects the relationship to deepen over the life of the fund.`;

const NEEDLES = {
  lead: "In June 2025, Halden Group made a lead commitment",
  exceptional: "genuinely exceptional",
  ranking: "top quartile of European lower-mid-market managers",
  risk: "key-person risk is limited",
  mark: "Fund IV has returned 1.9 times gross MOIC",
  fund_desc: "Meridian Capital Partners V is a EUR 1.2 billion fund targeting",
  hold: "will not deploy more than 30 per cent",
  recommend: "we recommend the commitment",
  coinvest: "would not otherwise have been available",
  deepen: "expects the relationship to deepen",
};

function findByNeedle(statements, needle) {
  const list = Array.isArray(statements) ? statements : [];
  return (
    list.find((s) => typeof s?.text === "string" && s.text.includes(needle)) || null
  );
}

function stripMarkers(text) {
  return String(text || "").replace(/\{\{([\s\S]*?)\|\|[\s\S]*?\}\}/g, "$1");
}

function cardBrief(stmt) {
  if (!stmt) return null;
  const c = stmt.qcCard || {};
  const spans = Array.isArray(c.supportSpans) ? c.supportSpans : [];
  const fps = Array.isArray(c.stage2SourceFingerprints) ? c.stage2SourceFingerprints : [];
  return {
    text: stmt.text ?? "",
    displayVerdict: c.displayVerdict ?? null,
    concernLevel: c.concernLevel ?? null,
    supportState: c.supportState ?? null,
    aggregateVerdict: c.aggregateVerdict ?? null,
    evidenceSummary: c.evidenceSummary ?? c.reasoningParagraph ?? null,
    primaryExcerpt: c.primaryExcerpt ?? null,
    supportRefIds: c.supportRefIds ?? null,
    supportRefTitles: c.supportRefTitles ?? null,
    supportSpans: spans.map((sp) => ({
      classification: sp?.classification ?? null,
      sourceLabel: sp?.sourceLabel ?? null,
      sourceRefId: sp?.sourceRefId ?? null,
      passage: typeof sp?.passage === "string" ? sp.passage.slice(0, 240) : null,
    })),
    stage2SourceFingerprints: fps.map((f) => ({
      sourceIndex: f?.sourceIndex ?? null,
      sourceLabel: f?.sourceLabel ?? null,
      classification: f?.classification ?? null,
    })),
    unsupportedSpans: Array.isArray(c.unsupportedSpans) ? c.unsupportedSpans : [],
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

async function main() {
  const gpText = await readFile(GP_PATH, "utf8");
  const haldenText = await readFile(HALDEN_PATH, "utf8");
  await mkdir(OUT_DIR, { recursive: true });

  console.log("condition-b-two-sources");
  console.log(`URL: ${PRODUCTION_URL}`);
  console.log("Review against GP pack + Halden note...");

  const review = await postJson("/api/analyse-statements", {
    draftText: MERIDIAN_DRAFT,
    outputType: "reporting_commentary",
    requiredVersion: "complete",
    authoringOrganisation: "Halden Group",
    options: {
      pipelineRoute: "v4",
      evidenceEnabled: true,
      editorialEnabled: false,
      complianceEnabled: false,
    },
    sources: [
      {
        text: gpText,
        label: "Meridian Fund V summary (Halden copy)",
        name: "meridian_source.txt",
        title: "Meridian Fund V summary (Halden copy)",
        sourceType: "uploaded",
      },
      {
        text: haldenText,
        label: "Halden Group IC note (Meridian V)",
        name: "meridian_halden_note.txt",
        title: "Halden Group IC note (Meridian V)",
        sourceType: "uploaded",
      },
    ],
  });

  await writeFile(
    path.join(OUT_DIR, "condition-b-review.json"),
    `${JSON.stringify({ ranAt: new Date().toISOString(), ...review }, null, 2)}\n`,
    "utf8"
  );

  const statements = Array.isArray(review.payload?.statements)
    ? review.payload.statements
    : [];
  console.log(
    `review http=${review.httpStatus} ms=${review.ms} stmts=${statements.length} trace=${review.payload?.meta?.traceId ?? "?"}`
  );

  const byKey = {};
  for (const [key, needle] of Object.entries(NEEDLES)) {
    byKey[key] = cardBrief(findByNeedle(statements, needle));
    const c = byKey[key];
    console.log(
      `${key}: ${c?.displayVerdict ?? "?"}/${c?.concernLevel ?? "?"} refs=${JSON.stringify(c?.supportRefTitles)}`
    );
  }

  console.log("Suggest...");
  const suggest = await postJson("/api/suggest-revision", {
    draftText: MERIDIAN_DRAFT,
    statements,
    outputType: "reporting_commentary",
    requiredVersion: "complete",
    sources: [
      { index: 0, publicationState: "non_public", label: "Meridian Fund V summary (Halden copy)" },
      { index: 1, publicationState: "non_public", label: "Halden Group IC note (Meridian V)" },
    ],
  });

  await writeFile(
    path.join(OUT_DIR, "condition-b-suggest.json"),
    `${JSON.stringify({ ranAt: new Date().toISOString(), ...suggest }, null, 2)}\n`,
    "utf8"
  );

  const revised = suggest.payload?.revisedDraft ?? "";
  const deepenOrig =
    "Halden Group expects the relationship to deepen over the life of the fund.";
  const deepenInRevised = stripMarkers(revised)
    .split(/\n+/)
    .map((p) => p.trim())
    .find((p) => /deepen|expects the relationship/i.test(p));
  const deepenLeftAlone =
    deepenInRevised != null &&
    deepenInRevised.replace(/\s+/g, " ").trim() === deepenOrig.replace(/\s+/g, " ").trim();

  console.log("deepen in revised:", deepenInRevised);
  console.log("deepen left alone:", deepenLeftAlone);

  const meta = {
    ranAt: new Date().toISOString(),
    productionUrl: PRODUCTION_URL,
    costEstimateUsd: 0.8,
    review: {
      httpStatus: review.httpStatus,
      ms: review.ms,
      traceId: review.payload?.meta?.traceId ?? null,
      cards: byKey,
      statements: statements.map((s) => cardBrief(s)),
    },
    suggest: {
      httpStatus: suggest.httpStatus,
      ms: suggest.ms,
      ok: suggest.payload?.ok ?? false,
      revisedDraft: revised,
      markers: suggest.payload?.markers ?? [],
      honestyEvents: suggest.payload?.honestyEvents ?? [],
      deepenInRevised,
      deepenLeftAlone,
    },
  };

  await writeFile(
    path.join(OUT_DIR, "condition-b-run-meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8"
  );
  console.log("Wrote condition-b artefacts");
}

main().catch((err) => {
  console.error("[condition-b] fatal:", err?.message || err);
  process.exit(1);
});
