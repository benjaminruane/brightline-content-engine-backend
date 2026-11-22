/**
 * B394 element extractor. Matching and name rules follow
 * scripts/diagnostic/b394/ELEMENTS-v3.md.
 * B403A adds the line of each hit, and drops a cardinal that only
 * states the length of a period whose endpoint is in the same sentence.
 * B403C adds benchmark words. A swap inside that closed list changes the claim,
 * so the list is not extended. Callers of extractElements are reading-contract,
 * b392/cross-table.mjs, b396, b397, b398, and b401. A re-run of those diagnostics
 * will see benchmark elements as well as figures, dates, and names.
 * B458. A figure qualified by a hedge carries that hedge, and elementFound
 * accepts a source figure that satisfies it. An equal figure does not
 * satisfy more than, less than, or modestly above.
 * scripts/diagnostic/b392/elements.mjs re-exports this file.
 * B565. Currency, scale, dates, and periods follow the equivalences named
 * on the style guide. A percent and a money amount joined by "to" are not a range.
 */
import { bareDollarUnit, currencyAlternation, currencyUnit, scaleName, scaleSuffixAlternation, shortYear } from "./figure-equivalence.mjs";

/**
 * A word is on this list only when swapping it for another word on the list
 * changes what is being claimed. Outlook, estimate, plan, and assumption do
 * not: each is often the same claim as forecast or guidance. Guidance and
 * consensus have no ordinary plural on the list.
 */
export const BENCHMARK_WORDS = [
  "budget",
  "budgets",
  "expectation",
  "expectations",
  "forecast",
  "forecasts",
  "guidance",
  "target",
  "targets",
  "consensus",
];
const SCALE_WORD = "thousand|million|billion|bn|mn";
const CARDINALS =
  "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty";
const MONTH =
  "january|february|march|april|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|may";

const MONTH_INDEX = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MUST_KEEP = new Set("action hicl hcil fortysouth johor switzerland 3i".split(" "));
const EXPANSIONS = [
  { abbr: "CEO", phrases: ["chief executive officer", "chief executive"] },
  { abbr: "CFO", phrases: ["chief financial officer"] },
  { abbr: "COO", phrases: ["chief operating officer"] },
  { abbr: "CIO", phrases: ["chief information officer"] },
  { abbr: "CTO", phrases: ["chief technology officer"] },
  { abbr: "LFL", phrases: ["like-for-like", "like for like"] },
  { abbr: "NAV", phrases: ["net asset value"] },
];
const NOT_A_NAME = new Set(
  `${CARDINALS.replace(/\|/g, " ")} thousand million billion bn mn percent ${MONTH} usd gbp eur sek`.split(/\s+/)
);

const SCALE_MULT = {
  "": 1,
  thousand: 1e3,
  k: 1e3,
  million: 1e6,
  mn: 1e6,
  m: 1e6,
  billion: 1e9,
  bn: 1e9,
};

function overlaps(spans, start, end) {
  return spans.some((span) => start < span.end && end > span.start);
}

function pushSpan(spans, start, end) {
  spans.push({ start, end });
}

