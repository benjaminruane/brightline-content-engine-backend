// api/generate.js  – TEMP TEST VERSION
export default async function handler(req, res) {
  // Basic CORS so the frontend can call us
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({
      error: "Method not allowed",
      method: req.method,
    });
    return;
  }

  // For now, just echo back what we received
  res.status(200).json({
    ok: true,
    message: "generate test endpoint is working",
    method: req.method,
    body: req.body || null,
  });
}
