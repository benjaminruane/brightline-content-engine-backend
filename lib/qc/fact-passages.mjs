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

function trimAround(text, fact) {
  const body = clean(text);
  if (body.length <= 220) return body;
  const surface = clean(fact?.surface);
  const digits = surface.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  const needle = digits ? digits[0] : surface;
  const at = body.toLowerCase().indexOf(String(needle).toLowerCase());
  if (at < 0) return `${body.slice(0, 200).trim()}...`;
  const start = Math.max(0, at - 80);
  const end = Math.min(body.length, at + String(needle).length + 80);
  const slice = body.slice(start, end).trim();
  return `${start > 0 ? "..." : ""}${slice}${end < body.length ? "..." : ""}`;
}

function isBullet(text) {
  return /^[·•]\s*/.test(String(text || "").trim());
}

function weight(fact) {
  return fact?.kind === "name" ? 1 : 3;
}

/**
 * Up to four source sentences, one per distinct line that carries a matched
 * fact. A run of bullets is one slot so a breakdown stays together.
 * @returns {{ passage: string, lineIds: string[] }}
 */
export function factPassage(card) {
  const facts = countableFacts(card).filter((fact) => fact?.status === "matched" || fact?.status === "matched_disputed");
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
  const shown = [];
  const lineIds = [];
  for (const unit of picked) {
    for (const line of unit.lines) {
      const fact = [...line.facts][0];
      const sentence = trimAround(line.text, fact);
      if (!sentence || shown.includes(sentence)) continue;
      shown.push(sentence);
      lineIds.push(line.id);
    }
  }
  return { passage: shown.join(" "), lineIds };
}

export function plainSourceVoice(text) {
  let body = clean(text);
  if (!body) return "";
  body = body.replace(/,?\s*matching the statement\b/gi, "");
  body = body.replace(/\bconfirms the statement\b/gi, "says this");
  body = body.replace(/\bThe source confirms\b/g, "The source says");
  body = body.replace(/\bthe source confirms\b/g, "the source says");
  body = body.replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").trim();
  return body;
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
export function alignReason(reason, passage, card) {
  return nameUnmatchedFacts(dropUnsupportedClaims(plainSourceVoice(reason), passage), card);
}
