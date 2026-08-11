/**
 * B45 — Deterministic AI-provenance URL scan (pre-Stage 1, no LLM).
 * Flags draft URLs whose tracking params carry known AI-tool markers.
 */

/** Extensible list of AI-tool markers (domains + bare tokens). Case-insensitive match. */
export const AI_PROVENANCE_MARKERS = Object.freeze([
  "chatgpt.com",
  "chat.openai.com",
  "openai.com",
  "claude.ai",
  "anthropic.com",
  "perplexity.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "chatgpt",
  "claude",
  "perplexity",
  "gemini",
  "copilot",
]);

const TRACKING_PARAM_NAMES = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "ref",
  "source",
]);

/** http(s) URLs; trim common trailing punctuation from the match. */
const URL_RE = /https?:\/\/[^\s<>"'\\)]+/gi;

function trimTrailingPunctuation(raw) {
  let url = raw;
  while (/[.,;:!?)\]]$/.test(url)) {
    url = url.slice(0, -1);
  }
  return url;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, " "));
  } catch {
    return String(value);
  }
}

/**
 * True when a query param value matches a known AI marker.
 * Domain markers (contain ".") may match as exact or as substring (e.g. www.chatgpt.com).
 * Bare tokens match exact only — avoids false positives like newsletter.
 */
export function valueMatchesAiMarker(rawValue, markers = AI_PROVENANCE_MARKERS) {
  const value = safeDecode(rawValue).trim().toLowerCase();
  if (!value) return false;
  const list = Array.isArray(markers) ? markers : AI_PROVENANCE_MARKERS;
  for (const marker of list) {
    const m = String(marker).toLowerCase();
    if (!m) continue;
    if (value === m) return true;
    if (m.includes(".") && value.includes(m)) return true;
  }
  return false;
}

/**
 * Scan draft text for URLs with AI-tool tracking parameters.
 * @param {string} draftText
 * @returns {Array<{ url: string, param: string, value: string, startChar: number, endChar: number }>}
 */
export function scanDraftForAiProvenance(draftText) {
  const text = typeof draftText === "string" ? draftText : "";
  if (!text) return [];

  const out = [];
  URL_RE.lastIndex = 0;
  let match;
  while ((match = URL_RE.exec(text)) !== null) {
    const raw = match[0];
    const url = trimTrailingPunctuation(raw);
    const startChar = match.index;
    const endChar = startChar + url.length;

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }

    for (const [param, value] of parsed.searchParams.entries()) {
      const paramKey = String(param).toLowerCase();
      if (!TRACKING_PARAM_NAMES.has(paramKey)) continue;
      if (!valueMatchesAiMarker(value)) continue;
      out.push({
        url,
        param: paramKey,
        value: String(value),
        startChar,
        endChar,
      });
    }
  }

  return out;
}
