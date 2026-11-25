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
  if (block.kind === "cardLabel") {
    doc.font(fontName("regular")).fontSize(EXPORT_STYLE.lineRef.size).fillColor(EXPORT_STYLE.lineRef.color)
      .text(block.text, { lineGap: gap(EXPORT_STYLE.lineRef.size) });
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
  if (block.kind === "summary" || block.kind === "howToRead") {
    const rows = block.kind === "summary"
      ? [block.summary.readiness, block.summary.facts, ...(block.summary.counts || []), block.summary.houseStyle, block.summary.editorial].filter(Boolean)
      : [block.title, ...block.labels, block.lineNote, block.disclaimer].filter(Boolean);
    const pad = EXPORT_STYLE.summary.paddingPt;
    const textWidth = width - pad * 2;
    const height = rows.reduce((sum, row, index) => {
      const size = block.kind === "howToRead" && index === rows.length - 1
        ? EXPORT_STYLE.disclaimer.size
        : EXPORT_STYLE.body.size;
      return sum + doc.font(fontName("regular")).fontSize(size).heightOfString(row, { width: textWidth, lineGap: gap(size) });
    }, 0) + pad * 2;
    const top = doc.y;
    if (top + height > doc.page.height - margin) doc.addPage();
    const boxTop = doc.y;
    doc.save();
    doc.rect(margin, boxTop, width, height).fill(EXPORT_STYLE.summary.fill);
    doc.restore();
    let y = boxTop + pad;
    rows.forEach((row, index) => {
      const italic = block.kind === "howToRead" && index === rows.length - 1;
      const size = italic ? EXPORT_STYLE.disclaimer.size : EXPORT_STYLE.body.size;
      doc.font(index === 0 ? fontName(EXPORT_STYLE.summary.labelWeight) : fontName("regular", italic))
        .fontSize(size)
        .fillColor(italic ? EXPORT_STYLE.disclaimer.color : EXPORT_STYLE.body.color)
        .text(row, margin + pad, y, { width: textWidth, lineGap: gap(size) });
      y = doc.y;
    });
    doc.y = boxTop + height + pad;
    return;
  }
  if (block.kind === "draft") {
    block.sentences.forEach((sentence, index) => {
      const more = index < block.sentences.length - 1;
      const parts = String(sentence.text || "").split(/\n\n+/);
      parts.forEach((part, partIndex) => {
        const piece = part.replace(/^\n+|\n+$/g, "");
        if (!piece && !sentence.marker) return;
        const lastPart = partIndex === parts.length - 1;
        const marker = lastPart ? String(sentence.marker || "") : "";
        doc.font(fontName("regular")).fontSize(EXPORT_STYLE.body.size);
        if (marker) {
          const markerWidth = doc.font(fontName("regular")).fontSize(EXPORT_STYLE.superscript.size).widthOfString(marker) + 2;
          doc.font(fontName("regular")).fontSize(EXPORT_STYLE.body.size).fillColor(EXPORT_STYLE.body.color)
            .text(piece, { continued: true, width: width - markerWidth, lineGap: gap(EXPORT_STYLE.body.size) });
          doc.font(fontName("regular")).fontSize(EXPORT_STYLE.superscript.size).fillColor(EXPORT_STYLE.superscript.color)
            .text(marker, { continued: more && lastPart, lineGap: 0 });
        } else {
          doc.fillColor(EXPORT_STYLE.body.color)
            .text(piece, { continued: more && lastPart, lineGap: gap(EXPORT_STYLE.body.size) });
        }
        if (!lastPart) doc.moveDown(EXPORT_STYLE.layout.afterSentence);
      });
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
    const body = block.inline || (block.kind === "also" ? `${block.heading}: ${block.text}` : block.text);
    const text = block.kind === "also" && !block.inline
      ? `${block.heading}: ${block.text}`
      : (block.kind === "also" ? `${block.heading}: ${body}` : `${EXPORT_STYLE.bullet}  ${body}`);
    const start = doc.y;
    doc.font(fontName("regular", true)).fontSize(EXPORT_STYLE.body.size).fillColor(EXPORT_STYLE.body.color)
      .text(text, margin + indent, start, { width: width - indent, lineGap: gap(EXPORT_STYLE.body.size) });
    const end = doc.y;
    doc.moveTo(margin + 1, start).lineTo(margin + 1, end).strokeColor(EXPORT_STYLE.passage.rule).lineWidth(EXPORT_STYLE.passage.ruleWidthPt).stroke();
    return;
  }
  if (block.kind === "source") {
    doc.font(fontName("regular", true)).fontSize(EXPORT_STYLE.body.size).fillColor(EXPORT_STYLE.body.color).text(block.name, { lineGap: gap(EXPORT_STYLE.body.size) });
    if (block.description) doc.font(fontName("regular")).text(block.description, { lineGap: gap(EXPORT_STYLE.body.size) });
    const detail = sourceDetail(block);
    if (detail) doc.font(fontName("regular")).text(detail, { lineGap: gap(EXPORT_STYLE.body.size) });
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
  // Keep page numbers inside the bottom margin band so footer .text() cannot open a blank page.
  const footerBand = Math.max(18, EXPORT_STYLE.pageNumber.size * 2);
  const doc = new PDFDocument({
    size: EXPORT_STYLE.page.size,
    margins: { top: margin, right: margin, bottom: margin + footerBand, left: margin },
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
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);
    if (i > 0 && document.header) {
      doc.font(fontName("regular")).fontSize(EXPORT_STYLE.running.size).fillColor(EXPORT_STYLE.running.color)
        .text(document.header, margin, margin * EXPORT_STYLE.layout.headerBand, {
          width: doc.page.width - margin * 2,
          lineBreak: false,
        });
    }
    const label = `Page ${i + 1} of ${range.count}`;
    const y = doc.page.height - margin - footerBand + 4;
    doc.font(fontName("regular")).fontSize(EXPORT_STYLE.pageNumber.size).fillColor(EXPORT_STYLE.pageNumber.color)
      .text(label, margin, y, {
        width: doc.page.width - margin * 2,
        align: "right",
        lineBreak: false,
      });
  }
  doc.end();
  return finished;
}
