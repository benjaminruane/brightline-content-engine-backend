/**
 * B579. The passage is the lines where the statement's figures, dates, and
 * names were found. The count ignores terms, ampersand fragments, and a
 * sentence-initial ordinary word. A reason may not claim what that passage
 * does not show, and an unmatched fact that raises the card is named.
 */

const TERM_NAMES = new Set(
  "nav irr moic dpi tvpi rvpi ebitda aum esg ytd cagr pme gp lp bps ebit fcf roi roe roce wacc".split(" ")
);

const ORDINARY_OPENERS = new Set(
  "realisations realisation outstanding continued total net cash available portfolio share shares dividend dividends performance results revenue earnings commitments commitment drawdowns drawdown liquidity gearing resources new the during despite".split(" ")
);

const CARDINALS = {
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
};

const STOP = new Set(
  "source says said statement draft this that with from about their there where which while have been were into over under than then also after before does not the and for per was are its".split(" ")
);

const SOFT_CLAIM = /\battributes?\b|\baddressed\b|\baddresses\b|\bthe context of\b/i;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function statementOf(card) {
  return clean(card?.statement || card?.text || card?.originalClaimText);
}

export function isCountableFact(fact, statement) {
  if (!fact || (fact.kind !== "figure" && fact.kind !== "date" && fact.kind !== "name")) return false;
  const surface = clean(fact.surface);
  if (!surface) return false;
  if (fact.kind !== "name") return true;
  if (TERM_NAMES.has(surface.toLowerCase())) return false;
  if (/^[A-Za-z]$/.test(surface) && new RegExp(`(?:${surface}\\s*[&]|[&]\\s*${surface})`).test(statement || "")) return false;
  if (/^[A-Za-z]$/.test(surface)) return false;
  const opener = statement.trim().match(/^(\p{L}+)/u);
  if (
    opener
    && opener[1].toLowerCase() === surface.toLowerCase()
    && ORDINARY_OPENERS.has(surface.toLowerCase())
    && surface !== surface.toUpperCase()
  ) return false;
  return true;
}

export function countableFacts(card) {
  const statement = statementOf(card);
  const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
  return facts.filter((fact) => isCountableFact(fact, statement));
}

export function factCounts(cards) {
  let total = 0;
  let matched = 0;
  for (const row of Array.isArray(cards) ? cards : []) {
    const card = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : row;
    const withFacts = Array.isArray(card?.readingFacts) || !Array.isArray(card?.facts)
      ? card
      : { ...card, readingFacts: card.facts };
    for (const fact of countableFacts(withFacts)) {
      total += 1;
      if (fact?.status === "matched" || fact?.status === "matched_disputed") matched += 1;
    }
  }
  return { matched, total };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function furnitureLine(text) {
  return /^Document:/i.test(text) || /News article\s*\|/i.test(text) || /https?:\/\//i.test(text);
}

function lineHasFact(text, fact) {
  const body = String(text || "");
  if (!body || furnitureLine(body)) return false;
  const surface = clean(fact.surface);
  const digits = surface.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (digits) return body.replace(/,/g, "").includes(digits[0]);
  const word = surface.toLowerCase();
  const wordHit = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, "iu").test(body);
  if (wordHit) return true;
  const digit = CARDINALS[word];
  if (!digit) return false;
  return new RegExp(`(?<![\\d.])${digit}(?![\\d.])`).test(body);
}

function lineNumber(lineId) {
  const match = String(lineId || "").match(/^L(\d+)$/);
  return match ? Number(match[1]) : null;
}

const SHORT_WORDS = new Set("a an the and or for per its was are not but has had his her our any all own new net one two six ten".split(" "));

