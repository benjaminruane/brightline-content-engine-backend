/**
 * Bind a document-level finding to the sentence its quote lives in (B275).
 * Never use a model-supplied index. A miss is unplaced, not a guessed card.
 */

function collapseWhitespace(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function normalizeForLocate(text) {
  return collapseWhitespace(String(text ?? "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'));
}

function sentenceList(sentences) {
  return Array.isArray(sentences) ? sentences : [];
}

function quoteTooShort(quote) {
  return normalizeForLocate(quote).length < 4;
}

/**
 * @param {string} quote
 * @param {Array<{ index: number, text: string, charStart?: number, charEnd?: number }>} sentences
 * @param {string} [draftText]
 * @returns {{ index: number } | { reason: string }}
 */
export function locateQuoteInSentences(quote, sentences, draftText) {
  const needle = normalizeForLocate(quote);
  if (!needle || needle.length < 4) {
    return { reason: "quote_too_short" };
  }
  const rows = sentenceList(sentences);
  const hits = [];
  for (const row of rows) {
    const hay = normalizeForLocate(row?.text);
    if (!hay) continue;
    if (hay.includes(needle) || needle.includes(hay)) {
      hits.push(row);
    }
  }
  if (hits.length === 1) {
    return { index: Number(hits[0].index) };
  }
  if (hits.length > 1) {
    return { reason: "quote_ambiguous" };
  }

  const lowerNeedle = needle.toLowerCase();
  const caseHits = [];
  for (const row of rows) {
    const hay = normalizeForLocate(row?.text).toLowerCase();
    if (!hay) continue;
    if (hay.includes(lowerNeedle) || lowerNeedle.includes(hay)) {
      caseHits.push(row);
    }
  }
  if (caseHits.length === 1) {
    return { index: Number(caseHits[0].index) };
  }
  if (caseHits.length > 1) {
    return { reason: "quote_ambiguous" };
  }

  const draft = normalizeForLocate(draftText);
  if (draft && draft.includes(needle)) {
    const rawDraft = String(draftText ?? "");
    const rawNeedle = collapseWhitespace(quote);
    const at = rawDraft.indexOf(String(quote ?? ""));
    const fromCollapsed = rawDraft.replace(/\s+/g, " ").indexOf(needle);
    let start = at;
    if (start < 0 && rawNeedle) {
      start = rawDraft.indexOf(rawNeedle);
    }
    if (start < 0 && fromCollapsed >= 0) {
      start = fromCollapsed;
    }
    if (start >= 0) {
      const end = start + String(quote ?? needle).length;
      const overlapping = rows.filter((row) => {
        const cs = Number(row?.charStart);
        const ce = Number(row?.charEnd);
        if (!Number.isFinite(cs) || !Number.isFinite(ce)) return false;
        return cs < end && ce > start;
      });
      if (overlapping.length === 1) {
        return { index: Number(overlapping[0].index) };
      }
      if (overlapping.length > 1) {
        return { reason: "quote_ambiguous" };
      }
    }
  }

  return { reason: "quote_not_found" };
}

function toConcern(finding, index) {
  const ruleId = typeof finding?.ruleId === "string" ? finding.ruleId.trim() : "";
  const note = typeof finding?.note === "string" ? finding.note.trim() : "";
  const suggestedDirection =
    typeof finding?.suggestedDirection === "string" ? finding.suggestedDirection.trim() : "";
  const quote = typeof finding?.quote === "string" ? finding.quote : "";
  const concern = {
    concernCode: ruleId,
    note,
    category: "editorial",
    suggestedDirection,
    quote,
    source: "document_level",
    documentLevel: true,
  };
  if (finding?.concernText != null && String(finding.concernText).trim()) {
    concern.concernText = String(finding.concernText).trim();
  }
  return { index, finding, concern };
}

/**
 * @param {{
 *   findings: object[],
 *   sentences: object[],
 *   draftText?: string
 * }} args
 */
export function attachDocumentFindings({ findings, sentences, draftText } = {}) {
  const attached = [];
  const unplaced = [];
  const list = Array.isArray(findings) ? findings : [];
  for (const finding of list) {
    const quote = typeof finding?.quote === "string" ? finding.quote : "";
    const ruleId = typeof finding?.ruleId === "string" ? finding.ruleId.trim() : "";
    const note = typeof finding?.note === "string" ? finding.note.trim() : "";
    const suggestedDirection =
      typeof finding?.suggestedDirection === "string" ? finding.suggestedDirection.trim() : "";
    if (quoteTooShort(quote)) {
      unplaced.push({
        ruleId,
        quote,
        note,
        reason: quote ? "quote_too_short" : "missing_quote",
      });
      continue;
    }
    if (!note || !suggestedDirection) {
      unplaced.push({
        ruleId,
        quote,
        note,
        reason: "missing_fields",
      });
      continue;
    }
    const located = locateQuoteInSentences(quote, sentences, draftText);
    if (Number.isFinite(located?.index)) {
      attached.push(toConcern(finding, located.index));
      continue;
    }
    unplaced.push({
      ruleId,
      quote,
      note: typeof finding?.note === "string" ? finding.note : "",
      reason: located?.reason || "quote_not_found",
    });
    console.warn(
      `[DOCUMENT_LEVEL] unplaced ruleId=${ruleId || "(unknown)"} reason=${located?.reason || "quote_not_found"}`
    );
  }
  return { attached, unplaced };
}
