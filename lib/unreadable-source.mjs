import { reportRouteFailure } from "./problem-events.mjs";

export const NONE_READABLE = "None of your sources could be read.";

export function fileKindLabel(name) {
  const base = String(name || "");
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "file";
  const kind = base.slice(dot + 1).trim();
  if (!kind || kind.length > 8) return "file";
  return kind.toUpperCase();
}

export function unreadableFileMessage(name) {
  return `We could not read any text from this file. It may be a scanned image or not a real ${fileKindLabel(name)}.`;
}

export function sourceHasReadableText(source) {
  return typeof source?.text === "string" && source.text.trim().length > 0;
}

export function everySourceUnreadable(sources) {
  const rows = Array.isArray(sources) ? sources : [];
  return rows.length > 0 && rows.every((source) => !sourceHasReadableText(source));
}

/** Records the problem and returns the response body when every source is empty. */
export async function refuseIfUnreadable({ sources, account, req, sql, route, startedAt } = {}) {
  if (!everySourceUnreadable(sources)) return null;
  await reportRouteFailure({
    account,
    route: route || "analyse-statements",
    req,
    sql,
    status: 200,
    error: NONE_READABLE,
    startedAt,
  });
  return { ok: false, error: NONE_READABLE };
}
