/**
 * Stage 1 prompt: revise ONE statement, given ONE concern.
 *
 * fc25060 arm B held the prompt, concern, model, temperature and seed constant
 * and removed only the surrounding draft. A statement the wide call had never
 * fixed went from 0 of 3 to 3 of 3. This is that call.
 *
 * ORDER IS LOAD-BEARING. Prompt caching matches an identical LEADING prefix,
 * and 1560579 measured a 96.7% hit rate on our real prompts, which is what
 * takes stage 1 from 3.51x today's cost to 1.31x. So everything
 * kind-independent comes first and the kind rule comes after it. Reordering
 * these two blocks silently voids the cost model.
 *
 * Blocks are SLICED OUT OF THE LIVE PROMPT rather than copied, so the house
 * style guide and guardrails cannot drift from the whole-draft path.
 */

import { buildRevisionPrompt } from "./build-revision-prompt.mjs";
import { tightestUnsupportedSpans } from "./revise-author-statement.mjs";

/** Strict, and deliberately short: code owns markers, so the model writes prose. */
export const STAGE1_OUTPUT_CONTRACT = `OUTPUT CONTRACT — return STRICT JSON and nothing else. No prose, no markdown fences.
{
  "action": "edit" | "no_change",
  "revised_statement": "<the full revised statement>" or null when action is "no_change",
  "what": "<what you changed, in plain words>",
  "why": "<why, in plain words>"
}
Rules for the JSON:
- Return the WHOLE statement in "revised_statement", not a fragment.
- "what" and "why" are plain words for a colleague. Do NOT use marker syntax, do NOT write "Confirm before publishing", do NOT mention markers, underlines or highlights.
- If no change is warranted, use action "no_change", revised_statement null, and say in "why" what stopped you.`;

// Some rules qualify the kind before the colon, e.g. `e) kind "soften"
// (marketing_language_excess):`, so the colon is not part of the match.
const RULE_RE = /^([a-i])\) kind "([a-z_]+)"/gm;

function sliceBetween(text, from, to) {
  const a = text.indexOf(from);
  if (a < 0) throw new Error(`stage1 prompt: block not found: ${from}`);
  const b = to ? text.indexOf(to, a) : text.length;
  return text.slice(a, b < 0 ? text.length : b).trimEnd();
}

let cachedBlocks = null;

/**
 * The live prompt's own blocks, parsed once.
 * @returns {{ guardrails: string, houseStyle: string, kindPreamble: string, kindRules: Map<string,string> }}
 */
export function livePromptBlocks() {
  if (cachedBlocks) return cachedBlocks;
  const live = buildRevisionPrompt("Placeholder.", [], {
    outputType: "reporting_commentary",
    requiredVersion: "complete",
  });

  const guardrails = sliceBetween(live, "GLOBAL GUARDRAILS (must obey):", "KIND HANDLING");
  const houseStyle = sliceBetween(live, "HOUSE STYLE RULES (v4 Review canon", "CONCERNS TO ADDRESS:");
  const kindBlock = sliceBetween(live, "KIND HANDLING (apply by kind=", "NAMED ENTITIES");

  // The preamble separating the three ways of "removing content" is kept: it is
  // what stops the model confusing a compliance strip with an evidence cut.
  const firstRule = kindBlock.search(/^a\) kind "/m);
  const kindPreamble = kindBlock.slice(0, firstRule).split("\n").slice(1).join("\n").trim();

  const kindRules = new Map();
  const marks = [...kindBlock.matchAll(RULE_RE)];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index;
    const end = i + 1 < marks.length ? marks[i + 1].index : kindBlock.length;
    kindRules.set(marks[i][2], kindBlock.slice(start, end).trimEnd());
  }

  cachedBlocks = { guardrails, houseStyle, kindPreamble, kindRules };
  return cachedBlocks;
}

/**
 * Everything kind-independent, in cache order. Identical for every statement of
 * every draft with the same outputType, which is what makes it cacheable.
 *
 * @returns {string}
 */
export function buildStage1SharedPrefix() {
  const { guardrails, houseStyle } = livePromptBlocks();
  return [
    "You are revising ONE statement from a reviewed draft, using the QC Review finding on it.",
    "Revise only what the finding requires. Everything else in the statement stays exactly as the author wrote it.",
    "",
    houseStyle,
    "",
    guardrails,
    "",
    STAGE1_OUTPUT_CONTRACT,
  ].join("\n");
}

/**
 * The finding block for one statement. Everything here varies per call and
 * therefore sits after the shared prefix.
 */
function buildFindingBlock(concern, kind, paragraph) {
  const ev = concern?.evidence || {};
  const lines = [`STATEMENT TO REVISE:\n${concern.statementText}`, ""];

  lines.push(`FINDING [kind=${kind}]: ${ev.reason || firstConcernReason(concern) || "(none stated)"}`);

  // The same tightest element the validator enforces. Showing the coarser
  // unsupportedSpans entry here while the validator held the claim-level one
  // rejected every equity-cheque edit 3 of 3: the model was being asked for an
  // edit the validator would not accept.
  const spans = tightestUnsupportedSpans(concern);
  if (spans.length > 0) {
    for (const s of spans) lines.push(`UNSUPPORTED ELEMENT: "${s.text}"`);
    lines.push(
      "Edit ONLY inside the unsupported element above. Every other word of the statement must come back byte-identical."
    );
  } else {
    lines.push(
      "No specific element was named, so the finding applies to the whole statement."
    );
  }

  if (ev.excerpt) lines.push(`SOURCE EXCERPT: ${ev.excerpt}`);
  if (ev.conflictingPassage) lines.push(`CONFLICTING PASSAGE: ${ev.conflictingPassage}`);

  for (const item of concern?.compliance || []) {
    if (item?.reason) lines.push(`COMPLIANCE: ${item.reason}`);
  }
  for (const item of concern?.editorial || []) {
    if (item?.suggestedDirection) lines.push(`DIRECTION: ${item.suggestedDirection}`);
    else if (item?.reason) lines.push(`EDITORIAL: ${item.reason}`);
  }

  if (paragraph) {
    lines.push(
      "",
      `SURROUNDING PARAGRAPH (read-only context, do NOT revise or return it):\n${paragraph}`
    );
  }
  return lines.join("\n");
}

function firstConcernReason(concern) {
  for (const item of [...(concern?.compliance || []), ...(concern?.editorial || [])]) {
    if (item?.reason) return item.reason;
  }
  return "";
}

/**
 * @param {object} concern      one gatherConcerns entry
 * @param {string} kind         resolved concern kind
 * @param {{ paragraph?: string }} [opts]
 * @returns {string}
 */
export function buildStage1Prompt(concern, kind, opts = {}) {
  const { kindPreamble, kindRules } = livePromptBlocks();
  const rule = kindRules.get(kind);

  const kindSection = rule
    ? `KIND HANDLING (this finding only):\n${kindPreamble}\n${rule}`
    : `KIND HANDLING (this finding only):\n${kindPreamble}`;

  return [buildStage1SharedPrefix(), "", kindSection, "", buildFindingBlock(concern, kind, opts.paragraph)].join(
    "\n"
  );
}
