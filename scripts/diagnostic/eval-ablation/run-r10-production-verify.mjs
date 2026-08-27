#!/usr/bin/env node
/**
 * One production Review run for R10 ship verification.
 * Evidence only. Meridian draft vs meridian_source.txt (Halden copy).
 *
 * Expected cost: ~$0.50 (Stage 1 + Stage 2 pair calls on one source).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const MERIDIAN_SOURCE_PATH = path.join(__dirname, "meridian_source.txt");
const STAGE2_PROMPT_PATH = path.join(REPO_ROOT, "lib/qc/pipeline-v4/prompts/stage2_v4.md");
const OUT_PATH = path.join(__dirname, "r10-production-verify.json");
const NOTE_PATH = path.join(__dirname, "r10-production-verify.md");

const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL ||
  "https://brightline-content-engine-backend.vercel.app";

const EXPECTED_R10 = {
  length: 14259,
  sha256: "44847c61b07bac89855b9a0f555e30f528077ebe0b3a8baa2c2c06669d60b3e1",
};

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

const EXHIBITS = [
  {
    id: "EA_E1",
    label: "ranking",
    needle:
      "It has realised a gross MOIC of 2.4 times across 17 exits, placing it in the top quartile of European lower-mid-market managers.",
    r3aVerify: { displayVerdict: "supported_partial", concernLevel: "moderate" },
  },
  {
    id: "EA_E2",
    label: "risk",
    needle:
      "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.",
    r3aVerify: { displayVerdict: "supported_partial", concernLevel: "moderate" },
  },
  {
    id: "EA_E3",
    label: "mark",
    needle: "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.",
    r3aVerify: { displayVerdict: "supported_full", concernLevel: "none" },
    expectedNow: { displayVerdict: "conflict", concernLevel: "high" },
  },
];

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function findStatement(statements, needle) {
  const list = Array.isArray(statements) ? statements : [];
  const exact = list.find((s) => s?.text === needle);
  if (exact) return exact;
  const partial = list.find(
    (s) => typeof s?.text === "string" && s.text.includes(needle.slice(0, 40))
  );
  return partial || null;
}

function collectFingerprints(stmt) {
  const out = [];
  const card = stmt?.qcCard;
  const spans = Array.isArray(card?.supportSpans) ? card.supportSpans : [];
  for (const sp of spans) {
    if (sp?.systemFingerprint != null && String(sp.systemFingerprint).trim()) {
      out.push(String(sp.systemFingerprint));
    }
  }
  // Also scan nested match / evidence fields if present
  const matches = Array.isArray(stmt?.sourceMatches) ? stmt.sourceMatches : [];
  for (const m of matches) {
    if (m?.systemFingerprint != null && String(m.systemFingerprint).trim()) {
      out.push(String(m.systemFingerprint));
    }
  }
  return [...new Set(out)];
}

async function main() {
  const sourceText = await readFile(MERIDIAN_SOURCE_PATH, "utf8");
  const promptTrimmed = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
  const promptMeta = { length: promptTrimmed.length, sha256: sha256(promptTrimmed) };

  console.log("R10 production verify");
  console.log(`URL: ${PRODUCTION_URL}/api/analyse-statements`);
  console.log(`Local prompt reference: len=${promptMeta.length} sha256=${promptMeta.sha256}`);
  console.log(
    `Local matches EXPECTED_R10: ${
      promptMeta.length === EXPECTED_R10.length && promptMeta.sha256 === EXPECTED_R10.sha256
    }`
  );
  console.log("Expected billing: ~$0.50 (evidence only, one source)");

  const body = {
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
        text: sourceText,
        label: "Meridian Fund V summary (Halden copy)",
        name: "meridian_source.txt",
        title: "Meridian Fund V summary (Halden copy)",
        sourceType: "uploaded",
      },
    ],
  };

  const res = await fetch(`${PRODUCTION_URL.replace(/\/$/, "")}/api/analyse-statements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  const statements = Array.isArray(payload?.statements) ? payload.statements : [];

  const cards = statements
    .map((s, i) => ({
      index: i,
      text: s?.text ?? "",
      displayVerdict: s?.qcCard?.displayVerdict ?? null,
      concernLevel: s?.qcCard?.concernLevel ?? null,
      aggregateVerdict: s?.qcCard?.aggregateVerdict ?? null,
      supportState: s?.qcCard?.supportState ?? null,
      supportSpans: Array.isArray(s?.qcCard?.supportSpans) ? s.qcCard.supportSpans : [],
      pipelineVersion: s?.qcCard?.pipelineVersion ?? null,
      systemFingerprints: collectFingerprints(s),
    }))
    .filter((c) => c.text.trim());

  const exhibitReports = EXHIBITS.map((ex) => {
    const stmt = findStatement(statements, ex.needle);
    const card = stmt?.qcCard ?? null;
    const spans = Array.isArray(card?.supportSpans) ? card.supportSpans : [];
    return {
      id: ex.id,
      label: ex.label,
      statementText: stmt?.text ?? "(not extracted)",
      displayVerdict: card?.displayVerdict ?? null,
      concernLevel: card?.concernLevel ?? null,
      aggregateVerdict: card?.aggregateVerdict ?? null,
      supportState: card?.supportState ?? null,
      supportSpanClassifications: spans.map((sp) => sp?.classification ?? null),
      supportSpanPassages: spans.map((sp) => sp?.passage ?? null),
      systemFingerprints: collectFingerprints(stmt),
      r3aVerify: ex.r3aVerify ?? null,
      expectedNow: ex.expectedNow ?? null,
    };
  });

  const report = {
    ranAt: new Date().toISOString(),
    httpStatus: res.status,
    traceId: payload?.meta?.traceId ?? null,
    pipelineVersion: payload?.meta?.pipelineVersion ?? null,
    productionUrl: PRODUCTION_URL,
    promptReferenceLocal: promptMeta,
    expectedR10: EXPECTED_R10,
    exhibitReports,
    cardList: cards,
    raw: payload,
  };

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("");
  console.log(`traceId: ${report.traceId ?? "(none)"}`);
  console.log(`statements: ${cards.length}`);
  for (const ex of exhibitReports) {
    console.log(
      `${ex.id} (${ex.label}): ${ex.displayVerdict ?? "?"} / ${ex.concernLevel ?? "?"} spans=${JSON.stringify(ex.supportSpanClassifications)} fp=${JSON.stringify(ex.systemFingerprints)}`
    );
  }
  console.log(`\nWrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("[r10-production-verify] fatal:", err?.message || err);
  process.exit(1);
});