export function normaliseName(text) {
  return String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function yearOk(year) {
  return year >= 1900 && year <= 2099;
}

function dayOk(day) {
  return day >= 1 && day <= 31;
}

function collectDates(text, spans) {
  const found = [];
  const add = (start, end, surface, key) => {
    if (overlaps(spans, start, end)) return;
    pushSpan(spans, start, end);
    found.push({ kind: "date", surface, start, end, key });
  };
  const quarterKey = (q, token) => {
    const year = shortYear(token);
    const quarter = Number(q);
    if (!year || quarter < 1 || quarter > 4) return null;
    return `${year}-Q${quarter}`;
  };
  const halfKey = (h, token) => {
    const year = shortYear(token);
    const half = Number(h);
    if (!year || (half !== 1 && half !== 2)) return null;
    return `${year}-H${half}`;
  };
  const fyKey = (token) => {
    const year = shortYear(token);
    return year ? `FY${year}` : null;
  };
  const patterns = [
    {
      re: /\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/g,
      build: (m) => {
        const year = +m[1];
        const month = +m[2];
        const day = +m[3];
        if (!yearOk(year) || month < 1 || month > 12 || !dayOk(day)) return null;
        return `${year}-${pad(month)}-${pad(day)}`;
      },
    },
    {
      re: /\b(\d{1,2})\/(\d{1,2})\/((?:19|20)\d{2})\b/g,
      build: (m) => {
        const day = +m[1];
        const month = +m[2];
        const year = +m[3];
        if (!yearOk(year) || month < 1 || month > 12 || !dayOk(day)) return null;
        return `${year}-${pad(month)}-${pad(day)}`;
      },
    },
    {
      re: /\b(?:financial\s+year|fiscal(?:\s+year)?)\s+((?:19|20)\d{2})\b/gi,
      build: (m) => fyKey(m[1]),
    },
    { re: /\bFY\s?((?:19|20)\d{2})\b/gi, build: (m) => fyKey(m[1]) },
    { re: /\bFY\s?'?(\d{2})\b/gi, build: (m) => fyKey(m[1]) },
    {
      re: /\b([1-4])Q\s?'?(\d{2}|(?:19|20)\d{2})\b/gi,
      build: (m) => quarterKey(m[1], m[2]),
    },
    {
      re: /\bQ([1-4])\s*['\u2019]\s?(\d{2})\b/gi,
      build: (m) => quarterKey(m[1], m[2]),
    },
    {
      re: /\b([12])H\s?'?(\d{2}|(?:19|20)\d{2})\b/gi,
      build: (m) => halfKey(m[1], m[2]),
    },
    {
      re: /\bH([12])\s*['\u2019]\s?(\d{2})\b/gi,
      build: (m) => halfKey(m[1], m[2]),
    },
    {
      re: /\bQ([1-4])\s+((?:19|20)\d{2})\b/gi,
      build: (m) => (yearOk(+m[2]) ? `${m[2]}-Q${m[1]}` : null),
    },
    {
      re: /\b(first|second|third|fourth)\s+quarter(?:\s+of)?\s+((?:19|20)\d{2})\b/gi,
      build: (m) => {
        const q = { first: 1, second: 2, third: 3, fourth: 4 }[m[1].toLowerCase()];
        return yearOk(+m[2]) ? `${m[2]}-Q${q}` : null;
      },
    },
    {
      re: /\bH([12])\s+((?:19|20)\d{2})\b/gi,
      build: (m) => (yearOk(+m[2]) ? `${m[2]}-H${m[1]}` : null),
    },
    {
      re: /\b(first|second)\s+half(?:\s+of)?\s+((?:19|20)\d{2})\b/gi,
      build: (m) => {
        const h = m[1].toLowerCase() === "first" ? 1 : 2;
        return yearOk(+m[2]) ? `${m[2]}-H${h}` : null;
      },
    },
    {
      re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH})\\s+(\\d{4})\\b`, "gi"),
      build: (m) => {
        const month = MONTH_INDEX[m[2].toLowerCase()];
        const day = +m[1];
        const year = +m[3];
        if (!month || !dayOk(day) || !yearOk(year)) return null;
        return `${year}-${pad(month)}-${pad(day)}`;
      },
    },
    {
      re: new RegExp(`\\b(${MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?,\\s+(\\d{4})\\b`, "gi"),
      build: (m) => {
        const month = MONTH_INDEX[m[1].toLowerCase()];
        const day = +m[2];
        const year = +m[3];
        if (!month || !dayOk(day) || !yearOk(year)) return null;
        return `${year}-${pad(month)}-${pad(day)}`;
      },
    },
    {
      re: new RegExp(`\\b(${MONTH})\\s+((?:19|20)\\d{2})\\b`, "gi"),
      build: (m) => {
        const month = MONTH_INDEX[m[1].toLowerCase()];
        const year = +m[2];
        if (!month || !yearOk(year)) return null;
        return `${year}-${pad(month)}`;
      },
    },
    {
      re: /(?<![\w.])((?:19|20)\d{2})(?![\w])/gi,
      build: (m) => (yearOk(+m[1]) ? m[1] : null),
    },
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.re)) {
      const key = pattern.build(match);
      if (!key) continue;
      add(match.index, match.index + match[0].length, match[0], key);
    }
  }
  return found;
}

function currencyOf(raw) {
  return currencyUnit(raw);
}

function scaleOf(word, suffix, currency) {
  const token = String(word || suffix || "").toLowerCase();
  if (!token) return "";
  if (token === "mm" && !currency) return "";
  return scaleName(token);
}

function unitOf(currency, percent) {
  if (percent) return "percent";
  if (currency) return currencyOf(currency);
  return "bare";
}

function refold(figure) {
  const major = figure.minor ? figure.written / 100 : figure.written;
  figure.folded = figure.sign * major * SCALE_MULT[figure.scale || ""];
}

function applyMinor(figure, minorToken) {
  const token = String(minorToken || "").toLowerCase();
  if (!token || figure.unit === "percent") return figure;
  const pence = token === "p" || token === "pence";
  const cents = token === "c" || token === "cents";
  const ore = token === "öre" || token === "ore";
  if (!pence && !cents && !ore) return figure;
  if (pence) {
    if (figure.unit !== "bare" && figure.unit !== "GBP") return figure;
    figure.unit = "GBP";
    figure.minor = "pence";
  } else if (ore) {
    if (figure.unit !== "bare" && figure.unit !== "SEK") return figure;
    figure.unit = "SEK";
    figure.minor = "ore";
  } else if (figure.unit === "USD" || figure.unit === "EUR") {
    figure.minor = "cents";
  } else if (figure.unit === "bare") {
    figure.unit = "cent";
    figure.minor = "cents";
  } else {
    return figure;
  }
  refold(figure);
  return figure;
}

function figureFrom(match, parts) {
  const { sign, currency, body, frac, scaleWord, scaleSuffix, percent } = parts;
  if (!body) return null;
  const compact = body.replace(/[,'\u2019 ]/g, "");
  if (/^\d+$/.test(compact) && /^(?:19|20)\d{2}$/.test(compact) && !currency && !scaleWord && !scaleSuffix && !percent) {
    return null;
  }
  const digits = `${body}${frac || ""}`.replace(/[,'\u2019 ]/g, "");
  const decimals = frac ? frac.length - 1 : 0;
  const mantissa = Number(digits.replace(".", ""));
  if (!Number.isFinite(mantissa)) return null;
  const scale = scaleOf(scaleWord, scaleSuffix, currency);
  const unit = unitOf(currency, percent);
  const signNum = sign === "-" ? -1 : 1;
  const written = mantissa / 10 ** decimals;
  return {
    kind: "figure",
    surface: match[0],
    start: match.index,
    end: match.index + match[0].length,
    sign: signNum,
    written,
    decimals,
    scale,
    unit,
    currencyMark: currency || "",
    minor: null,
    folded: signNum * written * SCALE_MULT[scale],
    hedge: "",
  };
}

const HEDGE_PHRASES = [
  ["modestly above", "modestly_above"],
  ["more than", "gt"],
  ["less than", "lt"],
  ["approximately", "approx"],
  ["roughly", "approx"],
  ["nearly", "nearly"],
  ["around", "approx"],
  ["about", "approx"],
  ["over", "gt"],
  ["under", "lt"],
];

function hedgeOf(text, start) {
  const before = String(text || "").slice(Math.max(0, start - 48), start).replace(/\s+$/, "");
  for (const [phrase, kind] of HEDGE_PHRASES) {
    const atEnd = new RegExp(`(?:^|\\W)${phrase}(?:\\s+(?:the|a|an))?$`, "i");
    if (!atEnd.test(before)) continue;
    if ((phrase === "over" || phrase === "under") && new RegExp(`(?:^|\\W)${phrase}\\s+(?:the|a|an)$`, "i").test(before)) {
      return "";
    }
    return kind;
  }
  return "";
}

function collectFigures(text, spans) {
  const currency = currencyAlternation();
  const suffix = scaleSuffixAlternation();
  const numberBody = "\\d{1,3}(?:[,\\u2019' ]\\d{3})+|\\d+";
  const digitRe = new RegExp(
    `(?<![\\w.%\\d])(-?)(?:(${currency})\\s*)?(${numberBody})(\\.\\d+)?(?:\\s+(${SCALE_WORD})\\b|(${suffix})\\b)?(?:\\s*(%|percent)(?!\\w))?(?:\\s+(pence|cents|öre|ore)\\b|([pc])\\b|x\\b)?(?![A-Za-z])`,
    "gi"
  );
  const wordRe = new RegExp(
    `(?<![\\w])(-?)(?:(${currency})\\s+)?\\b(${CARDINALS})\\b(?:\\s+(${SCALE_WORD}))?(?:\\s+(percent)\\b|\\s*%)?`,
    "gi"
  );
  const pending = [];
  const take = (match, parts) => {
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(spans, start, end)) return;
    const figure = figureFrom(match, parts);
    if (!figure) return null;
    if (figure.unit !== "percent" && figure.currencyMark === "$") {
      figure.unit = bareDollarUnit(text);
      refold(figure);
    }
    applyMinor(figure, parts.minor);
    figure.hedge = hedgeOf(text, figure.start);
    pending.push(figure);
    return figure;
  };
  const claim = (match, parts, unit) => {
    const before = pending.length;
    const figure = take(match, parts);
    if (!figure || pending.length === before) return;
    if (unit) {
      figure.unit = unit;
      refold(figure);
    }
    pushSpan(spans, figure.start, figure.end);
  };
  const amount = "(\\d{1,3}(?:[, '\\u2019]\\d{3})+|\\d+)(\\.\\d+)?";
  for (const match of text.matchAll(new RegExp(`\\(${amount}\\)\\s*%`, "g"))) {
    claim(match, { sign: "-", currency: "", body: match[1], frac: match[2] || "", scaleWord: "", scaleSuffix: "", percent: "%", minor: "" });
  }
  for (const match of text.matchAll(new RegExp(`\\bminus\\s+${amount}(?:\\s*(%|percent)|\\s+per\\s+cent)?`, "gi"))) {
    const percent = match[3] || (/\bper\s+cent/i.test(match[0]) ? "%" : "");
    claim(match, { sign: "-", currency: "", body: match[1], frac: match[2] || "", scaleWord: "", scaleSuffix: "", percent, minor: "" });
  }
  for (const match of text.matchAll(new RegExp(`${amount}\\s+per\\s+cent\\b`, "gi"))) {
    claim(match, { sign: "", currency: "", body: match[1], frac: match[2] || "", scaleWord: "", scaleSuffix: "", percent: "%", minor: "" });
  }
  for (const match of text.matchAll(new RegExp(`${amount}\\s+(?:basis\\s+points|bps)\\b`, "gi"))) {
    claim(match, { sign: "", currency: "", body: match[1], frac: match[2] || "", scaleWord: "", scaleSuffix: "", percent: "", minor: "" }, "bp");
  }
  for (const match of text.matchAll(new RegExp(`${amount}\\s+(?:percentage\\s+points|pp)\\b`, "gi"))) {
    claim(match, { sign: "", currency: "", body: match[1], frac: match[2] || "", scaleWord: "", scaleSuffix: "", percent: "", minor: "" }, "pp");
  }
  for (const match of text.matchAll(/(\d+)(\.\d+)?\s+times(?:\s+cost)?\b/gi)) {
    claim(match, { sign: "", currency: "", body: match[1], frac: match[2] || "", scaleWord: "", scaleSuffix: "", percent: "", minor: "" });
  }
  for (const match of text.matchAll(digitRe)) {
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 2);
    if (/^(st|nd|rd|th)\b/i.test(after) && !match[5] && !match[6] && !match[7]) continue;
    take(match, {
      sign: match[1],
      currency: match[2],
      body: match[3],
      frac: match[4],
      scaleWord: match[5],
      scaleSuffix: match[6],
      percent: match[7],
      minor: match[8] || match[9] || "",
    });
  }
  const words = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
  for (const match of text.matchAll(wordRe)) {
    take(match, {
      sign: match[1],
      currency: match[2],
      body: String(words[match[3].toLowerCase()]),
      frac: "",
      scaleWord: match[4],
      scaleSuffix: "",
      percent: match[5] || (match[0].includes("%") ? "%" : ""),
      minor: "",
    });
  }
  pending.sort((a, b) => a.start - b.start);
  for (let i = 1; i < pending.length; i += 1) {
    const prev = pending[i - 1];
    const curr = pending[i];
    const between = text.slice(prev.end, curr.start);
    // A hyphen, the word to, or a dash that arrived as ñ (a damaged en dash) joins a range.
    if (!/^\s*(?:-|\u2013|\u2014|to|\u00f1|\u00d1|\uFFFD)\s*$/i.test(between)) continue;
    const percentSide = prev.unit === "percent" || curr.unit === "percent";
    const moneySide = (prev.unit !== "percent" && prev.unit !== "bare") || (curr.unit !== "percent" && curr.unit !== "bare");
    if (percentSide && moneySide) continue;
    if (prev.unit === "percent" || curr.unit === "percent") {
      prev.unit = "percent";
      curr.unit = "percent";
      refold(prev);
      refold(curr);
      continue;
    }
    if (prev.unit !== "bare" && curr.unit !== "bare" && prev.unit !== curr.unit) continue;
    if (prev.scale && curr.scale && prev.scale !== curr.scale) continue;
    if (!prev.scale && curr.scale) prev.scale = curr.scale;
    if (!curr.scale && prev.scale) curr.scale = prev.scale;
    if (prev.unit === "bare" && curr.unit !== "bare") prev.unit = curr.unit;
    if (curr.unit === "bare" && prev.unit !== "bare") curr.unit = prev.unit;
    if (prev.hedge && !curr.hedge) curr.hedge = prev.hedge;
    refold(prev);
    refold(curr);
  }
  for (const figure of pending) pushSpan(spans, figure.start, figure.end);
  return pending;
}

function stripNameEdge(surface) {
  let cleaned = surface.replace(/(?:'s|’s)$/i, "");
  if (!/^St\.$/.test(cleaned)) cleaned = cleaned.replace(/[.,;:]+$/, "");
  return cleaned;
}

function collectNames(text, spans, corpus) {
  const tokenRe = /(?<![\p{L}0-9])(?:\p{Lu}[\p{L}0-9'’]*|\d+\p{L}[\p{L}0-9'’]*)(?:\.\p{L}[\p{L}0-9'’]*)*\.?/gu;
  const tokens = [...text.matchAll(tokenRe)];
  const names = [];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const surface = text.slice(run[0].index, run[run.length - 1].index + run[run.length - 1][0].length);
    const start = run[0].index;
    const end = run[run.length - 1].index + run[run.length - 1][0].length;
    run = [];
    if (overlaps(spans, start, end)) return;
    const cleaned = stripNameEdge(surface);
    let words = cleaned.split(/\s+/).filter(Boolean);
    if (start === firstWordStart(text) && words.length) {
      const first = words[0].replace(/\.$/, "");
      const key = first.toLowerCase();
      if (!MUST_KEEP.has(key) && !capitalisedAwayFromSentenceStart(corpus, first)) {
        words = words.slice(1);
      }
    }
    const kept = words.filter((word) => {
      const key = word.toLowerCase().replace(/\./g, "");
      return !NOT_A_NAME.has(key);
    });
    if (!kept.length) return;
    const name = kept.join(" ");
    names.push({ kind: "name", surface: name, start, end });
    pushSpan(spans, start, end);
  };
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!run.length) {
      run.push(token);
      continue;
    }
    const prev = run[run.length - 1];
    const gap = text.slice(prev.index + prev[0].length, token.index);
    if (/^\s+$/.test(gap)) run.push(token);
    else {
      flush();
      run.push(token);
    }
  }
  flush();
  return headlineNames(text, names, corpus);
}

function firstWordStart(text) {
  const match = /\b[A-Za-z]/.exec(text);
  return match ? match.index : -1;
}

function atSentenceStart(text, index) {
  let cursor = index;
  while (cursor > 0 && /[\s"'“”]/.test(text[cursor - 1])) cursor -= 1;
  if (cursor === 0) return true;
  const prev = text[cursor - 1];
  return prev === "." || prev === "!" || prev === "?" || prev === "\n";
}

/** The capitalised form occurs in the sources, and not only as the first word of a sentence. */
function capitalisedAwayFromSentenceStart(sources, word) {
  const text = String(sources || "");
  const needle = String(word || "");
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\p{L}0-9])${escaped}(?![\\p{L}0-9])`, "gu");
  let match;
  while ((match = re.exec(text))) {
    if (!atSentenceStart(text, match.index)) return true;
  }
  return false;
}

function isHeadline(text) {
  const words = String(text || "").split(/\s+/).filter((word) => /\p{L}/u.test(word));
  if (words.length < 2) return false;
  return words.every((word) => /\p{Lu}/u.test(word));
}

function headlineNames(text, names, sources) {
  if (!isHeadline(text)) return names;
  const hay = String(sources || "");
  return names.filter((name) => hay.includes(name.surface));
}

function sentenceSlice(text, index) {
  const before = text.slice(0, index);
  const boundary = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("? "),
    before.lastIndexOf("! "),
    before.lastIndexOf("\n")
  );
  const start = boundary >= 0 ? boundary + 1 : 0;
  const after = text.slice(index);
  const rel = after.search(/[.!?](\s|$)/);
  const end = rel >= 0 ? index + rel + 1 : text.length;
  return text.slice(start, end);
}

/**
 * A cardinal that only states how long a period is, when that same sentence
 * already gives an endpoint the source also states, and the source does not
 * write the cardinal.
 *
 * "five months to 28 February 2026" is this: the source writes
 * "1 October 2025 to 28 February 2026" and does not write "five".
 * "six months" stays when the source writes "six". A wrong length whose
 * endpoint is not in the source stays, so the substitution is still an element.
 */
export function isDerivedPeriodLength(text, element, sourceText) {
  if (!element || element.kind !== "figure") return false;
  if (element.scale || element.unit !== "bare" || element.minor) return false;
  if (element.decimals) return false;
  if (element.written < 1 || element.written > 20) return false;
  const body = String(text || "");
  const after = body.slice(element.end);
  if (!/^\s+(?:day|days|week|weeks|month|months|year|years)\b/i.test(after)) return false;
  const source = String(sourceText || "");
  if (!source.trim()) return false;
  const escaped = String(element.surface).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, "i").test(source)) return false;
  const sentenceDates = collectDates(sentenceSlice(body, element.start), []);
  if (!sentenceDates.length) return false;
  const sourceDates = collectDates(source, []);
  return sentenceDates.some((date) => sourceDates.some((sourceDate) => datesAgree(date.key, sourceDate.key)));
}

// A hyphen before the word is a compound, not a benchmark. MRI-guidance is not guidance.
function benchmarkPattern() {
  const body = [...BENCHMARK_WORDS].sort((a, b) => b.length - a.length).join("|");
  return new RegExp(`(?<![A-Za-z-])(?:${body})(?![A-Za-z])`, "gi");
}

function collectBenchmarks(text, spans) {
  const found = [];
  for (const match of String(text).matchAll(benchmarkPattern())) {
    const start = match.index;
    const surface = match[0];
    const end = start + surface.length;
    if (overlaps(spans, start, end)) continue;
    pushSpan(spans, start, end);
    found.push({ kind: "benchmark", surface, start, end });
  }
  return found;
}

function benchmarkOccurs(source, word) {
  const needle = String(word || "");
  if (!BENCHMARK_WORDS.includes(needle.toLowerCase())) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z-])${escaped}(?![A-Za-z])`, "i").test(String(source || ""));
}

function rawElements(statement, _draft, sources) {
  const text = String(statement);
  const spans = [];
  const dates = collectDates(text, spans);
  const figures = collectFigures(text, spans);
  const benchmarks = collectBenchmarks(text, spans);
  const names = collectNames(text, spans, typeof sources === "string" ? sources : "");
  return [...dates, ...figures, ...benchmarks, ...names].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function extractElements(statement, draft, sources) {
  const text = String(statement);
  const elements = rawElements(statement, draft, sources).filter((element) => !isDerivedPeriodLength(text, element, sources));
  const figures = elements.filter((element) => element.kind === "figure").map((element) => element.surface);
  return elements.map((element) => {
    if (element.kind === "date" && /^\d{4}-\d{2}$/.test(element.key || "")) {
      return { ...element, pairedFigures: figures };
    }
    return element;
  });
}

export function droppedPeriodLengths(statement, draft, sources) {
  const text = String(statement);
  return rawElements(statement, draft, sources).filter((element) => isDerivedPeriodLength(text, element, sources));
}

function roundAway(value, places) {
  const factor = 10 ** places;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * factor)) / factor;
}

function unitsMatch(draftFigure, sourceFigure) {
  if (draftFigure.unit === "percent" || sourceFigure.unit === "percent") {
    return draftFigure.unit === "percent" && sourceFigure.unit === "percent";
  }
  if (draftFigure.unit === sourceFigure.unit) return true;
  const centSide = draftFigure.unit === "cent" || sourceFigure.unit === "cent";
  const major = draftFigure.unit === "cent" ? sourceFigure.unit : draftFigure.unit;
  return centSide && (major === "USD" || major === "EUR" || major === "cent");
}

function asDraftWrote(foldedMajor, draftFigure) {
  const inDraftUnit = draftFigure.minor ? foldedMajor * 100 : foldedMajor;
  return inDraftUnit / SCALE_MULT[draftFigure.scale || ""];
}

function valuesTie(draftFigure, sourceFigure) {
  const gap = Math.abs(draftFigure.folded - sourceFigure.folded);
  if (gap <= Math.max(1e-6, Math.abs(draftFigure.folded) * 1e-9)) return true;
  const sourceInDraftScale = asDraftWrote(sourceFigure.folded, draftFigure);
  if (roundAway(sourceInDraftScale, draftFigure.decimals) === draftFigure.sign * draftFigure.written) return true;
  if (draftFigure.scale !== sourceFigure.scale) {
    const draftInSource = asDraftWrote(draftFigure.folded, sourceFigure);
    if (roundAway(draftInSource, sourceFigure.decimals) === sourceFigure.sign * sourceFigure.written) return true;
  }
  return false;
}

function hedgeBand(draftFigure) {
  if (draftFigure.unit === "percent" && !draftFigure.decimals) return { abs: 1 };
  if (draftFigure.unit === "bare" && !draftFigure.scale && !draftFigure.decimals && draftFigure.written <= 20) {
    return { abs: 1 };
  }
  if (draftFigure.decimals > 0) return { rel: 0.01 };
  return { rel: 0.05 };
}

function withinBand(draftFigure, sourceFigure, band) {
  const gap = Math.abs(draftFigure.folded - sourceFigure.folded);
  if (band.abs != null) return gap <= band.abs + 1e-9;
  const base = Math.abs(draftFigure.folded);
  if (base < 1e-9) return false;
  return gap / base <= band.rel + 1e-12;
}

function hedgeSatisfied(draftFigure, sourceFigure) {
  const hedge = draftFigure.hedge;
  if (!hedge || !unitsMatch(draftFigure, sourceFigure)) return false;
  if (draftFigure.sign !== sourceFigure.sign && draftFigure.written !== 0) return false;
  const draft = draftFigure.folded;
  const source = sourceFigure.folded;
  const apart = Math.max(1e-6, Math.abs(draft) * 1e-9);
  if (hedge === "gt") return source > draft + apart;
  if (hedge === "lt") return source < draft - apart;
  if (hedge === "modestly_above") {
    if (!(source > draft + apart) || Math.abs(draft) < 1e-9) return false;
    return (source - draft) / Math.abs(draft) <= 0.15 + 1e-12;
  }
  const band = hedgeBand(draftFigure);
  if (hedge === "nearly") {
    if (!(source < draft - apart)) return false;
    return withinBand(draftFigure, sourceFigure, band);
  }
  if (hedge === "approx") return withinBand(draftFigure, sourceFigure, band);
  return false;
}

function figuresMatch(draftFigure, sourceFigure) {
  if (!unitsMatch(draftFigure, sourceFigure)) return false;
  if (draftFigure.sign !== sourceFigure.sign && draftFigure.written !== 0) return false;
  if (valuesTie(draftFigure, sourceFigure)) {
    const strict = draftFigure.hedge === "gt" || draftFigure.hedge === "lt" || draftFigure.hedge === "modestly_above";
    if (!strict) return true;
    return sourceFigure.hedge === draftFigure.hedge;
  }
  return hedgeSatisfied(draftFigure, sourceFigure);
}

function parseDateKey(key) {
  const fy = /^FY(\d{4})$/.exec(key);
  if (fy) return { kind: "fy", year: +fy[1] };
  const quarter = /^(\d{4})-Q([1-4])$/.exec(key);
  if (quarter) return { kind: "quarter", year: +quarter[1], quarter: +quarter[2] };
  const half = /^(\d{4})-H([12])$/.exec(key);
  if (half) return { kind: "half", year: +half[1], half: +half[2] };
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (full) return { kind: "full", year: +full[1], month: +full[2], day: +full[3] };
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (month) return { kind: "month", year: +month[1], month: +month[2] };
  if (/^\d{4}$/.test(key)) return { kind: "year", year: +key };
  return null;
}

function quarterOf(month) {
  return Math.floor((month - 1) / 3) + 1;
}

function halfOf(month) {
  return month <= 6 ? 1 : 2;
}

function figureToken(surface) {
  const match = String(surface || "").match(/\d[\d,]*(?:\.\d+)?/);
  return match ? match[0].replace(/,/g, "") : "";
}

function cellHasFigure(cell, surface) {
  const token = figureToken(surface);
  if (!token) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\d])${escaped}(?:$|[^\\d])`).test(String(cell || "").replace(/,/g, ""));
}

