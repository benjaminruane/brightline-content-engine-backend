#!/usr/bin/env node
/**
 * B163 production gates: body arrival (Gate 2), extract-draft-text (Gates 3-5),
 * and a short evidence-only Review (Gate 7).
 *
 * Usage:
 *   node scripts/diagnostic/delivery-check/b163/production-gates.mjs
 *   node scripts/diagnostic/delivery-check/b163/production-gates.mjs --only=d01,d02
 *   node scripts/diagnostic/delivery-check/b163/production-gates.mjs --skip-review --skip-body-probes
 *   node scripts/diagnostic/delivery-check/b163/production-gates.mjs --review-only
 *   node scripts/diagnostic/delivery-check/b163/production-gates.mjs --body-probes-only
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CORPUS = path.join(ROOT, "corpus");
const ORIGINAL = path.join(ROOT, "original-eleven");
const REVIEWS = path.join(ROOT, "reviews");
const EXTRACTS = path.join(ROOT, "extracts");

const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL || "https://brightline-content-engine-backend.vercel.app";

const VERCEL_EDGE_BODY_BYTES = 4_500_000;
const MAX_REQUEST_BYTES = 4_200_000;
const REQUEST_JSON_OVERHEAD_BYTES = 8_192;

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only=")) || (args.includes("--only") ? args[args.indexOf("--only") + 1] : "");
const onlySet = new Set(
  String(onlyArg || "")
    .replace(/^--only=/, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
const skipReview = args.includes("--skip-review");
const bodyProbesOnly = args.includes("--body-probes-only");
const reviewOnly = args.includes("--review-only");
const skipBodyProbes = args.includes("--skip-body-probes") || reviewOnly || bodyProbesOnly === false && args.includes("--skip-body-probes");

function estimateEncodedSize(n) {
  return 4 * Math.ceil(n / 3);
}

async function postJson(pathname, body, timeoutMs) {
  const payload = JSON.stringify(body);
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res = null;
  let text = "";
  let json = null;
  let networkError = null;
  try {
    res = await fetch(`${PRODUCTION_URL.replace(/\/$/, "")}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: controller.signal,
    });
    text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  } catch (err) {
    networkError = {
      name: err?.name || null,
      message: err?.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
  return {
    elapsedMs: Date.now() - t0,
    httpStatus: res?.status ?? null,
    okHeader: res?.ok ?? null,
    bodyBytesSent: Buffer.byteLength(payload),
    bodyPreview: String(text || "").slice(0, 400),
    json,
    networkError,
  };
}

function pickDraftFromExtract(text) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\[Image:/i.test(l) && !/^page\s+\d+$/i.test(l));
  const joined = lines.join(" ");
  const match = joined.match(/[^.!?]{30,220}?\d[\d,.]*.{0,80}[.!?]/);
  if (match) return match[0].trim().slice(0, 500);
  return joined.slice(0, 400);
}

function quoteFromCard(card) {
  const primary = card?.primaryExcerpt;
  if (typeof primary === "string" && primary.trim()) return primary.trim();
  if (primary && typeof primary === "object" && typeof primary.passage === "string" && primary.passage.trim()) {
    return primary.passage.trim();
  }
  if (typeof card?.primaryExcerptText === "string" && card.primaryExcerptText.trim()) {
    return card.primaryExcerptText.trim();
  }
  const spans = Array.isArray(card?.supportSpans) ? card.supportSpans : [];
  for (const s of spans) {
    if (typeof s?.passage === "string" && s.passage.trim()) return s.passage.trim();
  }
  return "";
}

function verdictFromCard(card) {
  return (
    card?.evidenceVerdict ||
    card?.displayVerdict ||
    card?.supportState ||
    card?.classification ||
    null
  );
}

function gate7FromPayload(post, draftText) {
  const payload = post.json;
  const statements = Array.isArray(payload?.statements) ? payload.statements : [];
  const cards = statements.map((row) => row?.qcCard).filter((c) => c && typeof c === "object");
  let verdictWithQuote = null;
  for (const card of cards) {
    const quote = quoteFromCard(card);
    const ev = verdictFromCard(card);
    if (quote && ev && ev !== "not_reviewed" && ev !== "notSupported") {
      verdictWithQuote = {
        evidenceVerdict: ev,
        supportState: card?.supportState ?? null,
        displayVerdict: card?.displayVerdict ?? null,
        hasRealExcerpt: card?.hasRealExcerpt === true,
        quote: quote.slice(0, 400),
        statement: typeof card.statement === "string" ? card.statement.slice(0, 240) : null,
      };
      break;
    }
  }
  const spend = payload?.meta?.llmSpend || null;
  return {
    elapsedMs: post.elapsedMs,
    httpStatus: post.httpStatus,
    networkError: post.networkError,
    ok: payload?.ok ?? null,
    error: payload?.error ?? null,
    fatal: payload?.meta?.fatal ?? null,
    pipelineVersion: payload?.meta?.pipelineVersion ?? null,
    traceId: payload?.meta?.traceId ?? null,
    cards: cards.length,
    excludedSources: payload?.excludedSources || [],
    sourceIngestionWarning: payload?.meta?.sourceIngestionWarning || null,
    totalTextLowWarning: payload?.meta?.totalTextLowWarning === true,
    llmSpend: spend,
    listUsd: spend?.costUsd ?? spend?.listUsd ?? spend?.totalListUsd ?? spend?.totalUsd ?? null,
    discountedUsd: spend?.discountedUsd ?? null,
    reviewSummary: payload?.meta?.reviewSummary || null,
    preflight: payload?.meta?.preflight || null,
    verdictWithQuote,
    draftChars: draftText.length,
    draftText: draftText.slice(0, 500),
  };
}

await mkdir(REVIEWS, { recursive: true });
const catalog = JSON.parse(await readFile(path.join(ROOT, "catalog.json"), "utf8"));

const out = {
  ranAt: new Date().toISOString(),
  productionUrl: PRODUCTION_URL,
  mode: reviewOnly ? "review-only" : bodyProbesOnly ? "body-probes-only" : "extract",
  docs: [],
  bodyProbes: [],
};

if (!skipBodyProbes && !reviewOnly) {
  const b79Files = [
    "pg-annual-results-2024.pdf",
    "3i-fy25-presentation.pdf",
    "pg-ir-july-2025.pdf",
    "3i-ar-2025.pdf",
  ];
  for (const filename of b79Files) {
    const buf = await readFile(path.join(ORIGINAL, filename));
    const encoded = estimateEncodedSize(buf.length);
    const estimated = encoded + REQUEST_JSON_OVERHEAD_BYTES;
    process.stderr.write(`body-probe ${filename} raw=${buf.length} estRequest=${estimated}\n`);
    const body = {
      name: filename,
      mimeType: "application/pdf",
      contentBase64: buf.toString("base64"),
    };
    const post = await postJson("/api/extract-draft-text", body, 30_000);
    const probe = {
      filename,
      rawBytes: buf.length,
      encodedBase64Bytes: encoded,
      estimatedRequestBytes: estimated,
      overVercelBy: Math.max(0, estimated - VERCEL_EDGE_BODY_BYTES),
      overClientBy: Math.max(0, estimated - MAX_REQUEST_BYTES),
      exceedsVercel45mb: estimated > VERCEL_EDGE_BODY_BYTES,
      exceedsClient42mb: estimated > MAX_REQUEST_BYTES,
      post,
    };
    out.bodyProbes.push(probe);
    process.stderr.write(
      `  http=${post.httpStatus} net=${post.networkError?.message || "none"} ms=${post.elapsedMs} preview=${JSON.stringify(post.bodyPreview).slice(0, 180)}\n`
    );
    await writeFile(path.join(REVIEWS, `body-probe-${filename}.json`), JSON.stringify(probe, null, 2));
  }
  await writeFile(path.join(ROOT, "body-probes.json"), JSON.stringify(out.bodyProbes, null, 2));
  if (bodyProbesOnly) {
    console.log(JSON.stringify({ bodyProbes: out.bodyProbes.length }, null, 2));
    process.exit(0);
  }
}

for (const doc of catalog.documents) {
  if (onlySet.size && !onlySet.has(doc.id)) continue;
  const buf = await readFile(path.join(CORPUS, doc.filename));
  const encoded = estimateEncodedSize(buf.length);
  const estimated = encoded + REQUEST_JSON_OVERHEAD_BYTES;
  const row = {
    id: doc.id,
    filename: doc.filename,
    rawBytes: buf.length,
    encodedBase64Bytes: encoded,
    estimatedRequestBytes: estimated,
    exceedsVercel45mb: estimated > VERCEL_EDGE_BODY_BYTES,
    exceedsClient42mb: estimated > MAX_REQUEST_BYTES,
    gate2: null,
    gate3to5: null,
    gate7: null,
  };

  let extractedText = "";
  if (reviewOnly) {
    try {
      extractedText = await readFile(path.join(EXTRACTS, doc.filename.replace(/\.pdf$/i, ".txt")), "utf8");
    } catch {
      extractedText = "";
    }
    row.gate2 = { skipped: true, reason: "review-only" };
    row.gate3to5 = { skipped: true, reason: "review-only", charCount: extractedText.length };
  } else {
    process.stderr.write(`prod-extract ${doc.id} ${doc.filename} estRequest=${estimated}\n`);
    const extractPost = await postJson(
      "/api/extract-draft-text",
      {
        name: doc.filename,
        mimeType: "application/pdf",
        contentBase64: buf.toString("base64"),
      },
      320_000
    );
    extractedText = typeof extractPost.json?.text === "string" ? extractPost.json.text : "";
    row.gate2 = {
      reachedServer: extractPost.httpStatus != null,
      httpStatus: extractPost.httpStatus,
      networkError: extractPost.networkError,
      elapsedMs: extractPost.elapsedMs,
      bodyBytesSent: extractPost.bodyBytesSent,
      verbatim:
        extractPost.networkError?.message ||
        (extractPost.httpStatus && extractPost.httpStatus >= 400
          ? `HTTP ${extractPost.httpStatus} ${extractPost.bodyPreview}`
          : `HTTP ${extractPost.httpStatus}`),
    };
    row.gate3to5 = {
      elapsedMs: extractPost.elapsedMs,
      httpStatus: extractPost.httpStatus,
      networkError: extractPost.networkError,
      ok: extractPost.json?.ok ?? null,
      error: extractPost.json?.error ?? null,
      charCount: extractedText.length,
      empty: !extractedText.trim(),
      bodyPreview: extractPost.bodyPreview,
    };
    process.stderr.write(
      `  extract http=${extractPost.httpStatus} chars=${extractedText.length} ms=${extractPost.elapsedMs} net=${extractPost.networkError?.message || "none"}\n`
    );
  }

  if (!skipReview && extractedText.trim()) {
    const draft = pickDraftFromExtract(extractedText);
    const reviewBody = {
      draftText: draft,
      outputType: "reporting_commentary",
      requiredVersion: "complete",
      options: {
        pipelineRoute: "v4",
        evidenceEnabled: true,
        editorialEnabled: false,
        complianceEnabled: false,
        outputType: "reporting_commentary",
      },
      sources: [
        {
          text: extractedText,
          label: `${doc.id} extract`,
          name: `${doc.id} extract`,
          title: `${doc.id} extract`,
          sourceType: "uploaded",
        },
      ],
    };
    process.stderr.write(`prod-review ${doc.id} draftChars=${draft.length} sourceChars=${extractedText.length}\n`);
    const reviewPost = await postJson("/api/analyse-statements", reviewBody, 320_000);
    row.gate7 = gate7FromPayload(reviewPost, draft);
    await writeFile(path.join(REVIEWS, `${doc.id}-review-extract.json`), JSON.stringify(row.gate7, null, 2));
    if (reviewPost.json) {
      await writeFile(path.join(REVIEWS, `${doc.id}-review.json`), JSON.stringify(reviewPost.json));
    }
    process.stderr.write(
      `  review http=${reviewPost.httpStatus} ok=${row.gate7.ok} cards=${row.gate7.cards} quote=${row.gate7.verdictWithQuote ? "yes" : "no"} listUsd=${row.gate7.listUsd} ms=${row.gate7.elapsedMs} err=${row.gate7.error || row.gate7.networkError?.message || "none"}\n`
    );
  } else if (!skipReview) {
    row.gate7 = {
      skipped: true,
      reason: extractedText.trim() ? null : "no_extracted_text",
    };
  }

  out.docs.push(row);
  const outName = reviewOnly ? "gate7-reviews.json" : "production-gates.json";
  await writeFile(path.join(ROOT, outName), JSON.stringify(out, null, 2));
}

console.log(`production gates done docs=${out.docs.length} mode=${out.mode}`);
