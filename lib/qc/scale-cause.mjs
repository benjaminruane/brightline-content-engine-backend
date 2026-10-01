/**
 * B362 Part four / B361 slice d plus inventory half of a.
 * Closed lexicon for scale and cause. Arithmetic when two comparable money
 * figures sit in the displayed passages. Universal-set plus one named holding
 * is not confirmed. Deterministic. No model call.
 */
import { CAUSAL_CONNECTIVES } from "./objectionable-term.mjs";
import { collectBackstopFigures } from "./pipeline-v4/stage2-match-sources.mjs";
import { splitSentences, sentenceConfirms } from "./card-honesty.mjs";

function asText(value) {
  return typeof value === "string" ? value : "";
}

const SCALE_PHRASES = [
  "vast majority",
  "virtually all",
  "essentially all",
  "accounted for",
  "majority",
  "largely",
  "primarily",
  "mainly",
  "most",
];

const PERIOD_RE =
  /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:reporting\s+)?(?:period|periods|month|months|year|years)\b/gi;

const DATE_RE =
  /\b(?:Q[1-4]\s*20\d{2}|FY\s*20\d{2}|H[12]\s*20\d{2}|20\d{2}|January|February|March|April|May|June|July|August|September|October|November|December)\b/gi;

const ACROSS_RE = /\bacross\s+(?:\S+\s+){0,8}(?:all(?:\s+of\s+its)?(?:\s+investments)?|investments)\b/gi;

const UNIVERSAL_RE = /\bessentially all\b|\ball of its\b|\bacross\s+(?:\S+\s+){0,8}investments\b/gi;

