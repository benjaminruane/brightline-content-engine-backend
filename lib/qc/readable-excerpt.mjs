/**
 * An extract is readable when it contains a letter or a digit.
 * A quotation mark, punctuation, or whitespace on its own is not an extract.
 */
export function excerptIsReadable(text) {
  return /[\p{L}\p{N}]/u.test(String(text ?? ""));
}
