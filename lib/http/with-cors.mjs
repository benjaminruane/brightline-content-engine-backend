import { applyCors } from "./frontend-origins.mjs";
import { reportRouteFailure } from "../problem-events.mjs";

const FORCE_STATUS = "x-brightline-force-status";

function headerValue(req, name) {
  const headers = req?.headers || {};
  const raw = headers[name] ?? headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

function failureMessage(body, statusCode) {
  if (typeof body?.error === "string" && body.error.trim()) return body.error.trim();
  if (typeof body?.message === "string" && body.message.trim()) return body.message.trim();
  return `status ${statusCode}`;
}

/**
 * Stamps CORS before the handler runs, again if the handler throws, and
 * records a non-auth failure for the routes that report problems.
 * A test may force 404 or 500 with x-brightline-force-status while VITEST is set.
 */
export function withCors(handler, options = {}) {
  const cors = {
    methods: options.methods,
    headers: options.headers,
    answer: false,
  };
  return async function corsWrapped(req, res) {
    applyCors(req, res, cors);
    if (process.env.VITEST) {
      const force = headerValue(req, FORCE_STATUS);
      if (force === "404" || force === "500") {
        return res.status(Number(force)).json({
          error: force === "404" ? "not_found" : "forced_error",
        });
      }
    }
    armProblemWatch(req, res, options.problemRoute);
    let answered = false;
    if (typeof res.json === "function") {
      const origJson = res.json.bind(res);
      res.json = (body) => {
        answered = true;
        return origJson(body);
      };
    }
    try {
      const result = await handler(req, res);
      if (res._problemPromise) await res._problemPromise;
      return result;
    } catch (err) {
      console.error("[route]", err?.message || err);
      if (res._problemPromise) await res._problemPromise.catch(() => {});
      if (!answered && !res.headersSent) {
        applyCors(req, res, cors);
        return res.status(500).json({ error: "internal_error" });
      }
    }
  };
}

function armProblemWatch(req, res, route) {
  if (!route || typeof res.status !== "function" || typeof res.json !== "function") return;
  const origStatus = res.status.bind(res);
  const origJson = res.json.bind(res);
  let statusCode = 200;
  res.status = (code) => {
    statusCode = Number(code) || 200;
    return origStatus(code);
  };
  res.json = (body) => {
    const auth = statusCode === 401 || statusCode === 403;
    const httpFail = statusCode >= 400 && !auth;
    const softFail = Boolean(body && typeof body === "object" && body.ok === false);
    const account = req?.brightlineAccount;
    if ((httpFail || softFail) && account?.accountId && !res._problemRecorded) {
      res._problemRecorded = true;
      res._problemPromise = reportRouteFailure({
        account,
        route,
        req,
        status: httpFail ? statusCode : 200,
        error: failureMessage(body, statusCode),
      });
    }
    return origJson(body);
  };
}
