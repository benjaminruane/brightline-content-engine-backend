/**
 * Silence about the author's own actions is not evidence against them.
 *
 * cd9a666 drove stage 1's refusal rate to 0.0%, which meant every finding
 * became an edit. The reviser's former inertia had been accidentally
 * protecting drafts from findings that should never have been acted on:
 * stage 1 deleted who committed and when from "In June 2026, Partners Group
 * committed to..." 3 of 3, because no third-party document mentioned the
 * commitment. A third-party document is not expected to mention it.
 *
 * So where a finding rests only on SILENCE, and the flagged element states
 * the authoring organisation's own action, view, intention or commitment, the
 * statement is kept and quietly flagged instead of edited.
 *
 * THIS IS NOT A RULE ABOUT DOCUMENT TYPES. The standing guard that the product
 * never asks what kind of document a source is remains in force. Every test
 * here reads the DRAFT only: who does the sentence say performed the action or
 * holds the view. Nothing looks at the source at all.
 *
 * WHERE IT DOES NOT APPLY. A source that CONTRADICTS the statement is still
 * caught and still acted on. Contradiction is evidence; silence is not.
 *
 * Deterministic. No model call.
 */

import { identifyAuthoringOrganisation } from "./qc/first-person-actor.mjs";

/**
 * Quiet register, deliberately distinct from both other notes on this path:
 * the ordinary evidence note asks the reviewer to resolve a concern, and
 * DETERMINISTIC_UNSUPPORTED_EMPTY_DRAFT_NOTE is loud about a removal that was
 * suppressed. This one explains why nothing was done, so it carries no
 * "Confirm before publishing" closer.
 */
export const AUTHOR_STATEMENT_KEPT_NOTE =
  "Kept. This states your own position or action, and no supplied source speaks to it either way.";

/** Recorded as an outcome in its own right, never counted as a refusal. */
export const OUTCOME_AUTHOR_EXEMPT = "author_statement_exempt";

/**
 * The quiet note is exempt from note normalisation and from what-from-diff.
 * Normalisation appends "Confirm before publishing." to every note, and this
 * note must not carry it: there is no concern to resolve, only an explanation
 * of why nothing was done. what-from-diff would also overwrite it with a
 * no-change account, since by construction nothing changed.
 *
 * @param {unknown} note
 * @returns {boolean}
 */
export function isAuthorStatementKeptNote(note) {
  return collapse(note) === collapse(AUTHOR_STATEMENT_KEPT_NOTE);
}

const collapse = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Leading adverbial that precedes the grammatical subject. */
const LEADING_ADVERBIAL_RE =
  /^(?:(?:in|on|as of|during|since|by|at|following|after|before|throughout)\b[^,]{2,40},\s*|(?:on balance|however|furthermore|in addition|overall|accordingly|therefore|separately|more broadly),\s*)/i;

/**
 * Verbs that attribute an ACTION, VIEW, INTENTION or COMMITMENT to the subject.
 *
 * Reporting frames ("notes that", "observes that", "sees that") are deliberately
 * ABSENT. "We note that Meridian's IRR is 24 per cent" has the author as its
 * subject but smuggles a third-party figure through the exemption. Excluding
 * them costs nothing on the corpus and closes that hole.
 */
const AUTHOR_VERB_RE = new RegExp(
  "^\\s*(?:(?:also|subsequently|further|therefore|then|has|have|had|will|would|may|can|do|does|did|is|are|was|were|been|being)\\s+)*" +
    "(commit(?:s|ted|ting)?|invest(?:s|ed|ing)?|made|makes?|complet(?:e|es|ed)|acquir(?:e|es|ed)|" +
    "provid(?:e|es|ed)|participat(?:e|es|ed)|allocat(?:e|es|ed)|subscrib(?:e|es|ed)|approv(?:e|es|ed)|" +
    "conduct(?:s|ed)?|undertook|undertak(?:e|es|en)|engag(?:e|es|ed)|" +
    "recommend(?:s|ed|ing)?|believ(?:e|es|ed)|consider(?:s|ed|ing)?|view(?:s|ed)?|regard(?:s|ed)?|" +
    "expect(?:s|ed|ing)?|think(?:s)?|judg(?:e|es|ed)|attracted|confident|comfortable|satisfied|" +
    "intend(?:s|ed|ing)?|plan(?:s|ned|ning)?|aim(?:s|ed|ing)?|propos(?:e|es|ed)|seek(?:s|ing)?|" +
    "look(?:s|ing)?\\s+forward)\\b",
  "i"
);

