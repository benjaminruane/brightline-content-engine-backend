// api/generate.js (debug CORS stub)

export default function handler(req, res) {
  const origin = req.headers.origin || "*";

  // Always set CORS headers
  res.setHeader(
    "Access-Control-Allow-Origin",
    origin === "null" ? "*" : origin
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // For now, just return a dummy payload
  return res.status(200).json({
    ok: true,
    method: req.method,
    message: "CORS test endpoint for /api/generate",
  });
}
