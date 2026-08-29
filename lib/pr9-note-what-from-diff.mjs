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
import { findStatementTextInDraft } from "./pr9-deterministic-unsupported-removal.mjs";
import { flagRegister } from "./revise-flag-register.mjs";
import { sentenceBoundsContaining } from "./pr9-marker-honesty.mjs";

/** The marked span as it stands in the revised draft. */
function spanText(revised, start, end) {
  return String(revised ?? "").slice(start, end);
}

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
 * Class-level reason per concern kind, used only when the model gave no
 * separable reason of its own.
 *
 * These state the CLASS of concern, never a bespoke factual justification —
 * the backend knows why the sentence was flagged, not what is wrong with it.
 * Wording follows the reviser prompt's own examples.
 */
export const CONCERN_KIND_REASONS = {
  unsupported: "no supplied source backs this claim",
  conflict: "a source states otherwise",
  partial: "the source backs only part of this",
  soften: "overstated against the source",
  deletion: "review flagged this as immaterial",
  compliance_strip: "a named person in a public version",
  compliance_claim: "this wording is not permitted in this version",
  compliance_add: "a required qualifier was missing",
};

/**
 * The concern kind driving a marker: evidence first, then compliance, then
 * editorial, matching the order the reviser prompt prioritises them.
 *
 * @param {object} concern
 * @returns {?string}
 */
export function concernKind(concern) {
  const evidence = concern?.evidence;
  if (evidence && typeof evidence.kind === "string" && evidence.kind) return evidence.kind;
  const compliance = Array.isArray(concern?.compliance) ? concern.compliance : [];
  if (compliance.length > 0 && typeof compliance[0]?.kind === "string") return compliance[0].kind;
  const editorial = Array.isArray(concern?.editorial) ? concern.editorial : [];
  for (const item of editorial) {
    // "craft" never earns a marker, so it never explains one.
    if (typeof item?.kind === "string" && item.kind !== "craft") return item.kind;
  }
  return null;
}

/**
 * The concern whose statement covers a marker's original region.
 *
 * Located in the ORIGINAL draft, because that is where concern statement text
 * came from and where the marker's origRegion offsets live. A marker with no
 * original region — a pure insertion — cannot be traced and returns null
 * rather than being attached to a neighbour.
 *
 * @param {string} original
 * @param {{ origRegion: Array<{ start: number, end: number }> }} align
 * @param {Array<object>} concerns
 * @returns {?object}
 */
export function resolveConcernForMarker(original, align, concerns) {
  const list = Array.isArray(concerns) ? concerns : [];
  const region = Array.isArray(align?.origRegion) ? align.origRegion : [];
  if (list.length === 0 || region.length === 0) return null;

  const regionStart = region[0].start;
  const regionEnd = region[region.length - 1].end;

  let best = null;
  let bestOverlap = 0;
  for (const concern of list) {
    const found = findStatementTextInDraft(original, concern?.statementText);
    if (!found) continue;
    const overlap = Math.min(regionEnd, found.end) - Math.max(regionStart, found.start);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = concern;
    }
  }
  return bestOverlap > 0 ? best : null;
}

/**
 * Class-level reason for the concern a marker traces to, or "" when it cannot
 * be traced or its kind has no mapped wording.
 *
 * @param {string} original
 * @param {object} align
 * @param {Array<object>} concerns
 * @returns {string}
 */
export function concernFallbackReason(original, align, concerns) {
  const concern = resolveConcernForMarker(original, align, concerns);
  if (!concern) return "";
  const kind = concernKind(concern);
  return (kind && CONCERN_KIND_REASONS[kind]) || "";
}

