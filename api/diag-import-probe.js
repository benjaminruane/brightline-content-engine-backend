// api/diag-import-probe.js
// A3.9.2: ESM import probe for fast verification that analyse-statements-impl.mjs parses/loads under Vercel ESM.

function setCorsHeaders(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://brightline-content-engine-frontend.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();

  const impl = "analyse-statements-impl.mjs";

  try {
    await import("../lib/analyse-statements-impl.mjs");
    const meta = { ok: true, errorName: null, errorMessage: null };
    console.log("[A3.9.2][IMPORT_PROBE]", meta);
    return res.status(200).json({
      ok: true,
      message: "import ok",
      meta: { impl },
    });
  } catch (e) {
    const errorName = e?.name ?? "Error";
    const errorMessage = e?.message ?? String(e);
    const error = { name: errorName, message: errorMessage };
    if (e?.stack) error.stack = e.stack;
    console.log("[A3.9.2][IMPORT_PROBE]", { ok: false, errorName, errorMessage });
    return res.status(200).json({
      ok: false,
      message: "import failed",
      error,
    });
  }
}
