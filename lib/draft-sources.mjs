// Generate and Rewrite read file sources the same way Review does.
// File bytes are extracted here and never placed in a prompt.

import { prepareUploadedSourcesForPipeline } from "./extract-text-from-source.mjs";
import { estimateTokensFromChars } from "./qc/token-estimate.mjs";

export const SOURCE_NOT_READ =
  "This source could not be read. Use a text-based PDF or a Word file.";
export const SOURCE_TOO_LONG =
  "This source is too long to draft from. Use a shorter document.";

// The provider rejects a prompt past 272000 tokens. Leave room for the instructions.
const SOURCE_TOKEN_CEILING = 200000;

const TOO_LONG_CODES = new Set(["file_too_large", "pdf_too_large"]);

function withoutFileBytes(source) {
  if (!source || typeof source !== "object") return source;
  const copy = { ...source };
  delete copy.contentBase64;
  return copy;
}

/**
 * Extract text from PDF and Office sources, then drop the file bytes.
 * A file that cannot be read, or that is still too long, is a loud refusal.
 * @param {Array<object>} sources
 * @returns {Promise<{ sources: Array<object>, error?: string }>}
 */
export async function sourcesForDraftPrompt(sources) {
  const list = Array.isArray(sources) ? sources : [];
  if (!list.length) return { sources: [] };
  const prep = await prepareUploadedSourcesForPipeline(list);
  if (prep.error) {
    const code = prep.error.code || "";
    return { sources: [], error: TOO_LONG_CODES.has(code) ? SOURCE_TOO_LONG : SOURCE_NOT_READ };
  }
  const ready = (prep.sources || []).map(withoutFileBytes);
  const hadFile = list.some((source) => typeof source?.contentBase64 === "string" && source.contentBase64.length > 0);
  const text = ready.map((source) => (typeof source?.text === "string" ? source.text : "")).join("\n");
  if (hadFile && !text.trim()) return { sources: [], error: SOURCE_NOT_READ };
  if (estimateTokensFromChars(text) > SOURCE_TOKEN_CEILING) return { sources: [], error: SOURCE_TOO_LONG };
  return { sources: ready };
}

/** A raw provider token-limit error becomes the same plain sentence. Otherwise "". */
export function draftErrorFromProvider(err) {
  const message = err?.message || String(err || "");
  if (/input tokens exceed|maximum context length|context_length_exceeded|context length/i.test(message)) {
    return SOURCE_TOO_LONG;
  }
  return "";
}
