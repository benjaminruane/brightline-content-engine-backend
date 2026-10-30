/**
 * B450. The craft note's house style is composed from lib/qc/style-guide.mjs.
 * Nothing here restates a rule. The note is not a draft, so only universal
 * rules are candidates, and voice or draft-judgment rules are then excluded.
 * A rewrite runs only where one character pattern has one correct form.
 */
import { STYLE_GUIDE_LAYER_1, STYLE_GUIDE_LAYER_2_CLIENT } from "./style-guide.mjs";

/**
 * Universal rules that still do not govern the note.
 * The note speaks as an editor. It is not the draft, and it is allowed to
 * discuss the draft's voice, register, and word choice.
 */
export const NOTE_STYLE_EXCLUSIONS = [
  {
    id: "first_person_plural",
    reason: "The note speaks as an editor to a colleague. House voice and person do not apply to it.",
  },
  {
    id: "defined_term_capitalisation",
    reason: "The rule applies after a draft defines a term. The note is not that draft, and it defines nothing.",
  },
  {
    id: "active_voice_preference",
    reason: "This is a preference about the draft's sentences. The note's job is to discuss those sentences.",
  },
  {
    id: "hyperbole_vs_qualitative",
    reason: "The note exists to talk about this kind of language. Putting the rule on the note would fight that job.",
  },
  {
    id: "register_consistency",
    reason: "This is the draft's register. The note's register is already set by the prompt.",
  },
  {
    id: "sentence_structure_clarity",
    reason: "Clarity of the draft is what the note discusses. It is not a mechanical rule for the note's own characters.",
  },
];

/**
 * Included rules with one safe rewrite. Everything else in the note's rule
 * list is prompt only.
 */
export const NOTE_ENFORCED_REWRITES = [
  {
    id: "em_dash",
    reason: "A long dash has one replacement, a hyphen. It is replaced inside a quotation as well, because the character must not reach the reader.",
  },
  {
    id: "percentage_notation",
    reason: "A number written as percent or per cent has one replacement, the % symbol. Inside a quotation the word stays, because the note may be quoting the draft.",
  },
  {
    id: "smart_quotes",
    reason: "A curly quote or apostrophe has one straight replacement. The words do not change.",
  },
];

export const NOTE_PROMPT_ONLY = [
  {
    id: "thousand_separator",
    reason: "A comma is also a list comma, and a quoted figure must stay what the draft wrote. The rule also accepts a number with no separator. A rewrite cannot tell those apart.",
  },
  {
    id: "currency_format",
    reason: "Turning a symbol and a scale into an ISO code needs a table, and forms such as $4bn are ambiguous.",
  },
  {
    id: "oxford_comma",
    reason: "A list of two items must not gain a comma. The rule says to count the items before deciding. A rewrite cannot see that reliably.",
  },
  {
    id: "english_variant",
    reason: "Proper nouns keep their spelling, and licence is either a noun or a verb. A blind replace is not safe.",
  },
  {
    id: "number_spelling",
    reason: "Percentages, money, dates, ages, and units stay numerals, and month counts under 13 stay words. A rewrite will correct a number the rule says to leave.",
  },
  {
    id: "date_format",
    reason: "A numeric date such as 05/06/2026 does not say which number is the month.",
  },
];

function allStyleRules() {
  const merged = [...STYLE_GUIDE_LAYER_1];
  const indexById = new Map(merged.map((rule, index) => [rule.id, index]));
  for (const rule of STYLE_GUIDE_LAYER_2_CLIENT) {
    const existing = indexById.get(rule.id);
    if (existing !== undefined) merged[existing] = rule;
    else {
      indexById.set(rule.id, merged.length);
      merged.push(rule);
    }
  }
  return merged;
}

function requireKnown(ids, label) {
  const known = new Set(allStyleRules().map((rule) => rule.id));
  for (const id of ids) {
    if (!known.has(id)) throw new Error(`note style block: ${label} rule ${id} is not in the style guide`);
  }
}

/** Universal house-style rules, minus voice and draft-judgment rules. */
export function noteStyleRules() {
  requireKnown(NOTE_STYLE_EXCLUSIONS.map((row) => row.id), "excluded");
  const excluded = new Set(NOTE_STYLE_EXCLUSIONS.map((row) => row.id));
  return allStyleRules().filter((rule) => {
    if (!Array.isArray(rule.applies_to) || !rule.applies_to.includes("*")) return false;
    return !excluded.has(rule.id);
  });
}

/** The subset the code rewrites. Each id must be a note rule. */
export function enforcedNoteStyleRuleIds() {
  requireKnown(NOTE_ENFORCED_REWRITES.map((row) => row.id), "enforced");
  const noteIds = new Set(noteStyleRules().map((rule) => rule.id));
  const ids = [];
  for (const row of NOTE_ENFORCED_REWRITES) {
    if (!noteIds.has(row.id)) throw new Error(`note style block: ${row.id} is not a rule for the note`);
    ids.push(row.id);
  }
  return ids;
}

/**
 * The description is written for a reviewer. Keep the standard, drop the
 * sentences that tell a reviewer to flag a draft, and do not show a long
 * dash. The words still come from the rule.
 */
export function standardForNote(description) {
  if (typeof description !== "string" || !description.trim()) {
    throw new Error("note style block: a rule description is missing");
  }
  let text = description.replace(/\s*\([^)]*[\u2014\u2013\u201C\u201D\u2018\u2019][^)]*\)/g, "");
  text = text.replaceAll("\u2014", "-").replaceAll("\u2013", "-");
  text = text.replaceAll("\u201C", "\"").replaceAll("\u201D", "\"");
  text = text.replaceAll("\u2018", "'").replaceAll("\u2019", "'");
  text = text.replace(/\s+Flag\b[\s\S]*$/, "");
  text = text.replace(/\s+Do NOT flag\b[\s\S]*$/, "");
  text = text.replace(/\s+Do not flag\b[\s\S]*$/, "");
  text = text.replace(/\s+When raising a concern\b[\s\S]*$/, "");
  text = text.replace(/\s+To count list items:[\s\S]*$/, "");
  text = text.trim();
  if (!text) throw new Error("note style block: a rule standard rendered empty");
  return text;
}

function exampleForNote(example) {
  if (typeof example !== "string" || !example.trim()) {
    throw new Error("note style block: a correct example is missing");
  }
  return example.replaceAll("\u2014", "-").replaceAll("\u2013", "-");
}

/** Scope line, then one line per note rule, taken from the style guide. */
export function writerNoteStyleBlock() {
  const lines = [
    "These rules govern the note you are writing, not the draft you are reading. Do not comment on the draft's punctuation, number formatting, or house style. A separate check covers that.",
    "Follow them in the note itself:",
  ];
  for (const rule of noteStyleRules()) {
    lines.push(`- ${rule.id}: ${standardForNote(rule.description)} Write like this: ${exampleForNote(rule.correct_example)}`);
  }
  return lines.join("\n");
}
