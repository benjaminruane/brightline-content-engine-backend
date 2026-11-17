/** One list. Every route and Clerk's authorized parties read it. */
export const DEFAULT_FRONTEND_ORIGIN = "https://brightline-content-engine-frontend.vercel.app";

const ALWAYS_HEADERS = ["Content-Type", "Authorization", "x-owner-key"];

export function allowedOrigins() {
  const raw = typeof process.env.FRONTEND_ORIGINS === "string" ? process.env.FRONTEND_ORIGINS : "";
  const list = raw.split(",").map((part) => part.trim()).filter(Boolean);
  return list.length > 0 ? list : [DEFAULT_FRONTEND_ORIGIN];
}

function requestOrigin(req) {
  const raw = req?.headers?.origin || req?.headers?.Origin || "";
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Sets CORS from the shared list. Returns true when the request was an
 * OPTIONS preflight and the response has already been ended.
 * An origin that is not on the list gets no Access-Control-Allow-Origin.
 */
export function applyCors(req, res, { methods = "GET,POST,OPTIONS", headers = [] } = {}) {
  const origin = requestOrigin(req);
  const allowed = origin.length > 0 && allowedOrigins().includes(origin);
  const extra = Array.isArray(headers) ? headers : String(headers).split(",");
  const allowHeaders = [...ALWAYS_HEADERS];
  for (const item of extra) {
    const name = String(item).trim();
    if (!name) continue;
    if (allowHeaders.some((have) => have.toLowerCase() === name.toLowerCase())) continue;
    allowHeaders.push(name);
  }
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", allowHeaders.join(", "));
  res.setHeader("Access-Control-Max-Age", "86400");
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (req?.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
