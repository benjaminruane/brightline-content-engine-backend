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
  return { statements: normalizedStatements, counts, total };
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
  const outputTypeName = String(meta.outputTypeName || "").trim() || String(meta.outputTypeLabel || "Unknown").split(" - ")[0];
  const requiredVersionLabel = String(meta.requiredVersionLabel || "").trim() || "Complete";

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
  let pageNumber = 1;
  const drawFooter = (n) => {
    const prevX = doc.x;
    const prevY = doc.y;
    const y = doc.page.height - 46;
    doc.font("Helvetica").fontSize(9).fillColor("#475569");
    doc.text(exportAt, doc.page.margins.left, y, { width: 250, align: "left", lineBreak: false });
    doc.text(String(n), doc.page.width - doc.page.margins.right - 40, y, { width: 40, align: "right", lineBreak: false });
    doc.x = prevX;
    doc.y = prevY;
  };
  drawFooter(pageNumber);
  doc.on("pageAdded", () => {
    pageNumber += 1;
    drawFooter(pageNumber);
  });

  // Header block (no label prefixes for title/summary lines)
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a").text(meta.documentTitle || outputTypeName);
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
      body(`- File type: ${formatSourceFileType(s?.fileType)}`);
      if (s?.description) body(`- Description: ${s.description}`);
      if (s?.usedFor) body(`- Used for: ${s.usedFor}`);
      doc.moveDown(0.45);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor("#e2e8f0").lineWidth(1).stroke();
      doc.moveDown(0.75);
    }
  }

  if (includeReview) {
    sectionGap();
    sectionHeading("Review Summary");
    labelValue("Total statements reviewed", review.total);
    labelValue("Supported", review.counts.supported);
    labelValue("Conflicted", review.counts.conflicted);
    labelValue("Not Supported", review.counts.notSupported);
    labelValue("Unverifiable", review.counts.unverifiable);
    labelValue("Editorial flags", review.counts.editorialFlags);
    labelValue("Compliance flags", review.counts.complianceFlags);

    sectionGap();
    sectionHeading("Statement Review");
    for (const s of review.statements) {
      labelValue("Statement", s.text || "");
      body(`Verdict: ${s.verdict}`, { bold: true });
      const notes = [];
      if (isConcerned(s.editorialVerdict) || s.editorialConcerns.length > 0) {
        const note = s.editorialConcerns[0]?.note ? String(s.editorialConcerns[0].note) : "";
        if (note) notes.push(`- Editorial note: ${note}`);
      }
      if (isConcerned(s.complianceVerdict) || s.complianceConcerns.length > 0) {
        const note = s.complianceConcerns[0]?.note ? String(s.complianceConcerns[0].note) : "";
        if (note) notes.push(`- Compliance note: ${note}`);
      }
      if (notes.length === 0) body("No concerns raised.");
      else notes.forEach((line) => body(line));
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
  const includeReview = !!sections?.reviewSummary && review.total > 0;
  const includeSources = !!sections?.sources && sources.length > 0;
  const includeDraft = !!sections?.draft;
  const children = [];
  const outputTypeName = String(meta.outputTypeName || "").trim() || String(meta.outputTypeLabel || "Unknown").split(" - ")[0];
  const requiredVersionLabel = String(meta.requiredVersionLabel || "").trim() || "Complete";
  const heading = (text, opts = {}) => new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 240 },
    ...opts,
  });

  children.push(new Paragraph({
    children: [new TextRun({ text: meta.documentTitle || outputTypeName, bold: true, size: 36 })],
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
      children.push(new Paragraph({ text: `- File type: ${formatSourceFileType(s?.fileType)}` }));
      if (s?.description) children.push(new Paragraph({ text: `- Description: ${s.description}` }));
      if (s?.usedFor) children.push(new Paragraph({ text: `- Used for: ${s.usedFor}` }));
      children.push(new Paragraph({ text: "", spacing: { after: 280 } }));
    }
  }

  if (includeReview) {
    children.push(heading("Review Summary"));
    children.push(new Paragraph({ text: `Total statements reviewed: ${review.total}` }));
    children.push(new Paragraph({ text: `Supported: ${review.counts.supported}` }));
    children.push(new Paragraph({ text: `Conflicted: ${review.counts.conflicted}` }));
    children.push(new Paragraph({ text: `Not Supported: ${review.counts.notSupported}` }));
    children.push(new Paragraph({ text: `Unverifiable: ${review.counts.unverifiable}` }));
    children.push(new Paragraph({ text: `Editorial flags: ${review.counts.editorialFlags}` }));
    children.push(new Paragraph({ text: `Compliance flags: ${review.counts.complianceFlags}` }));
    children.push(new Paragraph({ text: "", spacing: { after: 360 } }));

    children.push(heading("Statement Review"));
    for (const s of review.statements) {
      children.push(new Paragraph({ children: [new TextRun({ text: "Statement: ", bold: true }), new TextRun(s.text || "")] }));
      children.push(new Paragraph({ children: [new TextRun({ text: `Verdict: ${s.verdict}`, bold: true })] }));
      const notes = [];
      if (isConcerned(s.editorialVerdict) || s.editorialConcerns.length > 0) {
        const note = s.editorialConcerns[0]?.note ? String(s.editorialConcerns[0].note) : "";
        if (note) notes.push(`- Editorial note: ${note}`);
      }
      if (isConcerned(s.complianceVerdict) || s.complianceConcerns.length > 0) {
        const note = s.complianceConcerns[0]?.note ? String(s.complianceConcerns[0].note) : "";
        if (note) notes.push(`- Compliance note: ${note}`);
      }
      if (notes.length === 0) children.push(new Paragraph({ text: "No concerns raised." }));
      else notes.forEach((line) => children.push(new Paragraph({ text: line })));
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
