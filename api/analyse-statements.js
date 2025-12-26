// api/analyse-statements.js
//
// Statement Analysis.
// Behaviour: ALWAYS uses web search (independent of the draft toggle).
//
// Scoring: rules-based (no LLM self-scoring).
// Extraction: LLM-assisted (with web context) to propose candidate factual statements.
//
// UX guarantees:
// - Never returns canned/technical fallback language.
// - If no verifiable factual statements are detected, returns an empty set with a calm summary.

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


function pctToReliabilityLevel(pct) {
  const n = typeof pct === "number" && Number.isFinite(pct) ? pct : 0;
  // Keep thresholds consistent with the UI expectation (can be tuned later).
  if (n >= 85) return "High";
  if (n >= 65) return "Medium";
  return "Low";
}

function buildSignalsForStatement({ text, reliabilityScore, evidenceCount, contradictionsCount }) {
  const t = String(text || "").toLowerCase();

  const hasNumber = /\b\d+(?:[\.,]\d+)?\b/.test(t);
  const hasDateToken =
    /\b(19\d{2}|20\d{2})\b/.test(t) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/.test(t) ||
    /\b(q[1-4])\b/.test(t);

  const hedged = /\b(may|might|could|likely|possibly|expected to|aims to|seeks to)\b/.test(t);
  const forwardLooking =
    /\b(will|to be|forecast|project|target|plan to|plans to|going to|next year|in the next)\b/.test(t);

  const quantWords = /\b(growth|grew|increase|decrease|decline|up|down|rose|fell|million|billion|percent|%)\b/.test(t);
  const timeBoundWords = /\b(by|in|during|since|as of|between|over|within)\b/.test(t);

  const vague = /\b(significant|material|strong|weak|leading|robust|meaningful|substantial)\b/.test(t);

  const signals = [];

  // Evidence-driven signals first (most actionable)
  if (!evidenceCount) {
    signals.push({
      code: "NO_SOURCES",
      label: "No sources",
      explanation: "No supporting sources were found for this claim in the available evidence.",
    });
  } else if (reliabilityScore < 65) {
    signals.push({
      code: "WEAK_SOURCES",
      label: "Weak sources",
      explanation: "Evidence exists but is indirect, thin, or not strongly aligned to the claim.",
    });
  }

  if (contradictionsCount > 0) {
    signals.push({
      code: "CONTRADICTION",
      label: "Contradiction",
      explanation: "This claim may conflict with other statements in the same draft.",
    });
  }

  if (forwardLooking) {
    signals.push({
      code: "FORWARD_LOOKING",
      label: "Forward-looking",
      explanation: "Forward-looking language is harder to verify and should be clearly attributed or caveated.",
    });
  }

  if (hedged) {
    signals.push({
      code: "HEDGED",
      label: "Hedged",
      explanation: "Hedging language reduces certainty unless the claim is clearly attributed to a source.",
    });
  }

  if (quantWords && !hasNumber) {
    signals.push({
      code: "MISSING_FIGURE",
      label: "Missing figure",
      explanation: "The claim implies a quantitative change but does not include a specific number.",
    });
  }

  if (timeBoundWords && !hasDateToken) {
    signals.push({
      code: "MISSING_DATE",
      label: "Missing date",
      explanation: "The claim appears time-bound but does not specify when it applies.",
    });
  }

  if (vague && !hasNumber) {
    signals.push({
      code: "VAGUE_CLAIM",
      label: "Vague claim",
      explanation: "The language is broad or subjective; consider tightening with specifics or attribution.",
    });
  }

  // Keep signals concise and on-point: cap to a small set.
  return signals.slice(0, 6);
}

function stripPlaceholders(text) {
  if (typeof text !== "string") return "";
  // Remove bracket placeholders like [Firm name]
  return text.replace(/\[[^\]]+\]/g, " ").replace(/\s+/g, " ").trim();
}