// AUTHOR-NAME-BLIND: this regex collects holdings the confirming passage names as
// the gain, so a universal-set claim can be checked against that set. The
// authoring organisation is a legitimate holding name when the source credits
// a gain in it. Excluding it would hide a one-holding miss where the only named
// gain is the author, and would invent a miss where the author is one of several.
const GAIN_HOLDING_RE =
  /\b(?:uplift|gain|gains)\s+in\s+([A-Z]{2,}|\d[A-Za-z][A-Za-z0-9]*|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;

const SCALE_RATIO = {
  "vast majority": 2 / 3,
  majority: 1 / 2,
  "essentially all": 0.9,
  "virtually all": 0.9,
};

function escapeRe(text) {
  return asText(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function overlapsAny(start, end, ranges) {
  for (const [s, e] of ranges) {
    if (overlaps(start, end, s, e)) return true;
  }
  return false;
}

function collectRegexRanges(text, re) {
  const t = asText(text);
  const out = [];
  const copy = new RegExp(re.source, re.flags);
  let m;
  while ((m = copy.exec(t))) {
    out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

function blockedRanges(text) {
  return [...collectRegexRanges(text, PERIOD_RE), ...collectRegexRanges(text, DATE_RE)];
}

function phraseHits(text, phrases, blocked) {
  const t = asText(text);
  const found = [];
  for (const phrase of phrases) {
    const re = new RegExp(`\\b${escapeRe(phrase)}\\b`, "gi");
    let m;
    while ((m = re.exec(t))) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlapsAny(start, end, blocked)) continue;
      found.push({ text: m[0], start, end });
    }
  }
  const across = new RegExp(ACROSS_RE.source, ACROSS_RE.flags);
  let m;
  while ((m = across.exec(t))) {
    const start = m.index;
    const end = start + m[0].length;
    if (overlapsAny(start, end, blocked)) continue;
    found.push({ text: m[0], start, end });
  }
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const taken = [];
  const out = [];
  for (const hit of found) {
    if (overlapsAny(hit.start, hit.end, taken)) continue;
    taken.push([hit.start, hit.end]);
    out.push(hit.text);
  }
  return out;
}

/**
 * Closed lexicon hits in a statement, excluding period tokens and dates.
 * Longer phrases win when they overlap.
 */
export function extractScaleCauseClaims(statement) {
  const t = asText(statement);
  if (!t.trim()) return [];
  const phrases = [...CAUSAL_CONNECTIVES, ...SCALE_PHRASES].sort((a, b) => b.length - a.length);
  return phraseHits(t, phrases, blockedRanges(t));
}

export function universalSetHits(statement) {
  const t = asText(statement);
  const out = [];
  const re = new RegExp(UNIVERSAL_RE.source, UNIVERSAL_RE.flags);
  let m;
  while ((m = re.exec(t))) {
    const hit = m[0];
    if (/^across/i.test(hit) && !/\bessentially all\b|\ball of its\b/i.test(hit)) {
      const before = t.slice(Math.max(0, m.index - 28), m.index);
      if (/\bincluding\b/i.test(before)) continue;
    }
    out.push(hit);
  }
  return out;
}

export function holdingsNamedAsGain(passages) {
  const seen = new Set();
  const out = [];
  for (const passage of Array.isArray(passages) ? passages : []) {
    const t = asText(passage);
    const re = new RegExp(GAIN_HOLDING_RE.source, GAIN_HOLDING_RE.flags);
    let m;
    while ((m = re.exec(t))) {
      const name = asText(m[1]).trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

function moneyFiguresPerPassage(passages) {
  const out = [];
  for (const passage of Array.isArray(passages) ? passages : []) {
    const seen = new Set();
    const figs = [];
    for (const fig of collectBackstopFigures(passage)) {
      if (fig?.kind !== "money") continue;
      const key = `${fig.value}|${fig.currency || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      figs.push(fig);
    }
    out.push(figs);
  }
  return out;
}

function scaleThreshold(statement) {
  const t = asText(statement).toLowerCase();
  for (const [phrase, ratio] of Object.entries(SCALE_RATIO)) {
    if (t.includes(phrase)) return { phrase, ratio };
  }
  return null;
}

/**
 * Null when arithmetic cannot run. Two money figures count as comparable
 * only when they come from two different displayed passages and each of
 * those passages holds exactly one money figure. A prior-year pair in the
 * same quote is not a part/whole.
 */
export function arithmeticScaleCheck(statement, displayedPassages) {
  const threshold = scaleThreshold(statement);
  if (!threshold) return null;
  const per = moneyFiguresPerPassage(displayedPassages);
  const singletons = [];
  for (const figs of per) {
    if (figs.length === 1) singletons.push(figs[0]);
  }
  if (singletons.length !== 2) return null;
  const currencies = [...new Set(singletons.map((f) => f.currency || ""))];
  if (currencies.length === 2 && currencies[0] && currencies[1] && currencies[0] !== currencies[1]) {
    return null;
  }
  const values = singletons.map((f) => f.value).sort((a, b) => a - b);
  const whole = values[1];
  if (!(whole > 0)) return null;
  const ratio = values[0] / whole;
  return {
    pass: ratio + 1e-9 >= threshold.ratio,
    ratio,
    threshold: threshold.ratio,
    phrase: threshold.phrase,
  };
}

function dropConfirmingSetSentences(commentary) {
  const kept = [];
  for (const sentence of splitSentences(commentary)) {
    const t = sentence.trim();
    if (/\bconfirms the statement\b/i.test(t)) continue;
    if (/\baligns with the statement\b/i.test(t)) continue;
    if (sentenceConfirms(t) && universalSetHits(t).length > 0) continue;
    kept.push(sentence);
  }
  return kept.join("").replace(/\s+$/, "").trim();
}

function prependSentence(commentary, sentence) {
  const body = asText(commentary).replace(/^\s+/, "");
  return body ? `${sentence} ${body}` : sentence;
}

/**
 * Display-only demotion when a universal-set claim is backed by exactly one
 * named holding as the gain, or when two displayed money figures fail the
 * claimed scale. supportState is unchanged.
 */
export function applyScaleCauseCheck({
  statement,
  displayedPassages,
  confirmingPassages,
  displayVerdict,
  evidenceSummary,
} = {}) {
  const passages = Array.isArray(displayedPassages) ? displayedPassages : [];
  const confirming = Array.isArray(confirmingPassages) ? confirmingPassages : passages;
  if (displayVerdict === "supported_full") {
    const setHits = universalSetHits(statement);
    const holdings = holdingsNamedAsGain(confirming.length ? confirming : passages);
    if (setHits.length > 0 && holdings.length === 1) {
      const holding = holdings[0];
      const finding = `The source names a valuation uplift in ${holding}, not gains across essentially all of its investments.`;
      const next = prependSentence(dropConfirmingSetSentences(evidenceSummary), finding);
      return {
        applied: true,
        reason: "scale_set_one_holding",
        displayVerdict: "conflict",
        concernLevel: "high",
        displayVerdictReason: "scale_set_one_holding",
        evidenceSummary: next,
        holding,
      };
    }
    const arith = arithmeticScaleCheck(statement, passages);
    if (arith && arith.pass === false) {
      const finding = "The displayed figures do not support the claimed scale.";
      const next = prependSentence(asText(evidenceSummary), finding);
      return {
        applied: true,
        reason: "scale_arithmetic",
        displayVerdict: "conflict",
        concernLevel: "high",
        displayVerdictReason: "scale_arithmetic",
        evidenceSummary: next,
      };
    }
  }
  return {
    applied: false,
    displayVerdict,
    evidenceSummary: asText(evidenceSummary),
  };
}
