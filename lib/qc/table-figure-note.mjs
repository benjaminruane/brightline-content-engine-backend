/**
 * B547. A figure confirmed only inside a detected table is not a confident green.
 * B548. A figure the check could not place, which the reader confirms from a
 * table, is the same amber note. A reader conflict in that table is the conflict.
 * A figure absent from the source stays not in the source.
 */
import { lineIsTableRow, stripChartGlyphs } from "../pdf-table-rows.mjs";

export const TABLE_FIGURE_NOTE =
  "This figure was found in a table. Check it is in the right row and column.";

const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);
const EXCERPT_CAP = 400;

function figuresIn(text) {
  const found = String(text || "").match(/\d[\d,'’]*(?:\.\d+)?%?/g) || [];
  return [...new Set(found.map((token) => token.trim()).filter((token) => token.length >= 2 || token.endsWith("%")))];
}

function lineHasFigure(line, figure) {
  if (line.includes(figure)) return true;
  const bare = String(figure || "").replace(/%$/, "");
  return Boolean(bare) && bare !== figure && line.includes(bare);
}

function sourceLines(sourceText) {
  return stripChartGlyphs(sourceText).split(/\n/).map((line) => line.trim()).filter(Boolean);
}

/** Every figure in the statement sits on a detected table row. */
export function figureFoundInTable(statement, sourceText) {
  const figures = figuresIn(statement);
  if (!figures.length || typeof sourceText !== "string") return false;
  const lines = sourceLines(sourceText);
  return figures.every((figure) => lines.some((line) => lineIsTableRow(line) && lineHasFigure(line, figure)));
}

/** A claimed figure does not appear anywhere in the source. */
export function figureAbsentFromSource(statement, sourceText) {
  const figures = figuresIn(statement);
  if (!figures.length) return false;
  const text = stripChartGlyphs(sourceText);
  return figures.some((figure) => !lineHasFigure(text, figure));
}

/**
 * The reader confirmed a table figure the check could not place, or found a
 * conflict in that table. Null when the figure is absent, or this is not that case.
 */
export function tableFigureVerdict(statement, sourceText, note) {
  if (typeof sourceText !== "string") return null;
  if (!note || note.refused === true || typeof note.bucket !== "string") return null;
  const bucket = note.bucket.trim().toLowerCase();
  if (bucket !== "none" && bucket !== "conflicts") return null;
  if (figureAbsentFromSource(statement, sourceText)) return null;
  if (!figureFoundInTable(statement, sourceText)) return null;
  if (bucket === "none") {
    return {
      state: "note_withheld",
      tier: "light",
      setBy: { branch: "tableFigure", source: "table" },
      prose: TABLE_FIGURE_NOTE,
    };
  }
  const text = typeof note.text === "string" ? note.text.trim() : "";
  if (!text) return null;
  return {
    state: "conflicts",
    tier: "demands",
    setBy: { source: "note", bucket: "conflicts" },
    prose: text,
  };
}

function capExcerpt(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.length <= EXCERPT_CAP) return trimmed;
  const cut = trimmed.slice(0, EXCERPT_CAP);
  const line = cut.lastIndexOf("\n");
  if (line > 80) return cut.slice(0, line).trim();
  const word = cut.lastIndexOf(" ");
  return (word > 80 ? cut.slice(0, word) : cut).trim();
}

/**
 * The passage that bears on the statement. A table row that holds the figure
 * replaces an excerpt that does not. Other excerpts stay, and stay within the
 * same 400 character cap as a matched passage.
 */
export function excerptBearingOnStatement(statement, sourceText, current) {
  const cleanedCurrent = capExcerpt(stripChartGlyphs(typeof current === "string" ? current : ""));
  const figures = figuresIn(statement);
  if (!figures.length || typeof sourceText !== "string" || !sourceText.trim()) return cleanedCurrent;
  const lines = sourceLines(sourceText);
  const tableHits = lines.filter((line) => lineIsTableRow(line) && figures.some((figure) => lineHasFigure(line, figure)));
  const classMatch = String(statement || "").match(/\bclass\s+([A-Za-z])\b/);
  const letter = classMatch ? classMatch[1].toUpperCase() : "";
  let chosen = tableHits;
  if (letter) {
    const preferred = tableHits.filter((line) => new RegExp(`(?:^|\\|\\s*)${letter}(?:\\s*\\||\\s|$)`).test(line));
    if (preferred.length) chosen = preferred;
  }
  const currentBears = figures.some((figure) => lineHasFigure(cleanedCurrent, figure));
  if (currentBears && cleanedCurrent.length <= EXCERPT_CAP && !tableHits.length) return cleanedCurrent;
  if (!currentBears && chosen.length) return capExcerpt(chosen.join("\n"));
  if (currentBears && cleanedCurrent.length <= EXCERPT_CAP) return cleanedCurrent;
  if (chosen.length) return capExcerpt(chosen.join("\n"));
  const proseHits = lines.filter((line) => figures.some((figure) => lineHasFigure(line, figure)));
  if (proseHits.length) return capExcerpt(proseHits.slice(0, 2).join("\n"));
  return cleanedCurrent;
}

export function confirmedOnlyByTable(statement, sourceText) {
  const all = figuresIn(statement);
  const years = all.filter((token) => /^(?:19|20)\d{2}$/.test(token));
  const figures = all.filter((token) => !years.includes(token));
  const checked = figures.length ? figures : all;
  if (!checked.length) return false;
  const lines = String(sourceText || "").split(/\n/);
  for (const figure of checked) {
    const hits = lines.filter((line) => line.includes(figure));
    if (!hits.length) return false;
    if (hits.some((line) => !lineIsTableRow(line))) return false;
  }
  return true;
}

export function applyTableFigureCaution(card, sourceText) {
  if (!card || typeof card !== "object") return card;
  const state = card.sentenceState || card.statementVerdict?.state || "";
  if (!QUIET.has(state)) return card;
  const statement = typeof card.statement === "string" ? card.statement : "";
  if (!confirmedOnlyByTable(statement, sourceText)) return card;
  const verdict = {
    ...(card.statementVerdict && typeof card.statementVerdict === "object" ? card.statementVerdict : {}),
    state: "note_withheld",
    tier: "amber",
    setBy: { branch: "tableFigure", source: "table" },
  };
  return {
    ...card,
    sentenceState: "note_withheld",
    statementVerdict: verdict,
    displayedEvidenceProse: TABLE_FIGURE_NOTE,
    tableFigureNote: TABLE_FIGURE_NOTE,
  };
}
