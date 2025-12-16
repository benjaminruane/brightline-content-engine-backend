// api/analyse-statements.js
//
// Statement Analysis.
// Behaviour: ALWAYS uses web search (independent of the draft toggle).
//
// Key behaviour guarantees:
// - Attempts LLM extraction first (with web results).
// - If LLM returns empty (even after fallback prompt), we DO NOT return empty.
//   We apply a deterministic local sentence-based extraction to return >= 3 statements.

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "./_web.js";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clamp01(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normaliseStatements(parsed) {
  const arr = Array.isArray(parsed?.statements) ? parsed.statements : [];

  const pickText = (s) => {
    const candidates = [
      s?.text,
      s?.statement,
      s?.claim,
      s?.atomicStatement,
      s?.sentence,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c.trim();
    }
    return "";
  };

  const pickExplanation = (s) => {
    const candidates = [s?.explanation, s?.reason, s?.rationale, s?.because];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c.trim();
    }
    return "";
  };

  const pickImplication = (s) => {
    const candidates = [s?.implication, s?.soWhat, s?.action, s?.recommendation];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c.trim();
    }
    return "";
  };

  const pickScore = (s) => {
    const raw =
      typeof s?.score === "number"
        ? s.score
        : typeof s?.reliability === "number"
        ? s.reliability
        : typeof s?.confidence === "number"
        ? s.confidence
        : null;

    if (raw == null || !Number.isFinite(raw)) return 0;

    // Accept either 0..1 or 0..100
    const n = raw > 1 ? raw / 100 : raw;
    return clamp01(n);
  };

  const pickId = (s, idx) => {
    if (typeof s?.id === "number" && Number.isFinite(s.id)) return s.id;
    if (typeof s?.id === "string" && s.id.trim()) return idx + 1;
    return idx + 1;
  };

  const mapped = arr.map((s, idx) => {
    const id = pickId(s, idx);
    const text = pickText(s);

    const category =
      typeof s?.category === "string" && s.category.trim()
        ? s.category.trim()
        : typeof s?.type === "string" && s.type.trim()
        ? s.type.trim()
        : "Other";

    const score = pickScore(s);

    let explanation = pickExplanation(s);
    let implication = pickImplication(s);

    if (!explanation || explanation === "-" || explanation === "—") {
      explanation =
        "Insufficient information to justify a stronger assessment; treat this claim cautiously.";
    }
    if (!implication || implication === "-" || implication === "—") {
      implication =
        "Add supporting sources, clarify specifics, or rephrase/remove the claim if it cannot be supported.";
    }

    return { id, text, category, score, explanation, implication };
  });

  // Drop empty statements
  return mapped.filter((s) => typeof s.text === "string" && s.text.trim());
}

function stripPlaceholders(text) {
  if (typeof text !== "string") return "";
  // Remove bracket placeholders like [Firm name]
  return text.replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim();
}

