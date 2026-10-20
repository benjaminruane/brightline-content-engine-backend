/**
 * B359. A displayed quote is whole sentences. A length limit may drop
 * sentences; it may not decide whether a quote was found. B405 caps the
 * shown quote at MAX_EXCERPT_CHARS and finishes a cut on a word boundary.
 * Multiple locatable source runs for one statement are joined with a
 * visible gap marker in the one primaryExcerpt string. No new card field.
 */
import { isPageFurnitureSentence } from "../extract-boilerplate.mjs";
import { extractVerifiableAnchors } from "./claim-spans.mjs";
import { collectBackstopFigures } from "./pipeline-v4/stage2-match-sources.mjs";
import { splitSentences } from "./card-honesty.mjs";

export { isPageFurnitureSentence };

/** Whole sentences kept unless a must-keep cover is larger. */
export const MAX_QUOTE_SENTENCES = 6;

/** Stage 2 already promises this ceiling. The must-keep cover may not exceed it. */
export const MAX_EXCERPT_CHARS = 400;

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

const WORD_CHAR = /[A-Za-z0-9]/;

function truncateAtWord(text, cap) {
  const budget = Math.max(1, cap - 1);
  let end = Math.min(budget, text.length);
  if (end < text.length && WORD_CHAR.test(text[end - 1] || "") && WORD_CHAR.test(text[end] || "")) {
    while (end > 0 && WORD_CHAR.test(text[end - 1])) end -= 1;
    while (end > 0 && /\s/.test(text[end - 1])) end -= 1;
  } else {
    while (end > 0 && /\s/.test(text[end - 1])) end -= 1;
  }
  if (end <= 0) end = Math.min(budget, text.length);
  return `${text.slice(0, end).trimEnd()}…`;
}

function renderMustSubset(t, scored, indices) {
  const sorted = [...indices].sort((a, b) => a - b);
  const runs = [];
  let run = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === run[run.length - 1] + 1) run.push(sorted[i]);
    else {
      runs.push(run);
      run = [sorted[i]];
    }
  }
  runs.push(run);
  const parts = runs.map((r) => t.slice(scored[r[0]].start, scored[r[r.length - 1]].end).trim());
  let body = parts.join(GAP_MARK);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (scored[first].start > 0) body = `... ${body}`;
  if (scored[last].end < t.length) body = `${body} ...`;
  return body;
}

function capMustKeep(t, scored, mustIdx) {
  const ranked = [...mustIdx].sort((a, b) => {
    if (scored[b].score !== scored[a].score) return scored[b].score - scored[a].score;
    return a - b;
  });
  const chosen = [];
  for (const i of ranked) {
    const trial = renderMustSubset(t, scored, [...chosen, i]);
    if (trial.length <= MAX_EXCERPT_CHARS) {
      chosen.push(i);
      continue;
    }
    if (chosen.length === 0) return truncateAtWord(scored[i].text.trim(), MAX_EXCERPT_CHARS);
  }
  if (!chosen.length) return truncateAtWord(scored[mustIdx[0]].text.trim(), MAX_EXCERPT_CHARS);
  return renderMustSubset(t, scored, chosen);
}

/**
 * If the passage ends mid-word and the source continues that word, extend
 * it by at most 30 characters. If the word is still unfinished, cut back
 * to the previous word and append an ellipsis. The mirror holds at the start.
 * A passage that already ends on punctuation is left as it is.
 */
export function finishExcerptEdges(passage, sourceText, startOffset) {
  const source = typeof sourceText === "string" ? sourceText : "";
  let shown = typeof passage === "string" ? passage : "";
  if (!shown) return shown;
  let contentStart = Number(startOffset);
  if (!Number.isFinite(contentStart) || contentStart < 0) contentStart = 0;

  const startsMid =
    WORD_CHAR.test(shown[0] || "") && contentStart > 0 && WORD_CHAR.test(source[contentStart - 1] || "");
  if (startsMid) {
    let i = 0;
    while (i < shown.length && WORD_CHAR.test(shown[i])) i += 1;
    while (i < shown.length && /\s/.test(shown[i])) i += 1;
    contentStart += i;
    shown = `…${shown.slice(i)}`;
  }

  const lead = shown.startsWith("…") ? "…" : "";
  const body = lead ? shown.slice(lead.length) : shown;
  if (!body || !WORD_CHAR.test(body[body.length - 1] || "")) return shown;
  const contentEnd = contentStart + body.length;
  if (!WORD_CHAR.test(source[contentEnd] || "")) return shown;

  let extra = 0;
  while (extra < 30 && contentEnd + extra < source.length && WORD_CHAR.test(source[contentEnd + extra])) {
    extra += 1;
  }
  const stillInWord = WORD_CHAR.test(source[contentEnd + extra] || "");
  if (!stillInWord) return `${lead}${body}${source.slice(contentEnd, contentEnd + extra)}`;

  let end = body.length;
  while (end > 0 && WORD_CHAR.test(body[end - 1])) end -= 1;
  while (end > 0 && /\s/.test(body[end - 1])) end -= 1;
  const cut = body.slice(0, end).trimEnd();
  return cut ? `${lead}${cut}…` : `${lead}…`;
}

