/**
 * B547. A figure confirmed only inside a detected table is not a confident green.
 */
import { lineIsTableRow } from "../pdf-table-rows.mjs";

export const TABLE_FIGURE_NOTE =
  "This figure was found in a table. Check it is in the right row and column.";

const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);

function figuresIn(text) {
  const found = String(text || "").match(/\d[\d,'’]*(?:\.\d+)?%?/g) || [];
  return [...new Set(found.map((token) => token.trim()).filter((token) => token.length >= 2 || token.endsWith("%")))];
}

export function confirmedOnlyByTable(statement, sourceText) {
  const figures = figuresIn(statement);
  if (!figures.length) return false;
  const lines = String(sourceText || "").split(/\n/);
  for (const figure of figures) {
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
