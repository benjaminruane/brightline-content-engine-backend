// api/_web.js
//
// Shared web retrieval helpers for Content Engine.
// We use Tavily for fast, lightweight public web search.
//
// NOTE:
// - Ask AI and Statement Analysis ALWAYS use web search.
// - Generate and Rewrite use web search only when publicSearch === true.

const TAVILY_API_URL = "https://api.tavily.com/search";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} environment variable`);
  return v;
}

function withTimeout(ms = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

export async function tavilySearch(arg) {
  const { query, maxResults = 4 } =
    typeof arg === "string" ? { query: arg, maxResults: 4 } : (arg || {});

  if (!query || typeof query !== "string") {
    return {
      ok: false,
      query: String(query || ""),
      results: [],
      error: "Missing query",
    };
  }

  const apiKey = requireEnv("TAVILY_API_KEY");
  const payload = {
    api_key: apiKey,
    query,
    max_results: maxResults,
    search_depth: "basic",
    include_answer: false,
    include_raw_content: false,
    include_images: false,
  };

  const t = withTimeout(12000);
  try {
    const r = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: t.signal,
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return {
        ok: false,
        query,
        results: [],
        error: `Tavily HTTP ${r.status}: ${text || "Unknown error from Tavily"}`,
      };
    }

    const data = await r.json();
    const results = Array.isArray(data?.results)
      ? data.results
          .map((x, i) => ({
            id: i + 1,
            title:
              typeof x?.title === "string" && x.title.trim()
                ? x.title.trim()
                : `Result ${i + 1}`,
            url: typeof x?.url === "string" ? x.url : "",
            snippet:
              (typeof x?.content === "string" && x.content) ||
              (typeof x?.snippet === "string" && x.snippet) ||
              "",
          }))
          .filter((x) => x.url || x.snippet)
      : [];

    return { ok: true, query, results, raw: data };
  } catch (err) {
    const msg =
      err?.name === "AbortError"
        ? "Tavily request timed out"
        : err?.message || String(err);
    return { ok: false, query, results: [], error: msg };
  } finally {
    t.cancel();
  }
}

export function formatWebResultsForPrompt(results) {
  if (!Array.isArray(results) || results.length === 0) return "";

  const lines = [];
  for (const r of results) {
    const id = typeof r?.id === "number" ? r.id : lines.length + 1;
    const title = typeof r?.title === "string" ? r.title : "";
    const url = typeof r?.url === "string" ? r.url : "";
    const snippet = typeof r?.snippet === "string" ? r.snippet : "";

    lines.push(`[${id}] ${title}\nURL: ${url}\nSnippet: ${snippet}`.trim());
  }

  return lines.join("\n\n");
}

export function webResultsToReferences(results) {
  if (!Array.isArray(results) || results.length === 0) return [];

  return results
    .map((r, i) => {
      const id = typeof r?.id === "number" ? r.id : i + 1;
      const title = typeof r?.title === "string" ? r.title : null;
      const url = typeof r?.url === "string" ? r.url : null;
      const snippet = typeof r?.snippet === "string" ? r.snippet : null;

      // Stable IDs for downstream linking (Statement Analysis / Ask AI).
      const sourceId = `web:tavily:${id}`;

      return { id, sourceId, sourceType: "web", title, url, snippet };
    })
    .filter((r) => r.url);
}

export function deriveQueryFromAsk({ question, title, draftText }) {
  const q = typeof question === "string" ? question.trim() : "";
  const t = typeof title === "string" ? title.trim() : "";
  const d = typeof draftText === "string" ? draftText.trim() : "";

  if (q && t) return `${q} (${t})`;
  if (q) return q;

  const firstLine = d.split(/\r?\n/).find((x) => x.trim())?.trim() || "";
  return firstLine || t || "General background";
}

export function deriveQueryFromDraft(draftText) {
  const d = typeof draftText === "string" ? draftText.trim() : "";
  const firstLine = d.split(/\r?\n/).find((x) => x.trim())?.trim() || "";
  if (firstLine) return firstLine.slice(0, 140);
  return d ? d.slice(0, 140) : "General background";
}