function rowHasYear(line, year) {
  return new RegExp(`(?:^|[|\\s])${year}(?:$|[|\\s])`).test(line);
}

function monthCellValue(line, monthNumber) {
  for (const cell of String(line || "").split("|")) {
    const match = cell.trim().match(/^([A-Za-z]+)\s*:\s*(.*)$/);
    if (!match) continue;
    if (MONTH_INDEX[match[1].toLowerCase()] === monthNumber) return match[2];
  }
  return null;
}

/**
 * B549. A month heading and a year on the same rebuilt row count as that
 * month and year for the figure in the month's cell. Callers of elementFound
 * and locateElement that pass a date from extractElements see this. A date
 * with no paired figure, and a date that is already a phrase in the source,
 * are unchanged.
 */
export function tableDateLine(element, sourceText) {
  const parsed = parseDateKey(element?.key || "");
  if (!parsed || parsed.kind !== "month") return null;
  const figures = Array.isArray(element?.pairedFigures) ? element.pairedFigures : [];
  if (!figures.length) return null;
  const year = String(parsed.year);
  for (const raw of String(sourceText || "").split("\n")) {
    const line = raw.trim();
    if (!line.includes("|") || !rowHasYear(line, year)) continue;
    const value = monthCellValue(line, parsed.month);
    if (value == null) continue;
    if (figures.some((surface) => cellHasFigure(value, surface))) return line;
  }
  return null;
}

