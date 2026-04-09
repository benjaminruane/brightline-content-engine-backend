import PDFDocument from "pdfkit";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

function setCorsHeaders(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://brightline-content-engine-frontend.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toParagraphs(text) {
  const raw = typeof text === "string" ? text : "";
  const parts = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [raw.trim()].filter(Boolean);
}

function normalizeVerdict(displayVerdict) {
  if (displayVerdict === "supported_full" || displayVerdict === "supported_partial") return "Supported";
  if (displayVerdict === "conflict") return "Conflicted";
  if (displayVerdict === "not_supported" || displayVerdict === "no_clear_support") return "Not Supported";
  return "Unverifiable";
}

function isConcerned(verdict) {
  return verdict === "soft_concern" || verdict === "hard_concern";
}

function formatSourceFileType(rawType) {
  const t = String(rawType || "").trim().toLowerCase();
  if (!t) return "Unknown";
  if (t.includes("pdf")) return "PDF";
  if (t.includes("txt") || t.includes("text")) return "TXT";
  if (t.includes("docx")) return "DOCX";
  if (t.includes("doc")) return "DOC";
  if (t.includes("web") || t.includes("url")) return "WEB";
  if (t === "file") return "File";
  return t.toUpperCase();
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const out = String(value);
  return out === "" ? null : out;
}

function deriveDocumentTitle(meta, outputTypeName) {
  const subject = normalizeOptionalString(meta?.subject)?.trim() || null;
  const title = normalizeOptionalString(meta?.title)?.trim() || null;
  const resolvedSubject = subject || title || null;
  return resolvedSubject ? `${resolvedSubject} — ${outputTypeName}` : outputTypeName;
}

function buildReviewData(qcResult) {
  const statements = Array.isArray(qcResult?.statements) ? qcResult.statements : [];
  const normalizedStatements = statements.map((s) => {
    const qcCard = s?.qcCard && typeof s.qcCard === "object" ? s.qcCard : {};
    const statementText = typeof qcCard.statement === "string" ? qcCard.statement.trim() : "";
    const verdict = normalizeVerdict(qcCard.displayVerdict);
    const concernLevel = typeof qcCard.concernLevel === "string" && qcCard.concernLevel.trim()
      ? qcCard.concernLevel.trim()
      : null;
    const evidenceFinding = typeof qcCard.reasoningParagraph === "string" && qcCard.reasoningParagraph.trim()
      ? qcCard.reasoningParagraph.trim()
      : (typeof qcCard.reasoningHeadline === "string" && qcCard.reasoningHeadline.trim()
        ? qcCard.reasoningHeadline.trim()
        : "No evidence finding recorded.");
    const excerpt = qcCard.hasRealExcerpt === true && typeof qcCard.primaryExcerptText === "string" && qcCard.primaryExcerptText.trim()
      ? qcCard.primaryExcerptText.trim()
      : null;
    const editorialConcerns = Array.isArray(qcCard.editorialConcerns) ? qcCard.editorialConcerns : [];
    const complianceConcerns = Array.isArray(qcCard.complianceConcerns) ? qcCard.complianceConcerns : [];
    const editorialFallback = editorialConcerns.map((c) => c?.note).filter((x) => typeof x === "string" && x.trim()).join(" ");
    const complianceFallback = complianceConcerns.map((c) => c?.note).filter((x) => typeof x === "string" && x.trim()).join(" ");
    const editorialNote = typeof qcCard.editorialNote === "string" && qcCard.editorialNote !== ""
      ? qcCard.editorialNote
      : (editorialFallback || null);
    const complianceNote = typeof qcCard.complianceNote === "string" && qcCard.complianceNote !== ""
      ? qcCard.complianceNote
      : (complianceFallback || null);
    const reviewerVerdict = qcCard.reviewerVerdict == null ? null : String(qcCard.reviewerVerdict).trim() || null;
    const editorialFlag = isConcerned(qcCard.editorialVerdict) || editorialNote != null;
    const complianceFlag = isConcerned(qcCard.complianceVerdict) || complianceNote != null;
    return {
      statementText,
      verdict,
      concernLevel,
      evidenceFinding,
      excerpt,
      editorialNote,
      complianceNote,
      reviewerVerdict,
      editorialFlag,
      complianceFlag,
    };
  });

  // Serialization break to prevent nested refs/prototypes reaching renderers.
  const safeStatements = JSON.parse(JSON.stringify(normalizedStatements));
  const total = safeStatements.length;
  return { statements: safeStatements, total };
}

