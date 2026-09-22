#!/usr/bin/env node
/**
 * B321. Local swap verification, Gate 7 quote/verdict check, deployed extract proof.
 *
 *   node scripts/diagnostic/extractor-swap/verify-swap.mjs
 *   node scripts/diagnostic/extractor-swap/verify-swap.mjs --skip-gate7
 *   node scripts/diagnostic/extractor-swap/verify-swap.mjs --gate7-only
 *   node scripts/diagnostic/extractor-swap/verify-swap.mjs --deployed
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPPORTED_MIME_TYPES,
  extractTextFromSource,
} from "../../../lib/extract-text-from-source.mjs";
import { extractPdfDirect } from "../../../lib/extract-pdf-direct.mjs";
import { locatePassageInSource } from "../../../lib/qc/pipeline-v4/stage2-match-multipassage.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const B163 = path.resolve(ROOT, "../delivery-check/b163");
const CORPUS = path.join(B163, "corpus");
const REVIEWS = path.join(B163, "reviews");
const ARM_C = path.resolve(ROOT, "../extractor-bakeoff/outputs");
const OUT = path.join(ROOT, "outputs");
const FILES = path.resolve(ROOT, "../../../tests/extraction-corpus/files");
const PRODUCTION_URL =
  process.env.QC_REGRESSION_BASE_URL || "https://brightline-content-engine-backend.vercel.app";

const args = process.argv.slice(2);
const skipGate7 = args.includes("--skip-gate7");
const gate7Only = args.includes("--gate7-only");
const deployed = args.includes("--deployed");

function wsNorm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function quoteInText(text, quote) {
  const q = wsNorm(quote);
  if (!q) return false;
  return wsNorm(text).includes(q);
}

function pct(n) {
  if (!Number.isFinite(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function setEngine(value) {
  if (value == null) delete process.env.PDF_ENGINE;
  else process.env.PDF_ENGINE = value;
}

async function timeEngine(engine, docs) {
  setEngine(engine);
  const rows = [];
  let totalMs = 0;
  for (const doc of docs) {
    const buf = await readFile(path.join(CORPUS, doc.filename));
    const t0 = Date.now();
    const extracted = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF);
    const wallMs = Date.now() - t0;
    totalMs += wallMs;
    const text = typeof extracted?.text === "string" ? extracted.text : "";
    const ex = extracted?.extraction && typeof extracted.extraction === "object" ? extracted.extraction : {};
    rows.push({
      id: doc.id,
      filename: doc.filename,
      wallMs,
      charCount: text.length,
      textConvertMs: Number.isFinite(ex.textConvertMs) ? ex.textConvertMs : null,
      chunkConvertMs: Number.isFinite(ex.chunkConvertMs) ? ex.chunkConvertMs : null,
      status: ex.status || null,
      warnings: Array.isArray(ex.warnings) ? ex.warnings : [],
      method: ex.method || null,
      text,
    });
    console.error(`  ${engine} ${doc.id} ${wallMs}ms chars=${text.length} status=${ex.status} method=${ex.method}`);
  }
  setEngine(undefined);
  return { totalMs, rows };
}

async function compareArmC(docs) {
  const rows = [];
  const mistakes = [];
  for (const doc of docs) {
    const buf = await readFile(path.join(CORPUS, doc.filename));
    const direct = await extractPdfDirect(buf);
    const appendix = await readFile(path.join(ARM_C, `${doc.id}-C.txt`), "utf8");
    const got = typeof direct.text === "string" ? direct.text : "";
    const want = String(appendix);
    const deltaChars = got.length - want.length;
    const deltaPct = want.length ? (deltaChars / want.length) * 100 : 0;
    const equal = got === want;
    const row = {
      id: doc.id,
      filename: doc.filename,
      armCChars: want.length,
      portChars: got.length,
      deltaChars,
      deltaPct,
      equal,
    };
    rows.push(row);
    if (Math.abs(deltaPct) > 1) {
      mistakes.push(row);
      console.error(`  MISTAKE ${doc.id} moved ${pct(deltaPct)} from arm C`);
    } else {
      console.error(`  armC ${doc.id} delta=${deltaChars} (${pct(deltaPct)}) equal=${equal}`);
    }
  }
  return { rows, mistakes };
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
    networkError = { name: err?.name || null, message: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
  return {
    elapsedMs: Date.now() - t0,
    httpStatus: res?.status ?? null,
    bodyPreview: String(text || "").slice(0, 400),
    json,
    networkError,
  };
}

function quoteFromCard(card) {
  const primary = card?.primaryExcerpt;
  if (typeof primary === "string" && primary.trim()) return primary.trim();
  if (primary && typeof primary === "object" && typeof primary.passage === "string" && primary.passage.trim()) {
    return primary.passage.trim();
  }
  const spans = Array.isArray(card?.supportSpans) ? card.supportSpans : [];
  for (const s of spans) {
    if (typeof s?.passage === "string" && s.passage.trim()) return s.passage.trim();
  }
  return "";
}

function isSupportedOrClean(card) {
  const ev = card?.evidenceVerdict || card?.displayVerdict || "";
  const support = card?.supportState || "";
  const summary = card?.summaryClass || "";
  const supported =
    ev === "supported_full" ||
    ev === "supported" ||
    ev === "confirmed" ||
    support === "supported" ||
    support === "confirmed";
  const clean = summary === "clean" || card?.cardTone === "clean";
  return supported || clean;
}

/** Quote the reviewer sees. supportSpans leftovers are not a displayed excerpt (B259). */
function displayedExcerpt(card) {
  if (card?.hasRealExcerpt !== true) return "";
  const primary = card?.primaryExcerpt;
  if (typeof primary === "string") return primary.trim();
  if (primary && typeof primary.passage === "string") return primary.passage.trim();
  return "";
}

