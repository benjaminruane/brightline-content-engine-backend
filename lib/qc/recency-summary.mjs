/**
 * B498. Recency is one line per source for the draft, not a row on a card.
 * A saved concern may carry the date only inside its note. The name is never invented.
 */

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

export function recencySummary(cards) {
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
  return [...groups.values()];
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

function agePhrase(age) {
  const value = text(age);
  if (!value) return "";
  return /\bold$/i.test(value) ? value : `${value} old`;
}

export function sourceDateLine(row) {
  const count = Array.isArray(row?.statementIndices) ? row.statementIndices.length : 0;
  const name = shownSourceName(row?.name, row?.date);
  const age = agePhrase(row?.age);
  if (!name || !text(row?.date) || !age || count < 1) {
    console.warn("[recency] a source date line is missing a name, date, age, or count");
    return "";
  }
  if (count === 1) {
    return `1 sentence rests on ${name}, dated ${row.date} (${age}). Check it is still accurate.`;
  }
  return `${count} sentences rest on ${name}, dated ${row.date} (${age}). Check they are still accurate.`;
}

export function recencyLine(row) {
  const count = Array.isArray(row?.statementIndices) ? row.statementIndices.length : 0;
  const noun = count === 1 ? "1 sentence is" : `${count} sentences are`;
  return `${noun} written as current but rest on ${row.name}, dated ${row.date} (${row.age}). Check they are still accurate.`;
}
