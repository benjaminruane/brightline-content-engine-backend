function isNonEmptyPassage(match) {
  return typeof match?.passage === "string" && match.passage.trim().length > 0;
}

function firstWithPassage(matches) {
  if (!Array.isArray(matches)) return null;
  for (const match of matches) {
    if (isNonEmptyPassage(match)) return match;
  }
  return null;
}

function trimPassageTo300(passage) {
  const text = typeof passage === "string" ? passage : "";
  if (text.length <= 300) return text;

  const candidate = text.slice(0, 300);
  let cut = -1;
  for (const marker of [".", "!", "?"]) {
    const idx = candidate.lastIndexOf(marker);
    if (idx > cut) cut = idx;
  }

  if (cut >= 0) {
    return `${candidate.slice(0, cut + 1)}…`;
  }
  return `${candidate}…`;
}

function toExcerpt(match) {
  if (!match || !isNonEmptyPassage(match)) return null;
  const sourceLabel =
    (typeof match.sourceLabel === "string" && match.sourceLabel.trim()) || "";
  if (!sourceLabel) return null;
  return {
    sourceLabel,
    passage: trimPassageTo300(match.passage),
  };
}

export function selectExcerpts(verdictResult) {
  try {
    if (!verdictResult || typeof verdictResult !== "object") {
      return { primaryExcerpt: null, conflictExcerpt: null };
    }

    const confirmingMatches = Array.isArray(verdictResult.confirmingMatches)
      ? verdictResult.confirmingMatches
      : [];
    const partialMatches = Array.isArray(verdictResult.partialMatches)
      ? verdictResult.partialMatches
      : [];
    const conflictingMatches = Array.isArray(verdictResult.conflictingMatches)
      ? verdictResult.conflictingMatches
      : [];

    let primaryMatch = firstWithPassage(confirmingMatches);
    if (!primaryMatch) primaryMatch = firstWithPassage(partialMatches);
    if (!primaryMatch) primaryMatch = firstWithPassage(conflictingMatches);
    const primaryExcerpt = toExcerpt(primaryMatch);

    let conflictExcerpt = null;
    if (verdictResult.hasConflict === true && conflictingMatches.length > 0) {
      const conflictMatch = firstWithPassage(conflictingMatches);
      const candidate = toExcerpt(conflictMatch);
      if (candidate) {
        const isIdenticalToPrimary =
          primaryExcerpt &&
          primaryExcerpt.sourceLabel === candidate.sourceLabel &&
          primaryExcerpt.passage === candidate.passage;
        conflictExcerpt = isIdenticalToPrimary ? null : candidate;
      }
    }

    return {
      primaryExcerpt,
      conflictExcerpt,
    };
  } catch {
    return { primaryExcerpt: null, conflictExcerpt: null };
  }
}
