#!/usr/bin/env node
/**
 * CHECK 2 — binary-source old-vs-new extractor verdict attribution (officeparser swap gate).
 * Uses tests/output/extractor-check2-old-texts.json + live extractTextFromSource for NEW.
 * Evidence-only v4 pipeline (editorial/compliance off).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "./lib/env.mjs";

loadLocalEnvFiles();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OLD_PATH = path.join(ROOT, "tests/output/extractor-check2-old-texts.json");
const OUT_PATH = path.join(ROOT, "tests/output/extractor-check2-attribution.json");
const MD_PATH = path.join(ROOT, "docs/R7_EXTRACTOR_CHECK2_ATTRIBUTION.md");

const {
  extractTextFromSource,
  detectFileType,
  SCANNED_NEAR_EMPTY_CHARS,
} = await import("../../lib/extract-text-from-source.mjs");
const { runPipelineV4 } = await import("../../lib/qc/pipeline-v4/index.mjs");
const { createTraceId, flushObservability, startTrace } = await import(
  "../../lib/observability.js"
);

/** Probe suites keyed by relative path under repo. */
const CASES = [
  {
    file: "tests/extraction-corpus/files/native_clean.pdf",
    statements: [
      "Vantor Systems generated revenue of $24 million in FY2024, up from $18 million in FY2023.",
      "The Company employs 142 staff across three regional offices.",
      "The base case generates a 2.8x MOIC and a 23% gross IRR.",
    ],
  },
  {
    file: "tests/extraction-corpus/files/native_typography.pdf",
    statements: [
      "Management described the pipeline as “robust and well-diversified” and noted the company’s strong momentum.",
      "The projected gross IRR is in the 20–24% range — well above the fund’s hurdle rate.",
      "Customer acquisition cost runs between $175–225 with payback in 7–9 months.",
    ],
  },
  {
    file: "tests/extraction-corpus/files/multicolumn.pdf",
    statements: [
      "This paragraph belongs entirely to the left column and should read as one continuous block.",
      "This paragraph belongs entirely to the right column and should read as one continuous block distinct from the left.",
    ],
  },
  {
    file: "tests/extraction-corpus/files/multipage.pdf",
    statements: [
      "Vantor was founded in 2019 by two former logistics engineers.",
      "Annual recurring revenue reached $24 million by the end of FY2024.",
      "The board comprises five directors, two of them independent.",
    ],
  },
  {
    file: "tests/extraction-corpus/files/memo.docx",
    statements: [
      "Management described the pipeline as “robust and well-diversified” and noted the company’s strong momentum.",
      "The projected gross IRR is in the 20–24% range — well above the fund’s hurdle rate.",
      "Customer acquisition cost runs between $175–225 with payback in 7–9 months.",
    ],
  },
  {
    file: "tests/extraction-corpus/files/deck.pptx",
    statements: [
      "Average revenue per customer is $450 per month.",
      "Annual recurring revenue reached $24 million in FY2024.",
      "Month-12 logo retention is approximately 82%.",
      "We recommend proceeding to full diligence.",
    ],
  },
  {
    file: "tests/extraction-corpus/files/model.xlsx",
    statements: [
      "Revenue FY2024 ($mm) is 24.",
      "The base case MOIC is 2.8.",
    ],
  },
  {
    file: "tests/extraction-corpus/files/image_only.pdf",
    statements: ["The gross merchandise value processed was $132 million."],
    scannedProbe: true,
  },
  {
    file: "scripts/diagnostic/r7-samples/Shopify_text_longform_clean.pdf",
    statements: [
      "We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify",
      "monthly recurring revenue has grown from $164K to $438K (+151% Y/Y)",
      "Shopify's 24 employees are located in Ottawa, Canada.",
      "they are able to acquire a customer for between $175-225 and can pay back that spend in 7-9 months",
      "The round is priced at a $20mm pre-money valuation ($18.7mm EV).",
      "roughly two-thirds (66%) of customers using at least one third-party app",
    ],
  },
  {
    file: "scripts/diagnostic/r7-samples/Shopify_text_longform_messy.pdf",
    statements: [
      "We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify",
      "monthly recurring revenue has grown from $164K to $438K (+151% Y/Y)",
      "Shopify's 24 employees are located in Ottawa, Canada.",
      "they are able to acquire a customer for between $175-225 and can pay back that spend in 7-9 months",
      "The round is priced at a $20mm pre-money valuation ($18.7mm EV).",
      "roughly two-thirds (66%) of customers using at least one third-party app",
    ],
  },
  {
    file: "scripts/diagnostic/r7-samples/Shopify_text_longform.docx",
    statements: [
      "We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify",
      "monthly recurring revenue has grown from $164K to $438K (+151% Y/Y)",
      "Shopify's 24 employees are located in Ottawa, Canada.",
      "they are able to acquire a customer for between $175-225 and can pay back that spend in 7-9 months",
      "The round is priced at a $20mm pre-money valuation ($18.7mm EV).",
      "roughly two-thirds (66%) of customers using at least one third-party app",
    ],
  },
  {
    file: "scripts/diagnostic/r7-samples/B1_shopify_source_1_7m.pdf",
    statements: [
      "We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify",
      "Shopify raised $7 million in funding.",
    ],
  },
  {
    file: "scripts/diagnostic/r7-samples/B1_shopify_source_1_7m.docx",
    statements: [
      "We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify",
      "Shopify raised $7 million in funding.",
    ],
  },
  {
    file: "scripts/diagnostic/r7-samples/B2_shopify_source_2_5m_conflict.pdf",
    statements: [
      "Shopify raised $5 million in funding.",
      "The round was led by Bessemer Venture Partners.",
    ],
  },
  {
    file: "scripts/diagnostic/r7-samples/B2_shopify_source_2_5m_conflict.docx",
    statements: [
      "Shopify raised $5 million in funding.",
      "The round was led by Bessemer Venture Partners.",
    ],
  },
  {
    file: "scripts/diagnostic/r7-samples/D2_shopify_unit_economics_discussion.pptx",
    statements: [
      "Customer acquisition cost runs between $175-225 with payback in 7-9 months",
      "monthly recurring revenue has grown from $164K to $438K (+151% Y/Y)",
    ],
  },
  {
    file: "scripts/diagnostic/r7-samples/D2_shopify_unit_economics_discussion.xlsx",
    statements: [
      "Customer acquisition cost runs between $175-225 with payback in 7-9 months",
      "monthly recurring revenue has grown from $164K to $438K (+151% Y/Y)",
    ],
  },
];

