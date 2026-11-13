/**
 * B498. An editorial concern that quotes a phrase a compliance concern
 * already quotes is not shown. The silence is the record.
 */

function concernText(concern) {
  return [concern?.note, concern?.text, concern?.explanation, concern?.quote, concern?.concernText]
    .filter((part) => typeof part === "string")
    .join(" ");
}

function quotedPhrases(text) {
  const found = [];
  const re = /['"]([^'"]+)['"]/g;
  let match;
  while ((match = re.exec(String(text || "")))) {
    const phrase = match[1].replace(/\s+/g, " ").trim().toLowerCase();
    if (phrase) found.push(phrase);
  }
  return found;
}

export function dropSharedPhrase(editorial, compliance) {
  const keptPhrases = new Set();
  for (const concern of Array.isArray(compliance) ? compliance : []) {
    for (const phrase of quotedPhrases(concernText(concern))) keptPhrases.add(phrase);
  }
  const kept = [];
  const silences = [];
  for (const concern of Array.isArray(editorial) ? editorial : []) {
    const hit = quotedPhrases(concernText(concern)).find((phrase) => keptPhrases.has(phrase));
    if (hit) {
      silences.push({
        id: "same_phrase",
        reason: "the same phrase is already on the compliance note",
        count: 1,
        content: [hit],
      });
      continue;
    }
    kept.push(concern);
  }
  return { editorial: kept, silences };
}