async function loadCommittedReviews() {
  const names = await readdir(REVIEWS);
  const byId = new Map();
  for (const name of names) {
    const m = name.match(/^(d\d+)-review-extract\.json$/);
    if (!m) continue;
    const raw = JSON.parse(await readFile(path.join(REVIEWS, name), "utf8"));
    byId.set(m[1], raw);
  }
  return byId;
}

async function runGate7(docs, directRows) {
  const committed = await loadCommittedReviews();
  const byId = new Map(directRows.map((r) => [r.id, r]));
  const out = [];
  let spendUsd = 0;
  let calls = 0;
  let kill = false;
  for (const doc of docs) {
    const committedRow = committed.get(doc.id);
    const draftText = typeof committedRow?.draftText === "string" ? committedRow.draftText : "";
    const sourceText = byId.get(doc.id)?.text || "";
    const committedVerdict = committedRow?.verdictWithQuote || null;
    if (!draftText.trim()) {
      out.push({
        id: doc.id,
        filename: doc.filename,
        skipped: true,
        reason: "no_committed_draft",
      });
      continue;
    }
    const body = {
      draftText,
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
          text: sourceText,
          label: `${doc.id} direct extract`,
          name: `${doc.id} direct extract`,
          title: `${doc.id} direct extract`,
          sourceType: "uploaded",
        },
      ],
    };
    console.error(`  gate7 ${doc.id} draftChars=${draftText.length} sourceChars=${sourceText.length}`);
    const post = await postJson("/api/analyse-statements", body, 320_000);
    const payload = post.json;
    const statements = Array.isArray(payload?.statements) ? payload.statements : [];
    const cards = statements.map((row) => row?.qcCard).filter((c) => c && typeof c === "object");
    const spend = payload?.meta?.llmSpend || null;
    if (typeof spend?.costUsd === "number") spendUsd += spend.costUsd;
    if (typeof spend?.calls === "number") calls += spend.calls;
    const cardDiffs = [];
    for (const card of cards) {
      const quote = displayedExcerpt(card);
      const supported = isSupportedOrClean(card);
      const loc = quote ? locatePassageInSource(sourceText, quote) : { start: 0, end: 0 };
      if (supported && quote && loc.start == null) {
        kill = true;
        cardDiffs.push({
          kill: true,
          statement: card?.statement || null,
          evidenceVerdict: card?.evidenceVerdict || null,
          supportState: card?.supportState || null,
          displayVerdict: card?.displayVerdict || null,
          hasRealExcerpt: card?.hasRealExcerpt === true,
          excerptNotLocatable: card?.excerptNotLocatable === true,
          quote,
          locatedInNewSource: false,
        });
      }
    }
    const newQuoteCard = cards.find((c) => quoteFromCard(c) && isSupportedOrClean(c)) || cards[0] || null;
    const newVerdict = newQuoteCard
      ? {
          evidenceVerdict: newQuoteCard.evidenceVerdict || null,
          supportState: newQuoteCard.supportState || null,
          displayVerdict: newQuoteCard.displayVerdict || null,
          quote: quoteFromCard(newQuoteCard).slice(0, 400),
          statement: typeof newQuoteCard.statement === "string" ? newQuoteCard.statement.slice(0, 240) : null,
        }
      : null;
    const verdictMoved =
      JSON.stringify(committedVerdict?.evidenceVerdict || null) !== JSON.stringify(newVerdict?.evidenceVerdict || null) ||
      JSON.stringify(committedVerdict?.quote || null) !== JSON.stringify(newVerdict?.quote || null);
    out.push({
      id: doc.id,
      filename: doc.filename,
      httpStatus: post.httpStatus,
      elapsedMs: post.elapsedMs,
      networkError: post.networkError,
      ok: payload?.ok ?? null,
      error: payload?.error ?? null,
      cards: cards.length,
      listUsd: spend?.costUsd ?? null,
      committedVerdict,
      newVerdict,
      verdictMoved,
      killCards: cardDiffs.filter((d) => d.kill),
      traceId: payload?.meta?.traceId || null,
    });
    await writeFile(path.join(OUT, `${doc.id}-gate7.json`), JSON.stringify(out[out.length - 1], null, 2));
    console.error(
      `    http=${post.httpStatus} cards=${cards.length} moved=${verdictMoved} kill=${cardDiffs.length} usd=${spend?.costUsd}`
    );
  }
  return { rows: out, spendUsd, calls, kill };
}

