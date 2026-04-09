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

function buildReviewData(qcResult) {
  const statements = Array.isArray(qcResult?.statements) ? qcResult.statements : [];
  const normalizedStatements = statements.map((s) => {
    const qcCard = s?.qcCard && typeof s.qcCard === "object" ? s.qcCard : {};
    const verdict = normalizeVerdict(qcCard.displayVerdict);
    const editorialConcerns = Array.isArray(qcCard.editorialConcerns) ? qcCard.editorialConcerns : [];
    const complianceConcerns = Array.isArray(qcCard.complianceConcerns) ? qcCard.complianceConcerns : [];
    return {
      text: typeof s?.text === "string" ? s.text : "",
      verdict,
      editorialVerdict: qcCard.editorialVerdict,
      complianceVerdict: qcCard.complianceVerdict,
      editorialConcerns,
      complianceConcerns,
    };
  });

  const counts = {
    supported: 0,
    conflicted: 0,
    notSupported: 0,
    unverifiable: 0,
    editorialFlags: 0,
    complianceFlags: 0,
  };
  for (const s of normalizedStatements) {
    if (s.verdict === "Supported") counts.supported += 1;
    else if (s.verdict === "Conflicted") counts.conflicted += 1;
    else if (s.verdict === "Not Supported") counts.notSupported += 1;
    else counts.unverifiable += 1;
    if (isConcerned(s.editorialVerdict) || s.editorialConcerns.length > 0) counts.editorialFlags += 1;
    if (isConcerned(s.complianceVerdict) || s.complianceConcerns.length > 0) counts.complianceFlags += 1;
  }

  const total = normalizedStatements.length;
  const health = `${total} statements reviewed - ${counts.supported} supported, ${counts.conflicted} conflicted, ${counts.notSupported} not supported. ${counts.editorialFlags} editorial concerns, ${counts.complianceFlags} compliance flags.`;
  return { statements: normalizedStatements, counts, total, health };
}

