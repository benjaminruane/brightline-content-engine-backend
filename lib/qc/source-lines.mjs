/**
 * One numbering for cards, passages, reading facts, line refs, and the drawer.
 * A line with no text is not numbered. The next line of text takes the next number.
 */

export function sourceLineIndex(sourceText) {
  if (typeof sourceText !== "string") {
    throw new Error("sourceLineIndex: sourceText is missing");
  }
  const parts = sourceText.split("\n");
  let cursor = 0;
  let count = 0;
  return parts.map((text) => {
    const body = text.replace(/\r$/, "");
    const start = cursor;
    const end = start + text.length;
    cursor = end + 1;
    const empty = body.trim() === "";
    return {
      id: empty ? "" : `L${++count}`,
      text: body,
      start,
      end,
      empty,
    };
  });
}
