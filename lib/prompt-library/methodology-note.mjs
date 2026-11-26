// The Methodology Note instruction. One owner. The frontend mirrors the delimiter.

export const METHODOLOGY_DELIMITER = "---METHODOLOGY---";

export function conflictingFigureInstruction() {
  return `Where the sources, or one source, give different figures for the valuation or the stake, use one version of the terms throughout. Do not combine figures from different versions (for example a USD 25 million pre-money with the 20% stake that goes with USD 20 million). Prefer the most specific or final statement, such as the deal terms section or the latest-dated source. The Methodology Note names the choice, for example: "The memo gives two pre-money valuations ($20mm and $25mm). The draft uses $25mm from the Deal section." The review is expected to flag the disagreement.`;
}

export function methodologyNoteInstruction(eventType) {
  const choice = eventType === "NEW_DIRECT_INVESTMENT" || eventType === "ADD_ON_DIRECT_INVESTMENT"
    ? `\n\n${conflictingFigureInstruction()}`
    : "";
  return `Output format (required):
1. Write the transaction commentary first.
2. After the commentary, on its own line, output exactly: ${METHODOLOGY_DELIMITER}
3. Then write the Methodology Note: 1 paragraph, as concise as possible and never more than 80 words,
professional, factual, neutral, framed for audit transparency (not process narration).
Briefly explain the overall approach and how source materials were used; summarise how
the text was constructed (synthesis of sources / provided draft as base / creation from
scratch); highlight key enhancements (financial or operational substance; clarity,
structure, and narrative flow; alignment with the writing guidelines); confirm
adherence to any specific instructions or constraints; introduce no information not
supported by the provided sources. Describe only what the draft actually contains. Do not say a point was covered if the commentary does not state it. Do not describe another author's views as the firm's.${choice}`;
}

/** The same note, worded for general writing. The investment instruction above is unchanged. */
export function generalMethodologyNoteInstruction() {
  return `Output format (required):
1. Write the text first.
2. After the text, on its own line, output exactly: ${METHODOLOGY_DELIMITER}
3. Then write the Methodology Note: 1 paragraph, as concise as possible and never more than 80 words,
professional, factual, and neutral.
Briefly explain how the sources were used and how the text was put together.
Introduce no information that the sources do not support. Describe only what the draft actually contains. Do not say a point was covered if the text does not state it. Do not describe another author's views as the firm's.`;
}

/** Commentary is the draft. The note is never part of the draft. */
export function splitMethodologyOutput(raw) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { commentary: "", methodologyNote: "" };
  const idx = text.indexOf(METHODOLOGY_DELIMITER);
  if (idx < 0) return { commentary: text, methodologyNote: "" };
  return {
    commentary: text.slice(0, idx).trim(),
    methodologyNote: text.slice(idx + METHODOLOGY_DELIMITER.length).trim(),
  };
}