async function renderPdf(payload) {
  const { sections, data } = payload;
  const meta = data?.meta || {};
  const draft = typeof data?.draft === "string" ? data.draft : "";
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const qcResult = data?.qcResult && typeof data.qcResult === "object" ? data.qcResult : null;
  const review = buildReviewData(qcResult);
  const includeReview = !!sections?.reviewSummary;
  const includeStatementReview = includeReview && review.total > 0;
  const includeSources = !!sections?.sources && sources.length > 0;
  const includeDraft = !!sections?.draft;
  const exportAt = String(meta.exportedAtLabel || "");
  const outputTypeName = String(meta.outputTypeName || "").trim() || String(meta.outputTypeLabel || "Unknown").split(" - ")[0];
  const requiredVersionLabel = String(meta.requiredVersionLabel || "").trim() || "Complete";
  const documentTitle = deriveDocumentTitle(meta, outputTypeName);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 71, right: 71, bottom: 71, left: 71 }, // ~25mm
    compress: true,
  });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const sectionGap = () => doc.moveDown(1.9); // ~24-32pt visual separation
  const sectionHeading = (text) => {
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a").text(text);
    doc.moveDown(0.6);
  };
  const body = (text, opts = {}) => {
    doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(11).fillColor("#0f172a").text(String(text ?? ""), { lineGap: 2 });
  };
  const labelValue = (label, value) => {
    doc.font("Helvetica-Bold").fontSize(11).text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(String(value ?? ""));
  };

  // Header block (no label prefixes for title/summary lines)
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a").text(documentTitle);
  doc.moveDown(0.25);
  labelValue("Output type", outputTypeName);
  labelValue("Required version", requiredVersionLabel);
  doc.moveDown(0.15);
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor("#475569")
    .text(`${exportAt}  |  ${Number(meta.wordCount || 0)} words  |  ${Number(meta.charCount || 0)} characters`);

  if (includeDraft) {
    sectionGap();
    sectionHeading("Draft Text");
    for (const p of toParagraphs(draft)) {
      body(p);
      doc.moveDown(0.4);
    }
  }

  if (includeSources) {
    sectionGap();
    sectionHeading("Sources Used");
    for (const s of sources) {
      body(s?.name || "Untitled source", { bold: true });
      labelValue("• File type", formatSourceFileType(s?.fileType));
      if (s?.description) labelValue("• Description", s.description);
      if (s?.usedFor) labelValue("• Used for", s.usedFor);
      doc.moveDown(0.45);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor("#e2e8f0").lineWidth(1).stroke();
      doc.moveDown(0.75);
    }
  }

  if (includeReview) {
    sectionGap();
    sectionHeading("Statement Review");
    for (const s of review.statements) {
      body(`"${s.statementText || ""}"`, { bold: true });
      doc.moveDown(0.2);
      const concernSuffix = s.concernLevel && String(s.concernLevel).toLowerCase() !== "none"
        ? ` (${s.concernLevel} concern)`
        : "";
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Verdict: ", { continued: true });
      doc.font("Helvetica").fontSize(11).fillColor("#0f172a").text(`${s.verdict}${concernSuffix}`);
      labelValue("Evidence finding", s.evidenceFinding);
      if (s.excerpt) labelValue("Excerpt", `"${s.excerpt}"`);
      if (s.editorialNote) labelValue("Editorial note", s.editorialNote);
      if (s.complianceNote) labelValue("Compliance note", s.complianceNote);
      if (s.reviewerVerdict) labelValue("Reviewer verdict", s.reviewerVerdict);
      doc.moveDown(0.45);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor("#e2e8f0").lineWidth(1).stroke();
      doc.moveDown(0.95);
    }
  }

  doc.end();
  return finished;
}

