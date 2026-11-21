/**
 * Renders the style guide for each consumer.
 * House style is the account's choices. The style guide is the rule set.
 */
import { createHash } from "node:crypto";
import { STYLE_GUIDE, VOICE_ROWS, guideEntry } from "./guide.mjs";
import { WRITING_PRINCIPLES, renderPrinciples } from "./principles.mjs";
import {
  EVALUATIVE_LANGUAGE_FIX_DIRECTION,
  EVALUATIVE_LANGUAGE_INSTRUCTION,
} from "../qc/evaluative-language.mjs";
import {
  FIRST_PERSON_ACTOR_FIX_DIRECTION,
  FIRST_PERSON_ACTOR_INSTRUCTION,
  buildFirstPersonActorInstruction,
  exampleAuthoringOrganisationName,
  resolveAuthoringOrganisationName,
  trimAuthoringOrganisationName,
} from "../qc/first-person-actor.mjs";

export const STYLE_CHOICE_DEFAULTS = Object.freeze({
  spelling: "US",
  thousands: "comma",
  legalIdentifiers: "omit",
  magnitude: "billions",
  quotes: "single",
  periods: "spelled",
  dates: "day_month",
  numberWords: "up_to_twelve",
  bannedWords: Object.freeze([]),
});

const SPELL_THROUGH = Object.freeze({
  up_to_twelve: 12,
  up_to_nine: 9,
  never: -1,
});

const THOUSANDS_MARK = Object.freeze({
  comma: ",",
  apostrophe: "'",
  space: " ",
});

const DATE_EXAMPLE = Object.freeze({
  day_month: "30 September 2026",
  month_day: "September 30, 2026",
});

const PERIOD_EXAMPLE = Object.freeze({
  spelled: "in the third quarter of 2026",
  abbreviated: "Q3 2026",
});

function allowed(entryId, value) {
  const entry = guideEntry(entryId);
  const options = entry.choice?.options || [];
  return options.some((option) => option.id === value);
}

function pick(entryId, value, fallback) {
  return allowed(entryId, value) ? value : fallback;
}

export function normaliseBannedWords(value) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const word = item.trim().toLowerCase();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

/**
 * House style for an account, a request, or a partial object.
 * A missing choice uses the new-account default. It does not use a personal pair.
 */
export function resolveStyleChoices(input) {
  const raw = input && typeof input === "object" ? input : {};
  const nested = raw.styleChoices && typeof raw.styleChoices === "object" ? raw.styleChoices : {};
  const styleChoices = raw.style_choices && typeof raw.style_choices === "object" ? raw.style_choices : {};
  const bag = { ...styleChoices, ...nested, ...raw };
  const spelling = bag.spelling === "UK" ? "UK" : bag.spelling === "US" ? "US" : STYLE_CHOICE_DEFAULTS.spelling;
  const thousands = pick("thousand_separator", bag.thousands, STYLE_CHOICE_DEFAULTS.thousands);
  return {
    spelling,
    thousands,
    legalIdentifiers: pick("legal_identifiers", bag.legalIdentifiers, STYLE_CHOICE_DEFAULTS.legalIdentifiers),
    magnitude: pick("magnitude", bag.magnitude, STYLE_CHOICE_DEFAULTS.magnitude),
    quotes: pick("smart_quotes", bag.quotes, STYLE_CHOICE_DEFAULTS.quotes),
    periods: pick("period_form", bag.periods, STYLE_CHOICE_DEFAULTS.periods),
    dates: pick("date_format", bag.dates, STYLE_CHOICE_DEFAULTS.dates),
    numberWords: pick("number_spelling", bag.numberWords, STYLE_CHOICE_DEFAULTS.numberWords),
    bannedWords: normaliseBannedWords(bag.bannedWords),
  };
}

export function choicesFromAccountRow(row) {
  if (!row || typeof row !== "object") return resolveStyleChoices(null);
  let stored = row.style_choices;
  if (typeof stored === "string") {
    try {
      stored = JSON.parse(stored);
    } catch (err) {
      console.error("[style] style_choices was not valid JSON", err?.message || err);
      stored = {};
    }
  }
  return resolveStyleChoices({
    spelling: row.spelling,
    thousands: row.thousands,
    ...(stored && typeof stored === "object" ? stored : {}),
  });
}

export function spellThroughFor(choices) {
  const key = resolveStyleChoices(choices).numberWords;
  const value = SPELL_THROUGH[key];
  if (!Number.isInteger(value)) throw new Error("style guide: number words choice is missing");
  return value;
}

