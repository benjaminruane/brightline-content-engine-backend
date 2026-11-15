// The Methodology Note instruction. One owner. The frontend mirrors the delimiter.

export const METHODOLOGY_DELIMITER = "---METHODOLOGY---";

export function methodologyNoteInstruction() {
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
supported by the provided sources.`;
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