function buildDocx(payload) {
  const { sections, data } = payload;
  const meta = data?.meta || {};
  const draft = typeof data?.draft === "string" ? data.draft : "";
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const qcResult = data?.qcResult && typeof data.qcResult === "object" ? data.qcResult : null;
  const review = buildReviewData(qcResult);
  const includeReview = !!sections?.reviewSummary;
  const includeStatementReview = includeReview && review.total > 0;
  const includeSources = !!sections?.sources && sources.length > 0;
  const includeDraft = !!sections?.draft;
  const children = [];
  const outputTypeName = String(meta.outputTypeName || "").trim() || String(meta.outputTypeLabel || "Unknown").split(" - ")[0];
  const requiredVersionLabel = String(meta.requiredVersionLabel || "").trim() || "Complete";
  const documentTitle = deriveDocumentTitle(meta, outputTypeName);
  const heading = (text, opts = {}) => new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 240 },
    ...opts,
  });

  children.push(new Paragraph({
    children: [new TextRun({ text: documentTitle, bold: true, size: 36 })],
    spacing: { after: 120 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: "Output type: ", bold: true }), new TextRun(outputTypeName)],
    spacing: { after: 120 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: "Required version: ", bold: true }), new TextRun(requiredVersionLabel)],
    spacing: { after: 120 },
  }));
  children.push(new Paragraph({
    text: `${meta.exportedAtLabel || ""}  |  ${String(meta.wordCount || 0)} words  |  ${String(meta.charCount || 0)} characters`,
    spacing: { after: 480 },
  }));

  if (includeDraft) {
    children.push(heading("Draft Text"));
    for (const p of toParagraphs(draft)) children.push(new Paragraph({ text: p }));
    children.push(new Paragraph({ text: "", spacing: { after: 360 } }));
  }

  if (includeSources) {
    children.push(heading("Sources Used"));
    for (const s of sources) {
      children.push(new Paragraph({ children: [new TextRun({ text: s?.name || "Untitled source", bold: true })] }));
      children.push(new Paragraph({ children: [new TextRun("• "), new TextRun({ text: "File type: ", bold: true }), new TextRun(String(formatSourceFileType(s?.fileType) || ""))] }));
      if (s?.description) children.push(new Paragraph({ children: [new TextRun("• "), new TextRun({ text: "Description: ", bold: true }), new TextRun(String(s.description))] }));
      if (s?.usedFor) children.push(new Paragraph({ children: [new TextRun("• "), new TextRun({ text: "Used for: ", bold: true }), new TextRun(String(s.usedFor))] }));
      children.push(new Paragraph({ text: "", spacing: { after: 280 } }));
    }
  }

  if (includeReview) {
    children.push(heading("Statement Review"));
    for (const s of review.statements) {
      children.push(new Paragraph({ children: [new TextRun({ text: `"${s.statementText || ""}"`, bold: true })] }));
      const concernSuffix = s.concernLevel && String(s.concernLevel).toLowerCase() !== "none"
        ? ` (${s.concernLevel} concern)`
        : "";
      children.push(new Paragraph({ children: [new TextRun({ text: "Verdict: ", bold: true }), new TextRun(String(s.verdict || "") + concernSuffix)] }));
      children.push(new Paragraph({ children: [new TextRun({ text: "Evidence finding: ", bold: true }), new TextRun(String(s.evidenceFinding || ""))] }));
      if (s.excerpt) children.push(new Paragraph({
        children: [new TextRun({ text: "Excerpt: ", bold: true }), new TextRun({ text: `"${s.excerpt}"`, italics: true })],
      }));
      if (s.editorialNote) children.push(new Paragraph({ children: [new TextRun({ text: "Editorial note: ", bold: true }), new TextRun(String(s.editorialNote))] }));
      if (s.complianceNote) children.push(new Paragraph({ children: [new TextRun({ text: "Compliance note: ", bold: true }), new TextRun(String(s.complianceNote))] }));
      if (s.reviewerVerdict) children.push(new Paragraph({ children: [new TextRun({ text: "Reviewer verdict: ", bold: true }), new TextRun(String(s.reviewerVerdict))] }));
      children.push(new Paragraph({ text: "", spacing: { after: 320 } }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const format = body?.format === "docx" ? "docx" : "pdf";
    const sections = body?.sections && typeof body.sections === "object" ? body.sections : {};
    const data = body?.data && typeof body.data === "object" ? body.data : {};
    const payload = { format, sections, data };
    const meta = data?.meta && typeof data.meta === "object" ? data.meta : {};
    console.log("[EXPORT_SUBJECT_FIELDS]", {
      subject: meta?.subject ?? null,
      title: meta?.title ?? null,
      documentTitle: meta?.documentTitle ?? null,
    });
    const filename = typeof body?.filename === "string" && body.filename.trim() ? body.filename.trim() : `export.${format}`;
    if (format === "pdf") {
      const fullReviewPayload = payload;
      let safePdfPayload;
      try {
        safePdfPayload = JSON.parse(JSON.stringify(fullReviewPayload));
      } catch (serializationErr) {
        console.error("[EXPORT_PDF_SERIALIZATION_FAIL]", {
          message: serializationErr?.message || "Unknown serialization error",
          stack: serializationErr?.stack || null,
        });
        throw serializationErr;
      }
      try {
        const buffer = await renderPdf(safePdfPayload);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.status(200).send(buffer);
      } catch (pdfErr) {
        console.error("[EXPORT_PDF_RENDER_FAIL]", {
          message: pdfErr?.message || "Unknown PDF render error",
          stack: pdfErr?.stack || null,
        });
        throw pdfErr;
      }
    }

    const buffer = await buildDocx(payload);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Export failed" });
  }
}
