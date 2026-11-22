/**
 * B569. A source mentions the investment or fund when its text contains the
 * name, or that name with a trailing legal suffix removed.
 * An empty name skips the check.
 */

const LEGAL_SUFFIX = /\s+(?:Ltd|Limited|Inc|plc|AG|AS|SA|SE|GmbH|BV|NV|SpA|SCSp|SCS|LP|LLP|LLC|s\.r\.o\.|ApS|AB|Oy)\.?$/i;

export function subjectForms(name) {
  const raw = typeof name === "string" ? name.trim() : "";
  if (!raw) return [];
  const forms = [raw];
  let current = raw;
  let previous = "";
  while (current && current !== previous) {
    previous = current;
    current = current.replace(LEGAL_SUFFIX, "").trim();
  }
  if (current && current.toLowerCase() !== raw.toLowerCase()) forms.push(current);
  return forms;
}

export function textMentionsSubject(text, name) {
  const forms = subjectForms(name);
  if (!forms.length) return true;
  const hay = String(text || "").toLowerCase();
  return forms.some((form) => hay.includes(form.toLowerCase()));
}

function sourceText(source) {
  return typeof source?.text === "string" ? source.text : "";
}

/** Sources with readable text that do not mention the name. No name means none. Empty text is not listed here. */
export function sourcesMissingSubject(sources, name) {
  if (!subjectForms(name).length) return [];
  return (Array.isArray(sources) ? sources : []).filter((source) => {
    const text = sourceText(source);
    if (!text.trim()) return false;
    return !textMentionsSubject(text, name);
  });
}

function sourceLabel(source) {
  if (typeof source?.name === "string" && source.name.trim()) return source.name.trim();
  if (typeof source?.title === "string" && source.title.trim()) return source.title.trim();
  return "Untitled source";
}

/**
 * The sentence shown before a draft when a source does not mention the name
 * or could not be read. Callers: classifyExtractedSources, api/source-relevance.js.
 */
export function relevanceStepCopy({ name, missing, unread }) {
  const lines = [];
  const missingRows = Array.isArray(missing) ? missing : [];
  const unreadRows = Array.isArray(unread) ? unread : [];
  if (missingRows.length) {
    lines.push(`These sources do not mention ${name}: ${missingRows.map(sourceLabel).join(", ")}.`);
  }
  for (const source of unreadRows) {
    lines.push(`We could not read ${sourceLabel(source)} to check it.`);
  }
  if (!lines.length) return "";
  lines.push("Leave them out of this draft?");
  return lines.join(" ");
}

/**
 * Split already extracted sources. Empty text is unread, not a mention.
 * Callers: api/source-relevance.js.
 */
export function classifyExtractedSources(sources, name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!subjectForms(trimmed).length) {
    return { skipped: true, missing: [], unread: [], message: "" };
  }
  const missing = [];
  const unread = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    const row = { id: source?.id ?? null, name: sourceLabel(source) };
    const text = sourceText(source).trim();
    if (!text) unread.push(row);
    else if (!textMentionsSubject(text, trimmed)) missing.push(row);
  }
  return {
    skipped: false,
    missing,
    unread,
    message: relevanceStepCopy({ name: trimmed, missing, unread }),
  };
}

export function sourceUseLine(used, leftOut) {
  const names = (list) => {
    const rows = (Array.isArray(list) ? list : [])
      .map((source) => (typeof source?.name === "string" && source.name.trim() ? source.name.trim() : "Untitled source"));
    return rows.length ? rows.join(", ") : "none";
  };
  return `Sources used: ${names(used)}. Left out: ${names(leftOut)}.`;
}

export function methodologyWithSourceUse(note, used, leftOut) {
  const line = sourceUseLine(used, leftOut);
  const body = typeof note === "string" ? note.trim() : "";
  return body ? `${body}\n${line}` : line;
}
