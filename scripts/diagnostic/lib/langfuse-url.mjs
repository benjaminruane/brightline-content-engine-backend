/**
 * @param {string|undefined} traceId
 */
export function langfuseTraceUrl(traceId) {
  if (!traceId || typeof traceId !== "string") return null;
  const host = typeof process.env.LANGFUSE_HOST === "string" ? process.env.LANGFUSE_HOST.trim() : "";
  if (!host) return null;
  const base = host.replace(/\/$/, "");
  return `${base}/trace/${traceId}`;
}