function normaliseExtractedStatements(parsed) {
  const arr = Array.isArray(parsed?.statements) ? parsed.statements : [];
  const out = [];

  for (let i = 0; i < arr.length; i++) {
    const s = arr[i] || {};
    const text =
      typeof s.text === "string" && s.text.trim()
        ? s.text.trim()
        : typeof s.statement === "string" && s.statement.trim()
        ? s.statement.trim()
        : typeof s.claim === "string" && s.claim.trim()
        ? s.claim.trim()
        : "";

    if (!text) continue;

    out.push({
      id: i + 1,
      text,
    });
  }

  // de-dupe (case-insensitive)
  const seen = new Set();
  const uniq = [];
  for (const s of out) {
    const key = String(s.text).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(s);
  }
  return uniq.slice(0, 20);
}

// -----------------------------
// Rules-based scoring
// -----------------------------

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "as",
  "at",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "it",
  "this",
  "that",
  "these",
  "those",
  "its",
  "their",
  "our",
  "your",
  "his",
  "her",
  "they",
  "we",
  "you",
  "i",
]);

function tokens(text) {
  const s = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return [];
  return s
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t && t.length >= 3 && !STOPWORDS.has(t));
}

function hasNumber(text) {
  return /\b\d+(?:[\.,]\d+)?\b/.test(String(text || ""));
}

function isForwardLooking(text) {
  return /(will|expects?|expected|forecast|project(ed|ion)?|outlook|guidance|target|aims?|plan(s|ned)?|intends?|anticipat(e|es|ed)|likely|may|might|could)/i.test(
    String(text || "")
  );
}

function isSoftOpinion(text) {
  return /(leading|best[-\s]?in[-\s]?class|strong|robust|high[-\s]?quality|world[-\s]?class|excellent|attractive|compelling)/i.test(
    String(text || "")
  );
}

function bestEvidenceMatches(statementText, references, max = 3) {
  const stoks = tokens(statementText);
  if (!stoks.length || !Array.isArray(references) || references.length === 0) {
    return [];
  }

  const scored = references
    .map((r, idx) => {
      const blob = `${r?.title || ""} ${r?.snippet || ""} ${r?.url || ""}`;
      const btoks = tokens(blob);
      const bset = new Set(btoks);

      let hit = 0;
      for (const t of stoks) {
        if (bset.has(t)) hit++;
      }

      // require at least 2 shared tokens for a usable match
      const ok = hit >= 2;

      return {
        idx,
        ok,
        hit,
        ref: r,
      };
    })
    .filter((x) => x.ok)
    .sort((a, b) => b.hit - a.hit)
    .slice(0, max);

  return scored.map((x) => {
    const n = x.idx + 1;
    return {
      label: `[${n}]`,
      title: x.ref?.title || "Source",
      url: x.ref?.url || "",
      snippet: x.ref?.snippet || "",
      refIndex: n,
      tokenHits: x.hit,
    };
  });
}

function scoreOneStatement(text, references) {
  let score = 0.55;
  const rationaleBits = [];

  const forward = isForwardLooking(text);
  const opiniony = isSoftOpinion(text);
  const numeric = hasNumber(text);

  const matches = bestEvidenceMatches(text, references, 3);
  const hasWeb = Array.isArray(references) && references.length > 0;

  if (forward) {
    score -= 0.12;
    rationaleBits.push("Forward-looking language reduces verifiability.");
  }

  if (opiniony) {
    score -= 0.08;
    rationaleBits.push("This wording is partly qualitative/opinion-based.");
  }

  if (!hasWeb) {
    score -= 0.10;
    rationaleBits.push("No supporting web sources were available for corroboration.");
  }

  if (matches.length) {
    // stronger boost if the statement is specific
    score += numeric ? 0.28 : 0.22;
    rationaleBits.push("Corroborating sources were found.");
  } else {
    // if it reads as factual/specific but we can't corroborate, penalise
    score -= numeric ? 0.18 : 0.10;
    rationaleBits.push("No clear corroboration was found in the retrieved sources.");
  }

  score = clamp01(score);

  let implication = "";
  if (score >= 0.8) {
    implication = "Keep as-is. Ensure the linked sources remain current and relevant.";
  } else if (score >= 0.6) {
    implication = "Consider adding a direct citation or tightening specifics (who/what/when) to improve confidence.";
  } else {
    implication = "If this claim matters, add a supporting source or rephrase to reflect uncertainty/attribution.";
  }

  const rationale = rationaleBits.length
    ? rationaleBits.join(" ")
    : "Insufficient information to make a stronger assessment.";

  return { score, rationale, implication, sources: matches };
}

