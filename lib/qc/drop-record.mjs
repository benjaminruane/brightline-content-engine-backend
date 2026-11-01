/**
 * B463. One record for everything a card build drops, suppresses, merges, or rewrites.
 * The reader does not see it. A later read of a stored card does.
 *
 * { rule, reason, content }
 * content is the dropped words, in the source's or the model's own words.
 */

export function dropRecord(rule, reason, content) {
  const name = typeof rule === "string" ? rule.trim() : "";
  if (!name) {
    console.warn("[drop-record] rule is missing");
    return null;
  }
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) console.warn(`[drop-record] reason is missing for ${name}`);
  const words = content == null ? "" : typeof content === "string" ? content.trim() : String(content).trim();
  if (!words) console.warn(`[drop-record] content is missing for ${name}`);
  return { rule: name, reason: why, content: words };
}

export function concernContent(row) {
  if (typeof row === "string") return row.trim();
  if (!row || typeof row !== "object") return "";
  const text = [row.concernText, row.note, row.text, row.suggestedDirection]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ");
  return text.trim();
}

export function removedByIdentity(before, after) {
  const kept = new Set(Array.isArray(after) ? after : []);
  return (Array.isArray(before) ? before : []).filter((row) => !kept.has(row));
}

export function silenceWithContent(id, reason, items, textOf = concernContent) {
  const list = Array.isArray(items) ? items : [];
  const content = list.map((row) => textOf(row)).filter(Boolean);
  return { id, reason, count: list.length, content };
}

export function pushDrop(card, record) {
  if (!card || typeof card !== "object" || !record) return card;
  const drops = Array.isArray(card.drops) ? card.drops : [];
  card.drops = [...drops, record];
  return card;
}

export function dropsFromSilences(silences) {
  const out = [];
  for (const row of Array.isArray(silences) ? silences : []) {
    const items = Array.isArray(row?.content) ? row.content : [];
    for (const text of items) {
      const record = dropRecord(row.id, row.reason, text);
      if (record) out.push(record);
    }
  }
  return out;
}

export function dropsFromRewrites(rewrites) {
  const out = [];
  for (const row of Array.isArray(rewrites) ? rewrites : []) {
    const reason = `${row?.from || ""} to ${row?.to || ""}`.trim();
    const record = dropRecord(row?.rule, reason, row?.evidence || "");
    if (record) out.push(record);
  }
  return out;
}

export function rejectionContent(row) {
  if (typeof row === "string") return row.trim();
  if (!row || typeof row !== "object") return "";
  const surface = typeof row.surface === "string" ? row.surface.trim() : "";
  const why = typeof row.reason === "string" ? row.reason.trim() : "";
  if (surface && why) return `${surface} (${why})`;
  return surface || why;
}