const VERDICT_RANK = {
  supported_full: 3,
  supported: 3,
  confirmed: 3,
  supported_partial: 2,
  partially_confirmed: 2,
  partial: 2,
  conflict: 2,
  conflicting: 2,
  not_supported: 0,
  no_support: 0,
};

function draftFromStatements(statements) {
  return statements.map((s) => s.trim()).filter(Boolean).join("\n\n");
}

function cardFields(card) {
  return {
    statement: card?.statement ?? null,
    displayVerdict: card?.displayVerdict ?? null,
    concernLevel: card?.concernLevel ?? null,
    supportState: card?.supportState ?? null,
    hasConflict: card?.hasConflict === true,
    primaryExcerpt: card?.primaryExcerpt
      ? {
          passage: String(card.primaryExcerpt.passage || "").slice(0, 160),
          sourceLabel: card.primaryExcerpt.sourceLabel ?? null,
        }
      : null,
  };
}

function rankOf(card) {
  const dv = card?.displayVerdict;
  const ss = card?.supportState;
  if (dv && VERDICT_RANK[dv] != null) return VERDICT_RANK[dv];
  if (ss && VERDICT_RANK[ss] != null) return VERDICT_RANK[ss];
  return -1;
}

function alignCards(oldCards, newCards, statements) {
  // Prefer statement-text alignment; fall back to index.
  const out = [];
  for (let i = 0; i < statements.length; i++) {
    const want = statements[i];
    const o =
      oldCards.find((c) => (c.statement || "").trim() === want.trim()) ||
      oldCards[i] ||
      null;
    const n =
      newCards.find((c) => (c.statement || "").trim() === want.trim()) ||
      newCards[i] ||
      null;
    out.push({ statement: want, old: o, neu: n });
  }
  return out;
}

