/**
 * Print furniture: a line repeated across the document, a bare URL,
 * or a page counter. The text stays. Callers skip these lines as evidence.
 */

const REPEAT_AT = 3;

export function isBareUrl(line) {
  return /^https?:\/\/\S+$/i.test(String(line || "").trim());
}

export function isPageCounter(line) {
  return /^\d{1,4}\s*\/\s*\d{1,4}$/.test(String(line || "").trim());
}

/**
 * 0-based indexes of furniture lines.
 * A line that repeats 3 or more times is a running header or footer.
 * @param {string} text
 * @returns {number[]}
 */
export function pageFurnitureIndexes(text) {
  const lines = String(text || "").split("\n");
  const counts = new Map();
  for (const line of lines) {
    const key = line.trim();
    if (key.length < 12) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const indexes = [];
  lines.forEach((line, index) => {
    const key = line.trim();
    if (!key) return;
    if ((counts.get(key) || 0) >= REPEAT_AT || isBareUrl(key) || isPageCounter(key)) indexes.push(index);
  });
  return indexes;
}

export function lineIsFurniture(line, counts) {
  const key = String(line || "").trim();
  if (!key) return false;
  if (isBareUrl(key) || isPageCounter(key)) return true;
  return (counts?.get(key) || 0) >= REPEAT_AT;
}
