/**
 * Deterministic punctuation tidy after a clause cut. Deletions only; remaps
 * marker offsets. Does not parse grammar. Does not change KIND HANDLING,
 * declared intent, or the honesty check.
 *
 * Known inconsistency (logged, not repaired): at pr9-marker-intent, F10 labelled
 * a clause-cut CHANGED rather than CUT because the marker wrapped the surviving
 * sentence instead of a remnant. Honesty passes either way. Intent does not
 * reliably distinguish a rewrite from a removal if the UI wants to show those
 * two differently.
 */

export const KNOWN_INCONSISTENCY_CUT_WRAPPED_AS_CHANGED =
  "F10 at pr9-marker-intent labelled a clause-cut CHANGED rather than CUT because the marker wrapped the surviving sentence rather than a remnant. Honesty passes either way; intent does not reliably distinguish a rewrite from a removal.";

const JOINER_BEFORE_TERMINAL_RE = /[,;:][.!?]/g;
const SPACE_BEFORE_PUNCT_RE = /[ \t]+[,.;:!?]/g;
const DOUBLED_SPACES_RE = /[ \t]{2,}/g;
const DOUBLED_JOINS_RE = /([,;:!?])\1+/g;
const DOUBLED_PERIODS_NOT_ELLIPSIS_RE = /(?<!\.)\.\.(?!\.)/g;
const DANGLING_CONJUNCTION_RE = /(?:^|[ \t])(and|or|but|nor|with)[ \t]*[.!?]/g;

/**
 * Current-string indices to drop this round. Deletions only.
 * @param {string} cur
 * @returns {Set<number>}
 */
function findDeletions(cur) {
  const drop = new Set();
  function mark(start, end) {
    const from = Math.max(0, start);
    const to = Math.min(cur.length, end);
    for (let i = from; i < to; i++) drop.add(i);
  }

  for (const match of cur.matchAll(DOUBLED_SPACES_RE)) {
    mark(match.index + 1, match.index + match[0].length);
  }
  for (const match of cur.matchAll(SPACE_BEFORE_PUNCT_RE)) {
    mark(match.index, match.index + match[0].length - 1);
  }
  for (const match of cur.matchAll(JOINER_BEFORE_TERMINAL_RE)) {
    mark(match.index, match.index + 1);
  }
  for (const match of cur.matchAll(DOUBLED_JOINS_RE)) {
    mark(match.index + 1, match.index + match[0].length);
  }
  for (const match of cur.matchAll(DOUBLED_PERIODS_NOT_ELLIPSIS_RE)) {
    mark(match.index + 1, match.index + 2);
  }
  for (const match of cur.matchAll(DANGLING_CONJUNCTION_RE)) {
    const full = match[0];
    const prefix = /^[ \t]/.test(full) ? 1 : 0;
    mark(match.index + prefix, match.index + full.length - 1);
  }
  return drop;
}

/**
 * @param {string} text
 * @returns {{ text: string, map: number[] }}
 */
export function normalizeCutPunctuation(text) {
  const source = typeof text === "string" ? text : "";
  const keep = new Array(source.length).fill(true);

  for (let guard = 0; guard < 16; guard++) {
    let cur = "";
    const origAt = [];
    for (let i = 0; i < source.length; i++) {
      if (!keep[i]) continue;
      origAt.push(i);
      cur += source[i];
    }
    const drop = findDeletions(cur);
    if (drop.size === 0) break;
    for (const ci of drop) {
      const orig = origAt[ci];
      if (orig != null) keep[orig] = false;
    }
  }

  let out = "";
  const map = new Array(source.length + 1);
  for (let i = 0; i <= source.length; i++) {
    map[i] = out.length;
    if (i < source.length && keep[i]) out += source[i];
  }
  return { text: out, map };
}

function snapCollapsedMarker(text, start, end) {
  if (end > start) return { start, end };
  let i = Math.max(0, Math.min(text.length, start));
  while (i > 0 && /[ \t]/.test(text[i - 1])) i -= 1;
  let j = i;
  while (j > 0 && /\S/.test(text[j - 1])) j -= 1;
  if (j < i) return { start: j, end: i };
  return { start, end };
}

/**
 * @param {{ revisedDraft: string, markers: Array<object> }} parsed
 * @returns {{ revisedDraft: string, markers: Array<object> }}
 */
export function applyCutPunctuationNormalizeToRevision(parsed) {
  const draft = typeof parsed?.revisedDraft === "string" ? parsed.revisedDraft : "";
  const incoming = Array.isArray(parsed?.markers) ? parsed.markers : [];
  const { text, map } = normalizeCutPunctuation(draft);

  const markers = incoming.map((m) => {
    const startIn = typeof m.start === "number" && Number.isFinite(m.start) ? m.start : 0;
    const endIn = typeof m.end === "number" && Number.isFinite(m.end) ? m.end : startIn;
    const clampedStart = Math.max(0, Math.min(draft.length, startIn));
    const clampedEnd = Math.max(0, Math.min(draft.length, endIn));
    let start = map[clampedStart] ?? text.length;
    let end = map[clampedEnd] ?? text.length;
    if (end < start) end = start;
    const snapped = snapCollapsedMarker(text, start, end);
    const out = {
      start: snapped.start,
      end: snapped.end,
      note: typeof m.note === "string" ? m.note : "",
    };
    if (m.intent) out.intent = m.intent;
    return out;
  });

  return { revisedDraft: text, markers };
}
