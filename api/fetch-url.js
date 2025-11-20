// api/fetch-url.js

// Simple backend endpoint to fetch a URL and return cleaned text.
// Frontend calls this instead of fetching arbitrary URLs directly.

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { url } = req.body || {};
    if (!url) {
      return res.status(400).json({ error: "Missing url" });
    }

    // Basic URL validation
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res
        .status(400)
        .json({ error: "Only http and https URLs are allowed" });
    }

    // Fetch the URL on the server side (Node has global fetch)
    const response = await fetch(parsed.toString(), {
      method: "GET",
    });

    if (!response.ok) {
      return res.status(502).json({
        error: "Upstream fetch failed",
        status: response.status,
        statusText: response.statusText,
      });
    }

    // Limit body size to something reasonable
    const html = await response.text();
    const truncated = html.slice(0, 200_000); // max 200k chars

    // Remove script and style blocks
    const withoutScripts = truncated.replace(
      /<script[\s\S]*?<\/script>/gi,
      ""
    );
    const withoutStyles = withoutScripts.replace(
      /<style[\s\S]*?<\/style>/gi,
      ""
    );

    // Strip HTML tags and collapse whitespace
    const text = withoutStyles
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      return res.status(200).json({
        url: parsed.toString(),
        text: "",
        warning: "No visible text could be extracted from URL",
      });
    }

    return res.status(200).json({
      url: parsed.toString(),
      text,
    });
  } catch (err) {
    console.error("Error in /api/fetch-url:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message || String(err),
    });
  }
}