/**
 * SPAN LEAK. markerSpanAlignment's original region runs from the nearest
 * aligned token left of the span to the nearest aligned token right of it.
 * When the text AFTER the marker was deleted too, the next aligned anchor sits
 * a whole sentence away and the region swallows that sentence's deleted words.
 *
 * That window is right for the honesty check — a clause cut beside a
 * byte-identical remnant must read as CHANGED — and wrong for a note, which
 * must account only for its own span. A note that says it removed "We
 * recommend" when "We recommend" sits in the next sentence is the same class of
 * false account this module exists to prevent.
 *
 * So the region is clipped to the ORIGINAL sentence its first token falls in.
 * Skipped when the marker's own revised span straddles a sentence boundary,
 * because such a marker legitimately accounts for more than one sentence.
 *
 * @param {string} original
 * @param {string} revised
 * @param {number} start
 * @param {number} end
 * @param {Array<{ text: string, start: number, end: number }>} origRegion
 * @returns {Array<{ text: string, start: number, end: number }>}
 */
const INTERNAL_SENTENCE_BREAK_RE = /[.!?]["'\u201d\u2019)]*\s+\S/;

export function confineRegionToOwnSentence(original, revised, start, end, origRegion) {
  const region = Array.isArray(origRegion) ? origRegion : [];
  if (region.length === 0) return region;

  // A span carrying an internal sentence terminator legitimately accounts for
  // more than one sentence, so it keeps the full region.
  const span = String(revised ?? "").slice(start, end);
  if (INTERNAL_SENTENCE_BREAK_RE.test(span)) return region;

  // Only ever drop a token that is ABSENT from the revised span. A leaked
  // token is by definition an unaligned deletion, so it fails this test; a
  // token the span still carries is kept whatever sentence the clip thinks it
  // belongs to, which stops the clip turning kept prose into a false "Added".
  const spanWords = new Set(String(span).split(/\s+/).filter(Boolean));
  const bounds = sentenceBoundsContaining(original, region[0].start, region[0].end);
  const clipped = region.filter(
    (t) => (t.start >= bounds.start && t.end <= bounds.end) || spanWords.has(t.text)
  );
  return clipped.length > 0 ? clipped : region;
}

/** The original-region tokens a marker may account for, leak removed. */
function ownRegion(original, revised, start, end, align) {
  return confineRegionToOwnSentence(original, revised, start, end, align.origRegion);
}

/**
 * Editorial and house-style rules earn a class reason of their own. Keyed by
 * RULE, not kind: gatherConcerns collapses every style rule to kind "craft",
 * so the kind alone cannot tell a voice fix from a comma fix.
 */
export const EDITORIAL_RULE_REASONS = {
  first_person_plural: "house style names the organisation rather than using first person",
  register_consistency: "house style asks for a consistent voice here",
  active_voice_preference: "house style prefers the active voice here",
  hyperbole_vs_qualitative: "this reads as promotional against house style",
  defined_term_capitalisation: "house style sets how this term is capitalised",
  sentence_structure_clarity: "the sentence was hard to follow as written",
};

const FIRST_PERSON_WORD_RE = /^(?:we|our|ours|us|ourselves|i|my|mine|me)\b/i;

function bareWord(word) {
  return String(word || "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * Did this diff drop first-person wording and put none back? That is the
 * signature of a voice-consistency edit, and it is an editorial change however
 * the same statement was flagged on evidence.
 *
 * @param {Array<{ removed: string, added: string }>} edits
 * @returns {boolean}
 */
export function editsDropFirstPerson(edits) {
  const list = Array.isArray(edits) ? edits : [];
  const words = (text) => String(text || "").split(/\s+/).map(bareWord).filter(Boolean);
  const hadFirstPerson = list.some((e) => words(e.removed).some((w) => FIRST_PERSON_WORD_RE.test(w)));
  if (!hadFirstPerson) return false;
  return !list.some((e) => words(e.added).some((w) => FIRST_PERSON_WORD_RE.test(w)));
}

/**
 * WRONG REASON CLASS. A statement can carry an evidence concern and an
 * editorial one at once. concernKind prefers evidence, so a house-style voice
 * fix on such a statement was explained with "no supplied source backs this
 * claim" — an accurate sentence about the statement, and a false account of
 * why THIS change was made.
 *
 * Where the diff itself identifies the change as editorial, the reason comes
 * from the editorial concern. Evidence keeps priority everywhere else.
 *
 * @param {object} concern
 * @param {Array<object>} edits
 * @returns {string}
 */
export function editorialReasonForEdits(concern, edits) {
  if (!editsDropFirstPerson(edits)) return "";
  const editorial = Array.isArray(concern?.editorial) ? concern.editorial : [];
  for (const item of editorial) {
    const reason = EDITORIAL_RULE_REASONS[String(item?.rule || "").trim().toLowerCase()];
    if (reason) return reason;
  }
  return EDITORIAL_RULE_REASONS.first_person_plural;
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
    ownRegion(original, revised, start, end, align).map((t) => t.text),
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
 * Reason preference: the model's own separable reason, then a class-level
 * reason from the concern the marker traces to, then the what clause alone.
 *
 * @param {{
 *   original: string,
 *   revised: string,
 *   start: number,
 *   end: number,
 *   note: string,
 *   concerns?: Array<object>,
 * }} args
 * @returns {{
 *   body: string,
 *   clause: string,
 *   reason: string,
 *   reasonSource: "model"|"concern"|"none",
 *   changed: boolean,
 *   edits: Array<object>,
 * }}
 */
export function buildNoteBodyFromDiff({ original, revised, start, end, note, concerns } = {}) {
  const align = markerSpanAlignment(original, revised, start, end);
  // Concern tracing uses the confined region too: a leaked region can overlap
  // the NEXT statement more than its own and pick up that statement's concern.
  const ownAlign = { ...align, origRegion: ownRegion(original, revised, start, end, align) };
  const edits = diffWordSequences(
    ownAlign.origRegion.map((t) => t.text),
    align.revSpan.map((t) => t.text)
  );
  const clause = renderWhatClause(edits);

  // SILENCE NEVER EDITS. Where the marked span came back untouched and the
  // finding rests on silence, the marker is a flag rather than an account of
  // an edit, and its volume is set by whether the flagged element carries
  // anything checkable. The register replaces the whole body, closer included.
  //
  // Gated on `edits.length === 0` deliberately. The live prompt's rules (b)
  // and (c) still tell the model to soften or cut on silence, so an unsupported
  // element can still come back changed. Stamping "No supplied source states
  // this" over a note describing a real edit would be a lie of exactly the kind
  // what-from-diff exists to prevent.
  if (edits.length === 0) {
    const concern = resolveConcernForMarker(original, ownAlign, concerns);
    if (concern) {
      const decision = flagRegister(concern, null, spanText(revised, start, end));
      if (decision.note) {
        return {
          body: decision.note,
          clause,
          reason: decision.note,
          reasonSource: "register",
          register: decision.register,
          registerSignal: decision.signal,
          changed: false,
          edits,
        };
      }
    }
  }

  // An editorial change takes its reason from the editorial concern even when
  // the model offered one, because the model's reason is what put an evidence
  // explanation on a house-style edit in the first place.
  const tracedConcern = resolveConcernForMarker(original, ownAlign, concerns);
  const editorialReason = tracedConcern ? editorialReasonForEdits(tracedConcern, edits) : "";
  if (editorialReason) {
    return {
      body: `${clause} - ${editorialReason}`,
      clause,
      reason: editorialReason,
      reasonSource: "editorial",
      changed: edits.length > 0,
      edits,
    };
  }

  let reason = extractModelReason(note);
  let reasonSource = reason ? "model" : "none";
  if (!reason) {
    reason = concernFallbackReason(original, ownAlign, concerns);
    if (reason) reasonSource = "concern";
  }

  return {
    body: reason ? `${clause} - ${reason}` : clause,
    clause,
    reason,
    reasonSource,
    changed: edits.length > 0,
    edits,
  };
}