export function styleFingerprint(choices) {
  const resolved = resolveStyleChoices(choices);
  return createHash("sha256").update(JSON.stringify(resolved), "utf8").digest("hex");
}

function selectedOption(entry, choices) {
  if (!entry.choice) return null;
  const resolved = resolveStyleChoices(choices);
  const mapped = {
    quotes: resolved.quotes,
    thousands: resolved.thousands,
    spelling: resolved.spelling,
    numberWords: resolved.numberWords,
    legalIdentifiers: resolved.legalIdentifiers,
    magnitude: resolved.magnitude,
    periods: resolved.periods,
    dates: resolved.dates,
    bannedWords: "list",
  };
  const id = mapped[entry.choice.id];
  return entry.choice.options.find((option) => option.id === id) || entry.choice.options[0];
}

function ruleSentence(entry, choices) {
  const resolved = resolveStyleChoices(choices);
  if (entry.id === "thousand_separator") {
    const mark = THOUSANDS_MARK[resolved.thousands];
    const sample = `5${mark}500`;
    const name = mark === "," ? "a comma" : mark === "'" ? "an apostrophe" : "a space";
    return `Use ${name} as the thousands separator, as in ${sample}. Do not put a thousands separator in a year.`;
  }
  if (entry.id === "english_variant") {
    return resolved.spelling === "UK"
      ? "Use UK English spellings: organise, colour, behaviour, centre. Do not flag text that is already UK English. A proper noun keeps its own spelling."
      : "Use US English spellings: organize, color, behavior, center. Do not flag text that is already US English. A proper noun keeps its own spelling.";
  }
  if (entry.id === "smart_quotes") {
    return resolved.quotes === "double"
      ? "Use straight double quotation marks. Do not use curly quotes or single quotation marks for speech."
      : "Use straight single quotation marks. Do not use curly quotes or double quotation marks for speech.";
  }
  if (entry.id === "number_spelling") {
    const through = spellThroughFor(resolved);
    if (through < 0) {
      return "Use numerals for every count. A measurement, a percentage, money, a multiple, a date, and a range already use numerals.";
    }
    const word = through === 9 ? "nine" : "twelve";
    return `Write a count of things from zero to ${word} in words. Always use numerals for a measurement with a unit, a percentage, money, a multiple, a date, a range, and ${through + 1} and above. When a small count and a large count of the same thing are compared, both are numerals. A fund number, a series, a product name, a ticker, and a clause number keep their form.`;
  }
  if (entry.id === "date_format") {
    const form = DATE_EXAMPLE[resolved.dates];
    return `Dates in prose use ${form}. Flag any other form, including an ISO date, a slash date, and an abbreviated month. Do not flag a month and a year with no day.`;
  }
  if (entry.id === "period_form") {
    return resolved.periods === "abbreviated"
      ? "Write a quarter, a half, and a financial year in the short form, as in Q3 2026, H1 2026, and FY2025."
      : "Spell a quarter, a half, and a financial year when it does not sit directly before the noun it describes, as in in the third quarter of 2026, the first half of 2026, and financial year 2025. Where the period sits directly before that noun, leave the text unchanged.";
  }
  if (entry.id === "legal_identifiers") {
    return resolved.legalIdentifiers === "keep"
      ? "Keep a legal identifier that follows a capitalised name, such as Ltd, Inc, or AS."
      : "Omit a legal identifier after a capitalised name. The identifiers are Ltd, Limited, Inc, plc, AG, AS, SA, SE, GmbH, BV, NV, SpA, SCSp, SCS, LP, LLP, LLC, s.r.o., ApS, AB, and Oy.";
  }
  if (entry.id === "magnitude") {
    return resolved.magnitude === "millions"
      ? "Keep amounts in millions. Do not convert them to billions."
      : "Write 1,000 million or more in billions to one decimal, as in GBP 5.0 billion.";
  }
  if (entry.id === "voice") {
    return VOICE_ROWS.map((row) => `${row.slug.replaceAll("_", " ")}: ${row.writing}`).join(" ");
  }
  if (entry.id === "banned_words") {
    const words = resolved.bannedWords;
    return words.length
      ? `Do not use any of these words: ${words.join(", ")}.`
      : "This account has no banned words.";
  }
  if (entry.id === "hyperbole_vs_qualitative") {
    return `${entry.rule} ${EVALUATIVE_LANGUAGE_INSTRUCTION}`;
  }
  return entry.rule;
}

