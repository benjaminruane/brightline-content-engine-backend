// api/query.js

import { deriveQueryFromAsk, runWebSearch } from "../lib/web.js";
import { callOpenAI, flushObservability } from "../lib/observability.js";

/**
 * Heuristic: detect whether results are generic / listicle-like.
 */
function resultsAreGeneric(results = [], entity = "") {
  if (!results.length) return true;

  const titles = results.map(r => (r.title || "").toLowerCase()).join(" ");
  if (entity && !titles.includes(entity.toLowerCase())) return true;

  return results.every(r =>
    /list|how to|guide|examples|famous|history of/.test(
      (r.title || "").toLowerCase()
    )
  );
}

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
      res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Vary", "Origin");

    const {
      question,
      title = "",
      draftText = "",
    } = req.body;

    if (!question) {
      return res.status(400).json({ ok: false, error: "Missing question" });
    }

    // ----- Web search (always on for Ask AI)
    // Force publicSearch = true regardless of client request
    const publicSearch = true;
    const initialQuery = deriveQueryFromAsk({
      question,
      title,
      draftText,
    });

    let queryUsed = initialQuery;

    let search = await runWebSearch({
      query: initialQuery,
      apiKey: process.env.TAVILY_API_KEY,
    });

    // Single refinement pass if results are weak
    if (resultsAreGeneric(search.results, title)) {
      const refinedQuery = `${initialQuery} founded headquarters CEO leadership`;
      queryUsed = refinedQuery;

      search = await runWebSearch({
        query: refinedQuery,
        apiKey: process.env.TAVILY_API_KEY,
      });
    }

    const references = (search.results || []).map((r, i) => ({
      id: i + 1,
      title: r.title,
      url: r.url,
    }));

    // ----- Prompt
    const systemPrompt = `
You are answering a factual research question using web sources.

Rules:
- ALWAYS answer using the provided sources.
- Produce ONE cohesive answer (no Answer/Evidence split).
- Rich text allowed: paragraphs and bullet points are fine.
- Insert inline citations like [1] at the exact supporting sentence.
- Do NOT say you lack browsing or live web access.
- If sources still do not support a clear answer, ask ONE clarifying question instead.
`;

    const userPrompt = `
Question:
${question}

Web sources:
${references.map(r => `[${r.id}] ${r.title}`).join("\n")}
`;

    const completion = await callOpenAI({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
    }, {
      traceName: "ask-query",
      spanName: "ask-query-answer",
      metadata: { route: "query" },
    });

    const answer = completion.choices[0]?.message?.content || "";

    // Simple confidence heuristic
    const confidence =
      references.length >= 3 ? 70 :
      references.length === 2 ? 50 :
      references.length === 1 ? 30 : 10;

    const confidenceReason =
      references.length
        ? "The answer is based on relevant web sources that directly address the question."
        : "Available web sources did not clearly support a definitive answer.";

    return res.json({
      ok: true,
      answer,
      confidence,
      confidenceReason,
      references,
      meta: {
        webSearch: {
          enabled: true,
          queryUsed,
          resultsCount: references.length,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Ask AI failed",
    });
  } finally {
    await flushObservability();
  }
}
