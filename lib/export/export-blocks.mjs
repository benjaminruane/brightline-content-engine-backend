/**
 * The words both export renderers paint, in order.
 * The renderers do not choose verdicts, reasons, counts, or excerpts.
 */
import {
  cutLineEllipsis,
  isCompleteCutLine,
  lineRefLabel,
  nextLineContinuesSentence,
  passageWithLineRef,
  stripTrailingLineRef,
} from "./passage-cut.mjs";
import { filterRelevantPassages } from "../qc/relevant-passages.mjs";

const FORBIDDEN = [
  /evidence concern/i,
  /note_withheld/,
  /primaryExcerpt/,
  /Nothing raised \(high/i,
  /Editorial note: No editorial/i,
];

export const HOW_TO_READ_TITLE = "How to read this review";
export const HOW_TO_READ_LABELS = [
  "Conflicts with the source: a figure, date or claim differs from what the source says.",
  "Goes beyond the source: the draft adds a claim the source does not make.",
  "Needs a look: the check could not settle the point from the source alone.",
  "Nothing raised: the sentence sits with the source.",
  "Craft notes or cautions: house style or wording points for the writer.",
];
export const HOW_TO_READ_LINE_NOTE = "Line numbers refer to the source text as Content Engine read it.";

function must(value, message) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

function present(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function sourceDetail(block) {
  const parts = [block?.publication, block?.fileType].map((part) => present(part)).filter(Boolean);
  return parts.length ? `${parts.join(". ")}.` : "";
}

export function sourceDisplayName(source) {
  for (const key of ["name", "label", "fileName", "filename", "sourceName", "title"]) {
    const value = present(source?.[key]);
    if (value) return value;
  }
  return "";
}

/** Subject-derived title, e.g. "PPET half-year commentary: review". Falls back to text type. */
export function exportTitleName({ subject, textName, textType } = {}) {
  const label = present(subject) || present(textName) || present(textType);
  if (!label) return "";
  if (/:\s*review$/i.test(label)) return label;
  if (/\breview$/i.test(label)) return label.replace(/\s+review$/i, ": review");
  return `${label}: review`;
}

/** B604: same colour as the screen badge when the caller sends no tone. */
function readinessTone(verdict) {
  const label = String(verdict || "").replace(/^Assessment:\s*/i, "").trim();
  if (label === "Needs significant work") return "red";
  if (label === "Ready") return "green";
  return "amber";
}

function titleLines(title) {
  const sourceNames = Array.isArray(title.sourceNames)
    ? title.sourceNames.map((name) => present(name)).filter(Boolean)
    : [];
  const lines = [];
  const name = present(title.name);
  if (name) lines.push({ kind: "title", text: name });
  // B602 F24: coloured Assessment pill (tone mirrors the screen). Keep a plain
  // titleLine too so older export checks still see the verdict string.
  const verdict = present(title.verdict) || present(title.readiness);
  const tone = present(title.assessmentTone) || present(title.tone) || "";
  if (verdict) {
    lines.push({
      kind: "assessmentPill",
      text: verdict.startsWith("Assessment") ? verdict : `Assessment: ${verdict}`,
      tone: tone === "red" || tone === "amber" || tone === "green" || tone === "grey" ? tone : readinessTone(verdict),
    });
    // B605: the line under the pill says why, not the label again.
    lines.push({ kind: "titleLine", text: present(title.verdictReason) || verdict });
  }
  const detail = present(title.detail);
  if (detail) lines.push({ kind: "titleLine", text: detail });
  // B602 F6 / F24: reviewed-version banner and transaction status.
  const reviewedBanner = present(title.reviewedBanner);
  if (reviewedBanner) lines.push({ kind: "titleLine", text: reviewedBanner });
  const dealStatus = present(title.dealStatus) || present(title.transactionStatus);
  if (dealStatus && dealStatus !== "As the source states") {
    lines.push({ kind: "titleLine", text: `Transaction status: ${dealStatus} (set by you)` });
  }
  const writingFor = present(title.writingFor);
  if (writingFor) lines.push({ kind: "titleLine", text: writingFor });
  const reviewed = present(title.reviewed);
  if (reviewed) lines.push({ kind: "titleLine", text: reviewed });
  if (sourceNames.length) lines.push({ kind: "titleSources", names: sourceNames });
  const exported = present(title.exported);
  if (exported) lines.push({ kind: "titleLine", text: exported });
  return lines;
}

/** Summary box rows: house style appears once. */
export function summaryRows(summary) {
  const pack = summary && typeof summary === "object" ? summary : {};
  const counts = Array.isArray(pack.counts) ? pack.counts.map((row) => present(row)).filter(Boolean) : [];
  const house = present(pack.houseStyle);
  const rows = [present(pack.readiness), present(pack.readinessReason), present(pack.facts), ...counts].filter(Boolean);
  if (house && !rows.some((row) => /house style/i.test(row))) rows.push(house);
  const editorial = present(pack.editorial);
  if (editorial) rows.push(editorial);
  return rows;
}

/**
 * B591. A passage piece from a table row shows its cells with clear spacing, and printed
 * bullets are removed. Formatting never stops the export.
 */
export function cleanPassageText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const cleaned = lines.map((line) => {
    let out = line.replace(/^\s*[\u00b7\u2022]\s*/, "");
    out = out.replace(/\s+[\u00b7\u2022]\s+/g, " ");
    if (out.includes("|")) {
      out = out
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
        .join("   ");
    }
    return out.trim();
  });
  return cleaned.filter((line, i) => line || i === 0).join("\n").trim();
}

function scan(text) {
  const body = String(text || "");
  for (const pattern of FORBIDDEN) {
    if (pattern.test(body)) throw new Error(`export: an internal phrase is in the document (${pattern})`);
  }
}

function cardList(document, include) {
  if (Array.isArray(document.cards)) {
    const list = document.cards;
    if (include.attentionOnly) return list.filter((card) => card?.attention === true || card?.tone === "red" || card?.tone === "amber");
    return list;
  }
  const needs = Array.isArray(document.needsAttention) ? document.needsAttention : [];
  const quiet = Array.isArray(document.nothingRaised) ? document.nothingRaised : [];
  if (include.attentionOnly) return needs;
  return [...needs, ...quiet];
}

function cardBlocks(blocks, card, compact) {
  must(card?.heading, "export: a card heading is missing");
  must(card?.sentence, "export: a card sentence is missing");
  must(card?.reason, "export: a card reason is missing");
  scan(card.heading);
  scan(card.sentence);
  scan(card.reason);
  blocks.push({
    kind: "cardHeading",
    text: card.heading,
    tone: card.tone === "red" || card.tone === "amber" || card.tone === "green" ? card.tone : "green",
    compact: compact === true,
  });
  blocks.push({ kind: "cardLabel", text: "Statement" });
  blocks.push({ kind: "quote", text: card.sentence });
  blocks.push({ kind: "cardLabel", text: "Comment" });
  blocks.push({ kind: "body", text: card.reason });
  // B606 C4: drop heading-only / unrelated lines; keep at least the best.
  const passages = filterRelevantPassages(
    Array.isArray(card.passages) ? card.passages : [],
    card.sentence,
  );
  // B604: no "Source" label when the card shows no source line (same as the screen).
  const hasPassage = passages.some((p) => typeof p?.text === "string" && p.text.trim());
  if (hasPassage) blocks.push({ kind: "cardLabel", text: "Source" });
  for (const passage of passages) {
    const original = must(passage?.text, "export: a source passage is missing");
    const cleaned = cleanPassageText(original);
    if (cleaned !== original.trim()) {
      console.warn("[export] cleaned table or bullet characters from a source passage");
    }
    const text = cutLineEllipsis(cleaned);
    if (!text) continue;
    scan(text);
    const lines = lineRefLabel(passage.lines);
    // B604: which source the line is from, when the review has more than one.
    const number = Number.isInteger(passage?.sourceNumber) && passage.sourceNumber > 0 ? passage.sourceNumber : null;
    blocks.push({ kind: "passage", text, lines, number, inline: passageWithLineRef(cleaned, passage.lines) });
  }
  if (card.also && card.also.text) {
    const heading = must(card.also.heading, "export: an extra passage heading is missing");
    scan(heading);
    const alsoClean = cleanPassageText(card.also.text);
    const alsoText = cutLineEllipsis(alsoClean);
    scan(alsoText);
    // B608: same source badge the screen shows on the also-appears passage.
    const number = Number.isInteger(card.also?.sourceNumber) && card.also.sourceNumber > 0
      ? card.also.sourceNumber
      : null;
    blocks.push({
      kind: "also",
      heading,
      text: alsoText,
      lines: lineRefLabel(card.also.lines),
      number,
      inline: passageWithLineRef(alsoClean, card.also.lines),
    });
  }
  const concerns = Array.isArray(card.concerns) ? card.concerns : [];
  for (const concern of concerns) {
    const text = must(concern?.text, "export: a raised concern is missing");
    scan(text);
    const suggestion = typeof concern.suggestion === "string" ? concern.suggestion.trim() : "";
    if (suggestion) scan(suggestion);
    blocks.push({ kind: "concern", label: must(concern.label, "export: a concern label is missing"), text, suggestion });
  }
}

function howToReadBlock(document) {
  const pack = document.howToRead && typeof document.howToRead === "object" ? document.howToRead : {};
  const labels = Array.isArray(pack.labels) && pack.labels.length
    ? pack.labels.map((row) => present(row)).filter(Boolean)
    : HOW_TO_READ_LABELS.slice();
  const lineNote = present(pack.lineNote) || HOW_TO_READ_LINE_NOTE;
  const disclaimer = present(pack.disclaimer) || present(document.disclaimer);
  if (!disclaimer) throw new Error("export: the disclaimer is missing");
  for (const label of labels) scan(label);
  scan(lineNote);
  scan(disclaimer);
  return {
    kind: "howToRead",
    title: present(pack.title) || HOW_TO_READ_TITLE,
    labels,
    lineNote,
    disclaimer,
  };
}

/**
 * B592 order: header (title), Draft, Sources, Review summary, Reviewer's note, Sentence review,
 * then How to read this review.
 */
export function exportBlocks(document, sections = {}) {
  if (!document || typeof document !== "object") throw new Error("export: the document is missing");
  const title = document.title;
  if (!title || typeof title !== "object") throw new Error("export: the title block is missing");
  const lines = titleLines(title);
  for (const line of lines) {
    if (line.text) scan(line.text);
    for (const name of line.names || []) scan(name);
  }
  const blocks = lines;
  const include = sections && typeof sections === "object" ? sections : {};

  if (include.draft) {
    const sentences = Array.isArray(document.draft) ? document.draft : null;
    if (!sentences) throw new Error("export: the draft is missing");
    blocks.push({ kind: "heading", text: "Draft" });
    if (!sentences.length) throw new Error("export: the draft has no sentences");
    const fullDraft = typeof document.fullDraft === "string"
      ? document.fullDraft
      : sentences.map((row) => String(row?.text || "")).join("");
    blocks.push({ kind: "draft", sentences, fullDraft });
  }

  if (include.sources) {
    const sources = Array.isArray(document.sources) ? document.sources : [];
    const named = sources
      .map((source) => ({
        name: sourceDisplayName(source),
        publication: present(source?.publication),
        fileType: present(source?.fileType),
        description: present(source?.description),
        // B602 F45: model-written summary under the source name.
        summary: present(source?.summary),
        number: source?.number ?? source?.index ?? null,
      }))
      .filter((source) => source.name);
    if (named.length) {
      blocks.push({ kind: "heading", text: "Sources" });
      for (const source of named) {
        blocks.push({
          kind: "source",
          name: source.name,
          publication: source.publication,
          fileType: source.fileType,
          description: source.description,
          summary: source.summary,
          number: source.number,
        });
      }
    }
  }

  if (include.reviewSummary) {
    const summary = document.summary;
    if (!summary || typeof summary !== "object") throw new Error("export: the review summary is missing");
    blocks.push({ kind: "heading", text: "Review summary" });
    const rows = summaryRows(summary);
    blocks.push({ kind: "summary", summary, rows });
    scan(must(summary.readiness, "export: the assessment label is missing"));
    for (const line of rows) scan(line);
  }

  if (include.note) {
    const note = typeof document.reviewerNote === "string" ? document.reviewerNote.trim() : "";
    if (!note) throw new Error("export: the reviewer's note is missing");
    scan(note);
    blocks.push({ kind: "heading", text: "Reviewer's note" });
    blocks.push({ kind: "body", text: note });
  }

  if (include.cards) {
    const cards = cardList(document, include);
    if (!Array.isArray(document.cards) && !Array.isArray(document.needsAttention) && !Array.isArray(document.nothingRaised)) {
      throw new Error("export: the cards are missing");
    }
    if (!Array.isArray(document.cards) && (!Array.isArray(document.needsAttention) || !Array.isArray(document.nothingRaised))) {
      throw new Error("export: the cards are missing");
    }
    blocks.push({ kind: "heading", text: "Sentence review" });
    for (const card of cards) {
      // B602 F24: blank line between statements.
      blocks.push({ kind: "spacer", size: 1 });
      const compact = !(card?.attention === true || card?.tone === "red" || card?.tone === "amber");
      cardBlocks(blocks, card, compact);
    }
    // B604: sentences the backend kept as the writer's own view.
    for (const view of Array.isArray(document.views) ? document.views : []) {
      const text = typeof view?.text === "string" ? view.text.trim() : "";
      if (!text) continue;
      const line = typeof view?.line === "string" && view.line.trim()
        ? view.line.trim()
        : "A view, not checked against the sources.";
      scan(text);
      scan(line);
      blocks.push({ kind: "spacer", size: 1 });
      blocks.push({ kind: "cardHeading", text: "A view", tone: "grey", compact: true });
      blocks.push({ kind: "cardLabel", text: "Statement" });
      blocks.push({ kind: "quote", text });
      blocks.push({ kind: "body", text: line });
    }
    blocks.push({ kind: "spacer", size: 1 });
  }

  blocks.push(howToReadBlock(document));
  const properties = document.properties && typeof document.properties === "object" ? document.properties : {};
  for (const value of [properties.title, properties.subject, properties.author, properties.keywords, properties.creator, document.header]) {
    if (present(value)) scan(value);
  }
  return blocks;
}

export function exportLines(document, sections) {
  const lines = [];
  for (const block of exportBlocks(document, sections)) {
    if (block.kind === "summary") {
      for (const row of (Array.isArray(block.rows) ? block.rows : summaryRows(block.summary))) {
        lines.push(row);
      }
      continue;
    }
    if (block.kind === "draft") {
      for (const sentence of block.sentences) {
        lines.push(sentence.text);
        if (sentence.marker) lines.push(sentence.marker);
      }
      continue;
    }
    if (block.kind === "passage" || block.kind === "also") {
      if (block.kind === "also") {
        const badge = Number.isInteger(block.number) ? `[${block.number}] ` : "";
        lines.push(`${block.heading} ${badge}${block.inline || block.text}`);
      } else {
        lines.push(block.inline || block.text);
      }
      continue;
    }
    if (block.kind === "concern") {
      lines.push(block.label);
      lines.push(block.text);
      if (block.suggestion) lines.push(block.suggestion);
      continue;
    }
    if (block.kind === "titleSources") {
      lines.push(`Sources reviewed: ${block.names.join(", ")}`);
      continue;
    }
    if (block.kind === "source") {
      lines.push(block.name);
      if (block.description) lines.push(block.description);
      if (block.publication) lines.push(block.publication);
      if (block.fileType) lines.push(block.fileType);
      continue;
    }
    if (block.kind === "howToRead") {
      lines.push(block.title);
      for (const label of block.labels) lines.push(label);
      lines.push(block.lineNote);
      lines.push(block.disclaimer);
      continue;
    }
    if (block.kind === "cardLabel") {
      lines.push(block.text);
      continue;
    }
    if (block.text) lines.push(block.text);
  }
  return lines;
}

/**
 * How the PDF draft should flow: text and markers stay on one line until an
 * explicit "\n". Used by the renderer and by the paragraph tests.
 *
 * B596: when fullDraft is given, line and paragraph breaks are taken from the
 * characters between (and after) sentence spans in that text, so a "\n\n" that
 * lives between two spans still becomes a paragraph gap.
 */
export function draftFlow(sentences, fullDraft = "") {
  const runs = Array.isArray(sentences) ? sentences : [];
  const events = [];
  const draft = typeof fullDraft === "string" ? fullDraft : "";
  let cursor = 0;
  for (let i = 0; i < runs.length; i += 1) {
    const sentence = runs[i];
    const text = String(sentence?.text || "");
    const marker = String(sentence?.marker || "");
    // Trailing newlines on the span itself.
    const trailing = text.match(/\n+$/);
    const body = trailing ? text.slice(0, -trailing[0].length) : text;
    let breaks = trailing ? trailing[0].length : 0;

    if (draft) {
      const at = body ? draft.indexOf(body, cursor) : -1;
      const start = at >= 0 ? at : cursor;
      const end = at >= 0 ? at + body.length : cursor + body.length;
      const next = runs[i + 1];
      const nextText = String(next?.text || "");
      const nextBody = nextText.replace(/\n+$/, "");
      let between = "";
      if (nextBody) {
        const nextAt = draft.indexOf(nextBody, end);
        between = nextAt >= end ? draft.slice(end, nextAt) : draft.slice(end);
      } else {
        between = draft.slice(end);
      }
      const betweenBreaks = (between.match(/\n/g) || []).length;
      if (betweenBreaks > breaks) breaks = betweenBreaks;
      cursor = end + between.length;
    }

    const chunks = body.split(/(\n)/);
    for (const chunk of chunks) {
      if (chunk === "\n") {
        events.push({ kind: "break" });
        continue;
      }
      if (chunk) events.push({ kind: "text", text: chunk });
    }
    if (marker) events.push({ kind: "marker", text: marker });
    for (let b = 0; b < breaks; b += 1) events.push({ kind: "break" });
  }
  return events;
}

/** Rebuild plain draft text from flow events (markers omitted). */
export function draftFlowPlain(events) {
  let out = "";
  for (const event of Array.isArray(events) ? events : []) {
    if (event.kind === "break") out += "\n";
    else if (event.kind === "text") out += event.text;
  }
  return out;
}

export { cutLineEllipsis, lineRefLabel, passageWithLineRef, stripTrailingLineRef, nextLineContinuesSentence, isCompleteCutLine };
