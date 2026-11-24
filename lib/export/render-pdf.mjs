import PDFDocument from "pdfkit";
import { exportBlocks, sourceDetail } from "./export-blocks.mjs";
import { EXPORT_STYLE, fontName, mmToPt } from "./export-style.mjs";

function gap(size) {
  return size * (EXPORT_STYLE.body.lineHeight - 1);
}

function paint(doc, block) {
  const margin = mmToPt(EXPORT_STYLE.page.marginMm);
  const width = doc.page.width - margin * 2;
  if (block.kind === "cardHeading") {
    const needed = EXPORT_STYLE.cardHeading.size * EXPORT_STYLE.layout.keepWithLines;
    if (doc.y + needed > doc.page.height - margin) doc.addPage();
    const dot = mmToPt(EXPORT_STYLE.cardHeading.dotMm);
    const color = EXPORT_STYLE.verdict[block.tone] || EXPORT_STYLE.verdict.green;
    const y = doc.y + EXPORT_STYLE.layout.headingLiftPt;
    doc.circle(margin + dot / 2, y + dot / 2, dot / 2).fill(color);
    doc.fillColor(EXPORT_STYLE.cardHeading.color)
      .font(fontName(EXPORT_STYLE.cardHeading.weight))
      .fontSize(EXPORT_STYLE.cardHeading.size)
      .text(block.text, margin + dot + EXPORT_STYLE.layout.dotGapPt, y, { width: width - dot - EXPORT_STYLE.layout.dotGapPt, lineGap: gap(EXPORT_STYLE.cardHeading.size) });
    doc.moveDown(EXPORT_STYLE.layout.afterCard);
    return;
  }
  if (block.kind === "titleSources") {
    doc.font(fontName("regular")).fontSize(EXPORT_STYLE.body.size).fillColor(EXPORT_STYLE.body.color)
      .text("Sources reviewed: ", { continued: true, lineGap: gap(EXPORT_STYLE.body.size) });
    block.names.forEach((name, index) => {
      const last = index === block.names.length - 1;
      doc.font(fontName("regular", true)).text(name, { continued: !last, lineGap: gap(EXPORT_STYLE.body.size) });
      if (!last) doc.font(fontName("regular")).text(", ", { continued: true });
    });
    return;
  }
  if (block.kind === "title") {
    doc.font(fontName(EXPORT_STYLE.title.weight)).fontSize(EXPORT_STYLE.title.size).fillColor(EXPORT_STYLE.title.color)
      .text(block.text, { lineGap: gap(EXPORT_STYLE.title.size) });
    return;
  }
  if (block.kind === "heading") {
    doc.moveDown(EXPORT_STYLE.section.spaceBefore / EXPORT_STYLE.body.size);
    doc.font(fontName(EXPORT_STYLE.section.weight)).fontSize(EXPORT_STYLE.section.size).fillColor(EXPORT_STYLE.section.color)
      .text(block.text, { lineGap: gap(EXPORT_STYLE.section.size) });
    doc.moveDown(EXPORT_STYLE.section.spaceAfter / EXPORT_STYLE.body.size);
    return;
  }
  if (block.kind === "summary") {
    const summary = block.summary;
    const rows = [summary.readiness, summary.facts, ...(summary.counts || []), summary.houseStyle, summary.editorial].filter(Boolean);
    const pad = EXPORT_STYLE.summary.paddingPt;
    const textWidth = width - pad * 2;
    const height = rows.reduce((sum, row) => sum + doc.font(fontName("regular")).fontSize(EXPORT_STYLE.body.size).heightOfString(row, { width: textWidth, lineGap: gap(EXPORT_STYLE.body.size) }), 0) + pad * 2;
    const top = doc.y;
    doc.save();
    doc.rect(margin, top, width, height).fill(EXPORT_STYLE.summary.fill);
    doc.restore();
    let y = top + pad;
    rows.forEach((row, index) => {
      doc.font(index === 0 ? fontName(EXPORT_STYLE.summary.labelWeight) : fontName("regular"))
        .fontSize(EXPORT_STYLE.body.size)
        .fillColor(EXPORT_STYLE.body.color)
        .text(row, margin + pad, y, { width: textWidth, lineGap: gap(EXPORT_STYLE.body.size) });
      y = doc.y;
    });
    doc.y = top + height + pad;
    return;
  }
  if (block.kind === "draft") {
    block.sentences.forEach((sentence, index) => {
      const more = index < block.sentences.length - 1 || sentence.marker;
      doc.font(fontName("regular")).fontSize(EXPORT_STYLE.body.size).fillColor(EXPORT_STYLE.body.color)
        .text(sentence.text, { continued: Boolean(sentence.marker), lineGap: gap(EXPORT_STYLE.body.size) });
      if (sentence.marker) {
        doc.font(fontName("regular")).fontSize(EXPORT_STYLE.superscript.size).fillColor(EXPORT_STYLE.superscript.color)
          .text(sentence.marker, { continued: index < block.sentences.length - 1, lineGap: 0 });
      }
      if (!more) doc.moveDown(EXPORT_STYLE.layout.afterSentence);
    });
    return;
  }
  if (block.kind === "quote") {
    doc.font(fontName("regular")).fontSize(EXPORT_STYLE.body.size).fillColor(EXPORT_STYLE.body.color)
      .text(`"${block.text}"`, { lineGap: gap(EXPORT_STYLE.body.size) });
    return;
  }
  if (block.kind === "passage" || block.kind === "also") {
    const indent = mmToPt(EXPORT_STYLE.passage.indentMm);
    const text = block.kind === "also" ? `${block.heading}: ${block.text}` : `${EXPORT_STYLE.bullet}  ${block.text}`;
    const start = doc.y;
    doc.font(fontName("regular", true)).fontSize(EXPORT_STYLE.body.size).fillColor(EXPORT_STYLE.body.color)
      .text(text, margin + indent, start, { width: width - indent, lineGap: gap(EXPORT_STYLE.body.size) });
    const end = doc.y;
    doc.moveTo(margin + 1, start).lineTo(margin + 1, end).strokeColor(EXPORT_STYLE.passage.rule).lineWidth(EXPORT_STYLE.passage.ruleWidthPt).stroke();
    if (block.lines) {
      doc.font(fontName("regular")).fontSize(EXPORT_STYLE.lineRef.size).fillColor(EXPORT_STYLE.lineRef.color)
        .text(block.lines, margin + indent, doc.y, { width: width - indent });
    }
    return;
  }
  if (block.kind === "source") {
    doc.font(fontName("regular", true)).fontSize(EXPORT_STYLE.body.size).fillColor(EXPORT_STYLE.body.color).text(block.name, { lineGap: gap(EXPORT_STYLE.body.size) });
    const detail = sourceDetail(block);
    if (detail) doc.font(fontName("regular")).text(detail, { lineGap: gap(EXPORT_STYLE.body.size) });
    if (block.description) doc.text(block.description, { lineGap: gap(EXPORT_STYLE.body.size) });
    doc.moveDown(EXPORT_STYLE.layout.afterSource);
    return;
  }
  if (block.kind === "disclaimer") return;
  doc.font(fontName("regular")).fontSize(EXPORT_STYLE.body.size).fillColor(EXPORT_STYLE.body.color)
    .text(block.text, { lineGap: gap(EXPORT_STYLE.body.size) });
}