function localFallbackExtractStatements(draftText, min = 3, max = 12) {
  const clean = stripPlaceholders(draftText);

  // Split into sentence-ish units
  const rawParts = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // If sentence split fails (e.g., one long paragraph), do a softer split.
  const parts =
    rawParts.length > 0
      ? rawParts
      : clean
          .split(/;\s+|,\s+(?=[A-Z])|\s{2,}/)
          .map((s) => s.trim())
          .filter(Boolean);

  const uniq = [];
  const seen = new Set();

  for (const p of parts) {
    const t = p.replace(/\s+/g, " ").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(t);
    if (uniq.length >= max) break;
  }

  // Ensure minimum by chunking the first long sentence if needed
  if (uniq.length < min) {
    const first = clean || "";
    if (first) {
      const chunks = first
        .split(/,\s+|;\s+|\sand\s+/i)
        .map((s) => s.trim())
        .filter((s) => s.length >= 20);

      for (const c of chunks) {
        const key = c.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(c);
        if (uniq.length >= min) break;
      }
    }
  }

  const picked = uniq.slice(0, Math.max(min, uniq.length));

  return picked.slice(0, max).map((t, idx) => ({
    id: idx + 1,
    text: t,
    category: "Other",
    score: 0.5,
    explanation:
      "Auto-extracted fallback statement because the model returned no statements. Treat as a draft segmentation of claims, not a validation.",
    implication:
      "Review and refine the claim wording, then re-run analysis; add sources if the claim should be verifiable.",
  }));
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : "gpt-4o-mini";

    if (!draftText.trim())
      return res.status(400).json({ error: "Missing or invalid draftText" });

    // Always-on web retrieval
    const searchQuery = deriveQueryFromDraft(stripPlaceholders(draftText));
    const search = await tavilySearch({ query: searchQuery, maxResults: 6 });
    const webBlock = search.ok ? formatWebResultsForPrompt(search.results) : "";
    const references = search.ok ? webResultsToReferences(search.results) : [];

    const systemPrompt = `
You are an expert analyst and fact-checker.

Turn the draft into atomic statements.

REQUIREMENTS:
- Return 8–20 statements when possible.
- If the draft is short, mostly bullets, or hedged, still return AT LEAST 3 statements by converting implicit claims into explicit ones.
- Do NOT return an empty statements array unless the draft is empty (it is not).

For each statement include:
- category
- reliability score 0..1
- explanation (never "-" or empty)
- implication (never "-" or empty)

Use the WEB RESULTS to corroborate or challenge statements where possible.
If web results are insufficient, say so.

Return ONLY valid JSON:
{
  "statements": [
    { "id": number, "text": string, "category": string, "score": number, "explanation": string, "implication": string }
  ],
  "summary": { "note": string|null }
}
`.trim();

    const userPrompt = `
DRAFT:
${draftText}

WEB RESULTS:
${webBlock || "(no web results retrieved)"}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      max_completion_tokens: 1800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};
    let finalStatements = normaliseStatements(parsed);

    // Fallback: stricter prompt if model returned nothing.
    let usedModelFallback = false;
    let usedLocalFallback = false;

    if (finalStatements.length === 0) {
      usedModelFallback = true;

      const fallbackSystemPrompt = `
You are an expert analyst.

Extract AT LEAST 3 atomic statements from the draft, even if the draft is short, mostly bullets, or hedged.
Convert implicit claims into explicit statements.

For each statement include:
- category
- reliability score 0..1
- explanation (never "-" or empty)
- implication (never "-" or empty)

Use WEB RESULTS if relevant; if they don't help, say so in explanation.

Return ONLY valid JSON:
{
  "statements": [
    { "id": number, "text": string, "category": string, "score": number, "explanation": string, "implication": string }
  ],
  "summary": { "note": string|null }
}
`.trim();

      const fallbackCompletion = await client.chat.completions.create({
        model: modelId,
        temperature: 0.2,
        max_completion_tokens: 1200,
        messages: [
          { role: "system", content: fallbackSystemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      });

      const raw2 = fallbackCompletion.choices?.[0]?.message?.content || "";
      const parsed2 = safeJsonParse(raw2) || {};
      finalStatements = normaliseStatements(parsed2);
    }

    // Last resort: deterministic local extraction (never return empty).
    if (finalStatements.length === 0) {
      usedLocalFallback = true;
      finalStatements = localFallbackExtractStatements(draftText, 3, 12);
    }

    const summaryNote =
      typeof parsed?.summary?.note === "string" ? parsed.summary.note : null;

    return res.status(200).json({
      ok: true,
      statements: finalStatements,
      summary: {
        note:
          summaryNote ||
          (usedLocalFallback
            ? "Model returned no statements; using a sentence-based fallback extraction."
            : null),
      },
      meta: {
        webSearch: {
          enabled: true,
          used: Boolean(search.ok && references.length),
          provider: "tavily",
          query: searchQuery,
          resultsCount: references.length,
          error: search.ok ? null : search.error || "Web search failed",
          note: "Statement Analysis always uses web search (independent of the draft toggle).",
        },
        references,
        model: completion.model || modelId,
        extraction: {
          fallbackUsed: usedModelFallback || usedLocalFallback,
          modelFallbackUsed: usedModelFallback,
          localFallbackUsed: usedLocalFallback,
          statementsCount: finalStatements.length,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to analyse statements",
      details: err?.message || String(err),
    });
  }
}
