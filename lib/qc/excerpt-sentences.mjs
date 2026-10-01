/**
 * B359. A displayed quote is whole sentences. A length limit may drop
 * sentences; it may not cut one, and it may not decide whether a quote
 * was found. Multiple locatable source runs for one statement are joined
 * with a visible gap marker in the one primaryExcerpt string. No new
 * card field; no frontend change.
 */
import { extractVerifiableAnchors } from "./claim-spans.mjs";
import { collectBackstopFigures } from "./pipeline-v4/stage2-match-sources.mjs";
import { splitSentences } from "./card-honesty.mjs";

/** Whole sentences kept unless a must-keep cover is larger. */
export const MAX_QUOTE_SENTENCES = 6;

const GAP_MARK = " ... ";
export const QUOTE_GAP_MARK = GAP_MARK;

function asText(value) {
  return typeof value === "string" ? value : "";
}

function addNeedle(out, seen, raw) {
  const t = String(raw || "").trim();
  if (t.length < 2) return;
  if (/^\d$/.test(t)) return;
  const key = t.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  out.push(t);
}

/**
 * Figures, dates, names, Nx multiples, and distinctive words. Lone
 * digits from 3.2x are dropped so "3" does not match the whole source.
 */
export function statementNeedles(statement) {
  const s = asText(statement);
  const out = [];
  const seen = new Set();
  for (const span of extractVerifiableAnchors(s) || []) addNeedle(out, seen, span?.text);
  for (const fig of collectBackstopFigures(s) || []) addNeedle(out, seen, fig?.raw);
  const multipleRe = /\b\d+(?:\.\d+)?x\b/gi;
  let m;
  while ((m = multipleRe.exec(s))) addNeedle(out, seen, m[0]);
  const capsRe = /\b[A-Z]{2,8}\b/g;
  while ((m = capsRe.exec(s))) addNeedle(out, seen, m[0]);
  const folded = s
    .toLowerCase()
    .replace(/[^a-z0-9%\-]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 6 || (w.includes("-") && w.length >= 4));
  for (const w of folded) addNeedle(out, seen, w);
  return out;
}

export function claimAnchors(statement) {
  const s = asText(statement);
  const out = [];
  const seen = new Set();
  for (const span of extractVerifiableAnchors(s) || []) addNeedle(out, seen, span?.text);
  for (const fig of collectBackstopFigures(s) || []) addNeedle(out, seen, fig?.raw);
  const multipleRe = /\b\d+(?:\.\d+)?x\b/gi;
  let m;
  while ((m = multipleRe.exec(s))) addNeedle(out, seen, m[0]);
  const capsRe = /\b[A-Z]{2,8}\b/g;
  while ((m = capsRe.exec(s))) addNeedle(out, seen, m[0]);
  return out;
}

function sentenceScore(sentence, needles) {
  if (!needles.length) return 0;
  const hay = String(sentence || "").toLowerCase();
  let n = 0;
  for (const needle of needles) {
    if (hay.includes(needle.toLowerCase())) n += 1;
  }
  return n;
}

function scoreSentences(text, needles) {
  const t = asText(text);
  const chunks = splitSentences(t);
  const scored = [];
  let offset = 0;
  for (const sentence of chunks) {
    const skip = /^\s*\.\.\.\s*$/.test(sentence);
    scored.push({
      text: sentence,
      start: offset,
      end: offset + sentence.length,
      score: skip ? 0 : sentenceScore(sentence, needles),
      skip,
    });
    offset += sentence.length;
  }
  return scored;
}

function carriesClaimAnchor(sentence, anchors) {
  if (!anchors.length) return false;
  const hay = String(sentence || "").toLowerCase();
  return anchors.some((a) => hay.includes(String(a).toLowerCase()));
}

function joinKept(t, scored, kept) {
  if (!kept.length) return null;
  const start = kept[0].start;
  const end = kept[kept.length - 1].end;
  const core = t.slice(start, end).trim();
  if (!core) return null;
  const lead = start > 0 ? "... " : "";
  const tail = end < t.length ? " ..." : "";
  return `${lead}${core}${tail}`;
}

/**
 * Quote is whole sentences. Must-keep sentences (those carrying the
 * statement's figures, dates, or names) are never dropped. Optional
 * sentences drop from the ends of the cover, lowest score first, until
 * the window is at most MAX_QUOTE_SENTENCES, unless the must-keep cover
 * is already larger: then the cover is shown in full. One long sentence
 * is shown in full. No relevant sentences: leading whole sentences up
 * to the ceiling.
 */
