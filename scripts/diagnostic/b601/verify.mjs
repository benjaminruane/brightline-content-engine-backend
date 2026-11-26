/**
 * B601 verification: colour-change list, export PNGs, feedback print.
 * Diagnostic only — not committed. Writes ~/ce-diagnostics/b601-diag/
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { restampAnalyseResponse } from "../../../lib/qc/b596-stamp.mjs";
import { renderPdf } from "../../../lib/export/render-pdf.mjs";
import { polishConstructiveFeedback } from "../../../lib/qc/constructive-feedback-v2.mjs";
import { buildConstructiveFeedbackV2 } from "../../../lib/qc/constructive-feedback-v2.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BE = path.resolve(HERE, "../../..");
const OUT = path.join(process.env.HOME || "", "ce-diagnostics/b601-diag");
mkdirSync(OUT, { recursive: true });

function load(name) {
  return JSON.parse(readFileSync(path.join(BE, "test/fixtures/b601", name), "utf8"));
}

function face(card) {
  const q = card?.qcCard || card || {};
  return {
    label: q.sentenceLabel || q.combinedVerdict?.label || "",
    reason: q.shownReason || "",
    state: q.sentenceState || "",
    branch: q.setBy?.branch || "",
    statusNeedsConfirm: q.statusNeedsConfirm === true,
    house: (q.houseStyleConcerns || []).map((c) => c.surface || c.message).filter(Boolean),
  };
}

function labelOf(row) {
  return face(row).label || "(none)";
}

const colourChanges = [];

function compare(name, beforeBody, afterBody, item) {
  const n = Math.max(beforeBody.statements?.length || 0, afterBody.statements?.length || 0);
  for (let i = 0; i < n; i += 1) {
    const before = labelOf(beforeBody.statements?.[i] || {});
    const after = labelOf(afterBody.statements?.[i] || {});
    if (before === after) continue;
    const afterFace = face(afterBody.statements[i]);
    colourChanges.push({
      item,
      run: name,
      card: `S${i + 1}`,
      before,
      after,
      reason: afterFace.reason,
      branch: afterFace.branch,
    });
  }
}

// Live faces (as saved) vs exit-gate restamp.
for (const [file, scenario, itemHints] of [
  ["kestrel-call-r30.json", "FUND_CAPITAL_CALL", "1+2"],
  ["helvetia-r31.json", "DIRECT_INVESTMENT_REVALUATION", "3+4"],
  ["vale-r32.json", "NEW_SECONDARY_INVESTMENT", "4"],
]) {
  const raw = load(file);
  const before = structuredClone(raw);
  // Ensure live labels exist on before faces.
  for (const row of before.statements || []) {
    const q = row.qcCard || {};
    if (!q.sentenceLabel && q.combinedVerdict?.label) q.sentenceLabel = q.combinedVerdict.label;
  }
  const after = restampAnalyseResponse({
    ...raw,
    meta: {
      ...(raw.meta || {}),
      scenario,
      eventType: scenario,
      houseStyle: { spelling: "US", numericRange: "on" },
      dealStatus: raw._b601?.dealStatus || raw.meta?.dealStatus || null,
    },
  });
  compare(file.replace(/\.json$/, ""), before, after, itemHints);
  writeFileSync(path.join(OUT, `restamped-${file}`), `${JSON.stringify(after, null, 2)}\n`);
}

writeFileSync(path.join(OUT, "colour-changes.json"), `${JSON.stringify(colourChanges, null, 2)}\n`);
console.log("COLOUR_CHANGES");
for (const row of colourChanges) {
  console.log(
    `${row.run} ${row.card}: ${row.before} → ${row.after} [${row.branch}] ${row.reason.slice(0, 140)}`,
  );
}

// Attribution newly amber (item 4 sweep list)
console.log("\nITEM4_NEW_AMBER");
for (const row of colourChanges.filter((r) => r.branch === "attributionClause" || /Goes beyond/.test(r.after))) {
  if (/Conflicts|Not in the source|Goes beyond/.test(row.before) && row.before === row.after) continue;
  console.log(`${row.run} ${row.card}: ${row.before} → ${row.after} — ${row.reason.slice(0, 160)}`);
}

async function exportPng(name, body) {
  const draft = body._b601?.draftText
    || body.meta?.fullDraft
    || (body.statements || []).map((s) => s.text || s.qcCard?.statement || "").join("\n\n");
  const marked = (body.statements || []).map((row, index) => ({
    number: `S${index + 1}`,
    text: row.text || row.qcCard?.statement || "",
    marker: `S${index + 1}`,
  }));
  const findingCards = (body.statements || []).map((row, index) => {
    const q = row.qcCard || {};
    const house = (q.houseStyleConcerns || []).map((c) => c.message || c.surface).filter(Boolean);
    return {
      number: `S${index + 1}`,
      sentence: row.text || q.statement || "",
      label: q.sentenceLabel || "",
      reason: q.shownReason || "",
      houseStyle: house,
      tone: q.combinedVerdict?.tone || "",
    };
  });
  const buf = await renderPdf({
    title: {
      name: body._b601?.ref || name,
      verdict: body.meta?.reviewSummary?.readiness || "Reviewed",
      detail: body._b601?.scenario || "",
      writingFor: "Halden Group",
      reviewed: new Date().toISOString().slice(0, 10),
      sourceNames: (body.sources || []).map((s) => s.displayName || s.name || "Source").filter(Boolean),
      exported: new Date().toISOString().slice(0, 10),
    },
    draft: marked,
    fullDraft: draft,
    cards: findingCards,
    sources: body.sources || [],
    summary: body.meta?.reviewSummary || null,
    howToRead: {
      title: "How to read this review",
      labels: ["Nothing raised: the sentence sits with the source.", "Conflicts with the source: a figure or fact disagrees."],
      lineNote: "Diagnostic B601 export.",
      disclaimer: "Diagnostic B601 export of the live fixture after the exit gate.",
    },
    disclaimer: "Diagnostic B601 export.",
  }, { draft: true, findings: true, summary: true });
  const pdfPath = path.join(OUT, `${name}.pdf`);
  writeFileSync(pdfPath, buf);
  spawnSync("qlmanage", ["-t", "-s", "1600", "-o", OUT, pdfPath], { encoding: "utf8" });
  const thumb = path.join(OUT, `${name}.pdf.png`);
  const png = path.join(OUT, `${name}.png`);
  if (existsSync(thumb)) {
    spawnSync("sips", ["-s", "format", "png", thumb, "--out", png], { encoding: "utf8" });
  }
  console.log(`EXPORT ${name}: pdf=${pdfPath} png=${existsSync(png) ? png : "(missing)"}`);
  // Face confirmation text beside the PNG.
  writeFileSync(
    path.join(OUT, `${name}-faces.txt`),
    findingCards.map((c) => `${c.number} ${c.label} | ${c.reason}${c.houseStyle.length ? ` | house: ${c.houseStyle.join("; ")}` : ""}`).join("\n"),
  );
  return png;
}

const r30 = restampAnalyseResponse({
  ...load("kestrel-call-r30.json"),
  meta: { scenario: "FUND_CAPITAL_CALL", eventType: "FUND_CAPITAL_CALL", houseStyle: { spelling: "US" } },
});
const r31 = restampAnalyseResponse({
  ...load("helvetia-r31.json"),
  meta: { scenario: "DIRECT_INVESTMENT_REVALUATION", eventType: "DIRECT_INVESTMENT_REVALUATION", houseStyle: { spelling: "US" } },
});
await exportPng("r30-kestrel", r30);
await exportPng("r31-helvetia", r31);

console.log("\nR30_FACES");
for (const [i, s] of r30.statements.entries()) {
  const f = face(s);
  console.log(`S${i + 1}`, f.label, f.statusNeedsConfirm, f.reason.slice(0, 100));
}
console.log("\nR31_HOUSE");
for (const [i, s] of r31.statements.entries()) {
  const f = face(s);
  if (f.house.length) console.log(`S${i + 1}`, f.label, f.house.join(", "));
}

// Aldermoor constructive feedback (deterministic polish of a representative model draft).
const ald = JSON.parse(
  readFileSync(path.join(BE, "test/fixtures/b600/aldermoor-live-b599.json"), "utf8"),
);
const stampedAld = restampAnalyseResponse({
  ...ald,
  meta: { ...(ald.meta || {}), eventType: "NEW_PRIMARY_COMMITMENT", subjectName: "Aldermoor Capital Fund VI" },
});
let payload;
try {
  payload = buildConstructiveFeedbackV2({
    draftText: stampedAld.statements.map((s) => s.text || "").join("\n\n"),
    eventType: "NEW_PRIMARY_COMMITMENT",
    outputType: "reporting_commentary",
    visibility: "internal",
    reviewOptions: { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true },
    statements: stampedAld.statements,
  });
} catch (err) {
  console.error("buildConstructiveFeedbackV2", err.message);
  payload = null;
}
const rawModel = `The draft states commitments the source has not confirmed.
To fix
"In October 2026, Halden Group committed…" The source only recommends the commitment and does not say it has completed. For example: Halden Group's investment team has recommended a commitment of EUR 65 million to Aldermoor Capital Fund VI. Confirm against the source.
"EUR 65 million" The figure matches the source but the decision status does not.
For next time
Set transaction status when the source only recommends a commitment.`;
const feedback = polishConstructiveFeedback(rawModel, {
  findings: payload?.payload?.findings || [{
    label: "Needs a look",
    reason: "The source recommends this transaction and does not say it has completed. Confirm its status below.",
  }],
});
const fullFeedback = payload
  ? `${payload.readiness}\n${feedback}`
  : feedback;
writeFileSync(path.join(OUT, "aldermoor-feedback.txt"), fullFeedback);
console.log("\nALDERMOOR_FEEDBACK\n" + fullFeedback);

console.log("\nF17_CAUSE");
console.log(
  "House spelling lived only in the Generate / editorial model prompt path (lib/qc/house-spelling.mjs); Review never ran a deterministic spelling stamp, so British words in a US-house draft raised nothing.",
);
