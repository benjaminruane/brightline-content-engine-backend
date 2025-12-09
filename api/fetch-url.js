// /api/fetch-url.js
//
// Fetches a public URL and returns a readable text blob + a sensible title.
// Also sets CORS headers so it works from your Vercel frontend.

// --- CORS helper --------------------------------------------------
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
      return res.status(400).json({ error: "Missing or invalid url" });
    }

    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
      });
    } catch (err) {
      console.error("Error fetching remote URL:", url, err);
      return res
        .status(502)
        .json({ error: "Failed to fetch remote URL", details: String(err) });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error(
        "Remote URL returned non-OK status:",
        url,
        response.status,
        text.slice(0, 500)
      );
      return res.status(502).json({
        error: "Remote URL returned an error status",
        status: response.status,
      });
    }

    const html = await response.text();

    // Very simple title extraction
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    // Naive "readable text": strip scripts/styles/tags and compress whitespace
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      return res.status(500).json({
        error: "Could not extract readable text from URL",
      });
    }

    // Keep it bounded so we don’t blow up token counts downstream
    const maxChars = 20000;
    const clipped = text.length > maxChars ? text.slice(0, maxChars) : text;

    return res.status(200).json({
      title,
      text: clipped,
      sourceUrl: url,
    });
  } catch (err) {
    console.error("Error in /api/fetch-url:", err);
    return res.status(500).json({
      error: "Failed to process URL",
      details: err.message || String(err),
    });
  }
}