export function trimExcerptToSentences(passage, statementText) {
  const text = asText(passage);
  const t = text.trim();
  if (!t) return null;
  const scored = scoreSentences(t, statementNeedles(statementText));
  if (scored.length === 0) return t;
  if (scored.length === 1) return scored[0].text.trim();

  const anchors = claimAnchors(statementText);
  const mustIdx = [];
  for (let i = 0; i < scored.length; i += 1) {
    if (scored[i].skip) continue;
    if (carriesClaimAnchor(scored[i].text, anchors)) mustIdx.push(i);
  }

  if (mustIdx.length === 0) {
    if (!statementText || !String(statementText).trim() || statementNeedles(statementText).length === 0) {
      const kept = scored.slice(0, Math.min(MAX_QUOTE_SENTENCES, scored.length));
      return joinKept(t, scored, kept);
    }
    const positive = scored
      .map((row, i) => ({ i, row }))
      .filter((x) => x.row.score > 0);
    if (positive.length === 0) {
      const kept = scored.slice(0, Math.min(MAX_QUOTE_SENTENCES, scored.length));
      return joinKept(t, scored, kept);
    }
    const lo = positive[0].i;
    const hi = positive[positive.length - 1].i;
    let kept = scored.slice(lo, hi + 1);
    while (kept.length > MAX_QUOTE_SENTENCES) {
      const left = kept[0];
      const right = kept[kept.length - 1];
      if (right.score <= left.score) kept = kept.slice(0, -1);
      else kept = kept.slice(1);
    }
    return joinKept(t, scored, kept);
  }

  const coverLo = mustIdx[0];
  const coverHi = mustIdx[mustIdx.length - 1];
  let lo = coverLo;
  let hi = coverHi;
  const coverLen = hi - lo + 1;
  if (coverLen < MAX_QUOTE_SENTENCES) {
    const optional = [];
    for (let i = 0; i < scored.length; i += 1) {
      if (i < coverLo || i > coverHi) optional.push(i);
    }
    optional.sort((a, b) => {
      const adjA = a === lo - 1 || a === hi + 1 ? 1 : 0;
      const adjB = b === lo - 1 || b === hi + 1 ? 1 : 0;
      if (adjB !== adjA) return adjB - adjA;
      if (scored[b].score !== scored[a].score) return scored[b].score - scored[a].score;
      return a - b;
    });
    for (const i of optional) {
      if (hi - lo + 1 >= MAX_QUOTE_SENTENCES) break;
      if (i === lo - 1) lo = i;
      else if (i === hi + 1) hi = i;
    }
  }
  const kept = scored.slice(lo, hi + 1);
  return joinKept(t, scored, kept);
}

const GENERIC_CAPS = new Set(["EUR", "USD", "GBP", "CHF", "JPY", "SGD", "HKD", "THE", "AND", "FOR", "NOT"]);

/**
 * Figures, Nx multiples, currency amounts, and ALL-CAPS names. Skips the
 * document party ("3i") and Title-Case words that appear throughout the
 * source, so a source search cannot quote every sentence that says Action.
 */
export function distinctiveClaimAnchors(statement) {
  return claimAnchors(statement).filter((a) => isDistinctiveAnchor(a));
}

function isDistinctiveAnchor(raw) {
  const t = String(raw || "").trim();
  if (t.length < 2) return false;
  if (/^\d$/.test(t)) return false;
  if (/\d+(?:\.\d+)?x$/i.test(t)) return true;
  if (/[€£$¥]/.test(t)) return true;
  if (/\d/.test(t) && t.replace(/\D/g, "").length >= 2) return true;
  if (/^[A-Z]{2,8}$/.test(t) && !GENERIC_CAPS.has(t)) return true;
  return false;
}

function sentenceHasFigureAnchor(sentence, anchors) {
  const hay = String(sentence || "");
  return anchors.some((a) => {
    if (!/\d/.test(a) && !/[€£$¥]/.test(a)) return false;
    return hay.toLowerCase().includes(String(a).toLowerCase());
  });
}

function onlyWhitespace(source, start, end) {
  if (end <= start) return true;
  return /^\s*$/.test(source.slice(start, end));
}

function joinSourceRuns(source, hits) {
  if (!hits.length) return null;
  hits.sort((a, b) => a.start - b.start);
  const runs = [];
  let cur = { start: hits[0].start, end: hits[0].end };
  for (let i = 1; i < hits.length; i += 1) {
    if (onlyWhitespace(source, cur.end, hits[i].start)) {
      cur.end = hits[i].end;
    } else {
      runs.push(cur);
      cur = { start: hits[i].start, end: hits[i].end };
    }
  }
  runs.push(cur);
  const passage = runs.map((r) => source.slice(r.start, r.end).trim()).filter(Boolean).join(GAP_MARK);
  if (!passage) return null;
  const multi = runs.length > 1;
  return {
    passage,
    start: multi ? null : runs[0].start,
    end: multi ? null : runs[runs.length - 1].end,
    runCount: runs.length,
  };
}

/**
 * When the matcher stored no pointer, find source sentences that carry
 * the statement's own figures and names. Non-contiguous runs join with
 * a visible gap marker in the one displayed string. Name-only sentences
 * far from a figure hit are dropped so a repeated portfolio name cannot
 * pull in a later commentary sentence.
 */
export function locateClaimSentencesInSource({ statement, sourceText, sourceLabel } = {}) {
  const source = asText(sourceText);
  const stmt = asText(statement);
  const label = asText(sourceLabel).trim();
  if (!source.trim() || !stmt.trim()) return null;
  const anchors = distinctiveClaimAnchors(stmt);
  if (anchors.length === 0) return null;
  const scored = scoreSentences(source, anchors).map((row, index) => ({ ...row, index }));
  let hits = scored.filter((row) => carriesClaimAnchor(row.text, anchors));
  if (hits.length === 0) return null;
  const figHits = hits.filter((row) => sentenceHasFigureAnchor(row.text, anchors));
  if (figHits.length > 0) {
    const lo = figHits[0].index - 2;
    const hi = figHits[figHits.length - 1].index + 2;
    hits = hits.filter((row) => row.index >= lo && row.index <= hi);
  }
  const joined = joinSourceRuns(source, hits);
  if (!joined) return null;
  return { ...joined, sourceLabel: label };
}

export function locateClaimSentencesInSources({ statement, sources } = {}) {
  const list = Array.isArray(sources) ? sources : [];
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i] || {};
    const label =
      asText(row.label).trim() || asText(row.name).trim() || asText(row.title).trim() || `Source ${i + 1}`;
    const hit = locateClaimSentencesInSource({
      statement,
      sourceText: row.text,
      sourceLabel: label,
    });
    if (hit?.passage) return hit;
  }
  return null;
}