/**
 * Start of an appositive or relative clause describing something other than the
 * subject: "...Partners V, a EUR 1.2 billion fund...". Material after this point
 * is a claim about a third party even in a sentence the author is the actor in.
 */
const APPOSITIVE_RE = /,\s+(?:a|an|which|who|whose|comprising|including)\s/i;

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The tightest flagged elements available for a concern.
 *
 * PART 3a. Where claim decomposition ran, the claim-level text is preferred
 * over the coarser unsupportedSpans entry. Measured: statement 1's span is
 * "control-oriented investments, with equity checks of EUR 80-100 million
 * apiece." while claims[1] is "equity checks of EUR 80-100 million apiece".
 * The first swallows confirmed material and stage 1 duly deleted
 * "control-oriented" 3 of 3; the second does not.
 *
 * @param {object} concern
 * @returns {Array<{ text: string, source: "claim"|"span" }>}
 */
export function tightestUnsupportedSpans(concern) {
  const claims = Array.isArray(concern?.claims) ? concern.claims : [];
  const fromClaims = claims
    .filter((c) => c?.role === "unsupported" && typeof c.text === "string" && c.text.trim())
    .map((c) => ({ text: c.text.trim(), source: /** @type {const} */ ("claim") }));
  if (fromClaims.length > 0) return fromClaims;

  const spans = Array.isArray(concern?.evidence?.unsupportedSpans)
    ? concern.evidence.unsupportedSpans
    : [];
  return spans
    .filter((s) => typeof s?.text === "string" && s.text.trim())
    .map((s) => ({ text: s.text.trim(), source: /** @type {const} */ ("span") }));
}

/**
 * Does the finding rest on SILENCE, or on a source that CONTRADICTS the draft?
 *
 * The exemption exists only for silence. This is enforced explicitly rather
 * than left to fall out of the kind check, because getting it wrong would mean
 * quietly keeping a statement a source actively disputes.
 *
 * @param {object} concern
 * @returns {{ silence: boolean, why: string }}
 */
export function findingRestsOnSilence(concern) {
  const kind = concern?.evidence?.kind;
  const verdict = String(concern?.evidence?.verdict ?? "");

  if (!kind) return { silence: false, why: "no evidence finding on this statement" };
  if (kind === "conflict" || verdict === "conflicting") {
    return { silence: false, why: "a source contradicts this statement" };
  }
  if (concernHasConflictingClaim(concern)) {
    return { silence: false, why: "a decomposed claim conflicts with a source" };
  }
  if (concern?.evidence?.sourcePassage || concern?.evidence?.sourceLabel) {
    // A named competing passage means a source spoke; that is not silence.
    return { silence: false, why: "a source states a competing value" };
  }
  if (kind === "unsupported") {
    return { silence: true, why: "no supplied source speaks to this statement" };
  }
  if (kind === "partial") {
    return { silence: true, why: "no supplied source speaks to the unsupported element" };
  }
  return { silence: false, why: `evidence kind ${kind} is not a silence finding` };
}

function concernHasConflictingClaim(concern) {
  const claims = Array.isArray(concern?.claims) ? concern.claims : [];
  return claims.some((c) => c?.role === "conflict");
}

/**
 * Split a statement into the author's subject and everything after it.
 * Returns null when the subject is not the authoring organisation.
 *
 * The organisation name is used only when identifyAuthoringOrganisation
 * confirms that exact configured name is present in the text. The module's own
 * contract is a presence check, never a scrape, so no firm is ever inferred.
 */
