// api/query.js
//
// Ask AI endpoint for Content Engine.
// - Uses OpenAI chat.completions.create() (no tools, no response_format).
// - Web search is ALWAYS ON by default if TAVILY_API_KEY is present.
// - Smart query construction:
//     • If question is clearly "about the draft entity", search with the draft subject.
//     • If question is clearly general/macro, search question-only.
//     • If ambiguous, include a light subject hint (not the full draft).
// - Robust answer extraction (handles string or structured content).

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  - Prefer straight double quotes "like this" for titles, terms, and citations.
  - Use single quotes only for quotes-within-quotes.
- Tone:
  - Clear, concise, neutral, professional.
`;

// ------------------------- Helpers --------------------------------

function extractAssistantText(message) {
  if (!message) return "";
  const c = message.content;

  if (typeof c === "string") return c;

  // Some SDK/model combos may return content as an array of parts.
  if (Array.isArray(c)) {
    const parts = c
      .map((p) => {
        if (!p) return "";
        if (typeof p === "string") return p;
        if (typeof p === "object") {
          // Common shapes:
          // { type: "text", text: "..." }
          // { text: "..." }
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

// Attempt to infer the draft "subject" (e.g., company/fund/asset name).
// This is deliberately lightweight (no extra model call).
function inferDraftSubject({ title, draftText }) {
  const t = (title || "").trim();
  if (t && t.length >= 3) {
    // Use title as the best available subject hint.
    // Keep it short (avoid entire titles with punctuation-heavy templates).
    return t.length > 80 ? t.slice(0, 80).trim() : t;
  }

  const text = (draftText || "").trim();
  if (!text) return null;

  // Heuristic #1: look for patterns like "Pinterest (NYSE: PINS)" or "Pinterest, Inc."
  const m1 = text.match(/\b([A-Z][A-Za-z0-9&.\-]{2,})(?:\s*,\s*Inc\.|\s*\(|\s*(?:Ltd\.|Limited|PLC|plc|AG|SA|S\.A\.|GmbH)\b)/);
  if (m1 && m1[1]) return m1[1].trim();

  // Heuristic #2: grab the first repeated capitalised token that appears multiple times.
  // This catches cases like "Pinterest" in an investment memo.
  const tokens = text.match(/\b[A-Z][a-zA-Z0-9&.\-]{2,}\b/g) || [];
  const freq = new Map();
  for (const tok of tokens.slice(0, 300)) {
    const key = tok;
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [k, c] of freq.entries()) {
    // Avoid generic words
    const lower = k.toLowerCase();
    if (["the", "and", "for", "with", "this", "that", "company", "fund", "group", "management"].includes(lower)) {
      continue;
    }
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  if (best && bestCount >= 2) return best;

  return null;
}

// Decide whether question is:
// - "draft_about" (implicitly refers to the subject in the draft)
// - "general" (macro/industry question, not about the draft)
// - "ambiguous"
function classifyQuestion(question, draftSubject) {
  const q = (question || "").trim().toLowerCase();
  if (!q) return "ambiguous";

  // Strong "general research" indicators
  const generalSignals = [
    "recent trends",
    "market",
    "industry",
    "macro",
    "outlook",
    "forecast",
    "headwinds",
    "tailwinds",
    "interest rates",
    "inflation",
    "private equity",
    "venture capital",
    "fundraising",
    "real estate",
    "credit",
    "spreads",
    "gdp",
    "recession",
    "in 2024",
    "in 2025",
    "2024–2025",
    "2024-2025",
    "global",
    "worldwide",
    "in europe",
    "in the us",
    "in asia",
  ];

  // Strong "about the draft entity" indicators (implicit subject)
  const draftSignals = [
    "the company",
    "this company",
    "the firm",
    "this firm",
    "the business",
    "this business",
    "the issuer",
    "the target",
    "the acquirer",
    "the fund",
    "the asset",
    "it ",
    "its ",
    "when was it founded",
    "when was the company founded",
    "founded",
    "headquartered",
    "headquarters",
    "ceo",
    "ticker",
    "market cap",
    "revenue",
    "customers",
    "competitors",
  ];

  const hasGeneral = generalSignals.some((s) => q.includes(s));
  const hasDraft = draftSignals.some((s) => q.includes(s));

  // If user explicitly names the draft subject, treat as draft_about.
  if (draftSubject) {
    const subj = draftSubject.toLowerCase();
    if (subj.length >= 3 && q.includes(subj)) return "draft_about";
  }

  // If clearly general and not clearly draft-about → general
  if (hasGeneral && !hasDraft) return "general";

  // If clearly draft-about and we have a subject to anchor → draft_about
  if (hasDraft && draftSubject) return "draft_about";

  // If both signals present:
  // - Prefer general for macro trend questions (reduces hijacking),
  // - Prefer draft_about for identity/facts (founded/CEO/HQ) if subject exists.
  if (hasGeneral && hasDraft) {
    // If question looks like identity/facts, prefer draft_about.
    const identitySignals = ["founded", "ceo", "headquartered", "headquarters", "ticker", "market cap"];
    const hasIdentity = identitySignals.some((s) => q.includes(s));
    if (hasIdentity && draftSubject) return "draft_about";
    return "general";
  }

  return "ambiguous";
}

// Build Tavily query based on classification
function buildWebSearchQuery({ question, draftSubject, mode }) {
  const q = (question || "").trim();
  const subj = (draftSubject || "").trim();

  if (!q) return "";

  if (mode === "draft_about") {
    // Anchor search on the subject explicitly.
    // Example: "Pinterest when founded"
    return subj ? `${subj} ${q}` : q;
  }

  if (mode === "general") {
    // Question-only for macro/general questions.
    return q;
  }

  // Ambiguous: use question + a light subject hint if available (NOT full draft).
  if (subj) return `${q} (context: ${subj})`;
  return q;
}

// ------------------------- Prompt building -------------------------

function buildSystemPrompt() {
  return [
    `You are the "Ask AI" assistant embedded in the Content Engine application.`,
    `You answer targeted questions about a draft document and, where provided, web search results.`,
    `Always format your answer in Markdown. Use short headings, bullet lists, and bold labels for readability.`,
    `If the user question is unclear or cannot be answered from the provided context, say so briefly instead of inventing details.`,
    `When using WEB SEARCH RESULTS, treat them as external context and avoid overstating certainty.`,
    `If the question is about the subject of the draft (e.g., "the company"), infer the subject from the draft context.`,
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

  lines.push("DRAFT SUBJECT (best-effort, may be empty):");
  lines.push(subj || "[unknown]");
  lines.push("");

  lines.push("QUESTION MODE (best-effort):");
  lines.push(mode); // draft_about | general | ambiguous
  lines.push("");

  lines.push("DRAFT OUTPUT (may be empty):");
  lines.push(safeDraft || "[no draft text provided]");
  lines.push("");

  lines.push("STYLE GUIDE (project-specific rules, may be empty):");
  lines.push(safeStyle || "[no additional style guide]");
  lines.push("");

  if (webResults && Array.isArray(webResults) && webResults.length > 0) {
    lines.push("WEB SEARCH RESULTS (for additional context):");
    lines.push(
      "If you rely on a specific result, cite it using footnote markers like [1], [2], etc., matching the numbering below."
    );
    lines.push("");

    webResults.forEach((r, idx) => {
      const n = idx + 1;
      lines.push(`[${n}] ${r.title || "Untitled"} — ${r.snippet || ""} (${r.url || ""})`);
    });

    lines.push("");
  }

  lines.push("INSTRUCTIONS:");
  lines.push(
    "Answer the QUESTION as helpfully as possible based on the DRAFT OUTPUT, STYLE GUIDE, DRAFT SUBJECT, and any WEB SEARCH RESULTS provided."
  );
  lines.push(
    "Do NOT invent specific numbers, dates, valuations, or party names. If unknown, say so."
  );
  lines.push(
    "Use [1], [2] markers when relying on web results so the UI can link sources."
  );
  lines.push(
    "Keep the answer concise, structured, and suitable for an institutional investor audience."
  );

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
      title, // optional: if frontend passes it, subject inference improves
      modelId,
      temperature,
      maxTokens,
      publicSearch, // if explicitly false, skip web search
    } = body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'question' in request body" });
    }

    const draftSubject = inferDraftSubject({ title, draftText });
    const mode = classifyQuestion(question, draftSubject);

    // Web search is "always on" by default if TAVILY_API_KEY exists,
    // unless caller explicitly disables it with publicSearch === false.
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

    const maxCompletionTokens = typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : 700;

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
      console.error("Ask AI returned empty answer text. Raw message:", message);
      return res.status(500).json({
        error: "Model returned empty answer",
        details: "The model response contained no extractable text output.",
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
    return res.status(500).json({
      error: "Failed to process query",
      details: message,
    });
  }
}