async function postExtract(filePath, name, pdfEngine) {
  const buf = await readFile(filePath);
  const body = {
    name,
    mimeType: "application/pdf",
    contentBase64: buf.toString("base64"),
  };
  if (pdfEngine) body.pdfEngine = pdfEngine;
  return postJson("/api/extract-draft-text", body, 320_000);
}

function extractRecord(label, post) {
  const text = typeof post.json?.text === "string" ? post.json.text : "";
  return {
    label,
    httpStatus: post.httpStatus,
    elapsedMs: post.elapsedMs,
    characters: text.length,
    status: post.json?.status ?? null,
    ok: post.json?.ok ?? null,
    error: post.json?.error ?? null,
    networkError: post.networkError,
    preview: text.slice(0, 120),
  };
}

async function waitForDeploy(filePath, name, attempts = 24) {
  for (let i = 0; i < attempts; i++) {
    const post = await postExtract(filePath, name, "direct");
    if (post.json && Object.prototype.hasOwnProperty.call(post.json, "status")) {
      return post;
    }
    console.error(`  waiting for deploy (${i + 1}/${attempts}) http=${post.httpStatus} keys=${post.json ? Object.keys(post.json).join(",") : "none"}`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
  return null;
}

function mdFence(s) {
  return String(s || "").replace(/```/g, "'''");
}

function buildReport({ timing, armC, gate7, deployedProof }) {
  const lines = [];
  lines.push("# B321. PDF text from the bundled engine");
  lines.push("");
  lines.push(`Ran ${new Date().toISOString()}.`);
  lines.push("");
  if (timing) {
    const ratio = timing.direct.totalMs > 0 ? timing.officeparser.totalMs / timing.direct.totalMs : 0;
    lines.push("## 2.1 Timing through extractTextFromSource");
    lines.push("");
    lines.push(`PDF_ENGINE=officeparser total wall **${timing.officeparser.totalMs} ms**.`);
    lines.push(`PDF_ENGINE=direct total wall **${timing.direct.totalMs} ms**.`);
    lines.push(`Ratio officeparser/direct **${ratio.toFixed(1)}x**. B319 was 755,216 ms and 1,429 ms.`);
    lines.push("");
    lines.push("| id | file | officeparser ms | direct ms | officeparser chars | direct chars |");
    lines.push("|----|------|----------------:|----------:|-------------------:|-------------:|");
    for (let i = 0; i < timing.officeparser.rows.length; i++) {
      const a = timing.officeparser.rows[i];
      const b = timing.direct.rows[i];
      lines.push(`| ${a.id} | ${a.filename} | ${a.wallMs} | ${b.wallMs} | ${a.charCount} | ${b.charCount} |`);
    }
    lines.push("");
  }
  if (armC) {
    lines.push("## 2.2 Characters versus B319 arm C appendix");
    lines.push("");
    if (armC.mistakes.length === 0) {
      lines.push("No document moved more than 1% from arm C. The port matches the appendix.");
    } else {
      lines.push("**MISTAKES.** These moved more than 1% from arm C:");
      for (const m of armC.mistakes) {
        lines.push(`- ${m.id} ${m.filename}: arm C ${m.armCChars}, port ${m.portChars}, ${pct(m.deltaPct)}`);
      }
    }
    lines.push("");
    lines.push("| id | arm C chars | port chars | delta | equal |");
    lines.push("|----|------------:|-----------:|------:|-------|");
    for (const r of armC.rows) {
      lines.push(`| ${r.id} | ${r.armCChars} | ${r.portChars} | ${pct(r.deltaPct)} | ${r.equal} |`);
    }
    lines.push("");
  }
  if (gate7) {
    lines.push("## 2.3 Gate 7 verdict comparison");
    lines.push("");
    lines.push(`Spend USD ${gate7.spendUsd.toFixed(4)} list across ${gate7.calls} calls. Kill=${gate7.kill}.`);
    lines.push("");
    if (gate7.kill) {
      lines.push("**KILL.** A supported or clean card quoted text that is not in the new source.");
      lines.push("");
    }
    for (const r of gate7.rows) {
      lines.push(`### ${r.id} ${r.filename}`);
      lines.push("");
      if (r.skipped) {
        lines.push(`Skipped: ${r.reason}`);
        lines.push("");
        continue;
      }
      lines.push(`HTTP ${r.httpStatus}, ${r.elapsedMs} ms, cards ${r.cards}, moved=${r.verdictMoved}, usd=${r.listUsd}.`);
      lines.push("");
      lines.push("Committed quote:");
      lines.push("");
      lines.push("```");
      lines.push(mdFence(r.committedVerdict?.quote || "(none)"));
      lines.push("```");
      lines.push("");
      lines.push(`Committed verdict: ${r.committedVerdict?.evidenceVerdict || r.committedVerdict?.supportState || "(none)"}`);
      lines.push("");
      lines.push("New quote:");
      lines.push("");
      lines.push("```");
      lines.push(mdFence(r.newVerdict?.quote || "(none)"));
      lines.push("```");
      lines.push("");
      lines.push(`New verdict: ${r.newVerdict?.evidenceVerdict || r.newVerdict?.supportState || "(none)"}`);
      lines.push("");
      if (r.killCards?.length) {
        for (const k of r.killCards) {
          lines.push(`KILL card statement=${JSON.stringify(k.statement)} quote not in new source:`);
          lines.push("");
          lines.push("```");
          lines.push(mdFence(k.quote));
          lines.push("```");
          lines.push("");
        }
      }
    }
  }
  if (deployedProof) {
    lines.push("## 3. Deployed extract-draft-text");
    lines.push("");
    if (deployedProof.error) {
      lines.push(`**Not proven.** ${deployedProof.error}`);
      lines.push("");
    }
    lines.push("| case | engine | HTTP | ms | chars | status |");
    lines.push("|------|--------|-----:|---:|------:|--------|");
    for (const r of deployedProof.rows || []) {
      lines.push(`| ${r.label} | ${r.engine || "default"} | ${r.httpStatus} | ${r.elapsedMs} | ${r.characters} | ${r.status} |`);
    }
    lines.push("");
    for (const r of deployedProof.rows || []) {
      lines.push(`- ${r.label}: ok=${r.ok} error=${r.error || "none"} preview=${JSON.stringify(r.preview)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function runLocal(docs) {
  console.error("2.1 officeparser");
  const officeparser = await timeEngine("officeparser", docs);
  console.error("2.1 direct");
  const direct = await timeEngine("direct", docs);
  console.error("2.2 arm C appendix");
  const armC = await compareArmC(docs);
  return { timing: { officeparser, direct }, armC };
}

async function runDeployed(docs) {
  const smallPdf = path.join(FILES, "native_clean.pdf");
  const scannedPdf = path.join(FILES, "image_only.pdf");
  const biggest = docs.reduce((a, b) => (b.extractCharCount > (a.extractCharCount || 0) ? b : a), docs[0]);
  const biggestPath = path.join(CORPUS, biggest.filename);
  console.error(`waiting for deploy; largest doc is ${biggest.id} ${biggest.filename}`);
  const ready = await waitForDeploy(smallPdf, "native_clean.pdf");
  if (!ready) {
    return { error: "deploy did not expose extraction status on extract-draft-text", rows: [] };
  }
  const rows = [];
  const aDirect = extractRecord("a-text-layer", ready);
  aDirect.engine = "direct (default)";
  rows.push(aDirect);

  console.error("b scanned");
  const bPost = await postExtract(scannedPdf, "image_only.pdf");
  const bRec = extractRecord("b-scanned", bPost);
  bRec.engine = "direct (default)";
  rows.push(bRec);

  console.error(`c largest ${biggest.filename}`);
  const cPost = await postExtract(biggestPath, biggest.filename);
  const cRec = extractRecord(`c-largest-${biggest.id}`, cPost);
  cRec.engine = "direct (default)";
  rows.push(cRec);

  console.error("a officeparser");
  const aOld = extractRecord("a-text-layer", await postExtract(smallPdf, "native_clean.pdf", "officeparser"));
  aOld.engine = "officeparser";
  rows.push(aOld);

  console.error("c officeparser");
  const cOld = extractRecord(`c-largest-${biggest.id}`, await postExtract(biggestPath, biggest.filename, "officeparser"));
  cOld.engine = "officeparser";
  rows.push(cOld);

  return { rows, biggestId: biggest.id, localDirectChars: null };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(B163, "manifest.json"), "utf8"));
  const docs = Array.isArray(manifest.documents) ? manifest.documents : [];
  if (docs.length !== 20) throw new Error(`expected 20 B163 documents, got ${docs.length}`);

  let timing = null;
  let armC = null;
  let gate7 = null;
  let deployedProof = null;

  if (deployed) {
    deployedProof = await runDeployed(docs);
    try {
      const prev = JSON.parse(await readFile(path.join(OUT, "summary.json"), "utf8"));
      const localRow = (prev.timing?.direct?.rows || []).find((r) => r.id === deployedProof.biggestId);
      deployedProof.localDirectChars = localRow?.charCount ?? null;
    } catch {
      deployedProof.localDirectChars = null;
    }
  } else {
    if (!gate7Only) {
      const local = await runLocal(docs);
      timing = local.timing;
      armC = local.armC;
    } else {
      try {
        const prev = JSON.parse(await readFile(path.join(OUT, "summary.json"), "utf8"));
        timing = prev.timing;
        armC = prev.armC;
      } catch {
        throw new Error("--gate7-only needs outputs/summary.json from a prior local run");
      }
    }
    if (!skipGate7) {
      const directRows = timing.direct.rows;
      console.error("2.3 Gate 7");
      gate7 = await runGate7(docs, directRows);
    }
  }

  const slimTiming = timing
    ? {
        officeparser: {
          totalMs: timing.officeparser.totalMs,
          rows: timing.officeparser.rows.map(({ text, ...rest }) => rest),
        },
        direct: {
          totalMs: timing.direct.totalMs,
          rows: timing.direct.rows.map(({ text, ...rest }) => rest),
        },
      }
    : null;

  const summary = {
    ranAt: new Date().toISOString(),
    timing: slimTiming,
    armC,
    gate7: gate7
      ? { spendUsd: gate7.spendUsd, calls: gate7.calls, kill: gate7.kill, rows: gate7.rows }
      : null,
    deployedProof,
  };

  let existing = {};
  try {
    existing = JSON.parse(await readFile(path.join(OUT, "summary.json"), "utf8"));
  } catch {
    existing = {};
  }
  const merged = {
    ...existing,
    ranAt: summary.ranAt,
    ...(slimTiming ? { timing: slimTiming } : {}),
    ...(armC ? { armC } : {}),
    ...(gate7 ? { gate7: summary.gate7 } : {}),
    ...(deployedProof ? { deployedProof } : {}),
  };
  await writeFile(path.join(OUT, "summary.json"), JSON.stringify(merged, null, 2));

  const report = buildReport({
    timing: merged.timing
      ? {
          officeparser: merged.timing.officeparser,
          direct: merged.timing.direct,
        }
      : null,
    armC: merged.armC,
    gate7: merged.gate7,
    deployedProof: merged.deployedProof,
  });
  await writeFile(path.join(ROOT, "REPORT.md"), report, "utf8");
  console.error(`wrote ${path.join(ROOT, "REPORT.md")}`);
  if (armC?.mistakes?.length) process.exitCode = 2;
  if (gate7?.kill) process.exitCode = 3;
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