function finishIfLocated(shown, locate) {
  if (shown == null || !locate || typeof locate.sourceText !== "string") return shown;
  const source = locate.sourceText;
  const hint = Number(locate.startOffset);
  const offset = Number.isFinite(hint) && hint >= 0 ? hint : 0;
  if (source.slice(offset, offset + shown.length) === shown) {
    return finishExcerptEdges(shown, source, offset);
  }
  if (shown.includes(GAP_MARK) || shown.includes("…")) return shown;
  const lead = shown.startsWith("... ") ? "... " : "";
  const tail = shown.endsWith(" ...") ? " ..." : "";
  const core = shown.slice(lead.length, shown.length - tail.length);
  if (!core) return shown;
  let idx = source.indexOf(core, Math.max(0, offset));
  if (idx < 0) idx = source.indexOf(core);
  if (idx < 0 || source.slice(idx, idx + core.length) !== core) return shown;
  const finished = finishExcerptEdges(core, source, idx);
  if (finished === core) return shown;
  return `${lead}${finished}${tail}`;
}

/**
 * Quote is whole sentences. Must-keep sentences (those carrying the
 * statement's figures, dates, or names) are never dropped, except that
 * a must-keep cover longer than MAX_EXCERPT_CHARS keeps only the
 * must-keep sentences nearest the statement's needles, joined with a
 * gap when the runs are not contiguous. One sentence longer than the
 * cap is cut at the last word boundary. Optional sentences still drop
 * from the ends until the window is at most MAX_QUOTE_SENTENCES.
 * locate, when present, is { sourceText, startOffset } for the passage.
 */
export function trimExcerptToSentences(passage, statementText, locate = null) {
  const text = asText(passage);
  const t = text.trim();
  if (!t) return null;
  const scored = scoreSentences(t, statementNeedles(statementText));
  if (scored.length === 0) return finishIfLocated(t, locate);
  if (scored.length === 1) {
    const one = scored[0].text.trim();
    const shown = one.length > MAX_EXCERPT_CHARS ? truncateAtWord(one, MAX_EXCERPT_CHARS) : one;
    return finishIfLocated(shown, locate);
  }

  const anchors = claimAnchors(statementText);
  const mustIdx = [];
  for (let i = 0; i < scored.length; i += 1) {
    if (scored[i].skip) continue;
    if (carriesClaimAnchor(scored[i].text, anchors)) mustIdx.push(i);
  }

  if (mustIdx.length === 0) {
    if (!statementText || !String(statementText).trim() || statementNeedles(statementText).length === 0) {
      const kept = scored.slice(0, Math.min(MAX_QUOTE_SENTENCES, scored.length));
      return finishIfLocated(joinKept(t, scored, kept), locate);
    }
    const positive = scored
      .map((row, i) => ({ i, row }))
      .filter((x) => x.row.score > 0);
    if (positive.length === 0) {
      const kept = scored.slice(0, Math.min(MAX_QUOTE_SENTENCES, scored.length));
      return finishIfLocated(joinKept(t, scored, kept), locate);
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
    return finishIfLocated(joinKept(t, scored, kept), locate);
  }

  const coverLo = mustIdx[0];
  const coverHi = mustIdx[mustIdx.length - 1];
  const coverText = t.slice(scored[coverLo].start, scored[coverHi].end).trim();
  if (coverText.length > MAX_EXCERPT_CHARS) {
    return finishIfLocated(capMustKeep(t, scored, mustIdx), locate);
  }
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
  return finishIfLocated(joinKept(t, scored, kept), locate);
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
 * pull in a later commentary sentence. A sentence that is page furniture
 * is not a hit, even when it also contains an anchor (B394).
 */
export function locateClaimSentencesInSource({ statement, sourceText, sourceLabel } = {}) {
  const source = asText(sourceText);
  const stmt = asText(statement);
  const label = asText(sourceLabel).trim();
  if (!source.trim() || !stmt.trim()) return null;
  const anchors = distinctiveClaimAnchors(stmt);
  if (anchors.length === 0) return null;
  const scored = scoreSentences(source, anchors).map((row, index) => ({ ...row, index }));
  let hits = scored.filter(
    (row) => carriesClaimAnchor(row.text, anchors) && !isPageFurnitureSentence(row.text)
  );
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
