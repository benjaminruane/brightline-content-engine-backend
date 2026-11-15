/**
 * B506. A source is Facts or Context. Missing means Facts.
 * The pipeline does not read the field. Callers that build a prompt omit it.
 */

export function sourceRole(raw) {
  if (raw == null || raw === "" || raw === "facts") return "facts";
  if (raw === "context") return "context";
  throw new Error("source role is missing");
}

export function annotateSourceRoles(sources) {
  const list = Array.isArray(sources) ? sources : [];
  return list.map((source) => {
    if (!source || typeof source !== "object") return source;
    return { ...source, role: sourceRole(source.role) };
  });
}

/** Prompt text stays the source text. The role is not written into it. */
export function sourcesForPrompt(sources) {
  const list = Array.isArray(sources) ? sources : [];
  return list.map((source) => {
    if (!source || typeof source !== "object" || !Object.prototype.hasOwnProperty.call(source, "role")) {
      return source;
    }
    const copy = { ...source };
    delete copy.role;
    return copy;
  });
}
