#!/usr/bin/env node
/**
 * Suggest-after-R10 measure: Production Review → Suggest → second Review
 * on Halden Meridian draft (same as r10-production-verify).
 * Evidence-only Review. Does not modify prompts or product code.
 *
 * Usage: node scripts/diagnostic/revise/run-suggest-after-r10.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const MERIDIAN_SOURCE_PATH = path.join(
  REPO_ROOT,
  "scripts/diagnostic/eval-ablation/meridian_source.txt"
);
const OUT_DIR = __dirname;

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

const MARK_NEEDLE = "Fund IV has returned 1.9 times gross MOIC and a 24 per cent gross IRR.";
const RISK_NEEDLE =
  "The team's stability, with no senior departures across the last three fund cycles, means key-person risk is limited.";

function findByNeedle(statements, needle) {
  const list = Array.isArray(statements) ? statements : [];
  const exact = list.find((s) => s?.text === needle);
  if (exact) return exact;
  return (
    list.find(
      (s) => typeof s?.text === "string" && s.text.includes(needle.slice(0, 40))
    ) || null
  );
}

function findMarkInRevised(text) {
  const t = String(text || "");
  // Prefer a sentence that still mentions Fund IV + MOIC / IRR figures
  const paras = t.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const hit =
    paras.find((p) => /Fund IV/i.test(p) && /(1\.9|24)/.test(p)) ||
    paras.find((p) => /Fund IV/i.test(p)) ||
    null;
  return hit;
}

function findRiskInRevised(text) {
  const t = String(text || "");
  const paras = t.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    paras.find((p) => /key-person|senior departures|team'?s stability/i.test(p)) || null
  );
}

function stripMarkers(text) {
  return String(text || "").replace(/\{\{([\s\S]*?)\|\|[\s\S]*?\}\}/g, "$1");
}

function scoreMarkRule(sentenceWithMarkers) {
  const clean = stripMarkers(sentenceWithMarkers || "");
  const lower = clean.toLowerCase();
  const hasBasis = /\b(realis(?:ed|ed)|unrealis(?:ed|ed)|marked|valued)\b/i.test(clean);
  const has19 = /\b1\.9\b/.test(clean);
  const has24 = /\b24\b/.test(clean);
  const keepsReturned = /\bhas returned\b|\breturned\b/i.test(lower);
  const hedgesWithoutBasis =
    /\bapproximately\s+1\.9\b/i.test(clean) && !hasBasis;
  const deletesFigure = !has19 || !has24;

  let verdict = "PASS";
  const fails = [];
  if (keepsReturned) {
    verdict = "FAIL";
    fails.push("keeps returned");
  }
  if (hedgesWithoutBasis) {
    verdict = "FAIL";
    fails.push("hedges figure without basis language");
  }
  if (deletesFigure) {
    verdict = "FAIL";
    fails.push("deletes 1.9 or 24");
  }
  if (!hasBasis) {
    verdict = "FAIL";
    fails.push("missing realised/unrealised/marked/valued language");
  }
  return { verdict, fails, clean, hasBasis, has19, has24, keepsReturned };
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
  return {
    url,
    httpStatus: res.status,
    ms: Date.now() - t0,
    payload,
  };
}

function reviewBody(draftText, sourceText) {
  return {
    draftText,
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
}

function cardSummary(stmt) {
  if (!stmt) return null;
  const c = stmt.qcCard || {};
  const spans = Array.isArray(c.unsupportedSpans) ? c.unsupportedSpans : [];
  return {
    text: stmt.text ?? "",
    displayVerdict: c.displayVerdict ?? null,
    concernLevel: c.concernLevel ?? null,
    supportState: c.supportState ?? null,
    evidenceSummary: c.evidenceSummary ?? c.reasoningParagraph ?? null,
    primaryExcerpt: c.primaryExcerpt ?? null,
    conflictingPassage: c.conflictingPassage ?? c.conflictPassage ?? null,
    unsupportedSpans: spans,
  };
}

async function main() {
  const sourceText = await readFile(MERIDIAN_SOURCE_PATH, "utf8");
  await mkdir(OUT_DIR, { recursive: true });

  const costLog = [];
  const estimate = (label, usd) => {
    costLog.push({ label, usdEstimate: usd });
    return usd;
  };

  console.log("suggest-after-r10");
  console.log(`URL: ${PRODUCTION_URL}`);
  console.log("Part 1: Production Review (evidence only)...");

  const review1 = await postJson("/api/analyse-statements", reviewBody(MERIDIAN_DRAFT, sourceText));
  estimate("review1_analyse_statements", 0.5);
  await writeFile(
    path.join(OUT_DIR, "suggest-after-r10-review1.json"),
    `${JSON.stringify({ ranAt: new Date().toISOString(), ...review1 }, null, 2)}\n`,
    "utf8"
  );

  const statements1 = Array.isArray(review1.payload?.statements)
    ? review1.payload.statements
    : [];
  console.log(
    `review1 http=${review1.httpStatus} ms=${review1.ms} statements=${statements1.length} trace=${review1.payload?.meta?.traceId ?? "?"}`
  );

  const mark1 = findByNeedle(statements1, MARK_NEEDLE);
  const risk1 = findByNeedle(statements1, RISK_NEEDLE);
  console.log(
    `EA_E3 mark: ${mark1?.qcCard?.displayVerdict}/${mark1?.qcCard?.concernLevel}`
  );
  console.log(
    `EA_E2 risk: ${risk1?.qcCard?.displayVerdict}/${risk1?.qcCard?.concernLevel}`
  );

  console.log("Suggest revised draft (attempt 1)...");
  const suggest1 = await postJson("/api/suggest-revision", {
    draftText: MERIDIAN_DRAFT,
    statements: statements1,
    outputType: "reporting_commentary",
    requiredVersion: "complete",
    sources: [
      {
        index: 0,
        publicationState: "non_public",
        label: "Meridian Fund V summary (Halden copy)",
      },
    ],
  });
  estimate("suggest1", 0.05);
  await writeFile(
    path.join(OUT_DIR, "suggest-after-r10-suggest1.json"),
    `${JSON.stringify({ ranAt: new Date().toISOString(), ...suggest1 }, null, 2)}\n`,
    "utf8"
  );

  if (!suggest1.payload?.ok || !suggest1.payload?.revisedDraft) {
    console.error("Suggest failed or empty:", suggest1.httpStatus, suggest1.payload?.error);
    await writeFile(
      path.join(OUT_DIR, "suggest-after-r10-run-meta.json"),
      `${JSON.stringify(
        {
          ranAt: new Date().toISOString(),
          productionUrl: PRODUCTION_URL,
          costLog,
          stop: "suggest1_failed",
          suggest1,
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    process.exit(1);
  }

  const revised1 = suggest1.payload.revisedDraft;
  const markers1 = suggest1.payload.markers || [];
  const markSentence1 = findMarkInRevised(revised1);
  const riskSentence1 = findRiskInRevised(revised1);
  const markScore1 = scoreMarkRule(markSentence1);

  console.log("Mark sentence (suggest1):", markSentence1);
  console.log("Mark rule:", markScore1.verdict, markScore1.fails);

  let suggest2 = null;
  let revised2 = null;
  let markers2 = null;
  let markSentence2 = null;
  let markScore2 = null;

  const markUnchanged =
    !markSentence1 ||
    stripMarkers(markSentence1).replace(/\s+/g, " ").trim() ===
      MARK_NEEDLE.replace(/\s+/g, " ").trim();

  if (
    markUnchanged &&
    mark1?.qcCard?.displayVerdict === "conflict" &&
    (mark1?.qcCard?.concernLevel === "high" || mark1?.qcCard?.concernLevel === "moderate")
  ) {
    console.log("INCONCLUSIVE: no edit on mark card despite conflict/high. Stopping.");
    await writeFile(
      path.join(OUT_DIR, "suggest-after-r10-run-meta.json"),
      `${JSON.stringify(
        {
          ranAt: new Date().toISOString(),
          productionUrl: PRODUCTION_URL,
          costLog,
          stop: "inconclusive_no_mark_edit",
          markSentence1,
          markScore1,
          cardMark1: cardSummary(mark1),
          cardRisk1: cardSummary(risk1),
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    return;
  }

  if (markScore1.verdict === "FAIL") {
    console.log("Mark rule FAIL on suggest1. Stopping per adaptive rule (no rerun).");
  } else {
    console.log("Mark rule PASS. Adaptive second Suggest on same Review output...");
    suggest2 = await postJson("/api/suggest-revision", {
      draftText: MERIDIAN_DRAFT,
      statements: statements1,
      outputType: "reporting_commentary",
      requiredVersion: "complete",
      sources: [
        {
          index: 0,
          publicationState: "non_public",
          label: "Meridian Fund V summary (Halden copy)",
        },
      ],
    });
    estimate("suggest2_instability", 0.05);
    await writeFile(
      path.join(OUT_DIR, "suggest-after-r10-suggest2.json"),
      `${JSON.stringify({ ranAt: new Date().toISOString(), ...suggest2 }, null, 2)}\n`,
      "utf8"
    );
    revised2 = suggest2.payload?.revisedDraft ?? null;
    markers2 = suggest2.payload?.markers || [];
    markSentence2 = findMarkInRevised(revised2);
    markScore2 = scoreMarkRule(markSentence2);
    console.log("Mark sentence (suggest2):", markSentence2);
    console.log("Mark rule suggest2:", markScore2.verdict, markScore2.fails);
  }

  console.log("Second Review on revised draft (suggest1)...");
  const review2 = await postJson(
    "/api/analyse-statements",
    reviewBody(stripMarkers(revised1), sourceText)
  );
  estimate("review2_analyse_statements", 0.5);
  await writeFile(
    path.join(OUT_DIR, "suggest-after-r10-review2.json"),
    `${JSON.stringify({ ranAt: new Date().toISOString(), ...review2 }, null, 2)}\n`,
    "utf8"
  );

  const statements2 = Array.isArray(review2.payload?.statements)
    ? review2.payload.statements
    : [];
  const mark2Needle =
    stripMarkers(markSentence1 || "").trim() || "Fund IV";
  const mark2 =
    statements2.find((s) => s?.text === mark2Needle) ||
    statements2.find(
      (s) =>
        typeof s?.text === "string" &&
        /Fund IV/i.test(s.text) &&
        /(1\.9|24)/.test(s.text)
    ) ||
    null;
  const risk2 =
    statements2.find(
      (s) =>
        typeof s?.text === "string" &&
        /key-person|senior departures|team'?s stability/i.test(s.text)
    ) || null;

  console.log(
    `review2 mark: ${mark2?.qcCard?.displayVerdict}/${mark2?.qcCard?.concernLevel}`
  );
  console.log(
    `review2 risk: ${risk2?.qcCard?.displayVerdict}/${risk2?.qcCard?.concernLevel}`
  );

  const totalUsd = costLog.reduce((a, c) => a + c.usdEstimate, 0);
  const meta = {
    ranAt: new Date().toISOString(),
    productionUrl: PRODUCTION_URL,
    costLog,
    totalUsdEstimate: totalUsd,
    review1: {
      httpStatus: review1.httpStatus,
      ms: review1.ms,
      traceId: review1.payload?.meta?.traceId ?? null,
      cardMark: cardSummary(mark1),
      cardRisk: cardSummary(risk1),
    },
    suggest1: {
      httpStatus: suggest1.httpStatus,
      ms: suggest1.ms,
      markSentence: markSentence1,
      riskSentence: riskSentence1,
      markScore: markScore1,
      markers: markers1,
      revisedDraft: revised1,
      markUnchanged,
    },
    suggest2: suggest2
      ? {
          httpStatus: suggest2.httpStatus,
          ms: suggest2.ms,
          markSentence: markSentence2,
          markScore: markScore2,
          markers: markers2,
          revisedDraft: revised2,
        }
      : null,
    review2: {
      httpStatus: review2.httpStatus,
      ms: review2.ms,
      traceId: review2.payload?.meta?.traceId ?? null,
      cardMark: cardSummary(mark2),
      cardRisk: cardSummary(risk2),
      statements: statements2.map((s) => ({
        text: s?.text,
        displayVerdict: s?.qcCard?.displayVerdict,
        concernLevel: s?.qcCard?.concernLevel,
      })),
    },
  };

  await writeFile(
    path.join(OUT_DIR, "suggest-after-r10-run-meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8"
  );
  console.log(`Wrote meta. Estimated cost ~$${totalUsd.toFixed(2)}`);
}

main().catch((err) => {
  console.error("[suggest-after-r10] fatal:", err?.message || err);
  process.exit(1);
});
