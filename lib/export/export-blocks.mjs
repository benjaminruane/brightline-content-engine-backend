/**
 * The words both export renderers paint, in order.
 * The renderers do not choose verdicts, reasons, counts, or excerpts.
 */

const FORBIDDEN = [
  /evidence concern/i,
  /note_withheld/,
  /primaryExcerpt/,
  /Nothing raised \(high/i,
  /Editorial note: No editorial/i,
];

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

function titleLines(title) {
  const sourceNames = Array.isArray(title.sourceNames)
    ? title.sourceNames.map((name) => present(name)).filter(Boolean)
    : [];
  const lines = [];
  const name = present(title.name);
  if (name) lines.push({ kind: "title", text: name });
  const detail = present(title.detail);
  if (detail) lines.push({ kind: "titleLine", text: detail });
  const writingFor = present(title.writingFor);
  if (writingFor) lines.push({ kind: "titleLine", text: writingFor });
  const reviewed = present(title.reviewed);
  if (reviewed) lines.push({ kind: "titleLine", text: reviewed });
  if (sourceNames.length) lines.push({ kind: "titleSources", names: sourceNames });
  const exported = present(title.exported);
  if (exported) lines.push({ kind: "titleLine", text: exported });
  return lines;
}

function scan(text) {
  const body = String(text || "");
  for (const pattern of FORBIDDEN) {
    if (pattern.test(body)) throw new Error(`export: an internal phrase is in the document (${pattern})`);
  }
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
  blocks.push({ kind: "quote", text: card.sentence });
  blocks.push({ kind: "body", text: card.reason });
  const passages = Array.isArray(card.passages) ? card.passages : [];
  for (const passage of passages) {
    const text = must(passage?.text, "export: a source passage is missing");
    if (text.includes("|") || text.includes("·")) {
      throw new Error("export: a source passage still has a pipe or a printed bullet");
    }
    scan(text);
    blocks.push({ kind: "passage", text, lines: String(passage.lines || "").trim() });
  }
  if (card.also && card.also.text) {
    const heading = must(card.also.heading, "export: an extra passage heading is missing");
    scan(heading);
    scan(card.also.text);
    blocks.push({
      kind: "also",
      heading,
      text: String(card.also.text).trim(),
      lines: String(card.also.lines || "").trim(),
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

  if (include.reviewSummary) {
    const summary = document.summary;
    if (!summary || typeof summary !== "object") throw new Error("export: the review summary is missing");
    blocks.push({ kind: "heading", text: "Review summary" });
    blocks.push({ kind: "summary", summary });
    scan(must(summary.readiness, "export: the assessment label is missing"));
    for (const line of summary.counts || []) scan(line);
    if (summary.facts) scan(summary.facts);
    if (summary.houseStyle) scan(summary.houseStyle);
    if (summary.editorial) scan(summary.editorial);
  }

  if (include.draft) {
    const sentences = Array.isArray(document.draft) ? document.draft : null;
    if (!sentences) throw new Error("export: the draft is missing");
    blocks.push({ kind: "heading", text: "Draft" });
    if (!sentences.length) throw new Error("export: the draft has no sentences");
    blocks.push({ kind: "draft", sentences });
  }

  if (include.cards) {
    const needs = Array.isArray(document.needsAttention) ? document.needsAttention : null;
    const quiet = Array.isArray(document.nothingRaised) ? document.nothingRaised : null;
    if (!needs || !quiet) throw new Error("export: the cards are missing");
    if (needs.length) {
      blocks.push({ kind: "heading", text: "Needs attention" });
      for (const card of needs) cardBlocks(blocks, card, false);
    }
    if (!include.attentionOnly && quiet.length) {
      blocks.push({ kind: "heading", text: "Nothing raised" });
      for (const card of quiet) cardBlocks(blocks, card, true);
    }
  }

  if (include.note) {
    const note = typeof document.reviewerNote === "string" ? document.reviewerNote.trim() : "";
    if (!note) throw new Error("export: the reviewer's note is missing");
    scan(note);
    blocks.push({ kind: "heading", text: "Reviewer's note" });
    blocks.push({ kind: "body", text: note });
  }

  if (include.sources) {
    const sources = Array.isArray(document.sources) ? document.sources : [];
    const named = sources.filter((source) => present(source?.name));
    if (named.length) {
      blocks.push({ kind: "heading", text: "Sources" });
      for (const source of named) {
        blocks.push({
          kind: "source",
          name: present(source.name),
          publication: present(source.publication),
          fileType: present(source.fileType),
          description: present(source.description),
        });
      }
    }
  }

  const disclaimer = typeof document.disclaimer === "string" ? document.disclaimer.trim() : "";
  if (!disclaimer) throw new Error("export: the disclaimer is missing");
  blocks.push({ kind: "disclaimer", text: disclaimer });
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
      lines.push(block.summary.readiness);
      if (block.summary.facts) lines.push(block.summary.facts);
      for (const count of block.summary.counts || []) lines.push(count);
      if (block.summary.houseStyle) lines.push(block.summary.houseStyle);
      if (block.summary.editorial) lines.push(block.summary.editorial);
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
      lines.push(block.kind === "also" ? `${block.heading} ${block.text}` : block.text);
      if (block.lines) lines.push(block.lines);
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
      lines.push(block.publication);
      lines.push(block.fileType);
      if (block.description) lines.push(block.description);
      continue;
    }
    if (block.text) lines.push(block.text);
  }
  return lines;
}