function fileInfo(properties = {}) {
  const source = properties && typeof properties === "object" ? properties : {};
  const info = {};
  if (source.title) info.Title = source.title;
  if (source.subject) info.Subject = source.subject;
  if (source.author) info.Author = source.author;
  if (source.keywords) info.Keywords = source.keywords;
  if (source.creator) info.Creator = source.creator;
  return info;
}

export function renderPdf(document, sections) {
  const blocks = exportBlocks(document, sections);
  const margin = mmToPt(EXPORT_STYLE.page.marginMm);
  const doc = new PDFDocument({
    size: EXPORT_STYLE.page.size,
    margins: { top: margin, right: margin, bottom: margin, left: margin },
    bufferPages: true,
    compress: EXPORT_STYLE.compress,
    info: fileInfo(document.properties),
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  for (const block of blocks) paint(doc, block);
  const range = doc.bufferedPageRange();
  const disclaimer = blocks.find((block) => block.kind === "disclaimer");
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);
    if (i > 0) {
      doc.font(fontName("regular")).fontSize(EXPORT_STYLE.running.size).fillColor(EXPORT_STYLE.running.color)
        .text(document.header, margin, margin * EXPORT_STYLE.layout.headerBand, { width: doc.page.width - margin * 2, lineBreak: false });
    }
    const label = `Page ${i + 1} of ${range.count}`;
    doc.font(fontName("regular")).fontSize(EXPORT_STYLE.pageNumber.size).fillColor(EXPORT_STYLE.pageNumber.color)
      .text(label, margin, doc.page.height - margin / EXPORT_STYLE.layout.footerBand, { width: doc.page.width - margin * 2, align: "right", lineBreak: false });
    if (disclaimer && i === range.count - 1) {
      doc.font(fontName("regular")).fontSize(EXPORT_STYLE.disclaimer.size).fillColor(EXPORT_STYLE.disclaimer.color)
        .text(disclaimer.text, margin, doc.page.height - margin + EXPORT_STYLE.layout.disclaimerLiftPt, { width: doc.page.width - margin * 2 - EXPORT_STYLE.layout.pageNumberReservePt });
    }
  }
  doc.end();
  return finished;
}