function examplesFor(entry, choices) {
  const resolved = resolveStyleChoices(choices);
  if (entry.id === "date_format") {
    const chosen = DATE_EXAMPLE[resolved.dates];
    const other = chosen === DATE_EXAMPLE.day_month ? DATE_EXAMPLE.month_day : DATE_EXAMPLE.day_month;
    return { correct: [chosen], incorrect: [other] };
  }
  if (entry.id === "period_form") {
    const chosen = PERIOD_EXAMPLE[resolved.periods];
    const other = chosen === PERIOD_EXAMPLE.spelled ? PERIOD_EXAMPLE.abbreviated : PERIOD_EXAMPLE.spelled;
    return { correct: [chosen], incorrect: [other] };
  }
  const option = selectedOption(entry, resolved);
  if (option && entry.choice && entry.id !== "number_spelling" && entry.id !== "banned_words") {
    return { correct: [option.example], incorrect: entry.incorrect || [] };
  }
  return { correct: entry.correct || [], incorrect: entry.incorrect || [] };
}

export function renderDraftStyleSection(choices, opts = {}) {
  const resolved = resolveStyleChoices(choices);
  const slug = opts.outputType ? outputTypeSlug(opts.outputType) : "";
  const lines = STYLE_GUIDE.map((entry) => {
    if (entry.id === "voice" && slug) {
      const row = VOICE_ROWS.find((item) => item.slug === slug);
      return row ? `- ${row.writing}` : `- ${ruleSentence(entry, resolved)}`;
    }
    const examples = examplesFor(entry, resolved);
    const correct = examples.correct.length ? ` Correct: ${examples.correct.join(" ")}` : "";
    return `- ${ruleSentence(entry, resolved)}${correct}`;
  });
  return `Style guide:\n${lines.join("\n")}`;
}

const CANONICAL_TO_OUTPUT_SLUG = {
  GENERAL_TEXT: "general_text",
  REPORTING_COMMENTARY: "reporting_commentary",
  INVESTOR_LETTER: "investor_letter",
  PRESS_RELEASE: "press_release",
  LINKEDIN_POST: "linkedin_post",
};

export function outputTypeSlug(rawOutputType) {
  if (typeof rawOutputType !== "string" || !rawOutputType.trim()) return "reporting_commentary";
  const trimmed = rawOutputType.trim();
  const upper = trimmed.toUpperCase().replaceAll("-", "_");
  if (CANONICAL_TO_OUTPUT_SLUG[upper]) return CANONICAL_TO_OUTPUT_SLUG[upper];
  const lower = trimmed.toLowerCase();
  if (Object.values(CANONICAL_TO_OUTPUT_SLUG).includes(lower)) return lower;
  if (lower === "general_text") return "general_text";
  return "reporting_commentary";
}

function appliesTo(entry, slug) {
  const types = entry.scope?.outputTypes || ["*"];
  if (types.includes("*")) return true;
  return types.includes(slug);
}

/**
 * Style rules for Review, in the shape the reviewer already reads.
 * The voice entry is exposed as first_person_plural so existing scans keep their id.
 */
export function renderReviewStyleRules(choices, context = {}) {
  const fromContext = resolveStyleChoices({
    ...(choices && typeof choices === "object" ? choices : {}),
    ...(context.houseStyle && typeof context.houseStyle === "object" ? context.houseStyle : {}),
    ...(context.styleChoices && typeof context.styleChoices === "object" ? context.styleChoices : {}),
  });
  const slug = context.all === true ? "" : outputTypeSlug(context.outputType);
  const house = context.promptHouseName !== undefined
    ? trimAuthoringOrganisationName(context.promptHouseName)
    : resolveAuthoringOrganisationName(context.authoringOrganisation);
  return STYLE_GUIDE.filter((entry) => {
    if (entry.id === "banned_words") return false;
    if (context.all === true) return true;
    if (entry.id === "voice" && (slug === "investor_letter" || slug === "linkedin_post")) return false;
    return appliesTo(entry, slug);
  }).map((entry) => {
    const examples = examplesFor(entry, fromContext);
    const id = entry.id === "voice" ? "first_person_plural" : entry.id;
    const description = entry.id === "voice"
      ? `${ruleSentence(entry, fromContext)} ${house ? buildFirstPersonActorInstruction(house) : FIRST_PERSON_ACTOR_INSTRUCTION}`
      : ruleSentence(entry, fromContext);
    const rule = {
      id,
      description,
      correct_example: examples.correct.join(" "),
      incorrect_example: examples.incorrect.join(" "),
      applies_to: entry.id === "voice"
        ? ["reporting_commentary"]
        : (entry.scope?.outputTypes || ["*"]),
      layer: entry.layer,
    };
    if (entry.layer === 2) rule.client = "CLIENT";
    if (entry.id === "number_spelling") rule.spellThrough = spellThroughFor(fromContext);
    if (entry.id === "hyperbole_vs_qualitative") rule.fixDirection = EVALUATIVE_LANGUAGE_FIX_DIRECTION;
    if (entry.id === "voice") {
      const name = exampleAuthoringOrganisationName(house);
      rule.fixDirection = FIRST_PERSON_ACTOR_FIX_DIRECTION;
      rule.correct_example = `${name} was attracted to Meridian. ${name} believes the fund should deliver. available to ${name}. ${name} completed the investment.`;
      rule.incorrect_example = "We believe the fund should deliver. available to us. We committed, in a reporting commentary. We announced, in the body of a press release.";
    }
    return rule;
  });
}

