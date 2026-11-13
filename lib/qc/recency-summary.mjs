/**
 * B498. Recency is one line per source for the draft, not a row on a card.
 */

export function recencySummary(cards) {
  const groups = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    const concerns = Array.isArray(card?.sourceRecencyConcerns) ? card.sourceRecencyConcerns : [];
    for (const concern of concerns) {
      const name = typeof concern?.sourceName === "string" ? concern.sourceName.trim() : "";
      const date = typeof concern?.date === "string" ? concern.date.trim() : "";
      const age = typeof concern?.age === "string" ? concern.age.trim() : "";
      if (!name || !date || !age) continue;
      const index = Number.isInteger(concern.statementIndex)
        ? concern.statementIndex
        : (Number.isInteger(card.index) ? card.index : null);
      const key = `${name}|${date}|${age}`;
      if (!groups.has(key)) groups.set(key, { name, date, age, statementIndices: [] });
      const row = groups.get(key);
      if (Number.isInteger(index) && !row.statementIndices.includes(index)) row.statementIndices.push(index);
    }
  }
  return [...groups.values()];
}

export function recencyLine(row) {
  const count = Array.isArray(row?.statementIndices) ? row.statementIndices.length : 0;
  const noun = count === 1 ? "1 sentence is" : `${count} sentences are`;
  return `${noun} written as current but rest on ${row.name}, dated ${row.date} (${row.age}). Check they are still accurate.`;
}
