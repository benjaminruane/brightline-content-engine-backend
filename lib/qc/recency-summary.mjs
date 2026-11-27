/**
 * B498. Recency is one line per source for the draft, not a row on a card.
 * A saved concern may carry the date only inside its note. The name is never invented.
 * B617: dated memo headers also become document-level rows even when no sentence fires.
 */
import {
  SOURCE_RECENCY_THRESHOLD_MONTHS,
  extractSourceAsOfDate,
  formatAgeFromDates,
  monthsBetween,
} from "./source-recency.mjs";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fieldsOf(concern, card) {
  const body = text(concern?.text) || text(concern?.note) || text(concern?.concernText);
  const parsed = body.match(/\bdated\s+(.+?)\s+\((.+?)\s+old\)/i);
  const name = text(concern?.sourceName);
  const date = text(concern?.date) || (parsed ? parsed[1].trim() : "");
  const age = text(concern?.age) || (parsed ? parsed[2].trim() : "");
  const index = Number.isInteger(concern?.statementIndex)
    ? concern.statementIndex
    : (Number.isInteger(card?.index) ? card.index : null);
  return { name, date, age, index, body };
}

function sourceNameOf(source) {
  return text(
    source?.title
    || source?.name
    || source?.label
    || source?.fileName
    || source?.filename
    || source?.displayName,
  );
}

/**
 * B617. One row per source whose memo header carries a confident as-of date
 * older than the recency threshold. statementIndices may be empty.
 */
export function sourceDateRowsFromSources(sources, { today = new Date(), thresholdMonths = SOURCE_RECENCY_THRESHOLD_MONTHS } = {}) {
  const end = today instanceof Date && !Number.isNaN(today.getTime()) ? today : new Date();
  const rows = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const body = typeof source?.text === "string"
      ? source.text
      : typeof source?.content === "string"
        ? source.content
        : "";
    const asOf = extractSourceAsOfDate(body);
    if (!asOf?.date) continue;
    const ageMonths = monthsBetween(asOf.date, end);
    if (!(ageMonths > thresholdMonths)) continue;
    const name = sourceNameOf(source);
    const date = text(asOf.raw);
    const age = formatAgeFromDates(asOf.date, end);
    if (!name || !date || !age) {
      console.warn("[recency] a dated source is missing a name, date, or age");
      continue;
    }
    rows.push({ name, date, age, statementIndices: [] });
  }
  return rows;
}

function mergeRecencyRows(existing, incoming) {
  const groups = new Map();
  for (const row of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const name = text(row?.name);
    const date = text(row?.date);
    const age = text(row?.age);
    if (!name || !date || !age) continue;
    const key = `${name}|${date}|${age}`;
    if (!groups.has(key)) {
      groups.set(key, {
        name,
        date,
        age,
        statementIndices: Array.isArray(row.statementIndices) ? [...row.statementIndices] : [],
      });
      continue;
    }
    const dest = groups.get(key);
    for (const index of Array.isArray(row.statementIndices) ? row.statementIndices : []) {
      if (Number.isInteger(index) && !dest.statementIndices.includes(index)) {
        dest.statementIndices.push(index);
      }
    }
  }
  return [...groups.values()];
}

export function recencySummary(cards, sources, { today = new Date() } = {}) {
  const groups = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    const concerns = Array.isArray(card?.sourceRecencyConcerns) ? card.sourceRecencyConcerns : [];
    for (const concern of concerns) {
      const fields = fieldsOf(concern, card);
      if (!fields.name || !fields.date || !fields.age || !Number.isInteger(fields.index)) {
        if (fields.body || fields.name) {
          console.warn("[recency] a concern is missing a source name, date, age, or statement");
        }
        continue;
      }
      const key = `${fields.name}|${fields.date}|${fields.age}`;
      if (!groups.has(key)) groups.set(key, { name: fields.name, date: fields.date, age: fields.age, statementIndices: [] });
      const row = groups.get(key);
      if (!row.statementIndices.includes(fields.index)) row.statementIndices.push(fields.index);
    }
  }
  const fromCards = [...groups.values()];
  const fromSources = sourceDateRowsFromSources(sources, { today });
  return mergeRecencyRows(fromCards, fromSources);
}

function shownSourceName(name, date) {
  const label = text(name);
  const when = text(date);
  if (!label || !when) return label;
  const escaped = when.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = label.replace(new RegExp(`,\\s*${escaped}\\s*$`, "i"), "").trim();
  if (!stripped) {
    console.warn("[recency] the source name is only its date");
    return label;
  }
  return stripped;
}

function yearsAgoPhrase(age) {
  const value = text(age);
  if (!value) return "";
  if (/\bago$/i.test(value)) return value;
  if (/\bold$/i.test(value)) return value.replace(/\s*old$/i, " ago");
  return `${value} ago`;
}

/** B612. Document-level summary row: one line per old source, no sentence count. */
export function sourceDateLine(row) {
  const name = shownSourceName(row?.name, row?.date);
  const age = yearsAgoPhrase(row?.age);
  if (!name || !text(row?.date) || !age) {
    console.warn("[recency] a source date line is missing a name, date, or age");
    return "";
  }
  return `${name} is dated ${row.date} (${age}). Check that anything described as current is still accurate.`;
}

export function recencyLine(row) {
  const count = Array.isArray(row?.statementIndices) ? row.statementIndices.length : 0;
  const noun = count === 1 ? "1 sentence is" : `${count} sentences are`;
  return `${noun} written as current but rest on ${row.name}, dated ${row.date} (${row.age}). Check they are still accurate.`;
}
