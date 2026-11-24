import {
  AlignmentType,
  Document,
  Footer,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  TextRun,
} from "docx";
import { exportBlocks, sourceDetail } from "./export-blocks.mjs";
import { EXPORT_STYLE, fontName, hexFill, lineTwips, mmToPt, ptToTwip } from "./export-style.mjs";

function run(text, { size, weight = "regular", italic = false, color = EXPORT_STYLE.body.color, superScript = false } = {}) {
  return new TextRun({
    text: String(text ?? ""),
    font: fontName(weight, italic),
    size: ptToTwip(size) / 10,
    bold: weight === "bold",
    italics: italic,
    color: hexFill(color),
    superScript,
  });
}

function paragraph(children, extra = {}) {
  return new Paragraph({
    children,
    spacing: { line: lineTwips(EXPORT_STYLE.body.lineHeight), lineRule: "auto" },
    ...extra,
  });
}

function blockParagraph(block) {
  if (block.kind === "titleSources") {
    const children = [run("Sources reviewed: ", { size: EXPORT_STYLE.body.size })];
    block.names.forEach((name, index) => {
      if (index > 0) children.push(run(", ", { size: EXPORT_STYLE.body.size }));
      children.push(run(name, { size: EXPORT_STYLE.body.size, italic: true }));
    });
    return paragraph(children);
  }
  if (block.kind === "title") {
    return paragraph([run(block.text, { size: EXPORT_STYLE.title.size, weight: EXPORT_STYLE.title.weight, color: EXPORT_STYLE.title.color })]);
  }
  if (block.kind === "heading") {
    return paragraph(
      [run(block.text, { size: EXPORT_STYLE.section.size, weight: EXPORT_STYLE.section.weight, color: EXPORT_STYLE.section.color })],
      { spacing: { before: ptToTwip(EXPORT_STYLE.section.spaceBefore), after: ptToTwip(EXPORT_STYLE.section.spaceAfter), line: lineTwips(EXPORT_STYLE.body.lineHeight), lineRule: "auto" } },
    );
  }
  if (block.kind === "cardHeading") {
    const color = EXPORT_STYLE.verdict[block.tone] || EXPORT_STYLE.verdict.green;
    return paragraph(
      [
        run("● ", { size: EXPORT_STYLE.cardHeading.size, color }),
        run(block.text, { size: EXPORT_STYLE.cardHeading.size, weight: EXPORT_STYLE.cardHeading.weight, color: EXPORT_STYLE.cardHeading.color }),
      ],
      { keepNext: true },
    );
  }
  if (block.kind === "quote") {
    return paragraph([run(`"${block.text}"`, { size: EXPORT_STYLE.body.size })]);
  }
  if (block.kind === "summary") {
    const summary = block.summary;
    const rows = [summary.readiness, summary.facts, ...(summary.counts || []), summary.houseStyle, summary.editorial].filter(Boolean);
    return rows.map((row, index) => paragraph(
      [run(row, { size: EXPORT_STYLE.body.size, weight: index === 0 ? EXPORT_STYLE.summary.labelWeight : "regular" })],
      { shading: { type: ShadingType.CLEAR, fill: hexFill(EXPORT_STYLE.summary.fill) } },
    ));
  }
  if (block.kind === "draft") {
    const children = [];
    for (const sentence of block.sentences) {
      children.push(run(sentence.text, { size: EXPORT_STYLE.body.size }));
      if (sentence.marker) {
        children.push(run(sentence.marker, { size: EXPORT_STYLE.superscript.size, color: EXPORT_STYLE.superscript.color, superScript: true }));
      }
    }
    return paragraph(children);
  }
  if (block.kind === "passage" || block.kind === "also") {
    const text = block.kind === "also" ? `${block.heading}: ${block.text}` : `${EXPORT_STYLE.bullet}  ${block.text}`;
    const rows = [
      paragraph(
        [run(text, { size: EXPORT_STYLE.body.size, italic: true })],
        { indent: { left: ptToTwip(mmToPt(EXPORT_STYLE.passage.indentMm)) } },
      ),
    ];
    if (block.lines) {
      rows.push(paragraph(
        [run(block.lines, { size: EXPORT_STYLE.lineRef.size, color: EXPORT_STYLE.lineRef.color })],
        { indent: { left: ptToTwip(mmToPt(EXPORT_STYLE.passage.indentMm)) } },
      ));
    }
    return rows;
  }
  if (block.kind === "source") {
    const rows = [
      paragraph([run(block.name, { size: EXPORT_STYLE.body.size, italic: true })]),
    ];
    const detail = sourceDetail(block);
    if (detail) rows.push(paragraph([run(detail, { size: EXPORT_STYLE.body.size })]));
    if (block.description) rows.push(paragraph([run(block.description, { size: EXPORT_STYLE.body.size })]));
    return rows;
  }
  if (block.kind === "disclaimer") {
    return paragraph([run(block.text, { size: EXPORT_STYLE.disclaimer.size, color: EXPORT_STYLE.disclaimer.color })]);
  }
  return paragraph([run(block.text, { size: EXPORT_STYLE.body.size })]);
}

export async function renderDocx(document, sections) {
  const blocks = exportBlocks(document, sections);
  const margin = ptToTwip(mmToPt(EXPORT_STYLE.page.marginMm));
  const children = blocks.flatMap((block) => {
    const made = blockParagraph(block);
    return Array.isArray(made) ? made : [made];
  });
  const header = new Header({
    children: [paragraph([run(document.header, { size: EXPORT_STYLE.running.size, color: EXPORT_STYLE.running.color })])],
  });
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        run("Page ", { size: EXPORT_STYLE.pageNumber.size, color: EXPORT_STYLE.pageNumber.color }),
        new TextRun({ children: [PageNumber.CURRENT], font: fontName("regular"), size: ptToTwip(EXPORT_STYLE.pageNumber.size) / 10, color: hexFill(EXPORT_STYLE.pageNumber.color) }),
        run(" of ", { size: EXPORT_STYLE.pageNumber.size, color: EXPORT_STYLE.pageNumber.color }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: fontName("regular"), size: ptToTwip(EXPORT_STYLE.pageNumber.size) / 10, color: hexFill(EXPORT_STYLE.pageNumber.color) }),
      ],
    })],
  });
  const properties = document.properties && typeof document.properties === "object" ? document.properties : {};
  const doc = new Document({
    ...(properties.title ? { title: properties.title } : {}),
    ...(properties.subject ? { subject: properties.subject } : {}),
    ...(properties.author ? { creator: properties.author } : {}),
    ...(properties.keywords ? { keywords: properties.keywords } : {}),
    ...(properties.creator ? { description: properties.creator } : {}),
    styles: {
      default: {
        document: {
          styles: [{ id: "Normal", run: { font: EXPORT_STYLE.font.family, size: ptToTwip(EXPORT_STYLE.body.size) / 10 } }],
        },
      },
    },
    sections: [{
      properties: {
        titlePage: true,
        page: {
          size: { width: ptToTwip(EXPORT_STYLE.page.widthPt), height: ptToTwip(EXPORT_STYLE.page.heightPt) },
          margin: { top: margin, right: margin, bottom: margin, left: margin },
        },
      },
      headers: { default: header },
      footers: { default: footer, first: footer },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
