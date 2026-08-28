/**
 * Marker notes: code writes the WHAT, the model writes the WHY.
 *
 * The model narrates edits it does not make. Marker honesty can only ask
 * whether the marked span moved, so a note that bundles one real edit with one
 * invented edit passes it. Nothing region-based can catch that.
 *
 * So the note's account of what changed is discarded and regenerated from the
 * actual difference between the original region and the revised span, using
 * markerSpanAlignment — the same comparator the honesty check uses, so the two
 * can never disagree. Only the model's reason survives.
 *
 * The deterministic removal note already builds its own text from what the code
 * did and is deliberately NOT routed through here.
 */
import { markerSpanAlignment } from "./pr9-marker-span-status.mjs";

/** Quoted fragments longer than this are truncated. */
export const QUOTE_MAX_CHARS = 80;

/** More separate edits than this are counted rather than listed. */
export const MAX_LISTED_EDITS = 3;

export const NO_CHANGE_CLAUSE = "No change was made";

/**
 * "<what> — <why>": the separator the note template asks for. Text after it is
 * the reason; the separator itself is dropped.
 */
const NOTE_SEPARATOR_RE = /\s+[\u2014\u2013]\s+|\s+-\s+|\s*;\s*/;

/**
 * The model often ignores the template and runs the reason on with a
 * connective instead. These introduce a reason and are KEPT in it, because
 * "to match the source" reads wrong with the "to" removed.
 */
const REASON_CONNECTIVE_RE =
  /\b(?:because|since|as the source|which (?:is|are|was|were)? ?(?:not|no longer)?\s*support|to (?:match|reflect|align|avoid|keep|stay)\b)/i;

const TRAILING_CLOSER_RE = /\s*Confirm before publishing\.?\s*$/i;

function collapseWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/**
 * Strip {{span||note}} markers from text before quoting it.
 * @param {string} text
 * @returns {string}
 */
export function stripMarkersFromQuotedText(text) {
  return String(text || "").replace(/\{\{([\s\S]*?)\|\|[\s\S]*?\}\}/g, "$1");
}

/**
 * Quote a fragment verbatim: markers stripped, whitespace collapsed, embedded
 * double quotes downgraded so the outer quotation stays readable, and
 * truncated with an ellipsis past QUOTE_MAX_CHARS.
 *
 * @param {string} text
 * @returns {string}
 */
export function quoteFragment(text) {
  let quoted = collapseWhitespace(stripMarkersFromQuotedText(text));
  if (quoted.length > QUOTE_MAX_CHARS) {
    quoted = `${quoted.slice(0, QUOTE_MAX_CHARS)}...`;
  }
  return quoted.replace(/"/g, "'");
}

/**
 * Token-level diff of two word sequences, grouped into edits in document
 * order. Adjacent deletion and insertion collapse into one replacement.
 *
 * @param {string[]} originalWords
 * @param {string[]} revisedWords
 * @returns {Array<{ kind: "removed"|"added"|"replaced", removed: string, added: string }>}
 */
export function diffWordSequences(originalWords, revisedWords) {
  const a = Array.isArray(originalWords) ? originalWords : [];
  const b = Array.isArray(revisedWords) ? revisedWords : [];

  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  /** @type {Array<{ kind: "removed"|"added"|"replaced", removed: string, added: string }>} */
  const edits = [];
  let pendingRemoved = [];
  let pendingAdded = [];

  const flush = () => {
    if (pendingRemoved.length === 0 && pendingAdded.length === 0) return;
    const removed = pendingRemoved.join(" ");
    const added = pendingAdded.join(" ");
    if (removed && added) edits.push({ kind: "replaced", removed, added });
    else if (removed) edits.push({ kind: "removed", removed, added: "" });
    else edits.push({ kind: "added", removed: "", added });
    pendingRemoved = [];
    pendingAdded = [];
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pendingRemoved.push(a[i]);
      i += 1;
    } else {
      pendingAdded.push(b[j]);
      j += 1;
    }
  }
  while (i < n) {
    pendingRemoved.push(a[i]);
    i += 1;
  }
  while (j < m) {
    pendingAdded.push(b[j]);
    j += 1;
  }
  flush();

  return edits;
}

/**
 * Render edits as the WHAT clause, without terminal punctuation.
 *
 * @param {Array<{ kind: string, removed: string, added: string }>} edits
 * @returns {string}
 */
export function renderWhatClause(edits) {
  const list = Array.isArray(edits) ? edits : [];
  if (list.length === 0) return NO_CHANGE_CLAUSE;
  if (list.length > MAX_LISTED_EDITS) {
    return `Made ${list.length} separate edits to this passage`;
  }
  return list
    .map((edit) => {
      if (edit.kind === "replaced") {
        return `Replaced "${quoteFragment(edit.removed)}" with "${quoteFragment(edit.added)}"`;
      }
      if (edit.kind === "added") return `Added "${quoteFragment(edit.added)}"`;
      return `Removed "${quoteFragment(edit.removed)}"`;
    })
    .join(", ");
}

/**
 * The model's reason, with its account of what it did discarded.
 *
 * A note with no separator is entirely an account of what it did, so there is
 * no reason to keep. Nothing is invented to fill the gap.
 *
 * @param {string} note
 * @returns {string}
 */
export function extractModelReason(note) {
  const raw = typeof note === "string" ? note.trim() : "";
  const body = raw.replace(TRAILING_CLOSER_RE, "").trim();
  if (!body) return "";

  const sepAt = body.search(NOTE_SEPARATOR_RE);
  const connAt = body.search(REASON_CONNECTIVE_RE);

  // Whichever introduces the reason first wins. A separator is dropped; a
  // connective is part of the reason it introduces.
  let reason = "";
  if (sepAt >= 0 && (connAt < 0 || sepAt < connAt)) {
    const match = body.slice(sepAt).match(NOTE_SEPARATOR_RE);
    reason = body.slice(sepAt + (match ? match[0].length : 1));
  } else if (connAt >= 0) {
    reason = body.slice(connAt);
  } else {
    return "";
  }

  return reason.trim().replace(/[.!?]+$/g, "").trim();
}

/**
 * The WHAT clause for one marker, from the real diff.
 *
 * @param {string} original
 * @param {string} revised
 * @param {number} start
 * @param {number} end
 * @returns {{ clause: string, edits: Array<object>, changed: boolean }}
 */
export function buildWhatClause(original, revised, start, end) {
  const align = markerSpanAlignment(original, revised, start, end);
  const edits = diffWordSequences(
    align.origRegion.map((t) => t.text),
    align.revSpan.map((t) => t.text)
  );
  return { clause: renderWhatClause(edits), edits, changed: edits.length > 0 };
}

/**
 * Rebuild a marker note as generated-WHAT plus the model's WHY.
 *
 * Returns the note body only. The caller applies normalizeMarkerNoteText,
 * which capitalises, adds terminal punctuation and appends the canonical
 * closer.
 *
 * @param {{ original: string, revised: string, start: number, end: number, note: string }} args
 * @returns {{ body: string, clause: string, reason: string, changed: boolean, edits: Array<object> }}
 */
export function buildNoteBodyFromDiff({ original, revised, start, end, note } = {}) {
  const { clause, edits, changed } = buildWhatClause(original, revised, start, end);
  const reason = extractModelReason(note);
  return {
    body: reason ? `${clause} - ${reason}` : clause,
    clause,
    reason,
    changed,
    edits,
  };
}
