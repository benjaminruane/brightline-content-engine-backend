/**
 * B602. Render Ostara + Harbourline fixtures through restamp + live renderPdf.
 * Writes PDF + PNG under ~/ce-diagnostics/b602-diag/.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { restampAnalyseResponse } from "../../../lib/qc/b596-stamp.mjs";
import { renderPdf } from "../../../lib/export/render-pdf.mjs";
import {
  HOW_TO_READ_TITLE,
  HOW_TO_READ_LABELS,
  HOW_TO_READ_LINE_NOTE,
} from "../../../lib/export/export-blocks.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BE = path.resolve(HERE, "../../..");
const OUT = path.join(process.env.HOME || "", "ce-diagnostics/b602-diag");
const FIX = path.join(BE, "test/fixtures/b602");
mkdirSync(OUT, { recursive: true });

function load(name) {
  return JSON.parse(readFileSync(path.join(FIX, `${name}.json`), "utf8"));
}

function draftOf(body) {
  if (typeof body?.meta?.fullDraft === "string" && body.meta.fullDraft.trim()) return body.meta.fullDraft;
  return (body.statements || []).map((s) => s.text || s.qcCard?.statement || "").filter(Boolean).join("\n\n");
}

function shownLines(card) {
  const raw = card?.shownLines || card?.evidenceLines || card?.sourceExcerpts || card?.excerpts || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((line) => {
    if (typeof line === "string") return { text: line, reference: "" };
    return {
      text: line?.text || line?.excerpt || line?.passage || "",
      reference: line?.reference || line?.lineRef || (line?.line != null ? `line ${line.line}` : ""),
      sourceBadge: line?.sourceBadge || line?.sourceIndex || line?.sourceNumber || "",
      sourceName: line?.sourceName || line?.documentName || "",
    };
  }).filter((line) => line.text);
}

function findingCards(body) {
  return (body.statements || []).map((row, index) => {
    const q = row.qcCard || {};
    const house = (q.houseStyleConcerns || [])
      .map((c) => c.message || c.note || c.surface)
      .filter(Boolean);
    const lines = shownLines(q);
    return {
      number: `S${index + 1}`,
      sentence: row.text || q.statement || "",
      label: q.sentenceLabel || q.combinedVerdict?.label || "",
      reason: q.shownReason || q.evidenceSummary || "",
      tone: q.combinedVerdict?.tone || "",
      houseStyle: house,
      lines,
      excerpts: lines.map((line) => ({
        text: line.text,
        reference: line.reference,
        sourceBadge: line.sourceBadge,
        sourceName: line.sourceName,
      })),
    };
  });
}

async function exportOne(name) {
  const raw = load(name);
  const body = restampAnalyseResponse(raw);
  const draft = draftOf(body);
  const cards = findingCards(body);
  const readiness = body.meta?.reviewSummary?.readiness || "Reviewed";
  const dealStatus = body.meta?.dealStatus || body.meta?.dealInfo?.dealStatus || "";
  const document = {
    title: {
      name: `${name}: review`,
      verdict: readiness,
      readiness,
      assessmentTone: /significant|not ready/i.test(readiness) ? "red" : /work/i.test(readiness) ? "amber" : "green",
      detail: dealStatus ? `Transaction status: ${dealStatus} (set by you)` : "",
      writingFor: "Halden Group",
      reviewed: new Date().toISOString().slice(0, 10),
      sourceNames: (body.sources || []).map((s) => s.displayName || s.name || s.fileName || "Source").filter(Boolean),
      exported: new Date().toISOString().slice(0, 10),
    },
    draft: (body.statements || []).map((row, index) => ({
      number: `S${index + 1}`,
      text: row.text || row.qcCard?.statement || "",
      marker: `S${index + 1}`,
    })),
    fullDraft: draft,
    cards,
    sources: (body.sources || []).map((s, i) => ({
      ...s,
      name: s.displayName || s.name || s.fileName || `Source ${i + 1}`,
      summary: s.summary || s.modelSummary || s.roleSummary || "",
      badge: s.badge || i + 1,
    })),
    summary: body.meta?.reviewSummary || null,
    howToRead: {
      title: HOW_TO_READ_TITLE,
      labels: HOW_TO_READ_LABELS,
      lineNote: HOW_TO_READ_LINE_NOTE,
      disclaimer: "B602 diagnostic export of the restamped fixture.",
    },
    disclaimer: "B602 diagnostic export.",
  };

  const buf = await renderPdf(document, {
    draft: true,
    findings: true,
    summary: true,
    sources: true,
  });
  const pdfPath = path.join(OUT, `${name}-export.pdf`);
  writeFileSync(pdfPath, buf);
  spawnSync("qlmanage", ["-t", "-s", "1600", "-o", OUT, pdfPath], { encoding: "utf8" });
  const thumb = path.join(OUT, `${name}-export.pdf.png`);
  const png = path.join(OUT, `${name}-export.png`);
  if (existsSync(thumb)) {
    spawnSync("sips", ["-s", "format", "png", thumb, "--out", png], { encoding: "utf8" });
  }
  writeFileSync(path.join(OUT, `${name}-faces.json`), `${JSON.stringify(cards, null, 2)}\n`);

  const pdfText = spawnSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" }).stdout || "";
  const check = {
    name,
    pdfPath,
    png: existsSync(png) ? png : null,
    noDealWord: !/\bdeal\b/i.test(pdfText),
    hasHowToRead: /How to read this review/i.test(pdfText),
    hasAssessment: /Assessment/i.test(pdfText),
    cardCount: cards.length,
    sampleLines: cards.slice(0, 3).map((c) => ({
      number: c.number,
      label: c.label,
      lineRefs: c.lines.map((l) => l.reference).filter(Boolean),
      lineStarts: c.lines.map((l) => l.text.slice(0, 60)),
    })),
  };
  console.log(JSON.stringify(check, null, 2));
  return check;
}

const results = [];
results.push(await exportOne("ostara"));
results.push(await exportOne("harbourline"));
writeFileSync(path.join(OUT, "pdf-check.json"), `${JSON.stringify({ results }, null, 2)}\n`);
console.log("PDF_CHECK_DONE", results.map((r) => ({ name: r.name, noDeal: r.noDealWord, how: r.hasHowToRead })));
