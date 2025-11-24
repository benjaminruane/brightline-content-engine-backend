// api/fetch-url.js

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader(
    "Access-Control-Allow-Origin",
    origin === "null" ? "*" : origin
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body || {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing url" });
    }

    const response = await fetch(url);
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      contentType,
      body: text
    });
  } catch (err) {
    console.error("Error in /api/fetch-url:", err);
    return res.status(500).json({
      error: "Failed to fetch URL",
      detail: err && err.message ? err.message : String(err)
    });
  }
}
