/**
 * B549. One source that gives two figures for the same thing.
 * The card stays red and names both. The excerpt shows both passages.
 * A table of months is not this case: the shared label has to be a
 * hyphenated word from the statement, sitting next to each figure.
 */

const MONEY = /(?:USD|GBP|EUR|\$|£|€)\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(mm|m|mn|million|bn|billion|k|thousand))?|(\d[\d,]*(?:\.\d+)?)\s+(mm|million|bn|billion|thousand)\b/gi;
const EXCERPT_CAP = 400;

function fold(raw, scale) {
  const value = Number(String(raw || "").replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = String(scale || "").toLowerCase();
  if (unit === "mm" || unit === "m" || unit === "mn" || unit === "million") return value * 1e6;
  if (unit === "bn" || unit === "billion") return value * 1e9;
  if (unit === "k" || unit === "thousand") return value * 1e3;
  return null;
}

function moneyHits(text) {
  const hits = [];
  for (const match of String(text || "").matchAll(MONEY)) {
    const raw = match[1] || match[3];
    const scale = match[2] || match[4] || "";
    const folded = fold(raw, scale);
    if (folded == null) continue;
    const after = String(text).slice(match.index + match[0].length, match.index + match[0].length + 2);
    if (after.trim().startsWith("%")) continue;
    hits.push({
      folded,
      display: match[0].replace(/\s+/g, " ").trim(),
      index: match.index,
    });
  }
  return hits;
}

function labelsIn(text) {
  return [...String(text || "").matchAll(/\b[a-z]{2,}(?:-[a-z]{2,})+\b/gi)].map((match) => match[0].toLowerCase());
}

function nearestMoney(line, label) {
  const at = line.toLowerCase().indexOf(label);
  if (at < 0) return null;
  const hits = moneyHits(line).filter((hit) => hit.index < at + label.length);
  if (!hits.length) return null;
  return hits.sort((a, b) => Math.abs(at - a.index) - Math.abs(at - b.index))[0];
}

function cap(text) {
  const trimmed = String(text || "").replace(/\s+/g, " ").trim();
  if (trimmed.length <= EXCERPT_CAP) return trimmed;
  const cut = trimmed.slice(0, EXCERPT_CAP);
  const word = cut.lastIndexOf(" ");
  return (word > 80 ? cut.slice(0, word) : cut).trim();
}

function headingBefore(lines, index) {
  for (let cursor = index - 1; cursor >= 0 && cursor >= index - 3; cursor -= 1) {
    const text = lines[cursor].trim();
    if (!text) continue;
    if (/\d/.test(text) || text.length > 40) return "";
    const words = text.split(/\s+/);
    if (words.length > 3) return "";
    return words.join(" ");
  }
  return "";
}

/**
 * Null when the source does not give two figures for one labelled thing.
 * Otherwise the sentence and the two passages.
 */
export function sameSourceDisagreement(statement, sourceText) {
  if (typeof statement !== "string" || typeof sourceText !== "string") return null;
  const labels = labelsIn(statement);
  if (!labels.length) return null;
  const lines = sourceText.split("\n");
  for (const label of labels) {
    const rows = [];
    lines.forEach((line, index) => {
      if (!line.toLowerCase().includes(label)) return;
      const money = nearestMoney(line, label);
      if (!money) return;
      rows.push({
        line: index + 1,
        text: line.trim(),
        folded: money.folded,
        display: money.display,
        section: headingBefore(lines, index),
      });
    });
    const distinct = [];
    for (const row of rows) {
      if (!distinct.some((item) => item.folded === row.folded)) distinct.push(row);
    }
    if (distinct.length < 2) continue;
    const claimed = moneyHits(statement).find((hit) => distinct.some((row) => row.folded === hit.folded));
    if (!claimed) continue;
    const ordered = [...distinct].sort((a, b) => a.line - b.line);
    const earlier = ordered[0];
    const later = ordered[1];
    const draftIsEarlier = claimed.folded === earlier.folded;
    const laterWhere = later.section
      ? `${later.display} in the ${later.section} section (line ${later.line})`
      : `${later.display} (line ${later.line})`;
    const prose = `The source gives two ${label} figures: ${earlier.display} (line ${earlier.line}) and ${laterWhere}. The draft uses the ${draftIsEarlier ? "earlier" : "later"} one. Check which is final.`;
    const second = draftIsEarlier ? later : earlier;
    const first = draftIsEarlier ? earlier : later;
    const secondText = cap(second.text);
    const excerpt = [
      cap(first.text),
      `Also in the source (line ${second.line}${second.section ? `, ${second.section}` : ""}): ${secondText}`,
    ].join("\n\n");
    return { prose, excerpt, secondPassage: secondText, label, earlier, later };
  }
  return null;
}

/** A line the reason cites that the current excerpt does not already show. */
export function passageCitedByReason(reason, sourceText, current) {
  const note = typeof reason === "string" ? reason : "";
  const shown = typeof current === "string" ? current : "";
  if (!note.trim() || typeof sourceText !== "string") return null;
  const wanted = moneyHits(note).filter((hit) => !shown.includes(hit.display));
  if (!wanted.length) return null;
  const lines = sourceText.split("\n");
  for (const hit of wanted) {
    const index = lines.findIndex((line) => line.includes(hit.display));
    if (index < 0) continue;
    const text = cap(lines[index]);
    if (!text || shown.includes(text)) continue;
    return { line: index + 1, text };
  }
  return null;
}
