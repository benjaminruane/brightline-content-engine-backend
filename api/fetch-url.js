// api/fetch-url.js
//
// Fetches a URL and tries to extract readable article-like text
// using Mozilla Readability + jsdom. Falls back to basic body
// text if needed.

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

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
// ------------------------------------------------------------------

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
      return res.status(400).json({ error: "Missing or invalid 'url' field" });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL" });
    }

    // Fetch the raw HTML. Node 18+ / Vercel have global fetch.
    const response = await fetch(parsedUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Content-Engine/1.0; +https://example.com)",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      console.error("fetch-url: HTTP error", response.status, url);
      return res.status(502).json({
        error: `Failed to fetch URL (status ${response.status})`,
      });
    }

    let html = await response.text();
    if (!html || !html.trim()) {
      return res
        .status(400)
        .json({ error: "No HTML content returned from URL" });
    }

    // Guard against extremely large pages – truncate to ~500k chars
    const MAX_HTML_CHARS = 500_000;
    if (html.length > MAX_HTML_CHARS) {
      html = html.slice(0, MAX_HTML_CHARS);
    }

    // Create a DOM and use Mozilla Readability to extract article text
    const dom = new JSDOM(html, { url: parsedUrl.toString() });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    let text = "";
    let title = null;

    if (article && article.textContent) {
      text = article.textContent;
      title = article.title || dom.window.document.title || null;
    } else {
      // Fallback: basic body text
      const bodyText = dom.window.document.body
        ? dom.window.document.body.textContent || ""
        : "";
      text = bodyText;
      title = dom.window.document.title || null;
    }

    // Normalise whitespace – collapse big gaps, keep paragraphs
    text = text
      .replace(/\r/g, "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // If after parsing we still have almost nothing, treat as no content
    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
    if (!text || wordCount < 30) {
      return res.status(200).json({
        text: "",
        title,
        wordCount,
        message:
          "Fetched page but could not find enough readable article-style text.",
      });
    }

    return res.status(200).json({
      text,
      title,
      wordCount,
      url: parsedUrl.toString(),
    });
  } catch (err) {
    console.error("Error in /api/fetch-url:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message || String(err),
    });
  }
}
