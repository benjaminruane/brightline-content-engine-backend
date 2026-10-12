/**
 * B387. Score the aligned-difference prototype. No model, no network.
 * Reads committed payloads, labels and source texts only.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  alignStatementToPassage,
  defectPositions,
  furnitureReason,
  tokenize,
  tokensForTier,
} from "./align.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const TIERS = [0, 1, 2, 3, 4];

/**
 * T4. Written from the tier-3 clean substitutions, after T1-T3.
 * A pair is included only when the two sides are the same word under
 * inflection or spelling. cash/cashflow was in the stem list and was left
 * out: they are not the same word. No other clean substitution was within
 * two edits. Cap 40. Seven entries.
 */
const T4_GROUPS = [
  ["continue", "continues", "continued"],
  ["cover", "covers", "covering"],
  ["investment", "investments"],
  ["maintain", "maintaining"],
  ["program", "programme"],
  ["return", "returns"],
  ["selective", "selectively"],
];

const STOP = new Set(
  "the a an of and to in for on with by from as at or its it is was were be been being that this their which who into over than also not but if so per our we has have had will would".split(" "),
);

const EIGHT = [
  { id: "3i-doctored", file: "tests/fixtures/real-runs-2026-09-29/doc-review.json", source: "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt" },
  { id: "3i-clean", file: "tests/fixtures/real-runs-2026-09-29/clean-review.json", source: "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt" },
  { id: "hicl-doctored", file: "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json", source: "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt" },
  { id: "hicl-clean", file: "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json", source: "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt" },
  { id: "gpi-doctored", file: "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json", source: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt" },
  { id: "gpi-clean", file: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json", source: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt" },
  { id: "clearpoint-doctored", file: "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json", source: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt" },
  { id: "clearpoint-clean", file: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json", source: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt" },
];

const EXTRA_CLEAN = [
  { id: "gpi-clean-run3", file: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run3-review.json", source: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt", headline: "gpi-clean" },
  { id: "gpi-clean-run4", file: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run4-review.json", source: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt", headline: "gpi-clean" },
  { id: "gpi-clean-run5", file: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run5-review.json", source: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt", headline: "gpi-clean" },
  { id: "clearpoint-clean2", file: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean2-review.json", source: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt", headline: "clearpoint-clean" },
  { id: "clearpoint-clean3", file: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean3-review.json", source: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt", headline: "clearpoint-clean" },
];

const CLEAN_HEADLINE = ["3i-clean", "hicl-clean", "gpi-clean", "clearpoint-clean"];
const FULL_LIST_DOCS = ["3i-clean", "hicl-clean"];

function synonymMapFrom(groups) {
  const map = new Map();
  for (const group of groups) {
    const canon = String(group[0] || "").toLowerCase();
    if (!canon) throw new Error("T4 group is missing its canonical word");
    for (const word of group) {
      const key = String(word || "").toLowerCase();
      if (!key) throw new Error("T4 group has an empty word");
      map.set(key, `syn:${canon}`);
    }
  }
  return map;
}

const SYNONYMS = synonymMapFrom(T4_GROUPS);

function assert(cond, message) {
  if (!cond) throw new Error(`self-check failed: ${message}`);
}

function classesOf(statement, passage, tier) {
  return alignStatementToPassage(statement, passage, { tier, synonymMap: SYNONYMS }).positions.map((p) => p.class);
}

function selfCheck() {
  const mait = alignStatementToPassage("MAIT redeemed the notes", "Action redeemed the notes", { tier: 0 });
  const maitSub = mait.positions.filter((p) => p.class === "substituted");
  assert(maitSub.length === 1 && maitSub[0].statementSpan.text === "MAIT", "MAIT/Action should be one substitution");

  const grown = defectPositions(alignStatementToPassage("Action grew", "Action grew strongly in Europe", { tier: 0 }).positions);
  assert(grown.length === 0, "extra passage words are dropped, not defects");

  const added = alignStatementToPassage("Action grew strongly", "Action grew", { tier: 0 }).positions;
  assert(added.some((p) => p.class === "added" && p.statementSpan.text === "strongly"), "extra statement word is added");

  const num = alignStatementToPassage("3,291", "3291", { tier: 2, synonymMap: SYNONYMS });
  assert(num.positions.length === 1 && num.positions[0].class === "same", "3,291 vs 3291 at T2");

  const money = alignStatementToPassage("$52.0m", "USD 52 million", { tier: 2, synonymMap: SYNONYMS });
  assert(money.positions.length === 1 && money.positions[0].class === "same", "$52.0m vs USD 52 million at T2");

  const six = alignStatementToPassage("six", "6", { tier: 2, synonymMap: SYNONYMS });
  assert(six.positions[0].class === "same", "six vs 6 at T2");

  const pct = alignStatementToPassage("16 percent", "16%", { tier: 2, synonymMap: SYNONYMS });
  assert(pct.positions.every((p) => p.class === "same"), "16 percent vs 16% at T2");

  const billion = alignStatementToPassage("six billion", "60 billion", { tier: 2, synonymMap: SYNONYMS });
  assert(billion.positions.some((p) => p.class === "substituted"), "six billion vs 60 billion stays a substitution at T2");

  const dateT2 = alignStatementToPassage("13 May 2026", "May 13, 2026", { tier: 2, synonymMap: SYNONYMS });
  assert(defectPositions(dateT2.positions).length > 0, "date order still differs at T2");

  const dateT3 = alignStatementToPassage("13 May 2026", "May 13, 2026", { tier: 3, synonymMap: SYNONYMS });
  assert(dateT3.positions.length === 1 && dateT3.positions[0].class === "same", "13 May 2026 vs May 13, 2026 at T3");

  const period = alignStatementToPassage("31 December 2025", "28 February 2026", { tier: 3, synonymMap: SYNONYMS });
  assert(period.positions.some((p) => p.class === "substituted"), "different dates stay different at T3");

  assert(tokenize("3i Group", 1).map((t) => t.text).join(" ") === "3i Group", "3i stays one token");
  assert(furnitureReason("Log In Sign Up\nProducts Pricing Customer Stories Resources Newsroom\nHello") === "navigation bar leads the excerpt", "nav bar");
  assert(furnitureReason("Action continued to trade strongly.") === null, "prose is not furniture");
  void classesOf;
}

function foldSpace(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function locateMap(statement) {
  let out = "";
  const at = [];
  for (let i = 0; i < statement.length; i += 1) {
    let ch = statement[i];
    if (ch === "’" || ch === "‘" || ch === "‛") ch = "'";
    else if (ch === "“" || ch === "”") ch = "\"";
    else if (ch === "–" || ch === "—" || ch === "−") ch = "-";
    if (/\s/.test(ch)) {
      if (out.endsWith(" ")) continue;
      out += " ";
      at.push(i);
      continue;
    }
    out += ch.toLowerCase();
    at.push(i);
  }
  return { out, at };
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function needleToReg(written) {
  let s = String(written)
    .replace(/[’‘‛]/g, "'")
    .replace(/[“”]/g, "\"")
    .replace(/[–—−]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const slots = [];
  s = s.replace(/£|gbp|\$|usd|€|eur/g, (m) => {
    const kind = m === "£" || m === "gbp" ? "gbp" : m === "$" || m === "usd" ? "usd" : "eur";
    const i = slots.length;
    slots.push(kind);
    return `\u0000${i}\u0000`;
  });
  let body = escapeReg(s).replace(/\\ /g, "\\s+");
  body = body.replace(/\u0000(\d+)\u0000/g, (_, n) => {
    const kind = slots[Number(n)];
    if (kind === "gbp") return "(?:£|gbp)\\s*";
    if (kind === "usd") return "(?:\\$|usd)\\s*";
    return "(?:€|eur)\\s*";
  });
  return new RegExp(body, "g");
}

function spansFromMatches(statement, written) {
  const { out, at } = locateMap(statement);
  const re = needleToReg(written);
  const spans = [];
  let match;
  while ((match = re.exec(out))) {
    if (match[0].length === 0) break;
    const a = at[match.index];
    const b = at[match.index + match[0].length - 1];
    spans.push({ start: a, end: b + 1, how: "verbatim" });
  }
  return spans;
}

function looseTokenEqual(w, s) {
  if (w.key === s.key) return true;
  const num = (t) => {
    const parsed = String(t.text).replace(/[$£€¥]/g, "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return parsed ? parsed[0].replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1") : null;
  };
  const nw = num(w);
  const ns = num(s);
  if (nw && ns && nw === ns) return true;
  const alias = { gbp: "gbp", "£": "gbp", usd: "usd", $: "usd", eur: "eur", "€": "eur" };
  if (alias[w.key] && alias[w.key] === alias[s.key]) return true;
  return false;
}

function subsequenceSpan(statement, written) {
  const w = tokensForTier(written, 1, null).filter((t) => t.key);
  const s = tokensForTier(statement, 1, null).filter((t) => t.key);
  let j = 0;
  const matched = [];
  const missed = [];
  for (const token of w) {
    let found = -1;
    for (let k = j; k < s.length; k += 1) {
      if (looseTokenEqual(token, s[k])) {
        found = k;
        break;
      }
    }
    if (found < 0) missed.push(token.text);
    else {
      matched.push(s[found]);
      j = found + 1;
    }
  }
  if (matched.length < 2 || matched.length / w.length < 0.6) return null;
  return {
    start: matched[0].start,
    end: matched[matched.length - 1].end,
    how: `partial, missing ${missed.join(" ") || "none"}`,
  };
}

function locateWritten(statement, written) {
  const verbatim = spansFromMatches(statement, written);
  if (verbatim.length) return verbatim;
  const partial = subsequenceSpan(statement, written);
  return partial ? [partial] : [];
}

function overlaps(a, b) {
  return a && b && a.start < b.end && a.end > b.start;
}

function coverage(positions, spans) {
  if (!spans.length) return { outcome: "not-covered", how: "written-not-in-statement", classes: [] };
  const classes = new Set();
  for (const span of spans) {
    for (const pos of positions) {
      if ((pos.class === "substituted" || pos.class === "added") && overlaps(pos.statementSpan, span)) {
        classes.add(pos.class);
      }
    }
  }
  if (classes.size === 0) return { outcome: "not-covered", how: spans[0].how, classes: [] };
  return { outcome: "covered", how: spans[0].how, classes: [...classes] };
}

function isStop(key) {
  return STOP.has(key);
}

function splitSentences(text) {
  const s = String(text ?? "");
  const parts = [];
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === "\n") {
      if (i > start) parts.push({ start, end: i });
      start = i + 1;
      continue;
    }
    if ((ch === "." || ch === "!" || ch === "?") && !(ch === "." && /\d/.test(s[i - 1] || "") && /\d/.test(s[i + 1] || ""))) {
      let j = i + 1;
      while (j < s.length && (s[j] === " " || s[j] === "\t")) j += 1;
      const nxt = s[j];
      if (!nxt || /[A-Z"“']/.test(nxt)) {
        parts.push({ start, end: j });
        start = j;
        i = j - 1;
      }
    }
  }
  if (start < s.length && s.slice(start).trim()) parts.push({ start, end: s.length });
  return parts.filter((p) => s.slice(p.start, p.end).trim());
}

function bestPassage(statement, source, tier, maxSentences) {
  if (!String(source || "").trim()) {
    throw new Error("best-match source is empty");
  }
  const sentences = splitSentences(source);
  const statementTokens = tokensForTier(statement, tier, SYNONYMS);
  const cap = maxSentences ?? 3;
  let best = null;
  for (let w = 1; w <= cap; w += 1) {
    for (let i = 0; i + w <= sentences.length; i += 1) {
      const start = sentences[i].start;
      const end = sentences[i + w - 1].end;
      const passage = source.slice(start, end);
      const tokens = tokensForTier(passage, tier, SYNONYMS);
      if (tokens.length > 80 || tokens.length === 0) continue;
      const bag = new Map();
      for (const token of tokens) bag.set(token.key, (bag.get(token.key) || 0) + 1);
      let hit = 0;
      let content = 0;
      for (const token of statementTokens) {
        if (isStop(token.key)) continue;
        content += 1;
        const n = bag.get(token.key) || 0;
        if (n > 0) {
          hit += 1;
          bag.set(token.key, n - 1);
        }
      }
      const row = { passage, start, end, sentences: w, hit, content, len: tokens.length };
      if (!best || row.hit > best.hit || (row.hit === best.hit && row.len < best.len) || (row.hit === best.hit && row.len === best.len && row.start < best.start)) {
        best = row;
      }
    }
  }
  if (!best) {
    const all = tokensForTier(source, tier, SYNONYMS);
    for (let i = 0; i < all.length; i += 20) {
      const slice = all.slice(i, i + 40);
      if (!slice.length) break;
      const passage = source.slice(slice[0].start, slice[slice.length - 1].end);
      const row = { passage, start: slice[0].start, end: slice[slice.length - 1].end, sentences: 0, hit: 0, content: 0, len: slice.length };
      if (!best || row.start < best.start) best = row;
    }
  }
  if (!best) throw new Error("best-match found no passage");
  return best;
}

function selectedPassage(card) {
  const primary = card.primaryExcerptText;
  if (primary != null && typeof primary !== "string") {
    throw new Error("primaryExcerptText is not a string");
  }
  if (!String(primary ?? "").trim()) return { unalignable: "absent", passage: "" };
  const reason = furnitureReason(primary);
  if (reason) return { unalignable: "furniture", detail: reason, passage: primary };
  const pieces = [primary];
  const spans = Array.isArray(card.supportSpans) ? card.supportSpans : [];
  for (const span of spans) {
    if (!span || span.passage == null) continue;
    if (typeof span.passage !== "string") throw new Error("supportSpans.passage is not a string");
    const p = span.passage.trim();
    if (!p) continue;
    const fp = foldSpace(p);
    const folded = pieces.map(foldSpace);
    if (folded.some((x) => x.includes(fp))) continue;
    const container = folded.findIndex((x) => fp.includes(x) && x.length > 0);
    if (container >= 0) pieces[container] = p;
    else pieces.push(p);
  }
  return { unalignable: null, passage: pieces.join("\n") };
}

function alignOrUnalignable(statement, selection, tier) {
  if (selection.unalignable) {
    return { unalignable: selection.unalignable, positions: [], defects: [] };
  }
  const positions = alignStatementToPassage(statement, selection.passage, { tier, synonymMap: SYNONYMS }).positions;
  return { unalignable: null, positions, defects: defectPositions(positions) };
}

async function loadPayload(rel) {
  const abs = path.join(ROOT, rel);
  const text = await readFile(abs, "utf8");
  const payload = JSON.parse(text);
  if (!Array.isArray(payload.statements)) throw new Error(`${rel} has no statements array`);
  return payload;
}

async function loadSource(rel) {
  const abs = path.join(ROOT, rel);
  const text = await readFile(abs, "utf8");
  if (!text.trim()) throw new Error(`${rel} is empty`);
  return text;
}

function statementText(row, where) {
  const text = row?.text;
  if (typeof text !== "string" || !text.trim()) throw new Error(`${where} is missing statement text`);
  return text;
}

function cardOf(row, where) {
  if (!row?.qcCard) throw new Error(`${where} is missing qcCard`);
  return row.qcCard;
}

function distribution(counts) {
  const hist = new Map();
  for (const n of counts) hist.set(n, (hist.get(n) || 0) + 1);
  return [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}:${c}`).join(" ");
}

function summariseClean(rows) {
  const alignable = rows.filter((r) => !r.unalignable);
  const flagged = alignable.filter((r) => r.defects > 0);
  const subs = alignable.reduce((n, r) => n + r.substituted, 0);
  const adds = alignable.reduce((n, r) => n + r.added, 0);
  return {
    statements: rows.length,
    unalignable: rows.filter((r) => r.unalignable).length,
    flagged: flagged.length,
    substituted: subs,
    added: adds,
    defects: subs + adds,
    distribution: distribution(alignable.map((r) => r.defects)),
    flaggedIndexes: flagged.map((r) => `${r.doc}#${r.index}`).join(","),
  };
}

selfCheck();

const synonymEntryCount = T4_GROUPS.length;
if (synonymEntryCount > 40) throw new Error(`T4 has ${synonymEntryCount} entries; cap is 40`);

const payloads = new Map();
const sources = new Map();
for (const spec of [...EIGHT, ...EXTRA_CLEAN]) {
  payloads.set(spec.id, await loadPayload(spec.file));
  if (!sources.has(spec.source)) sources.set(spec.source, await loadSource(spec.source));
  spec.sourceText = sources.get(spec.source);
}

const labels = JSON.parse(await readFile(path.join(ROOT, "scripts/diagnostic/b385/labels.json"), "utf8"));

const furniture = [];
const emptyGreen = [];
const spanHist = new Map();
for (const spec of EIGHT) {
  const payload = payloads.get(spec.id);
  payload.statements.forEach((row, i) => {
    const card = cardOf(row, `${spec.id}#${i}`);
    const n = Array.isArray(card.supportSpans) ? card.supportSpans.length : 0;
    spanHist.set(n, (spanHist.get(n) || 0) + 1);
    const reason = furnitureReason(card.primaryExcerptText);
    if (reason) {
      furniture.push({
        doc: spec.id,
        index: card.index,
        verdict: card.displayVerdict,
        reason,
        head: foldSpace(card.primaryExcerptText).slice(0, 140),
        chars: String(card.primaryExcerptText || "").length,
      });
    }
    if (card.displayVerdict === "supported_full" && n === 0) {
      emptyGreen.push({
        doc: spec.id,
        index: card.index,
        excerptChars: String(card.primaryExcerptText || "").length,
        head: foldSpace(card.primaryExcerptText).slice(0, 100),
      });
    }
  });
}

function cleanRows(spec, tier, arm) {
  const payload = payloads.get(spec.id);
  return payload.statements.map((row, i) => {
    const card = cardOf(row, `${spec.id}#${i}`);
    const text = statementText(row, `${spec.id}#${i}`);
    if (arm === "as-selected") {
      const selection = selectedPassage(card);
      const aligned = alignOrUnalignable(text, selection, tier);
      const defects = aligned.defects;
      return {
        doc: spec.id,
        index: card.index,
        unalignable: aligned.unalignable,
        substituted: defects.filter((p) => p.class === "substituted").length,
        added: defects.filter((p) => p.class === "added").length,
        defects: defects.length,
        positions: defects,
      };
    }
    const found = bestPassage(text, spec.sourceText, tier, 3);
    const positions = alignStatementToPassage(text, found.passage, { tier, synonymMap: SYNONYMS }).positions;
    const defects = defectPositions(positions);
    return {
      doc: spec.id,
      index: card.index,
      unalignable: null,
      substituted: defects.filter((p) => p.class === "substituted").length,
      added: defects.filter((p) => p.class === "added").length,
      defects: defects.length,
      positions: defects,
      sentences: found.sentences,
      hit: found.hit,
      content: found.content,
      passageHead: foldSpace(found.passage).slice(0, 160),
    };
  });
}

const cleanSummary = [];
const fullLists = [];
const pairCounts = new Map();

for (const tier of TIERS) {
  for (const arm of ["as-selected", "best-match"]) {
    const rows = [];
    for (const id of CLEAN_HEADLINE) {
      const spec = EIGHT.find((s) => s.id === id);
      const part = cleanRows(spec, tier, arm);
      rows.push(...part);
      if (FULL_LIST_DOCS.includes(id) && (tier === 0 || tier === 3 || tier === 4)) {
        for (const row of part) {
          if (row.unalignable || row.defects === 0) continue;
          fullLists.push({
            tier,
            arm,
            doc: row.doc,
            index: row.index,
            flags: row.positions.map((p) => ({
              class: p.class,
              statement: p.statementSpan?.text ?? "",
              passage: p.passageSpan?.text ?? "",
            })),
          });
        }
      }
      if (tier === 3 && arm === "best-match") {
        for (const row of part) {
          for (const p of row.positions) {
            const left = foldSpace(p.statementSpan?.text || "");
            const right = p.class === "added" ? "" : foldSpace(p.passageSpan?.text || "");
            const key = `${p.class}|${left}|${right}`;
            pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
          }
        }
      }
    }
    cleanSummary.push({ tier, arm, ...summariseClean(rows) });
  }
}

const extraCompare = [];
for (const extra of EXTRA_CLEAN) {
  for (const tier of [0, 4]) {
    for (const arm of ["as-selected", "best-match"]) {
      const extraRows = cleanRows(extra, tier, arm);
      const head = EIGHT.find((s) => s.id === extra.headline);
      const headRows = cleanRows(head, tier, arm);
      const sig = (rows) => rows.map((r) => `${r.index}:${r.unalignable || r.defects}`).join(",");
      extraCompare.push({
        doc: extra.id,
        tier,
        arm,
        same: sig(extraRows) === sig(headRows),
        extra: sig(extraRows),
        headline: sig(headRows),
      });
    }
  }
}

const planted = [];
for (const run of labels.runs) {
  const spec = EIGHT.find((s) => s.file === run.reviewPath);
  if (!spec) throw new Error(`no payload spec for ${run.reviewPath}`);
  const payload = payloads.get(spec.id);
  const byIndex = new Map(payload.statements.map((row) => [row.qcCard.index, row]));
  for (const entry of run.entries) {
    const row = byIndex.get(entry.statementIndex);
    if (!row) throw new Error(`${run.runId} missing statement ${entry.statementIndex}`);
    const text = statementText(row, `${run.runId}#${entry.statementIndex}`);
    const card = cardOf(row, `${run.runId}#${entry.statementIndex}`);
    for (const sub of entry.substitutions) {
      const spans = locateWritten(text, sub.written);
      for (const tier of TIERS) {
        for (const arm of ["as-selected", "best-match"]) {
          if (arm === "as-selected") {
            const selection = selectedPassage(card);
            if (selection.unalignable) {
              planted.push({ id: sub.id, tier, arm, outcome: "unalignable", how: selection.unalignable, classes: [] });
              continue;
            }
            const positions = alignStatementToPassage(text, selection.passage, { tier, synonymMap: SYNONYMS }).positions;
            const cov = coverage(positions, spans);
            planted.push({ id: sub.id, tier, arm, outcome: cov.outcome, how: cov.how, classes: cov.classes });
          } else {
            const found = bestPassage(text, spec.sourceText, tier, 3);
            const positions = alignStatementToPassage(text, found.passage, { tier, synonymMap: SYNONYMS }).positions;
            const cov = coverage(positions, spans);
            planted.push({
              id: sub.id,
              tier,
              arm,
              outcome: cov.outcome,
              how: cov.how,
              classes: cov.classes,
              sentences: found.sentences,
              passageHead: foldSpace(found.passage).slice(0, 140),
            });
            if (tier === 0) {
              const one = bestPassage(text, spec.sourceText, tier, 1);
              const onePos = alignStatementToPassage(text, one.passage, { tier, synonymMap: SYNONYMS }).positions;
              const oneCov = coverage(onePos, spans);
              planted.push({
                id: sub.id,
                tier: "0-one-sentence",
                arm: "best-match-1",
                outcome: oneCov.outcome,
                how: oneCov.how,
                classes: oneCov.classes,
                sentences: 1,
                passageHead: foldSpace(one.passage).slice(0, 140),
              });
            }
          }
        }
      }
    }
  }
}

const failures = [];
for (const arm of ["as-selected", "best-match"]) {
  const ids = [...new Set(planted.filter((p) => p.arm === arm).map((p) => p.id))];
  for (const id of ids) {
    for (let t = 1; t <= 4; t += 1) {
      const prev = planted.find((p) => p.id === id && p.arm === arm && p.tier === t - 1);
      const cur = planted.find((p) => p.id === id && p.arm === arm && p.tier === t);
      if (prev && cur && prev.outcome === "covered" && cur.outcome !== "covered") {
        failures.push({ tier: t, arm, id, from: prev.outcome, to: cur.outcome });
      }
    }
  }
}

const q1Clean = [];
for (const id of CLEAN_HEADLINE) {
  const spec = EIGHT.find((s) => s.id === id);
  const payload = payloads.get(spec.id);
  for (const row of payload.statements) {
    const text = statementText(row, id);
    const one = bestPassage(text, spec.sourceText, 1, 1);
    const many = bestPassage(text, spec.sourceText, 1, 3);
    q1Clean.push({
      doc: id,
      index: row.qcCard.index,
      spans: Array.isArray(row.qcCard.supportSpans) ? row.qcCard.supportSpans.length : 0,
      oneHit: one.hit,
      oneContent: one.content,
      manyHit: many.hit,
      manySentences: many.sentences,
      needsSeveral: many.sentences > 1 && many.hit >= one.hit + 2,
    });
  }
}

const multiIds = [];
for (const run of labels.runs) {
  const byStmt = new Map();
  for (const entry of run.entries) {
    for (const sub of entry.substitutions) {
      const list = byStmt.get(entry.statementIndex) || [];
      list.push(sub.id);
      byStmt.set(entry.statementIndex, list);
    }
  }
  for (const [index, ids] of byStmt) {
    if (ids.length < 2) continue;
    multiIds.push({ run: run.runId, index, ids });
  }
}

const topPairs = [...pairCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80);

const recallLine = (arm, tier) => {
  const rows = planted.filter((p) => p.arm === arm && p.tier === tier);
  const covered = rows.filter((p) => p.outcome === "covered").length;
  const missed = rows.filter((p) => p.outcome === "not-covered").length;
  const una = rows.filter((p) => p.outcome === "unalignable").length;
  return `${arm} T${tier}: covered ${covered} not-covered ${missed} unalignable ${una} of ${rows.length}`;
};

console.log("SELF-CHECK ok");
console.log(`T4 entries ${synonymEntryCount}`);
console.log("T4 list:");
for (const group of T4_GROUPS) console.log(`  ${group.join(" = ")}`);
console.log("\nFURNITURE", furniture.length);
for (const row of furniture) console.log(`  ${row.doc} S${row.index} ${row.verdict} ${row.chars}c ${row.reason} | ${row.head}`);
console.log("\nGREEN EMPTY SUPPORTSPANS", emptyGreen.length);
for (const row of emptyGreen) console.log(`  ${row.doc} S${row.index} excerpt ${row.excerptChars}c | ${row.head}`);
console.log("\nSUPPORTSPANS HIST", [...spanHist.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}:${c}`).join(" "));
console.log("\nCLEAN");
for (const row of cleanSummary) {
  console.log(`T${row.tier} ${row.arm}: flagged ${row.flagged}/${row.statements} unalignable ${row.unalignable} substituted ${row.substituted} added ${row.added} defects ${row.defects} dist ${row.distribution}`);
}
console.log("\nRECALL");
for (const tier of TIERS) {
  console.log(recallLine("as-selected", tier));
  console.log(recallLine("best-match", tier));
}
console.log("\nFAILURES", failures.length);
for (const row of failures) console.log(`  T${row.tier} ${row.arm} ${row.id} ${row.from} -> ${row.to}`);
console.log("\nPLANTED");
const ids = [...new Set(planted.filter((p) => p.arm === "best-match").map((p) => p.id))];
for (const id of ids) {
  const cells = [];
  for (const tier of TIERS) {
    for (const arm of ["as-selected", "best-match"]) {
      const row = planted.find((p) => p.id === id && p.tier === tier && p.arm === arm);
      const mark = row.outcome === "covered" ? "C" : row.outcome === "unalignable" ? "U" : "N";
      cells.push(`${arm[0]}${tier}${mark}`);
    }
  }
  const how = planted.find((p) => p.id === id && p.arm === "best-match" && p.tier === 0);
  console.log(`${id} ${cells.join(" ")} how=${how.how} sentences=${how.sentences}`);
}
console.log("\nQ2 multi-claim");
for (const group of multiIds) {
  const bits = group.ids.map((id) => {
    const wide = planted.find((p) => p.id === id && p.arm === "best-match" && p.tier === 0);
    const one = planted.find((p) => p.id === id && p.arm === "best-match-1" && p.tier === "0-one-sentence");
    return `${id}:${one.outcome}/${wide.outcome}/w${wide.sentences}`;
  });
  console.log(`  ${group.run} S${group.index} ${bits.join(" ")}`);
}
console.log("\nQ1 needsSeveral", q1Clean.filter((r) => r.needsSeveral).length, "of", q1Clean.length);
for (const row of q1Clean.filter((r) => r.needsSeveral)) {
  console.log(`  ${row.doc} S${row.index} spans=${row.spans} one=${row.oneHit}/${row.oneContent} many=${row.manyHit} sentences=${row.manySentences}`);
}
console.log("\nEXTRA");
for (const row of extraCompare) {
  console.log(`${row.doc} T${row.tier} ${row.arm} ${row.same ? "SAME" : "DIFF"} extra[${row.extra}] head[${row.headline}]`);
}
console.log("\nTOP PAIRS tier3 best-match");
for (const [key, n] of topPairs) console.log(`  ${n}  ${key}`);
console.log("\nFULL LISTS");
for (const row of fullLists) {
  if (row.tier !== 0 && row.tier !== 4) continue;
  if (row.arm !== "best-match") continue;
  console.log(`-- ${row.doc} S${row.index} T${row.tier} ${row.arm} (${row.flags.length})`);
  for (const flag of row.flags) console.log(`   ${flag.class} | ${flag.statement} | ${flag.passage}`);
}