export function autoFixTransformIds() {
  const ids = [];
  for (const entry of STYLE_GUIDE) {
    const id = entry.enforcement?.transformId;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function deterministicScanIds() {
  const ids = [];
  for (const entry of STYLE_GUIDE) {
    const id = entry.enforcement?.scanId;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

const CATEGORY_LABELS = Object.freeze({
  mechanics: "Mechanics",
  numbers: "Numbers",
  names: "Names",
  terms: "Terms",
  punctuation: "Punctuation",
  voice: "Voice",
  craft: "Craft",
});

export function renderHouseRulesView(choices) {
  const resolved = resolveStyleChoices(choices);
  const groups = [];
  for (const entry of STYLE_GUIDE) {
    const label = CATEGORY_LABELS[entry.category] || entry.category;
    let group = groups.find((row) => row.category === entry.category);
    if (!group) {
      group = { category: entry.category, label, rules: [] };
      groups.push(group);
    }
    const examples = examplesFor(entry, resolved);
    const kind = entry.enforcement?.kind || "guidance";
    group.rules.push({
      id: entry.id,
      rule: ruleSentence(entry, resolved),
      correct: examples.correct,
      incorrect: examples.incorrect,
      enforcement: kind,
      enforcementLabel: kind === "auto-fix" ? "Fixed automatically" : kind === "review-flag" ? "Flagged by Review" : "Guidance",
      choice: entry.choice
        ? {
          id: entry.choice.id,
          selected: selectedOption(entry, resolved)?.id || null,
          options: entry.choice.options,
        }
        : null,
    });
  }
  return {
    groups,
    voice: VOICE_ROWS.map((row) => ({
      slug: row.slug,
      label: row.label,
      person: row.person,
      sentence: row.sentence,
      writing: row.writing,
    })),
    choices: resolved,
    bannedWords: resolved.bannedWords,
  };
}

const CHOICE_ORDER = Object.freeze([
  "spelling",
  "dates",
  "numberWords",
  "thousands",
  "magnitude",
  "periods",
  "quotes",
  "legalIdentifiers",
]);

const CHOICE_LABELS = Object.freeze({
  spelling: "Spelling",
  thousands: "Thousands separator",
  quotes: "Quotation marks",
  numberWords: "Numbers in words",
  dates: "Dates",
  legalIdentifiers: "Legal suffixes",
  periods: "Periods",
  magnitude: "Large amounts",
});

export function renderHouseStylePage(choices) {
  const view = renderHouseRulesView(choices);
  const settingsChoices = [];
  const choiceEntries = STYLE_GUIDE
    .filter((entry) => entry.choice && entry.choice.id !== "bannedWords")
    .sort((a, b) => CHOICE_ORDER.indexOf(a.choice.id) - CHOICE_ORDER.indexOf(b.choice.id));
  for (const entry of choiceEntries) {
    const selected = selectedOption(entry, view.choices);
    settingsChoices.push({
      id: entry.choice.id,
      entryId: entry.id,
      label: CHOICE_LABELS[entry.choice.id] || entry.choice.id,
      selected: selected?.id || null,
      options: entry.choice.options.map((option) => ({
        id: option.id,
        label: option.label,
        example: option.example,
      })),
      example: selected?.example || "",
    });
  }
  const fresh = resolveStyleChoices(null);
  return {
    ...view,
    settingsChoices,
    defaults: Object.fromEntries(settingsChoices.map((row) => [row.id, fresh[row.id]])),
    principles: WRITING_PRINCIPLES.map((row) => ({
      id: row.id,
      text: row.text,
      example: row.example,
    })),
  };
}

export function renderDraftingInstructions(opts = {}) {
  const choices = resolveStyleChoices(opts.houseStyle || opts.styleChoices || opts);
  return [renderPrinciples(opts), renderDraftStyleSection(choices, opts)].filter(Boolean).join("\n\n");
}

export { renderPrinciples };
