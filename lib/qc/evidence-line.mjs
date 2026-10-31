/**
 * B457. The one evidence line.
 *
 * The reader's note is the line when it has text. A refused note is not
 * explained. When there is nothing to report, the line names the source
 * file and quotes the passage, and it stops. It does not say the passage
 * supports the statement.
 */

const INTERNAL_REJECTION = /^A note (?:was written|on the draft was written)/;

export function quoteIsVerbatim(quote, sources) {
  const text = typeof quote === "string" ? quote : "";
  if (!text) return false;
  const list = Array.isArray(sources) ? sources : [];
  return list.some((source) => typeof source?.text === "string" && source.text.includes(text));
}

export function evidenceLine({ fileName, quote, noteText } = {}) {
  const note = typeof noteText === "string" ? noteText.trim() : "";
  if (note && !INTERNAL_REJECTION.test(note)) return note;
  const passage = typeof quote === "string" ? quote.trim() : "";
  if (!passage) {
    console.warn("[evidence-line] passage is missing");
    return "";
  }
  const name = typeof fileName === "string" ? fileName.trim().replace(/\.(pdf|txt|docx)$/i, "") : "";
  if (!name) {
    console.warn("[evidence-line] source filename is missing");
    return `The source states "${passage}".`;
  }
  return `${name} states "${passage}".`;
}
