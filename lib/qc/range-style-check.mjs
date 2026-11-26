/**
 * B601. Numeric ranges as "12-15" with the unit once.
 * Skip change/movement "from X to Y" and worded date ranges.
 * House-style notes only. No model call.
 */

const CHANGE_VERBS =
  /\b(?:rose|fell|increased|decreased|grew|declined|moved|went|climbed|dropped|improved|widened|narrowed|shifted|jumped|slid)\b/i;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function maskQuotes(text) {
  return String(text || "")
    .replace(/"[^"]*"/g, (m) => " ".repeat(m.length))
    .replace(/'[^']*'/g, (m) => " ".repeat(m.length));
}

/** True when "X to Y" describes a movement, not a static range. */
export function isMovementRange(sentence, matchIndex) {
  const before = sentence.slice(Math.max(0, matchIndex - 80), matchIndex);
  if (CHANGE_VERBS.test(before)) return true;
  if (/\bfrom\s+[\d$€££EURUSDGBP]/i.test(before + sentence.slice(matchIndex, matchIndex + 20))) {
    // "from 11.2x to 11.9x"
    if (/\bfrom\b/i.test(before.slice(-30))) return true;
  }
  return false;
}

/** Worded month/season ranges stay as written. */
export function isWordedDateRange(left, right) {
  const months = /^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/i;
  return months.test(clean(left)) || months.test(clean(right));
}

/**
 * Find "X to Y" numeric ranges that should be "X-Y".
 * @returns {Array<{ surface: string, proposal: string, message: string }>}
 */
export function findRangeStyleNotes(statement) {
  const text = maskQuotes(statement);
  const out = [];
  // Currency amounts: EUR 150 million to EUR 500 million → EUR 150-500 million
  const currency = /\b((?:EUR|USD|GBP|SGD|AUD|CAD|\$|€|£)\s*)(\d[\d,]*(?:\.\d+)?)\s*(million|billion|m|bn)?\s+to\s+(?:(?:EUR|USD|GBP|SGD|AUD|CAD|\$|€|£)\s*)?(\d[\d,]*(?:\.\d+)?)\s*(million|billion|m|bn)?\b/gi;
  let m;
  while ((m = currency.exec(text))) {
    if (isMovementRange(text, m.index)) continue;
    const unit = m[5] || m[3] || "";
    const proposal = `${m[1]}${m[2]}-${m[4]}${unit ? ` ${unit}` : ""}`.replace(/\s+/g, " ").trim();
    out.push({
      surface: m[0],
      proposal,
      message: `Write numeric ranges with a hyphen and state the unit once: ${proposal}.`,
      id: `range_${m.index}`,
    });
  }
  // Plain numbers / counts: 12 to 15 companies → 12-15 companies
  const counts = /\b(\d[\d,]*(?:\.\d+)?)\s+to\s+(\d[\d,]*(?:\.\d+)?)(\s+[a-z][a-z-]*)?\b/gi;
  while ((m = counts.exec(text))) {
    if (isMovementRange(text, m.index)) continue;
    if (isWordedDateRange(m[1], m[2])) continue;
    // Skip if already captured as currency (overlap).
    if (out.some((row) => row.surface.includes(m[0]) || m[0].includes(row.surface.slice(0, 12)))) continue;
    const unit = clean(m[3] || "");
    // Skip year-looking pairs already hyphenated elsewhere; allow 2016 to 2019 → 2016-2019
    const proposal = unit ? `${m[1]}-${m[2]} ${unit}` : `${m[1]}-${m[2]}`;
    out.push({
      surface: m[0],
      proposal,
      message: `Write numeric ranges with a hyphen and state the unit once: ${proposal}.`,
      id: `range_${m.index}`,
    });
  }
  // from X to Y (static) — only when not a movement
  const fromTo = /\bfrom\s+(\d[\d,]*(?:\.\d+)?(?:x)?)\s+to\s+(\d[\d,]*(?:\.\d+)?(?:x)?)\b/gi;
  while ((m = fromTo.exec(text))) {
    if (isMovementRange(text, m.index)) continue;
    // Still a movement idiom when "from … to" even without verb? Spec: skip any from-to describing movement.
    // Treat bare "from X to Y" with x multiples as movement-like and skip.
    if (/x$/i.test(m[1]) || /x$/i.test(m[2])) continue;
    const proposal = `${m[1]}-${m[2]}`;
    out.push({
      surface: m[0],
      proposal,
      message: `Write numeric ranges with a hyphen and state the unit once: ${proposal}.`,
      id: `range_from_${m.index}`,
    });
  }
  return out;
}

export function applyRangeStyleNotesToCard(card, { enabled = true } = {}) {
  if (!enabled) return card;
  const statement = clean(card?.statement || card?.text || "");
  const found = findRangeStyleNotes(statement);
  if (!found.length) return card;
  const existing = Array.isArray(card.houseStyleConcerns) ? card.houseStyleConcerns : [];
  const ids = new Set(existing.map((row) => row?.id || row?.message));
  const added = [];
  for (const note of found) {
    if (ids.has(note.id) || ids.has(note.message)) continue;
    added.push({
      id: note.id,
      ruleId: "numeric_range",
      kind: "house_range",
      message: note.message,
      surface: note.surface,
      preferred: note.proposal,
      proposedChange: note.proposal,
      severity: "note",
    });
  }
  if (!added.length) return card;
  return {
    ...card,
    houseStyleConcerns: [...existing, ...added],
  };
}
