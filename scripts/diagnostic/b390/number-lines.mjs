/**
 * B390. Prefix every non-blank line with a stable id, from 1.
 * Blank lines are skipped and do not consume an id.
 * The lookup value is the original line, without the prefix and without the newline.
 */

export function numberLines(text) {
  const raw = String(text ?? "");
  const lines = raw.split("\n");
  if (lines.length && lines[lines.length - 1] === "" && raw.endsWith("\n")) lines.pop();
  const lookup = new Map();
  const numbered = [];
  let id = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    id += 1;
    lookup.set(id, line);
    numbered.push(`${id}\t${line}`);
  }
  return { text: numbered.join("\n"), lookup, maxId: id };
}

export function lineCount(lookup) {
  return lookup instanceof Map ? lookup.size : 0;
}
