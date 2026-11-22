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

/** Sources with readable text that do not mention the name. No name means none. */
export function sourcesMissingSubject(sources, name) {
  if (!subjectForms(name).length) return [];
  return (Array.isArray(sources) ? sources : []).filter((source) => {
    const text = sourceText(source);
    if (!text.trim()) return false;
    return !textMentionsSubject(text, name);
  });
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