function attribute(pair, extractMeta) {
  const o = pair.old;
  const n = pair.neu;
  const oDv = o?.displayVerdict ?? null;
  const nDv = n?.displayVerdict ?? null;
  const oConflict = o?.hasConflict === true;
  const nConflict = n?.hasConflict === true;
  const oEx = o?.primaryExcerpt?.passage ?? null;
  const nEx = n?.primaryExcerpt?.passage ?? null;
  const sameVerdict = oDv === nDv && oConflict === nConflict;

  if (sameVerdict) {
    if (oEx !== nEx) {
      return {
        label: "NEUTRAL",
        reason:
          "same verdict/hasConflict; excerpt text differs (faithful-vs-mangled or phrasing) without verdict change",
      };
    }
    return { label: "NEUTRAL", reason: "identical verdict/hasConflict/excerpt" };
  }

  const oRank = rankOf(o);
  const nRank = rankOf(n);
  const oldFailedExtract = extractMeta.oldOk === false || extractMeta.oldLen === 0;
  const newRecovered = extractMeta.newOk && extractMeta.newLen > 50;

  if (oldFailedExtract && newRecovered && nRank > oRank) {
    return {
      label: "IMPROVEMENT",
      reason: "old extractor failed/empty; officeparser recovered text and evidence verdict improved",
    };
  }
  if (nRank > oRank) {
    return {
      label: "IMPROVEMENT",
      reason: `cleaner/recoverable text → verdict ${oDv}→${nDv} (rank ${oRank}→${nRank})`,
    };
  }
  if (nRank < oRank) {
    return {
      label: "REGRESSION",
      reason: `verdict worsened ${oDv}→${nDv} (rank ${oRank}→${nRank})`,
    };
  }
  // same rank but different tokens (e.g. conflict flag flip, or alias)
  if (oConflict !== nConflict) {
    if (nConflict && !oConflict) {
      return {
        label: "IMPROVEMENT",
        reason: "hasConflict surfaced under clearer extract (conflict always surfaces)",
      };
    }
    return {
      label: "REGRESSION",
      reason: "hasConflict dropped under new extract",
    };
  }
  return {
    label: "NEUTRAL",
    reason: `verdict token change at same strength (${oDv}→${nDv})`,
  };
}

async function runEvidenceOnly(draft, sourceText, label) {
  const traceId = createTraceId();
  startTrace({
    traceId,
    traceName: "extractor-check2",
    metadata: { label, pipelineRoute: "v4", evidenceOnly: true },
  });
  try {
    const result = await runPipelineV4(
      draft,
      [{ text: sourceText || "", label, publicationState: "unknown" }],
      {
        traceId,
        pipelineRoute: "v4",
        evidenceEnabled: true,
        editorialEnabled: false,
        complianceEnabled: false,
      }
    );
    return Array.isArray(result?.qcCards) ? result.qcCards.map(cardFields) : [];
  } finally {
    await flushObservability();
  }
}

