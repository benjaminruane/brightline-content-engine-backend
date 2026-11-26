import PDFDocument from "pdfkit";
import { draftFlow, exportBlocks, sourceDetail } from "./export-blocks.mjs";
import { EXPORT_STYLE, fontName, mmToPt } from "./export-style.mjs";

function gap(size) {
  return size * (EXPORT_STYLE.body.lineHeight - 1);
}

function contentBottom(doc, margin) {
  return doc.page.height - margin - Math.max(18, EXPORT_STYLE.pageNumber.size * 2);
}

function ensureRoom(doc, margin, needed) {
  if (doc.y + needed > contentBottom(doc, margin)) doc.addPage();
}

function paint(doc, block, next) {
  const margin = mmToPt(EXPORT_STYLE.page.marginMm);
  const width = doc.page.width - margin * 2;
  if (block.kind === "cardHeading") {
    const statementSpace = EXPORT_STYLE.body.size * 4 + EXPORT_STYLE.cardHeading.size * 2;
    ensureRoom(doc, margin, statementSpace);
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
  if (block.kind === "assessmentPill") {
    const color = EXPORT_STYLE.verdict[block.tone] || EXPORT_STYLE.verdict.green;
    const padX = EXPORT_STYLE.assessmentPill.padX;
    const padY = EXPORT_STYLE.assessmentPill.padY;
    const size = EXPORT_STYLE.body.size;
    const textW = doc.font(fontName("bold")).fontSize(size).widthOfString(block.text) + padX * 2;
    const textH = size + padY * 2;
    ensureRoom(doc, margin, textH + 6);
    const x = margin;
    const y = doc.y;
    doc.save();
    doc.roundedRect(x, y, textW, textH, EXPORT_STYLE.assessmentPill.radius).fill(color);
    doc.fillColor(EXPORT_STYLE.assessmentPill.text).font(fontName("bold")).fontSize(size)
      .text(block.text, x + padX, y + padY, { width: textW - padX * 2, lineGap: 0 });
    doc.restore();
    doc.y = y + textH + 8;
    return;
  }
  if (block.kind === "spacer") {
    doc.moveDown(Number(block.size) || 1);
    return;
  }
  if (block.kind === "heading") {
    const nextKind = next?.kind || "";
    const keep = nextKind === "summary" || nextKind === "howToRead" || nextKind === "draft"
      || nextKind === "body" || nextKind === "source" || nextKind === "cardHeading";
    if (keep) {
      const headingH = EXPORT_STYLE.section.size * EXPORT_STYLE.body.lineHeight
        + EXPORT_STYLE.section.spaceBefore + EXPORT_STYLE.section.spaceAfter;
      const follow = nextKind === "summary" || nextKind === "howToRead"
        ? EXPORT_STYLE.body.size * 6
        : EXPORT_STYLE.body.size * 3;
      ensureRoom(doc, margin, headingH + follow);
    }
    doc.moveDown(EXPORT_STYLE.section.spaceBefore / EXPORT_STYLE.body.size);
    doc.font(fontName(EXPORT_STYLE.section.weight)).fontSize(EXPORT_STYLE.section.size).fillColor(EXPORT_STYLE.section.color)
      .text(block.text, { lineGap: gap(EXPORT_STYLE.section.size) });
    doc.moveDown(EXPORT_STYLE.section.spaceAfter / EXPORT_STYLE.body.size);
    return;
  }
  if (block.kind === "summary" || block.kind === "howToRead") {
    const rows = block.kind === "summary"
      ? (Array.isArray(block.rows) ? block.rows : [
        block.summary?.readiness,
        block.summary?.facts,
        ...(block.summary?.counts || []),
        block.summary?.houseStyle,
        block.summary?.editorial,
      ].filter(Boolean))
      // B602 F24: bullets in How to read this review.
      : [
        block.title,
        ...(block.labels || []).map((label) => `• ${label}`),
        block.lineNote,
        block.disclaimer,
      ].filter(Boolean);
    const pad = EXPORT_STYLE.summary.paddingPt;
    const textWidth = width - pad * 2;
    const height = rows.reduce((sum, row, index) => {
      const size = block.kind === "howToRead" && index === rows.length - 1
        ? EXPORT_STYLE.disclaimer.size
        : EXPORT_STYLE.body.size;
      return sum + doc.font(fontName("regular")).fontSize(size).heightOfString(row, { width: textWidth, lineGap: gap(size) });
    }, 0) + pad * 2;
    ensureRoom(doc, margin, height);
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
    // B595 / F11. One continued run per line; last segment uses continued:false.
    // "\n" starts a new line; "\n\n" adds the paragraph gap. No overlapping lines.
    const events = draftFlow(block.sentences, block.fullDraft || "");
    const lineGap = gap(EXPORT_STYLE.body.size);
    const marginX = mmToPt(EXPORT_STYLE.page.marginMm);
    const size = EXPORT_STYLE.body.size;
    // B602 F24: light shaded background behind the draft text.
    const draftText = typeof block.fullDraft === "string"
      ? block.fullDraft
      : (Array.isArray(block.sentences) ? block.sentences.map((row) => row?.text || "").join("") : "");
    const shadeH = Math.min(
      doc.heightOfString(draftText || " ", { width, lineGap }) + 16,
      contentBottom(doc, margin) - doc.y,
    );
    if (shadeH > 8) {
      doc.save();
      doc.rect(margin - 4, doc.y - 4, width + 8, shadeH).fill(EXPORT_STYLE.draftShade.fill);
      doc.restore();
    }
    let pending = [];
    let pendingBreaks = 0;
    const paintSeg = (seg, continued) => {
      if (seg.kind === "marker") {
        doc.font(fontName("regular")).fontSize(EXPORT_STYLE.superscript.size).fillColor(EXPORT_STYLE.superscript.color)
          .text(seg.text, { continued: true, lineGap: 0 });
        return;
      }
      doc.font(fontName("regular")).fontSize(size).fillColor(EXPORT_STYLE.body.color)
        .text(seg.text || " ", { continued, lineGap });
    };
    const flushLine = () => {
      if (!pending.length) return;
      const yBefore = doc.y;
      const textWidth = doc.page.width - marginX * 2;
      // Keep every content segment continued; close the run with a body-sized
      // empty end so a trailing S-marker cannot leave Y unmoved (F11 overlap).
      pending.forEach((seg) => paintSeg(seg, true));
      doc.font(fontName("regular")).fontSize(size).fillColor(EXPORT_STYLE.body.color)
        .text("", { continued: false, lineGap });
      doc.x = marginX;
      // Measure the body ink so a mid-run S-marker cannot leave Y above the
      // wrapped paragraph (B598 Read-more overlap on long runs).
      const bodyText = pending
        .filter((seg) => seg.kind !== "marker")
        .map((seg) => seg.text || "")
        .join("");
      doc.font(fontName("regular")).fontSize(size);
      const ink = bodyText
        ? doc.heightOfString(bodyText, { width: textWidth, lineGap })
        : size * 1.15;
      const floor = yBefore + Math.max(ink, size * 1.15);
      if (doc.y < floor) doc.y = floor;
      pending = [];
    };
    // B598: one break = new line; two or more = paragraph gap (~0.7 line).
    const paragraphGap = () => {
      doc.x = marginX;
      doc.font(fontName("regular")).fontSize(size);
      doc.moveDown(0.7);
    };
    for (const event of events) {
      if (event.kind === "break") {
        flushLine();
        pendingBreaks += 1;
        continue;
      }
      if (pendingBreaks >= 2) {
        paragraphGap();
      }
      pendingBreaks = 0;
      pending.push(event);
    }
    flushLine();
    if (pendingBreaks >= 2) paragraphGap();
    doc.moveDown(EXPORT_STYLE.layout.afterSentence);
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
    const badge = block.number != null && Number.isFinite(Number(block.number))
      ? `${Number(block.number)}. `
      : "";
    doc.font(fontName("regular", true)).fontSize(EXPORT_STYLE.body.size).fillColor(EXPORT_STYLE.body.color)
      .text(`${badge}${block.name}`, { lineGap: gap(EXPORT_STYLE.body.size) });
    if (block.summary) {
      doc.font(fontName("regular")).fontSize(EXPORT_STYLE.body.size).fillColor(EXPORT_STYLE.lineRef.color)
        .text(block.summary, { lineGap: gap(EXPORT_STYLE.body.size) });
    }
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

/**
 * Write page numbers inside the bottom margin without letting PDFKit open a new page.
 * Footer .text() below maxY is what created the blank "Page n of k" pages.
 */
function paintFooters(doc, document, margin, footerBand) {
  const range = doc.bufferedPageRange();
  const pageCount = range.count;
  for (let i = 0; i < pageCount; i += 1) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    if (i > 0 && document.header) {
      doc.font(fontName("regular")).fontSize(EXPORT_STYLE.running.size).fillColor(EXPORT_STYLE.running.color)
        .text(document.header, margin, margin * EXPORT_STYLE.layout.headerBand, {
          width: doc.page.width - margin * 2,
          lineBreak: false,
        });
    }
    const label = `Page ${i + 1} of ${pageCount}`;
    const y = doc.page.height - margin - footerBand + 4;
    doc.font(fontName("regular")).fontSize(EXPORT_STYLE.pageNumber.size).fillColor(EXPORT_STYLE.pageNumber.color)
      .text(label, margin, y, {
        width: doc.page.width - margin * 2,
        align: "right",
        lineBreak: false,
        height: EXPORT_STYLE.pageNumber.size + 2,
      });
    doc.page.margins.bottom = savedBottom;
  }
  return pageCount;
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
  for (let i = 0; i < blocks.length; i += 1) {
    paint(doc, blocks[i], blocks[i + 1]);
  }
  paintFooters(doc, document, margin, footerBand);
  doc.end();
  return finished;
}

/** Content page count after render. Used by tests to assert no footer-only pages. */
export async function renderPdfPageCount(document, sections) {
  const blocks = exportBlocks(document, sections);
  const margin = mmToPt(EXPORT_STYLE.page.marginMm);
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
    doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), pageCount: null }));
    doc.on("error", reject);
  });
  for (let i = 0; i < blocks.length; i += 1) {
    paint(doc, blocks[i], blocks[i + 1]);
  }
  const beforeFooters = doc.bufferedPageRange().count;
  const afterFooters = paintFooters(doc, document, margin, footerBand);
  doc.end();
  const { buffer } = await finished;
  return { buffer, contentPages: beforeFooters, pageCount: afterFooters, footerOnlyPages: afterFooters - beforeFooters };
}
