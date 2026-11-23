// /api/fetch-url.js
//
// Fetches a public URL and returns a readable text blob + a sensible title.
// Also sets CORS headers so it works from your Vercel frontend.

import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { markPageFurniture } from "../lib/extract-boilerplate.mjs";
import { extractArticleFromHtml } from "../lib/html-article-extract.mjs";
import { reportRouteFailure } from "../lib/problem-events.mjs";

// --- CORS helper --------------------------------------------------

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS" })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const routeStartedAt = Date.now();
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
      await reportRouteFailure({
        account,
        route: "fetch-url",
        req,
        status: 502,
        error: "Failed to fetch remote URL",
        startedAt: routeStartedAt,
      });
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
      await reportRouteFailure({
        account,
        route: "fetch-url",
        req,
        status: 502,
        error: "Remote URL returned an error status",
        startedAt: routeStartedAt,
      });
      return res.status(502).json({
        error: "Remote URL returned an error status",
        status: response.status,
      });
    }

    const html = await response.text();

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    let text;
    try {
      text = extractArticleFromHtml(html);
    } catch (err) {
      console.error("Could not extract an article from URL:", url, err);
      await reportRouteFailure({
        account,
        route: "fetch-url",
        req,
        status: 500,
        error: "Could not extract readable text from URL",
        startedAt: routeStartedAt,
      });
      return res.status(500).json({
        error: "Could not extract readable text from URL",
      });
    }

    const { furnitureLineIndexes } = markPageFurniture(text);

    return res.status(200).json({
      title,
      text,
      sourceUrl: url,
      furnitureLineIndexes,
    });
  } catch (err) {
    console.error("Error in /api/fetch-url:", err);
    await reportRouteFailure({
      account,
      route: "fetch-url",
      req,
      status: 500,
      error: err?.message || "Failed to process URL",
      startedAt: routeStartedAt,
    });
    return res.status(500).json({
      error: "Failed to process URL",
      details: err.message || String(err),
    });
  }
}