async function main() {
  const oldSnap = JSON.parse(await readFile(OLD_PATH, "utf8"));
  const rows = [];
  const typographySpot = [];

  for (const c of CASES) {
    const key = c.file;
    const abs = path.join(ROOT, c.file);
    const old = oldSnap.files?.[key] || null;
    const buf = await readFile(abs);
    const mime = detectFileType("", path.basename(c.file));
    let neu;
    try {
      neu = await extractTextFromSource(buf, mime);
    } catch (e) {
      neu = {
        text: "",
        extraction: {
          status: "error",
          error: e?.message || String(e),
          structure: { pages: [], slides: [], sheets: [] },
        },
      };
    }

    const extractMeta = {
      oldOk: old?.ok !== false && !old?.error,
      oldLen: old?.textLength ?? (old?.text || "").length,
      oldError: old?.error || null,
      newOk: neu?.extraction?.status !== "error",
      newLen: neu?.text?.length ?? 0,
      newStatus: neu?.extraction?.status ?? null,
      structure: neu?.extraction?.structure ?? null,
      meaningfulTextLength: neu?.extraction?.meaningfulTextLength ?? null,
    };

    if (c.file.includes("native_typography") || c.file.includes("memo.docx")) {
      typographySpot.push({
        file: c.file,
        oldHasTrueGlyphs: /[\u201C\u201D\u2019\u2013\u2014]/.test(old?.text || ""),
        newHasTrueGlyphs: /[\u201C\u201D\u2019\u2013\u2014]/.test(neu?.text || ""),
        oldSample: String(old?.text || "").slice(0, 120),
        newSample: String(neu?.text || "").slice(0, 120),
      });
    }

    if (c.scannedProbe) {
      rows.push({
        file: c.file,
        scannedConfirm: {
          threshold: SCANNED_NEAR_EMPTY_CHARS,
          status: neu?.extraction?.status,
          meaningfulTextLength: neu?.extraction?.meaningfulTextLength,
          textLength: neu?.text?.length ?? 0,
          pipelineSkipped: true,
          note: "unsupported_scanned flagged; pipeline not required for ship gate",
        },
        pairs: [],
      });
      console.log(`[scanned] ${c.file} status=${neu?.extraction?.status} meaningful=${neu?.extraction?.meaningfulTextLength}`);
      continue;
    }

    const draft = draftFromStatements(c.statements);
    console.log(`[run] ${c.file} statements=${c.statements.length} oldLen=${extractMeta.oldLen} newLen=${extractMeta.newLen}`);
    const oldCards = await runEvidenceOnly(draft, old?.text || "", path.basename(c.file) + "#old");
    const newCards = await runEvidenceOnly(draft, neu?.text || "", path.basename(c.file) + "#new");
    const aligned = alignCards(oldCards, newCards, c.statements);
    const pairs = aligned.map((p) => {
      const attr = attribute(p, extractMeta);
      return {
        statement: p.statement,
        old: p.old,
        new: p.neu,
        attribution: attr,
      };
    });
    rows.push({ file: c.file, extractMeta, pairs });
  }

  const flat = rows.flatMap((r) =>
    (r.pairs || []).map((p) => ({ file: r.file, ...p }))
  );
  const counts = {
    IMPROVEMENT: flat.filter((p) => p.attribution.label === "IMPROVEMENT").length,
    NEUTRAL: flat.filter((p) => p.attribution.label === "NEUTRAL").length,
    REGRESSION: flat.filter((p) => p.attribution.label === "REGRESSION").length,
  };

  const report = {
    capturedAt: new Date().toISOString(),
    scannedNearEmptyChars: SCANNED_NEAR_EMPTY_CHARS,
    counts,
    typographySpot,
    rows,
  };
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(report, null, 2));

  const lines = [];
  lines.push("# R7 extractor CHECK 2 — binary attribution");
  lines.push("");
  lines.push(`Generated: ${report.capturedAt}`);
  lines.push("");
  lines.push(`**Counts:** IMPROVEMENT=${counts.IMPROVEMENT} NEUTRAL=${counts.NEUTRAL} REGRESSION=${counts.REGRESSION}`);
  lines.push("");
  lines.push(`Scanned threshold: ${SCANNED_NEAR_EMPTY_CHARS} chars (meaningful, image placeholders stripped).`);
  lines.push("");
  lines.push("| File | Statement | Old DV | New DV | Conflict o→n | Label | Reason |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const p of flat) {
    lines.push(
      `| ${p.file} | ${JSON.stringify((p.statement || "").slice(0, 60))} | ${p.old?.displayVerdict ?? "—"} | ${p.new?.displayVerdict ?? "—"} | ${p.old?.hasConflict}→${p.new?.hasConflict} | ${p.attribution.label} | ${p.attribution.reason} |`
    );
  }
  lines.push("");
  lines.push("## Typography spot-check");
  for (const t of typographySpot) {
    lines.push(`- **${t.file}**: oldGlyphs=${t.oldHasTrueGlyphs} newGlyphs=${t.newHasTrueGlyphs}`);
    lines.push(`  - old: ${JSON.stringify(t.oldSample)}`);
    lines.push(`  - new: ${JSON.stringify(t.newSample)}`);
  }
  const scanned = rows.find((r) => r.scannedConfirm);
  if (scanned) {
    lines.push("");
    lines.push("## Scanned confirm");
    lines.push("```json");
    lines.push(JSON.stringify(scanned.scannedConfirm, null, 2));
    lines.push("```");
  }
  await writeFile(MD_PATH, lines.join("\n") + "\n");

  console.log("\nCOUNTS", counts);
  console.log("Wrote", OUT_PATH);
  console.log("Wrote", MD_PATH);
  if (counts.REGRESSION > 0) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
