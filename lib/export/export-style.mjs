/**
 * The only style values the PDF and Word export renderers may use.
 * Verdict borders match the card edge in the frontend verdict colour definition.
 */

export const EXPORT_STYLE = {
  page: { size: "A4", widthPt: 595.28, heightPt: 841.89, marginMm: 20 },
  font: {
    family: "Helvetica",
    bold: "Helvetica-Bold",
    italic: "Helvetica-Oblique",
  },
  body: { size: 10.5, lineHeight: 1.4, color: "#1e293b" },
  title: { size: 18, weight: "bold", color: "#1e293b" },
  section: { size: 12.5, weight: "bold", color: "#1e3a5f", spaceBefore: 14, spaceAfter: 6 },
  cardHeading: { size: 10.5, weight: "bold", color: "#1e293b", dotMm: 2.2 },
  summary: { fill: "#f1f5f9", paddingPt: 8, labelWeight: "bold" },
  passage: { indentMm: 6, rule: "#cbd5e1", ruleWidthPt: 0.6 },
  lineRef: { size: 8.5, color: "#64748b" },
  superscript: { size: 7, color: "#64748b" },
  running: { size: 8, color: "#64748b" },
  disclaimer: { size: 7.5, color: "#64748b" },
  pageNumber: { size: 8, color: "#64748b" },
  verdict: { green: "#16a34a", amber: "#d97706", red: "#c0444a" },
  layout: {
    dotGapPt: 4,
    headingLiftPt: 2,
    afterCard: 0.2,
    afterSentence: 0.15,
    afterSource: 0.3,
    headerBand: 0.5,
    footerBand: 1.4,
    disclaimerLiftPt: 4,
    pageNumberReservePt: 70,
    keepWithLines: 3,
  },
  separator: " · ",
  bullet: "•",
  compress: false,
};

export function mmToPt(mm) {
  const n = Number(mm);
  if (!Number.isFinite(n)) throw new Error("export style: a millimetre value is missing");
  return (n * 72) / 25.4;
}

export function ptToTwip(points) {
  const n = Number(points);
  if (!Number.isFinite(n)) throw new Error("export style: a point size is missing");
  return Math.round(n * 20);
}

export function lineTwips(lineHeight) {
  const n = Number(lineHeight);
  if (!Number.isFinite(n) || n <= 0) throw new Error("export style: the line height is missing");
  return Math.round(n * 240);
}

export function hexFill(color) {
  const value = String(color || "").trim();
  if (!value.startsWith("#")) throw new Error("export style: a colour is missing");
  return value.slice(1);
}

export function fontName(weight, italic = false) {
  if (italic) return EXPORT_STYLE.font.italic;
  if (weight === "bold") return EXPORT_STYLE.font.bold;
  return EXPORT_STYLE.font.family;
}
