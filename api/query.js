// api/query.js
//
// Ask AI endpoint for Content Engine.
// - Uses OpenAI chat.completions.create() (no tools, no response_format).
// - Web search is ON by default if TAVILY_API_KEY is present, unless publicSearch === false.
// - Supports modeOverride: "auto" | "draft_about" | "general".
// - Returns { ok, answer, references[], meta{draftSubject, mode} }.

import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Tavily configuration
const TAVILY_API_URL = "https://api.tavily.com/search";

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

const STYLE_GUIDE_INSTRUCTIONS = `
You are part of an internal writing tool called "Content Engine".
Follow this style guide in all answers:

- Currency:
  - Use "USD" followed by a space and a number with standard English thousand separators.
    Example: USD 1,500,000 (not USD1.5m, USD1,500,000 or US$1.5m).
- Years:
  - Do NOT insert thousand separators into years: 2025, 1999.
- Quotation marks:
  - Prefer straight double quotes "like this".
  - Use single quotes only for quotes-within-quotes.
- Tone:
  - Clear, concise, neutral, professional.
`;

// ------------------------- Helpers --------------------------------

function extractAssistantText(message) {
  if (!message) return "";
  const c = message.content;
  if (typeof c === "string") return c;

  if (Array.isArray(c)) {
    const parts = c
      .map((p) => {
        if (!p) return "";
        if (typeof p === "string") return p;
        if (typeof p === "object") {
          if (typeof p.text === "string") return p.text;
          if (typeof p.content === "string") return p.content;
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("\n");
  }

  return "";
}

function inferDraftSubject({ title, draftText }) {
  const t = (title || "").trim();
  if (t && t.length >= 3) return t.length > 80 ? t.slice(0, 80).trim() : t;

  const text = (draftText || "").trim();
  if (!text) return null;

  const m1 = text.match(
    /\b([A-Z][A-Za-z0-9&.\-]{2,})(?:\s*,\s*Inc\.|\s*\(|\s*(?:Ltd\.|Limited|PLC|plc|AG|SA|S\.A\.|GmbH)\b)/
  );
  if (m1 && m1[1]) return m1[1].trim();

  const tokens = text.match(/\b[A-Z][a-zA-Z0-9&.\-]{2,}\b/g) || [];
  const freq = new Map();
  for (const tok of tokens.slice(0, 300)) freq.set(tok, (freq.get(tok) || 0) + 1);

  let best = null;
  let bestCount = 0;
  for (const [k, c] of freq.entries()) {
    const lower = k.toLowerCase();
    if (
      ["the", "and", "for", "with", "this", "that", "company", "fund", "group", "management"].includes(
        lower
      )
    )
      continue;
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  if (best && bestCount >= 2) return best;

  return null;
}

function classifyQuestion(question, draftSubject) {
  const q = (question || "").trim().toLowerCase();
  if (!q) return "ambiguous";

  const generalSignals = [
    "recent trends",
    "market",
    "industry",
    "macro",
    "outlook",
    "forecast",
    "interest rates",
    "inflation",
    "gdp",
    "recession",
    "global",
    "worldwide",
    "in 2024",
    "in 2025",
  ];

  const draftSignals = [
    "the company",
    "this company",
    "the firm",
    "this firm",
    "the business",
    "issuer",
    "target",
    "acquirer",
    "the fund",
    "the asset",
    "when was it founded",
    "founded",
    "headquartered",
    "headquarters",
    "ceo",
    "ticker",
    "market cap",
    "revenue",
    "competitors",
  ];

  const hasGeneral = generalSignals.some((s) => q.includes(s));
  const hasDraft = draftSignals.some((s) => q.includes(s));

  if (draftSubject) {
    const subj = draftSubject.toLowerCase();
    if (subj.length >= 3 && q.includes(subj)) return "draft_about";
  }

  if (hasGeneral && !hasDraft) return "general";
  if (hasDraft && draftSubject) return "draft_about";

  if (hasGeneral && hasDraft) {
    const identitySignals = ["founded", "ceo", "headquartered", "headquarters", "ticker", "market cap"];
    const hasIdentity = identitySignals.some((s) => q.includes(s));
    if (hasIdentity && draftSubject) return "draft_about";
    return "general";
  }

  return "ambiguous";
}

function buildWebSearchQuery({ question, draftSubject, mode }) {
  const q = (question || "").trim();
  const subj = (draftSubject || "").trim();
  if (!q) return "";

  if (mode === "draft_about") return subj ? `${subj} ${q}` : q;
  if (mode === "general") return q;
  return subj ? `${q} (context: ${subj})` : q;
}

function buildSystemPrompt() {
  return [
    `You are the "Ask AI" assistant embedded in the Content Engine application.`,
    `You answer the user's question using the draft context and (if provided) web search results.`,
    `Write in Markdown with short headings and bullet points where helpful.`,
    `Be concise: provide ONE integrated answer (do not split into "from draft" vs "from web").`,
    `If details are unknown, say so briefly and move on.`,
    `When you rely on WEB SEARCH RESULTS, cite them with markers like [1], [2] that match the results list.`,
    STYLE_GUIDE_INSTRUCTIONS,
  ].join("\n\n");
}

function buildUserPrompt({ question, draftText, styleGuide, draftSubject, webResults, mode }) {
  const safeQuestion = (question || "").trim();
  const safeDraft = (draftText || "").trim();
  const safeStyle = (styleGuide || "").trim();
  const subj = (draftSubject || "").trim();

  const lines = [];

  lines.push("QUESTION:");
  lines.push(safeQuestion || "[no question provided]");
  lines.push("");

  lines.push("DRAFT SUBJECT (best-effort):");
  lines.push(subj || "[unknown]");
  lines.push("");

  lines.push("QUESTION MODE (best-effort):");
  lines.push(mode);
  lines.push("");

  lines.push("DRAFT OUTPUT (may be empty):");
  lines.push(safeDraft || "[no draft text provided]");
  lines.push("");

  lines.push("STYLE GUIDE (project-specific rules, may be empty):");
  lines.push(safeStyle || "[no additional style guide]");
  lines.push("");

  if (webResults && Array.isArray(webResults) && webResults.length > 0) {
    lines.push("WEB SEARCH RESULTS:");
    lines.push("Use [1], [2], etc. markers when you rely on a specific result.");
    lines.push("");
    webResults.forEach((r, idx) => {
      const n = idx + 1;
      lines.push(`[${n}] ${r.title || "Untitled"} — ${r.snippet || ""} (${r.url || ""})`);
    });
    lines.push("");
  }

  lines.push("INSTRUCTIONS:");
  lines.push("Answer the QUESTION using the draft and any web results.");
  lines.push("Do NOT invent specific numbers, dates, valuations, or party names.");
  lines.push("Keep it concise and investor-appropriate.");

  return lines.join("\n");
}

// ------------------------- Tavily web search ------------------------

async function fetchWebResultsTavily({ query, maxResults = 4 }) {
  if (!process.env.TAVILY_API_KEY) return null;
  if (!query || typeof query !== "string") return null;

  const payload = {
    api_key: process.env.TAVILY_API_KEY,
    query,
    max_results: maxResults,
    search_depth: "basic",
    include_answer: false,
    include_raw_content: false,
    include_images: false,
  };

  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Tavily web search non-OK:", res.status, text || "<no body>");
      return null;
    }

    const data = await res.json();

    const results = Array.isArray(data.results)
      ? data.results.map((r, index) => ({
          id: index + 1,
          title: r.title || `Result ${index + 1}`,
          url: r.url || "",
          snippet: r.content || r.snippet || "",
        }))
      : [];

    return results.length > 0 ? results : null;
  } catch (err) {
    console.error("Tavily web search error:", err);
    return null;
  }
}

// ------------------------- Handler ----------------------------------

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const {
      question,
      draftText,
      styleGuide,
      title,
      modelId,
      temperature,
      maxTokens,
      publicSearch,
      modeOverride, // "auto" | "draft_about" | "general"
    } = body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'question' in request body" });
    }

    const draftSubject = inferDraftSubject({ title, draftText });

    const inferredMode = classifyQuestion(question, draftSubject);
    const mode =
      modeOverride === "draft_about" || modeOverride === "general"
        ? modeOverride
        : inferredMode;

    let webResults = null;

    if (process.env.TAVILY_API_KEY && publicSearch !== false) {
      const webQuery = buildWebSearchQuery({ question, draftSubject, mode });
      webResults = await fetchWebResultsTavily({ query: webQuery, maxResults: 4 });
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      question,
      draftText,
      styleGuide,
      draftSubject,
      webResults,
      mode,
    });

    const maxCompletionTokens =
      typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : 700;

    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4o-mini",
      temperature: typeof temperature === "number" ? temperature : 0.3,
      max_completion_tokens: maxCompletionTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const message = completion.choices?.[0]?.message || null;
    const answer = extractAssistantText(message).trim();

    if (!answer) {
      return res.status(500).json({
        error: "Model returned empty answer",
        references: webResults || [],
      });
    }

    return res.status(200).json({
      ok: true,
      question,
      answer,
      model: completion.model || null,
      references: webResults || [],
      meta: {
        draftSubject: draftSubject || null,
        mode,
      },
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
        totalTokens: completion.usage?.total_tokens ?? null,
      },
    });
  } catch (err) {
    console.error("Ask AI /api/query error:", err);
    const message = err && typeof err === "object" && "message" in err ? err.message : "Unknown error";
    return res.status(500).json({ error: "Failed to process query", details: message });
  }
}
