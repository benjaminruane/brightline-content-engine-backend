/**
 * B569. A saved review keeps extracted text, not the file bytes.
 * Office and PDF sources that still have bytes are read once and stored.
 * A source that already has saved text is left as that text.
 */

import { prepareUploadedSourcesForPipeline } from "./extract-text-from-source.mjs";

const OFFICE_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function officeSource(source) {
  const mime = String(source?.mimeType || source?.type || "").toLowerCase();
  if (OFFICE_MIME.has(mime)) return true;
  return /\.(pdf|docx|pptx|xlsx)$/i.test(String(source?.name || ""));
}

function withoutBytes(source) {
  if (!source || typeof source !== "object") return source;
  const next = { ...source };
  delete next.contentBase64;
  return next;
}

async function storeOne(source) {
  if (!source || typeof source !== "object") return source;
  const text = typeof source.text === "string" ? source.text : "";
  if (source.savedExtraction === true && text.trim()) return withoutBytes(source);
  const bytes = typeof source.contentBase64 === "string" ? source.contentBase64 : "";
  if (!bytes || !officeSource(source)) return withoutBytes(source);
  let prepared;
  try {
    prepared = await prepareUploadedSourcesForPipeline([{ ...source, contentBase64: bytes }]);
  } catch (err) {
    console.error("[review-state] source text was not stored", source.name || "source", err?.message || err);
    return withoutBytes(source);
  }
  const row = Array.isArray(prepared?.sources) ? prepared.sources[0] : null;
  const extracted = typeof row?.text === "string" ? row.text : "";
  if (prepared?.error || !extracted.trim()) {
    console.error(
      "[review-state] source text was not stored",
      source.name || "source",
      prepared?.error?.code || "empty"
    );
    return withoutBytes(source);
  }
  const indexes = Array.isArray(row?.meta?.extraction?.furnitureLineIndexes)
    ? row.meta.extraction.furnitureLineIndexes
    : [];
  const next = withoutBytes(source);
  next.text = extracted;
  next.savedExtraction = true;
  next.furnitureLineIndexes = indexes;
  return next;
}

export async function sourcesWithStoredText(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const out = [];
  for (const source of list) out.push(await storeOne(source));
  return out;
}

export async function stateWithStoredSourceText(state) {
  if (!state || typeof state !== "object" || !Array.isArray(state.sources)) return state;
  return { ...state, sources: await sourcesWithStoredText(state.sources) };
}