// Very lightweight consistency scan (phaseable)
function detectPotentialContradictions(statements) {
  if (!Array.isArray(statements) || statements.length < 2) return [];

  const nums = (t) => {
    const m = String(t || "").match(/\b\d+(?:[\.,]\d+)?\b/g);
    return Array.isArray(m) ? m.map((x) => x.replace(",", "")) : [];
  };

  const keyTokens = (t) => {
    const ts = tokens(t);
    return new Set(ts.slice(0, 8));
  };

  const pairs = [];
  for (let i = 0; i < statements.length; i++) {
    for (let j = i + 1; j < statements.length; j++) {
      const a = statements[i];
      const b = statements[j];
      const an = nums(a.text);
      const bn = nums(b.text);
      if (!an.length || !bn.length) continue;

      const aset = keyTokens(a.text);
      const bset = keyTokens(b.text);
      let shared = 0;
      for (const t of aset) if (bset.has(t)) shared++;
      if (shared < 2) continue;

      // numeric conflict if different numbers appear
      const aFirst = an[0];
      const bFirst = bn[0];
      if (aFirst && bFirst && aFirst !== bFirst) {
        pairs.push({ a: a.id, b: b.id, reason: "Potential numeric inconsistency" });
      }
    }
  }
  return pairs.slice(0, 25);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

        const versionId = typeof body.versionId === "string" ? body.versionId : "";

if (!draftText.trim()) {
      return res.status(400).json({ error: "Missing or invalid draftText" });
    }

    // Always-on web retrieval
    const cleanDraft = stripPlaceholders(draftText);
    const searchQuery = deriveQueryFromDraft(cleanDraft);
    const search = await tavilySearch({ query: searchQuery, maxResults: 6 });
    const webBlock = search.ok ? formatWebResultsForPrompt(search.results) : "";
    const webReferences = search.ok ? webResultsToReferences(search.results) : [];

    // User-provided sources (files/URLs) are treated as "uploaded" evidence for analysis.
    const uploadedSources = Array.isArray(req?.body?.sources) ? req.body.sources : [];
    const uploadedReferences = uploadedSources
      .map((s, i) => {
        const sid = typeof s?.id === "string" ? s.id : `upl_${i + 1}`;
        const name = typeof s?.name === "string" ? s.name : "Uploaded source";
        const url = typeof s?.url === "string" ? s.url : null;
        const raw = typeof s?.text === "string" ? s.text : "";
        const snippet = raw ? raw.slice(0, 700) : null;

        return {
          id: sid,
          sourceId: `upl:${sid}`,
          sourceType: "uploaded",
          title: name,
          url,
          snippet,
        };
      })
      .filter((r) => r && (r.snippet || r.url));

    const uploadedBlock = uploadedReferences.length
      ? uploadedReferences
          .map((r, idx) => {
            const n = idx + 1;
            const title = r.title || "Uploaded source";
            const urlLine = r.url ? `URL: ${r.url}` : "";
            const snippetLine = r.snippet ? `Snippet: ${r.snippet}` : "";
            return [`[U${n}] ${title}`, urlLine, snippetLine].filter(Boolean).join("\n").trim();
          })
          .join("\n\n")
      : "";

    const references = [...webReferences, ...uploadedReferences];

    // LLM extraction (statements only; no scoring)
    const systemPrompt = `
You are an expert analyst.

Task: extract verifiable factual statements from the draft.

Rules:
- Prefer statements that could, in principle, be checked against public sources.
- Skip pure opinions, marketing adjectives, and vague descriptions.
- Keep each statement atomic (one claim per statement).
- It is acceptable to return an empty list if the draft contains no clearly verifiable factual statements.

Return ONLY valid JSON:
{
  "statements": [
    { "text": string }
  ]
}
`.trim();

    const userPrompt = `
DRAFT:
${draftText}

UPLOADED SOURCES:
${uploadedBlock || "(no uploaded sources provided)"}

WEB RESULTS:
${webBlock || "(no web results retrieved)"}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.1,
      max_completion_tokens: 900,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};
    const extracted = normaliseExtractedStatements(parsed);

    if (!extracted.length) {
      return res.status(200).json({
        ok: true,
        status: "success_empty",
        versionId: String(versionId || ""),
        analysedAt: new Date().toISOString(),
        summary: {
          note: "No verifiable factual statements were detected in the provided text.",
        },
        statements: [],
        meta: {
          webSearch: {
            enabled: true,
            used: Boolean(search.ok && Array.isArray(webReferences) && webReferences.length),
            provider: "tavily",
            query: searchQuery,
            resultsCount: Array.isArray(webReferences) ? webReferences.length : 0,
            error: search.ok ? null : search.error || "Web search failed",
          },
          consistency: { contradictions: [] },
        },
      });
    }


    const contradictions = detectPotentialContradictions(extracted);

// Index contradictions by statement id for row-level detail.
const contradictionsById = new Map();
for (const c of contradictions) {
  if (!c) continue;
  const a = String(c.a || "");
  const b = String(c.b || "");
  if (a) contradictionsById.set(a, [...(contradictionsById.get(a) || []), c]);
  if (b) contradictionsById.set(b, [...(contradictionsById.get(b) || []), c]);
}

const scored = extracted.map((s) => {
  const scoredOne = scoreOneStatement(s.text, references);
  const reliabilityScore = Math.round(clamp01(scoredOne.score) * 100);
  const reliabilityLevel = pctToReliabilityLevel(reliabilityScore);

  const matches = Array.isArray(scoredOne.sources) ? scoredOne.sources : [];
  const evidence = matches.map((m) => {
    const ref = m?.ref || {};
    return {
      sourceId: ref.sourceId || (ref.id ? `web:ref:${ref.id}` : "unknown"),
      sourceType: ref.sourceType || "web",
      title: typeof ref.title === "string" ? ref.title : null,
      url: typeof ref.url === "string" ? ref.url : null,
      snippet: typeof ref.snippet === "string" ? ref.snippet : null,
    };
  });

  const rowContradictions = contradictionsById.get(String(s.id)) || [];

  const assessment = [
    typeof scoredOne.rationale === "string" ? scoredOne.rationale.trim() : "",
    typeof scoredOne.implication === "string" ? scoredOne.implication.trim() : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const signals = buildSignalsForStatement({
    text: s.text,
    reliabilityScore,
    evidenceCount: evidence.length,
    contradictionsCount: rowContradictions.length,
  });

  return {
    id: String(s.id),
    text: s.text,
    reliabilityScore,
    reliabilityLevel,
    signals,
    assessment,
    evidence,
    contradictions: rowContradictions,
  };
});

const noteBits = [];
if (!search.ok) {
  noteBits.push("Web search was unavailable. Results may be less reliable.");
}
if (contradictions.length) {
  noteBits.push(
    `Potential internal inconsistencies detected (${contradictions.length}). Review related claims for alignment.`
  );
}
const summaryNote = noteBits.length ? noteBits.join(" ") : null;

return res.status(200).json({
      ok: true,
      status: scored.length ? "success" : "success_empty",
      versionId: String(versionId || ""),
      analysedAt: new Date().toISOString(),
      summary: {
        note: summaryNote,
      },
      statements: scored,
      meta: {
        webSearch: {
          enabled: true,
          used: Boolean(search.ok && Array.isArray(webReferences) && webReferences.length),
          provider: "tavily",
          query: searchQuery,
          resultsCount: Array.isArray(webReferences) ? webReferences.length : 0,
          error: search.ok ? null : search.error || "Web search failed",
        },
        consistency: {
          contradictions,
        },
      },
    });
  } catch (err) {
    // Genuine system failure: return error.
    return res.status(500).json({
      ok: false,
      status: "failed",
      error: "Statement analysis failed",
      versionId: String(req?.body?.versionId || ""),
      analysedAt: new Date().toISOString(),
      summary: { note: "Statement analysis failed. Please try again." },
      statements: [],
      meta: {
        webSearch: {
          enabled: true,
          used: false,
          provider: "tavily",
          query: deriveQueryFromDraft(req?.body?.draftText || ""),
          resultsCount: 0,
          error: "Failed",
        },
      },
    });
  }
}