function datesAgree(draftKey, sourceKey) {
  const draft = parseDateKey(draftKey);
  const source = parseDateKey(sourceKey);
  if (!draft || !source) return false;
  if (draft.kind === "fy" || source.kind === "fy") {
    return draft.kind === "fy" && source.kind === "fy" && draft.year === source.year;
  }
  if (draft.year !== source.year) return false;
  if (draft.kind === "year") return true;
  if (draft.kind === "month") return source.month === draft.month;
  if (draft.kind === "full") return source.month === draft.month && source.day === draft.day;
  if (draft.kind === "quarter") {
    if (source.quarter) return source.quarter === draft.quarter;
    if (source.month) return quarterOf(source.month) === draft.quarter;
    return false;
  }
  if (draft.kind === "half") {
    if (source.half) return source.half === draft.half;
    if (source.month) return halfOf(source.month) === draft.half;
    return false;
  }
  return false;
}

function sourceFigures(source) {
  const spans = [];
  collectDates(source, spans);
  return collectFigures(source, spans);
}

function abbreviationIn(source, abbr) {
  return new RegExp(`(?:^|[^A-Za-z0-9])${abbr}(?=$|[^A-Za-z0-9])`).test(source);
}

function phraseIn(source, phrase) {
  const body = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^A-Za-z0-9])${body}(?=$|[^A-Za-z0-9])`, "i").test(source);
}

function expansionMatch(source, name) {
  const needle = normaliseName(name);
  for (const row of EXPANSIONS) {
    const phrases = row.phrases.map((phrase) => phrase.toLowerCase());
    if (needle === row.abbr) return phrases.some((phrase) => phraseIn(source, phrase));
    if (phrases.includes(needle.toLowerCase())) return abbreviationIn(source, row.abbr);
  }
  return false;
}

const HONORIFIC_LEAD = /^(?:founder-CEO|(?:Mr|Mrs|Ms|Miss|Dr|CEO|CFO|CTO|COO)\.?)\s+/i;

function bareName(surface) {
  let name = String(surface || "").trim();
  let previous = "";
  while (name && name !== previous) {
    previous = name;
    name = name.replace(HONORIFIC_LEAD, "");
  }
  return name.replace(/^(?:the\s+)?company(?:'s|’s)?\s+/i, "").trim();
}

function nameWords(text) {
  return String(text || "").split(/[^A-Za-z]+/).filter((word) => word.length);
}

function phraseOccurs(hay, needle) {
  const body = normaliseName(needle);
  if (!body) return false;
  const escaped = body.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, "i").test(hay);
}

function nationalityFold(name) {
  return String(name || "")
    .replace(/\bAsian\b/gi, "Asia")
    .replace(/\bAmerican\b/gi, "America")
    .replace(/\bEuropean\b/gi, "Europe")
    .replace(/\bNordics\b/gi, "Nordic");
}

function initialismEitherWay(source, name) {
  const draftWords = nameWords(name);
  const sourceWords = nameWords(source);
  if (draftWords.length === 1) {
    const abbr = draftWords[0];
    if (abbr.length < 3 || abbr.length > 6) return false;
    if (abbr !== abbr.toUpperCase() && !/^[A-Z]+[a-z]$/.test(abbr)) return false;
    const letters = abbr.toLowerCase();
    for (let i = 0; i + letters.length <= sourceWords.length; i += 1) {
      const slice = sourceWords.slice(i, i + letters.length);
      if (slice.every((word, index) => word[0].toLowerCase() === letters[index])) return true;
    }
    return false;
  }
  if (draftWords.length < 3 || draftWords.length > 6) return false;
  const letters = draftWords.map((word) => word[0]).join("");
  return new RegExp(`(?:^|[^A-Za-z])${letters}(?=$|[^A-Za-z])`, "i").test(source);
}

function damagedCharacterMatch(source, needle) {
  if (!String(source).includes("\uFFFD")) return false;
  const folded = String(needle || "").normalize("NFD").replace(/\p{M}/gu, "");
  if (folded.length < 4) return false;
  for (const token of String(source).split(/[^\p{L}\uFFFD]+/u)) {
    if (!token.includes("\uFFFD")) continue;
    const body = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\uFFFD/g, ".");
    if (new RegExp(`^${body}$`, "i").test(folded)) return true;
  }
  return false;
}

function tokensOccur(source, needle) {
  const tokens = nameWords(needle).filter((word) => word.length >= 3);
  if (tokens.length < 2) return false;
  return tokens.every((word) => phraseOccurs(source, word));
}

function withoutRegionPrefix(name) {
  return String(name || "").replace(/^(?:EU|US|UK)\s+/i, "").trim();
}

function withoutLegalSuffix(name) {
  const suffix = /\s+(?:Ltd|Limited|Inc|plc|AG|AS|SA|SE|GmbH|BV|NV|SpA|SCSp|SCS|LP|LLP|LLC|s\.r\.o\.|ApS|AB|Oy)\.?$/i;
  let current = String(name || "").trim();
  let previous = "";
  while (current && current !== previous) {
    previous = current;
    current = current.replace(suffix, "").trim();
  }
  return current;
}

function nameOccurs(source, name) {
  const hay = normaliseName(source);
  const bare = bareName(name);
  const forms = [name, bare, withoutLegalSuffix(name), withoutLegalSuffix(bare), nationalityFold(name), nationalityFold(bare), withoutRegionPrefix(bare)];
  const seen = new Set();
  for (const form of forms) {
    const needle = normaliseName(form);
    if (!needle || seen.has(needle.toLowerCase())) continue;
    seen.add(needle.toLowerCase());
    if (phraseOccurs(hay, needle)) return true;
    if (expansionMatch(source, needle)) return true;
    if (initialismEitherWay(source, needle)) return true;
    if (tokensOccur(hay, needle)) return true;
    if (damagedCharacterMatch(source, needle)) return true;
    const foldedNeedle = needle.replace(/[-\s]/g, "");
    const foldedHay = hay.replace(/[-\s]/g, "");
    if (foldedNeedle.length > 0 && foldedHay.toLowerCase().includes(foldedNeedle.toLowerCase())) return true;
  }
  return false;
}

export function elementFound(element, sourceText) {
  const source = String(sourceText || "");
  if (element.kind === "name") return nameOccurs(source, element.surface);
  if (element.kind === "benchmark") return benchmarkOccurs(source, element.surface);
  if (element.kind === "date") {
    if (collectDates(source, []).some((date) => datesAgree(element.key, date.key))) return true;
    return tableDateLine(element, source) != null;
  }
  return sourceFigures(source).some((figure) => figuresMatch(element, figure));
}

function lineIndexAt(starts, offset) {
  let index = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= offset) index = i;
    else break;
  }
  return index;
}

function lineContaining(lines, starts, start, end, surface) {
  const first = lineIndexAt(starts, start);
  const last = lineIndexAt(starts, Math.max(start, (end || start + 1) - 1));
  const needle = String(surface || "");
  if (needle) {
    for (let i = first; i <= last; i += 1) {
      if (lines[i].includes(needle)) return i;
    }
  }
  return first;
}

function occurrenceFromLine(lines, index) {
  const row = {
    lineId: `L${index + 1}`,
    extract: lines[index].replace(/\r$/, ""),
  };
  if (index > 0) row.lineBeforeId = `L${index}`;
  if (index < lines.length - 1) row.lineAfterId = `L${index + 2}`;
  return row;
}

/**
 * Every line on which the matcher hits, in document order. Figures and dates
 * use the offsets the matcher already computed. A hit that runs over a line
 * break uses the line inside that hit which contains the surface. Names use
 * every line on which the same name test succeeds. This does not compare the
 * statement's other words with the source, and it does not pick a best line.
 * Two hits on one line are one occurrence. The only caller is
 * buildFacts in lib/qc/reading-contract.mjs. elementFound is unchanged.
 */
export function locateElement(element, sourceText) {
  const source = String(sourceText || "");
  if (!element || !source) return null;
  const lines = source.split("\n");
  const starts = [];
  let cursor = 0;
  for (const line of lines) {
    starts.push(cursor);
    cursor += line.length + 1;
  }
  const hits = [];
  if (element.kind === "date") {
    for (const hit of collectDates(source, [])) {
      if (!datesAgree(element.key, hit.key)) continue;
      hits.push(lineContaining(lines, starts, hit.start, hit.end, element.surface));
    }
    if (!hits.length) {
      const line = tableDateLine(element, source);
      if (line) {
        const index = lines.findIndex((row) => row.trim() === line);
        if (index >= 0) hits.push(index);
      }
    }
  } else if (element.kind === "figure") {
    for (const hit of sourceFigures(source)) {
      if (!figuresMatch(element, hit)) continue;
      hits.push(lineContaining(lines, starts, hit.start, hit.end, element.surface));
    }
  } else if (element.kind === "name") {
    for (let i = 0; i < lines.length; i += 1) {
      if (nameOccurs(lines[i], element.surface)) hits.push(i);
    }
  } else if (element.kind === "benchmark") {
    for (let i = 0; i < lines.length; i += 1) {
      if (benchmarkOccurs(lines[i], element.surface)) hits.push(i);
    }
  }
  const seen = new Set();
  const occurrences = [];
  for (const index of hits) {
    if (seen.has(index)) continue;
    seen.add(index);
    occurrences.push(occurrenceFromLine(lines, index));
  }
  if (!occurrences.length) return null;
  return { occurrences, occurrenceCount: occurrences.length };
}

/** Every closed-list word the source uses, each with every line it hits. */
export function benchmarksInSource(sourceText) {
  const found = [];
  for (const word of BENCHMARK_WORDS) {
    if (!benchmarkOccurs(sourceText, word)) continue;
    const located = locateElement({ kind: "benchmark", surface: word }, sourceText);
    if (!located) continue;
    found.push({ word, occurrenceCount: located.occurrenceCount, occurrences: located.occurrences });
  }
  return found;
}