function authorSubjectOf(statement, organisation) {
  const body = String(statement ?? "").trim().replace(LEADING_ADVERBIAL_RE, "");

  const firstPerson = /^(we|our)\b/i.exec(body);
  if (firstPerson) {
    return { body, rest: body.slice(firstPerson[0].length), how: "the sentence subject is first person" };
  }

  const org = collapse(organisation);
  if (org && new RegExp("^" + escapeRe(org) + "\\b", "i").test(body)) {
    const rest = body.slice(org.length);
    // "Halden Group's Fund III returned 2.1x" — the subject is Fund III, and
    // the returns are a fact about it, not an action by the author.
    if (/^(?:'s|\u2019s)/.test(rest)) return null;
    return { body, rest, how: `the sentence subject is ${org}` };
  }
  return null;
}

/**
 * Is the flagged element inside the clause the author is the actor of?
 *
 * Guards the appositive case: "In June 2025, Halden Group made a lead
 * commitment to Meridian Capital Partners V, a EUR 1.2 billion fund targeting
 * lower-mid-market buyouts." The commitment is the author's; the fund size is
 * not, and a finding against the fund size must still be edited.
 */
function elementInAuthorClause(body, elementText) {
  const boundary = APPOSITIVE_RE.exec(body);
  if (!boundary) return true;
  const at = body.toLowerCase().indexOf(collapse(elementText).toLowerCase());
  if (at < 0) return true; // element not locatable; do not use this as a reason to edit
  return at < boundary.index;
}

/**
 * Does the flagged element attribute an action, view, intention or commitment
 * to the authoring organisation?
 *
 * @param {string} statementText
 * @param {Array<{ text: string }>|null} flaggedElements  tightest available; empty means the whole statement
 * @param {{ authoringOrganisation?: string|null, draftText?: string }} [opts]
 * @returns {{ authorOriginated: boolean, reason: string }}
 */
export function isAuthorOriginatedStatement(statementText, flaggedElements, opts = {}) {
  const organisation = resolveOrganisation(opts);
  const subject = authorSubjectOf(statementText, organisation);
  if (!subject) {
    return {
      authorOriginated: false,
      reason: "the sentence does not name the authoring organisation as the actor",
    };
  }

  const verb = AUTHOR_VERB_RE.exec(subject.rest);
  if (!verb) {
    return {
      authorOriginated: false,
      reason:
        "the authoring organisation is the subject but the sentence states no action, view, intention or commitment",
    };
  }

  const elements = (Array.isArray(flaggedElements) ? flaggedElements : []).filter((e) =>
    collapse(e?.text)
  );
  if (elements.length > 0) {
    const inClause = elements.some((e) => elementInAuthorClause(subject.body, e.text));
    if (!inClause) {
      return {
        authorOriginated: false,
        reason: "the flagged wording describes a third party, not the authoring organisation's own act",
      };
    }
  }

  return {
    authorOriginated: true,
    reason: `${subject.how} and "${verb[1].toLowerCase()}" states its own action, view, intention or commitment`,
  };
}

/**
 * The organisation is only usable when the configured name actually appears in
 * the text. With no configuration the name resolves to null and only the
 * first-person path can fire, which is the safe default the first-person-actor
 * module insists on.
 */
function resolveOrganisation(opts) {
  const supplied = collapse(opts?.authoringOrganisation);
  if (!supplied) return null;
  const text = typeof opts?.draftText === "string" && opts.draftText ? opts.draftText : null;
  if (!text) return supplied;
  return identifyAuthoringOrganisation(text, supplied);
}

/**
 * The single decision the revise path asks for.
 *
 * @param {object} concern
 * @param {{ authoringOrganisation?: string|null, draftText?: string }} [opts]
 * @returns {{ exempt: boolean, reason: string, restsOnSilence: boolean, authorOriginated: boolean }}
 */
export function authorStatementExemption(concern, opts = {}) {
  const silence = findingRestsOnSilence(concern);
  const author = isAuthorOriginatedStatement(
    concern?.statementText,
    tightestUnsupportedSpans(concern),
    opts
  );

  if (!author.authorOriginated) {
    return {
      exempt: false,
      reason: author.reason,
      restsOnSilence: silence.silence,
      authorOriginated: false,
    };
  }
  if (!silence.silence) {
    return {
      exempt: false,
      reason: `${author.reason}, but ${silence.why}`,
      restsOnSilence: false,
      authorOriginated: true,
    };
  }
  return {
    exempt: true,
    reason: `${author.reason}; ${silence.why}`,
    restsOnSilence: true,
    authorOriginated: true,
  };
}