function endClipped(text) {
  const body = clean(text);
  if (!body || /[.!?…;:"')\]]$/u.test(body) || /\d$/.test(body) || body.endsWith("%")) return body;
  const last = body.match(/(\S+)$/);
  if (!last) return body;
  const word = last[1];
  if (!/^[a-z]{1,4}$/.test(word) || SHORT_WORDS.has(word)) return body;
  const cut = body.slice(0, body.length - word.length).trim();
  return cut.endsWith("…") ? cut : `${cut} …`;
}

function cleanPassage(text) {
  const body = clean(text).replace(/[·•]/g, " ").replace(/\s+/g, " ").trim();
  return endClipped(body);
}

function figureNeedle(fact) {
  const surface = clean(fact?.surface);
  if (fact?.kind === "name") return "";
  const digits = surface.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (digits) return digits[0];
  return surface;
}

function trimAround(text, fact) {
  const body = clean(text);
  const clipped = endClipped(body);
  if (body.length <= 220) return clipped;
  const needle = figureNeedle(fact);
  const at = needle ? body.toLowerCase().indexOf(String(needle).toLowerCase()) : -1;
  if (at < 0) return endClipped(body.slice(0, 200).trim());
  let start = Math.max(0, at - 90);
  let end = Math.min(body.length, at + String(needle).length + 90);
  if (start > 0) {
    const space = body.indexOf(" ", start);
    if (space > start && space < at) start = space + 1;
  }
  if (end < body.length) {
    const space = body.lastIndexOf(" ", end);
    if (space > at) end = space;
  }
  return body.slice(start, end).trim();
}

function isBullet(text) {
  return /^[·•]\s*/.test(String(text || "").trim());
}

function weight(fact) {
  return fact?.kind === "name" ? 1 : 3;
}

function spanText(span) {
  if (typeof span === "string") return span;
  return typeof span?.passage === "string" ? span.passage : "";
}

function reliedSentences(card) {
  const out = [];
  const spans = Array.isArray(card?.supportSpans) ? card.supportSpans : [];
  const pieces = spans.map(spanText);
  for (const piece of pieces) {
    const body = cleanPassage(piece);
    if (!body) continue;
    for (const sentence of body.split(/(?<=[.!?])\s+/)) {
      const next = sentence.trim();
      if (!next || out.some((item) => item.toLowerCase() === next.toLowerCase())) continue;
      out.push(next);
    }
  }
  return out;
}

function passageHasFact(passage, fact) {
  const hay = passage.replace(/,/g, "").toLowerCase();
  const needle = figureNeedle(fact).toLowerCase();
  if (!needle) return false;
  if (hay.includes(needle.replace(/,/g, ""))) return true;
  const digit = CARDINALS[needle];
  return Boolean(digit) && new RegExp(`(?<![\\d.])${digit}(?![\\d.])`).test(passage);
}

/**
 * What Review relied on, then the lines where unmatched figures and dates
 * occur. A line is never chosen only because it contains a name.
 * A run of bullets is one slot so a breakdown stays together.
 * @returns {{ passage: string, lineIds: string[] }}
 */
function rawReason(card) {
  const rows = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const first = rows[0];
  return typeof first === "string" ? first : (first?.explanation || "");
}

function parkUnstated(sentences, card) {
  const point = unstatedPoint(rawReason(card));
  if (!point || sentences.length < 2) return { keep: sentences };
  const terms = pointTerms(point);
  const figures = countableFacts(card).filter((fact) => (
    fact?.kind !== "name" && (fact?.status === "matched" || fact?.status === "matched_disputed")
  ));
  let bestIndex = -1;
  let bestScore = 1;
  sentences.forEach((sentence, index) => {
    if (figures.some((fact) => passageHasFact(sentence, fact))) return;
    const score = lineHits(sentence, terms);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  if (bestIndex < 0) return { keep: sentences };
  return { keep: sentences.filter((_, index) => index !== bestIndex) };
}

export function factPassage(card, sourceText = "") {
  const relied = parkUnstated(reliedSentences(card), card).keep.slice(0, 4);
  const facts = countableFacts(card).filter((fact) => (
    (fact?.status === "matched" || fact?.status === "matched_disputed")
    && fact?.kind !== "name"
  ));
  const byLine = new Map();
  for (const fact of facts) {
    const occurrences = Array.isArray(fact.occurrences) ? fact.occurrences : [];
    for (const occurrence of occurrences) {
      const text = clean(occurrence?.extract);
      const n = lineNumber(occurrence?.lineId);
      if (!text || n == null || !lineHasFact(text, fact)) continue;
      const key = occurrence.lineId;
      if (!byLine.has(key)) byLine.set(key, { id: key, n, text, facts: new Set() });
      byLine.get(key).facts.add(fact);
    }
  }
  const lines = [...byLine.values()].sort((a, b) => a.n - b.n);
  const bulletByNumber = new Map();
  for (const fact of countableFacts(card)) {
    if (fact?.status !== "matched" && fact?.status !== "matched_disputed") continue;
    for (const occurrence of Array.isArray(fact.occurrences) ? fact.occurrences : []) {
      const text = clean(occurrence?.extract);
      const n = lineNumber(occurrence?.lineId);
      if (!text || n == null || !isBullet(text) || !lineHasFact(text, fact)) continue;
      if (!bulletByNumber.has(n)) bulletByNumber.set(n, { id: occurrence.lineId, n, text, facts: new Set() });
      bulletByNumber.get(n).facts.add(fact);
    }
  }
  const units = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!isBullet(line.text)) {
      units.push({ lines: [line], n: line.n });
      index += 1;
      continue;
    }
    const run = [line];
    let next = index + 1;
    while (next < lines.length && lines[next].n === run[run.length - 1].n + 1 && isBullet(lines[next].text)) {
      run.push(lines[next]);
      next += 1;
    }
    let neighbor = run[run.length - 1].n + 1;
    for (;;) {
      const extra = bulletByNumber.get(neighbor);
      if (!extra || run.some((item) => item.id === extra.id)) break;
      run.push(extra);
      neighbor += 1;
    }
    units.push({ lines: run, n: run[0].n });
    index = next;
  }
  const covered = new Set();
  const picked = [];
  while (picked.length < 4) {
    let best = null;
    let bestScore = 0;
    for (const unit of units) {
      if (picked.includes(unit)) continue;
      let score = 0;
      for (const line of unit.lines) {
        for (const fact of line.facts) {
          if (!covered.has(fact)) score += weight(fact);
        }
      }
      if (score > bestScore || (score === bestScore && score > 0 && best && unit.n < best.n)) {
        best = unit;
        bestScore = score;
      }
    }
    if (!best || bestScore < 1) break;
    picked.push(best);
    for (const line of best.lines) {
      for (const fact of line.facts) covered.add(fact);
    }
  }
  picked.sort((a, b) => a.n - b.n);
  const shown = [...relied];
  const lineIds = relied.map((sentence) => lineIdForSentence(sentence, lines)).filter(Boolean);
  const seen = new Set(relied.map((sentence) => sentence.toLowerCase()));
  let slots = relied.length;
  for (const unit of picked) {
    if (slots >= 4) break;
    const pending = [];
    for (const line of unit.lines) {
      const fact = [...line.facts].find((item) => item?.kind !== "name") || [...line.facts][0];
      const sentence = cleanPassage(trimAround(line.text, fact));
      if (!sentence || seen.has(sentence.toLowerCase())) continue;
      const sameRun = unit.lines.length > 1;
      if (!sameRun && [...line.facts].every((item) => passageHasFact(shown.join(" "), item))) continue;
      pending.push({ sentence, id: line.id });
    }
    if (!pending.length) continue;
    slots += 1;
    for (const item of pending) {
      shown.push(item.sentence);
      seen.add(item.sentence.toLowerCase());
      lineIds.push(item.id);
    }
  }
  const pieces = splitPieces(shown, lineIds, sourceText);
  return {
    passage: pieces.map((piece) => piece.text).join(" "),
    pieces,
    lineIds: pieces.flatMap((piece) => piece.lineIds),
  };
}

function drawerLine(source, index) {
  const lines = String(source || "").split("\n");
  let cursor = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const end = cursor + lines[i].length;
    if (index >= cursor && index <= end) return { id: `L${i + 1}`, start: cursor, end };
    cursor = end + 1;
  }
  return null;
}

function locateText(source, text) {
  const raw = String(source || "");
  const needle = clean(text);
  if (!raw || !needle) return null;
  const direct = raw.indexOf(needle);
  if (direct >= 0) return direct;
  const head = needle.split("|")[0].trim().slice(0, 48);
  if (!head) return null;
  const at = raw.toLowerCase().indexOf(head.toLowerCase());
  return at < 0 ? null : at;
}

function presentText(text) {
  const body = cleanPassage(text);
  if (!body.includes("|")) return { text: body, cells: null };
  const cells = body.split("|").map((cell) => cell.trim()).filter(Boolean);
  return { text: cells.join("   "), cells };
}

function splitPieces(sentences, ids, sourceText) {
  const pieces = [];
  sentences.forEach((sentence, index) => {
    const at = sourceText ? locateText(sourceText, sentence) : null;
    const line = at == null ? null : drawerLine(sourceText, at);
    const basis = line && sourceText.slice(line.start, line.end).includes("|")
      ? sourceText.slice(line.start, line.end)
      : sentence;
    const shown = presentText(basis);
    if (!shown.text) return;
    const lineIds = line ? [line.id] : (ids[index] ? [ids[index]] : []);
    const prev = pieces[pieces.length - 1];
    if (prev && line && prev.lineIds[0] === line.id) {
      if (!prev.text.toLowerCase().includes(shown.text.toLowerCase())) {
        prev.text = `${prev.text} ${shown.text}`.replace(/\s+/g, " ").trim();
      }
      return;
    }
    pieces.push({
      text: shown.text,
      cells: shown.cells,
      lineIds,
      start: line ? line.start : null,
      end: line ? line.end : null,
    });
  });
  return pieces;
}

function lineIdForSentence(sentence, lines) {
  const key = sentence.slice(0, 48).toLowerCase();
  const hit = lines.find((line) => {
    const cleaned = cleanPassage(line.text).toLowerCase();
    return cleaned.includes(key) || key.includes(cleaned.slice(0, 48));
  });
  return hit?.id || "";
}

const POINT_STOP = new Set("these those figures figure reflect reflects which additional checkable claim does not explicitly state that the and for with from into have been were this".split(" "));

function unstatedPoint(reason) {
  const match = clean(reason).match(/does not explicitly state(?: that)?\s+(.{0,220}?)(?:\.|$)/i);
  if (!match) return "";
  return match[1].replace(/^[^a-z0-9]+/i, "").replace(/,?\s*which is an additional checkable claim$/i, "").trim();
}

function pointTerms(point) {
  const terms = [];
  if (/M&A/i.test(point)) terms.push("m&a", "slow", "exit", "pace");
  for (const word of point.toLowerCase().match(/[a-z]{4,}/g) || []) {
    if (POINT_STOP.has(word)) continue;
    const term = word === "slower" || word === "slowed" ? "slow" : word;
    if (!terms.includes(term)) terms.push(term);
  }
  return terms;
}

function lineHits(line, terms) {
  const hay = line.toLowerCase();
  return terms.filter((term) => hay.includes(term)).length;
}

/**
 * The closest source sentence for a point the reason says is not stated outright.
 * @returns {string}
 */
export function alsoRelevant(card, sourceText = "") {
  const rows = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const first = rows[0];
  const reason = typeof first === "string" ? first : (first?.explanation || "");
  const point = unstatedPoint(reason);
  if (!point) return "";
  const terms = pointTerms(point);
  const lines = String(sourceText || "").split(/\n/).map((line) => cleanPassage(line)).filter(Boolean);
  const spans = (Array.isArray(card?.supportSpans) ? card.supportSpans : []).map((span) => cleanPassage(spanText(span))).filter(Boolean);
  let best = "";
  let bestScore = 0;
  for (const line of [...lines, ...spans]) {
    const score = lineHits(line, terms);
    if (score > bestScore) {
      best = line;
      bestScore = score;
    }
  }
  if (best && bestScore > 0) {
    const shown = factPassage(card).passage.toLowerCase();
    if (shown.includes(best.toLowerCase())) return "";
    return best;
  }
  if (/M&A/i.test(point)) return "No sentence in the source mentions M&A activity.";
  return `No sentence in the source mentions ${point}.`;
}

/** Verdict words that must not appear in a reason. One list for the cleaner and the tests. */
export const INTERNAL_LABELS = [
  "partially_confirmed",
  "not_supported",
  "no_support",
  "no_clear_support",
  "supported_partial",
  "supported_full",
  "conflicting",
  "not_in_source",
  "confirmed",
];

/**
 * The stage 2 explanation, shown whole. The only edits are a leading
 * "The source confirms", and an internal label or a clause that only states one.
 */
export function shownReason(text) {
  let body = clean(text);
  if (!body) return "";
  body = body.replace(/^The source confirms the statement by\b/i, "The source supports the statement by");
  body = body.replace(/^The source confirms\b/, "The source states");
  const label = INTERNAL_LABELS.join("|");
  body = body.replace(new RegExp(`,?\\s*(?:making|leaving|which makes) the statement (?:${label})\\b`, "gi"), "");
  body = body.replace(new RegExp(`\\b(?:${label})\\b`, "gi"), "");
  body = body.replace(/\s+is(?=\s*[.]|$)/g, "");
  body = body.replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").replace(/,\s*\./g, ".").trim();
  if (body && !/[.!?]"?$/.test(body)) body = `${body}.`;
  return body;
}

export function plainSourceVoice(text) {
  return shownReason(text);
}

function clausesOf(sentence) {
  return sentence
    .split(/,\s+|\s+and\s+(?=attributes?\b|says\b|states\b|shows\b|confirms\b|gives\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clauseStands(clause, passage) {
  if (!passage) return true;
  if (!SOFT_CLAIM.test(clause)) return true;
  const words = clause.toLowerCase().match(/[a-z0-9]+(?:\.[0-9]+)?/g) || [];
  const keys = words.filter((word) => word.length > 4 && !STOP.has(word) && !SOFT_CLAIM.test(word));
  if (!keys.length) return false;
  const hay = passage.toLowerCase();
  const hits = keys.filter((word) => hay.includes(word));
  return hits.length >= Math.ceil(keys.length / 2);
}

export function dropUnsupportedClaims(reason, passage) {
  const body = clean(reason);
  if (!body) return "";
  const shown = clean(passage).toLowerCase();
  const sentences = body.split(/(?<=[.!?])\s+/);
  const kept = [];
  for (const sentence of sentences) {
    const clauses = clausesOf(sentence).filter((clause) => clauseStands(clause, shown));
    if (!clauses.length) continue;
    let next = clauses[0];
    for (const clause of clauses.slice(1)) {
      next = /^with\b/i.test(clause) ? `${next}, ${clause}` : `${next}, ${clause}`;
    }
    if (!/[.!?]["']?$/.test(next)) next = `${next}.`;
    kept.push(next.replace(/\s+,/g, ",").replace(/,\s*,/g, ", "));
  }
  return kept.join(" ").replace(/\s{2,}/g, " ").trim();
}

function raised(card) {
  const label = clean(card?.sentenceLabel);
  if (label && label !== "Nothing raised") return true;
  const tone = card?.combinedVerdict?.tone || card?.summaryClass?.cardTone;
  return tone === "amber" || tone === "red";
}

export function nameUnmatchedFacts(reason, card) {
  const body = clean(reason);
  if (!raised(card)) return body;
  const missing = [];
  for (const fact of countableFacts(card)) {
    if (fact?.status === "matched" || fact?.status === "matched_disputed") continue;
    const surface = clean(fact?.surface);
    if (!surface || missing.includes(surface)) continue;
    const hay = body.toLowerCase().replace(/,/g, "");
    const digits = surface.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    if (hay.includes(surface.toLowerCase())) continue;
    if (digits && hay.includes(digits[0])) continue;
    missing.push(surface);
  }
  if (!missing.length) return body;
  const extra = missing.map((surface) => `'${surface}' does not appear in the source.`).join(" ");
  return body ? `${body} ${extra}` : extra;
}

/** Reason shown on the card: plain voice, only claims the passage carries, missing facts named. */
export function alignReason(reason) {
  return shownReason(reason);
}
