/**
 * B607. Also-appears / conflict passages use the same joined-source line
 * numbering as the screen (resolveCardExcerpts / sourceNumberForLine).
 * Stage 4 line ids are per source document; remapping them onto the joined
 * corpus is wrong. Locate the passage text in the joined sources instead.
 */
import { sourceLineIndex } from "./source-lines.mjs";

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Same join the Assess screen uses for sourceText. */
export function joinSourceTexts(sources) {
  const texts = Array.isArray(sources)
    ? sources.map((row) => (typeof row === "string" ? row : (row?.text || row?.content || ""))).filter((t) => typeof t === "string")
    : [];
  return texts.join("\n");
}

/**
 * Which source (1-based) a joined line id belongs to. B612: also returns 1 for
 * a single source when the id belongs to it.
 */
export function sourceNumberForLine(sourceTexts, lineId) {
  const texts = Array.isArray(sourceTexts) ? sourceTexts : [];
  if (texts.length < 1) return null;
  const match = /^L(\d+)$/.exec(String(lineId || ""));
  if (!match) return null;
  const wanted = Number(match[1]);
  let before = 0;
  for (let i = 0; i < texts.length; i += 1) {
    const count = sourceLineIndex(typeof texts[i] === "string" ? texts[i] : "")
      .filter((row) => !row.empty).length;
    if (wanted <= before + count) return i + 1;
    before += count;
  }
  return null;
}

/**
 * Find the joined-corpus line that carries this passage. Prefer an exact
 * indexOf hit; otherwise the line that contains the longest shared head.
 */
export function locatePassageLine(joinedText, passage) {
  const needle = clean(passage);
  if (!needle || typeof joinedText !== "string" || !joinedText) return null;
  const rows = sourceLineIndex(joinedText);
  const flatJoin = joinedText;
  const at = flatJoin.indexOf(needle);
  if (at >= 0) {
    return rows.find((row) => row.id && at >= row.start && at < row.end) || null;
  }
  // Passage may be a normalised single line while the source wraps.
  const compactNeedle = needle.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const row of rows) {
    if (!row.id) continue;
    const hay = clean(row.text).toLowerCase();
    if (!hay) continue;
    if (hay.includes(compactNeedle) || compactNeedle.includes(hay)) {
      const score = Math.min(hay.length, compactNeedle.length);
      if (score > bestScore) {
        best = row;
        bestScore = score;
      }
      continue;
    }
    // Shared head of at least 40 characters.
    const headLen = Math.min(64, compactNeedle.length);
    for (let n = headLen; n >= 40; n -= 1) {
      if (hay.includes(compactNeedle.slice(0, n))) {
        if (n > bestScore) {
          best = row;
          bestScore = n;
        }
        break;
      }
    }
  }
  return best;
}

function passageOfConflict(card) {
  const conflict = card?.conflictExcerpt;
  if (typeof conflict === "string") return clean(conflict);
  if (conflict && typeof conflict === "object") {
    return clean(conflict.passage || conflict.text || "");
  }
  return clean(card?.alsoRelevant || card?.alsoRelevantText || "");
}

/**
 * Stamp conflict / also-appears line ids from the joined sources the screen uses.
 * Leaves the passage text untouched.
 */
export function resolveAlsoAppearsAgainstSources(card, sources) {
  if (!card || typeof card !== "object") return card;
  const texts = Array.isArray(sources)
    ? sources.map((row) => (typeof row === "string" ? row : (row?.text || row?.content || ""))).filter((t) => typeof t === "string" && t.length)
    : [];
  if (!texts.length) return card;
  const joined = joinSourceTexts(texts);
  const passage = passageOfConflict(card);
  if (!passage) return card;
  const located = locatePassageLine(joined, passage);
  if (!located?.id) return card;
  const lineIds = [located.id];
  const sourceNumber = sourceNumberForLine(texts, located.id);
  const next = { ...card, alsoRelevantLineIds: lineIds };
  if (card.conflictExcerpt && typeof card.conflictExcerpt === "object") {
    next.conflictExcerpt = {
      ...card.conflictExcerpt,
      lineIds,
      ...(Number.isInteger(sourceNumber) ? { sourceNumber } : {}),
    };
  } else if (typeof card.conflictExcerpt === "string") {
    next.conflictExcerpt = {
      passage: card.conflictExcerpt,
      lineIds,
      ...(Number.isInteger(sourceNumber) ? { sourceNumber } : {}),
    };
  } else if (clean(card.alsoRelevant || card.alsoRelevantText)) {
    next.alsoRelevant = clean(card.alsoRelevant || card.alsoRelevantText);
  }
  return next;
}
