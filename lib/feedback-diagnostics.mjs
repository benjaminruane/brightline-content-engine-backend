/**
 * B573. Diagnostics stored with feedback. Secrets are removed. Over 2 MB,
 * excerpts go first and the object says so.
 */
export const DIAGNOSTICS_MAX_BYTES = 2 * 1024 * 1024;

const SECRET_KEY = /token|cookie|authorization|api[_-]?key|secret|password|bearer/i;
const EXCERPT_KEY = /^(excerpt|extract|quote|passage)$/i;

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

export function redactSecretText(value) {
  return String(value)
    .replace(/bearer\s+\S+/gi, "bearer [redacted]")
    .replace(/\bsk-[a-z0-9_-]+\b/gi, "[redacted]")
    .replace(/\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, "[redacted]")
    .replace(/(?:api[_-]?key|token|cookie|secret|password)\s*[:=]\s*\S+/gi, "[redacted]");
}

export function scrubSecrets(value) {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = scrubSecrets(item);
    }
    return out;
  }
  if (typeof value === "string") return redactSecretText(value);
  return value;
}

function dropExcerpts(value) {
  if (Array.isArray(value)) return value.map(dropExcerpts);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (EXCERPT_KEY.test(key)) continue;
      out[key] = dropExcerpts(item);
    }
    return out;
  }
  return value;
}

/** A copy, capped. Excerpts are the first thing removed. */
export function prepareDiagnostics(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  let current = scrubSecrets(input);
  if (byteLength(JSON.stringify(current)) <= DIAGNOSTICS_MAX_BYTES) return current;
  current = dropExcerpts(current);
  current.excerptsDropped = true;
  if (byteLength(JSON.stringify(current)) <= DIAGNOSTICS_MAX_BYTES) return current;
  if (current.review) current.review = [];
  if (Array.isArray(current.events)) current.events = [];
  current.truncated = true;
  if (byteLength(JSON.stringify(current)) <= DIAGNOSTICS_MAX_BYTES) return current;
  return {
    excerptsDropped: true,
    truncated: true,
    note: "Diagnostics were too large to store.",
  };
}
