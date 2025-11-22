// api/fetch-url.js

// --- CORS helper -------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// -----------------------------------------------------------------

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body || {};

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing or invalid url" });
    }

    let response;
    try {
      response = await fetch(url);
    } catch (err) {
      console.error("Network error fetching URL:", err);
      return res.status(502).json({ error: "Failed to fetch URL" });
    }

    if (!response.ok) {
      console.error("Non-200 response fetching URL:", response.status);
      return res
        .status(502)
        .json({ error: `Upstream response ${response.status}` });
    }

    const html = await response.text();

    // Very simple text extraction for now – we can improve later.
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return res.status(200).json({
      url,
      text: stripped,
    });
  } catch (err) {
    console.error("Error in /api/fetch-url:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message || String(err),
    });
  }
}