async function renderPdf(payload) {
  const { sections, data } = payload;
  const meta = data?.meta || {};
  const draft = typeof data?.draft === "string" ? data.draft : "";
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const qcResult = data?.qcResult && typeof data.qcResult === "object" ? data.qcResult : null;
  const review = buildReviewData(qcResult);
  const includeReview = !!sections?.reviewSummary && review.total > 0;
  const includeSources = !!sections?.sources && sources.length > 0;
  const includeDraft = !!sections?.draft;
  const exportAt = String(meta.exportedAtLabel || "");

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 71, right: 71, bottom: 71, left: 71 }, // ~25mm
    bufferPages: true,
    compress: true,
  });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const sectionHeading = (text) => {
    doc.moveDown(0.2);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a").text(text);
    doc.moveDown(0.4);
  };
  const body = (text, opts = {}) => {
    doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(11).fillColor("#0f172a").text(String(text ?? ""), { lineGap: 2 });
  };
  const labelValue = (label, value) => {
    doc.font("Helvetica-Bold").fontSize(11).text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(String(value ?? ""));
  };

  sectionHeading("Section 1 - Header");
  labelValue("Document title", meta.documentTitle || "Draft Output");
  labelValue("Output type", meta.outputTypeLabel || "Unknown");
  labelValue("Version", meta.versionLabel || "V1");
  labelValue("Export date and time", exportAt);
  labelValue("Word count", Number(meta.wordCount || 0));
  labelValue("Character count", Number(meta.charCount || 0));

  if (includeDraft) {
    doc.addPage();
    sectionHeading("Section 2 - Draft Text");
    for (const p of toParagraphs(draft)) {
      body(p);
      doc.moveDown(0.4);
    }
  }

  if (includeSources) {
    doc.addPage();
    sectionHeading("Section 3 - Sources Used");
    for (const s of sources) {
      labelValue("Source name", s?.name || "Untitled source");
      labelValue("File type", s?.fileType || "Unknown");
      if (s?.description) labelValue("Description", s.description);
      if (s?.usedFor) labelValue("Used for", s.usedFor);
      doc.moveDown(0.8);
    }
  }

  if (includeReview) {
    doc.addPage();
    sectionHeading("Section 4 - Review Summary");
    labelValue("Total statements reviewed", review.total);
    labelValue("Supported", review.counts.supported);
    labelValue("Conflicted", review.counts.conflicted);
    labelValue("Not Supported", review.counts.notSupported);
    labelValue("Unverifiable", review.counts.unverifiable);
    labelValue("Editorial flags", review.counts.editorialFlags);
    labelValue("Compliance flags", review.counts.complianceFlags);
    labelValue("QC health", review.health);

    doc.addPage();
    sectionHeading("Section 5 - Statement Review");
    for (const s of review.statements) {
      labelValue("Statement", s.text || "");
      body(`Verdict: ${s.verdict}`, { bold: true });
      if (isConcerned(s.editorialVerdict) || s.editorialConcerns.length > 0) {
        const note = s.editorialConcerns[0]?.note ? ` - ${s.editorialConcerns[0].note}` : "";
        body(`Editorial signal: ${s.editorialVerdict || "Concern"}${note}`);
      }
      if (isConcerned(s.complianceVerdict) || s.complianceConcerns.length > 0) {
        const note = s.complianceConcerns[0]?.note ? ` - ${s.complianceConcerns[0].note}` : "";
        body(`Compliance signal: ${s.complianceVerdict || "Concern"}${note}`);
      }
      doc.moveDown(0.9);
    }
  }

  doc.addPage();
  sectionHeading("Section 6 - Footer");
  body(exportAt);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const footerY = doc.page.height - 46;
    doc.font("Helvetica").fontSize(9).fillColor("#475569");
    doc.text(exportAt, doc.page.margins.left, footerY, { width: 250, align: "left" });
    doc.text(String(i + 1), doc.page.width - doc.page.margins.right - 40, footerY, { width: 40, align: "right" });
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
  const includeReview = !!sections?.reviewSummary && review.total > 0;
  const includeSources = !!sections?.sources && sources.length > 0;
  const includeDraft = !!sections?.draft;
  const children = [];

  children.push(new Paragraph({ text: "Section 1 - Header", heading: HeadingLevel.HEADING_1 }));
  children.push(new Paragraph({ children: [new TextRun({ text: "Document title: ", bold: true }), new TextRun(meta.documentTitle || "Draft Output")] }));
  children.push(new Paragraph({ children: [new TextRun({ text: "Output type: ", bold: true }), new TextRun(meta.outputTypeLabel || "Unknown")] }));
  children.push(new Paragraph({ children: [new TextRun({ text: "Version: ", bold: true }), new TextRun(meta.versionLabel || "V1")] }));
  children.push(new Paragraph({ children: [new TextRun({ text: "Export date and time: ", bold: true }), new TextRun(meta.exportedAtLabel || "")] }));
  children.push(new Paragraph({ children: [new TextRun({ text: "Word count: ", bold: true }), new TextRun(String(meta.wordCount || 0))] }));
  children.push(new Paragraph({ children: [new TextRun({ text: "Character count: ", bold: true }), new TextRun(String(meta.charCount || 0))] }));

  if (includeDraft) {
    children.push(new Paragraph({ text: "Section 2 - Draft Text", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    for (const p of toParagraphs(draft)) children.push(new Paragraph({ text: p }));
  }

  if (includeSources) {
    children.push(new Paragraph({ text: "Section 3 - Sources Used", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    for (const s of sources) {
      children.push(new Paragraph({ children: [new TextRun({ text: "Source name: ", bold: true }), new TextRun(s?.name || "Untitled source")] }));
      children.push(new Paragraph({ children: [new TextRun({ text: "File type: ", bold: true }), new TextRun(s?.fileType || "Unknown")] }));
      if (s?.description) children.push(new Paragraph({ children: [new TextRun({ text: "Description: ", bold: true }), new TextRun(s.description)] }));
      if (s?.usedFor) children.push(new Paragraph({ children: [new TextRun({ text: "Used for: ", bold: true }), new TextRun(s.usedFor)] }));
      children.push(new Paragraph({ text: "" }));
    }
  }

  if (includeReview) {
    children.push(new Paragraph({ text: "Section 4 - Review Summary", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    children.push(new Paragraph({ text: `Total statements reviewed: ${review.total}` }));
    children.push(new Paragraph({ text: `Supported: ${review.counts.supported}` }));
    children.push(new Paragraph({ text: `Conflicted: ${review.counts.conflicted}` }));
    children.push(new Paragraph({ text: `Not Supported: ${review.counts.notSupported}` }));
    children.push(new Paragraph({ text: `Unverifiable: ${review.counts.unverifiable}` }));
    children.push(new Paragraph({ text: `Editorial flags: ${review.counts.editorialFlags}` }));
    children.push(new Paragraph({ text: `Compliance flags: ${review.counts.complianceFlags}` }));
    children.push(new Paragraph({ text: review.health }));

    children.push(new Paragraph({ text: "Section 5 - Statement Review", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
    for (const s of review.statements) {
      children.push(new Paragraph({ children: [new TextRun({ text: "Statement: ", bold: true }), new TextRun(s.text || "")] }));
      children.push(new Paragraph({ children: [new TextRun({ text: `Verdict: ${s.verdict}`, bold: true })] }));
      if (isConcerned(s.editorialVerdict) || s.editorialConcerns.length > 0) {
        const note = s.editorialConcerns[0]?.note ? ` - ${s.editorialConcerns[0].note}` : "";
        children.push(new Paragraph({ text: `Editorial signal: ${s.editorialVerdict || "Concern"}${note}` }));
      }
      if (isConcerned(s.complianceVerdict) || s.complianceConcerns.length > 0) {
        const note = s.complianceConcerns[0]?.note ? ` - ${s.complianceConcerns[0].note}` : "";
        children.push(new Paragraph({ text: `Compliance signal: ${s.complianceVerdict || "Concern"}${note}` }));
      }
      children.push(new Paragraph({ text: "" }));
    }
  }

  children.push(new Paragraph({ text: "Section 6 - Footer", heading: HeadingLevel.HEADING_1, pageBreakBefore: true }));
  children.push(new Paragraph({ text: meta.exportedAtLabel || "" }));

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
    const filename = typeof body?.filename === "string" && body.filename.trim() ? body.filename.trim() : `export.${format}`;

    if (format === "pdf") {
      const buffer = await renderPdf(payload);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(buffer);
    }

    const buffer = await buildDocx(payload);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Export failed" });
  }
}
