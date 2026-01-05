// api/analyse-statements.js
//
// Statement analysis endpoint (Review).

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "../lib/web.js";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Extract first valid JSON from raw text (handles markdown/prose wrappers)
function extractFirstJson(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  
  // Try direct parse first
  const direct = safeJsonParse(raw);
  if (direct) return direct;
  
  // Find first { or [
  const firstBrace = raw.indexOf("{");
  const firstBracket = raw.indexOf("[");
  
  let start = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket;
  }
  
  if (start === -1) return null;
  
  // Try to find matching closing brace/bracket
  const openChar = raw[start];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let end = start;
  
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === openChar) depth++;
    else if (raw[i] === closeChar) {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  
  if (depth !== 0) return null; // Unmatched brackets
  
  const candidate = raw.substring(start, end);
  return safeJsonParse(candidate);
}

// Coerce and validate statements array to match schema
function coerceStatements(parsed, maxRefIndex) {
  if (!parsed || typeof parsed !== "object") return [];
  
  let statements = Array.isArray(parsed.statements) ? parsed.statements : [];
  if (statements.length === 0) return [];
  
  const maxRef = typeof maxRefIndex === "number" && maxRefIndex > 0 ? maxRefIndex : 0;
  const normalized = new Map(); // For deduplication
  
  const coerced = [];
  
  for (const stmt of statements) {
    if (!stmt || typeof stmt !== "object") continue;
    
    // Extract and validate text
    const text = typeof stmt.text === "string" ? stmt.text.trim() : "";
    if (!text || text.length === 0) continue;
    
    // Normalize for deduplication (lowercase, strip punctuation, collapse whitespace)
    const normalizedKey = text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    if (normalized.has(normalizedKey)) continue; // Skip duplicate
    normalized.set(normalizedKey, true);
    
    // Coerce assessment
    const assessment = stmt.assessment || {};
    let reliabilityScore = typeof assessment.reliabilityScore === "number" 
      ? Math.max(0, Math.min(100, assessment.reliabilityScore))
      : 30; // Default to 30 if missing
    
    // Derive label from score if missing
    let reliabilityLabel = typeof assessment.reliabilityLabel === "string"
      ? assessment.reliabilityLabel
      : reliabilityScore >= 80 ? "High" : reliabilityScore >= 60 ? "Medium" : "Low";
    
    // Ensure label is valid
    if (!["High", "Medium", "Low"].includes(reliabilityLabel)) {
      reliabilityLabel = reliabilityScore >= 80 ? "High" : reliabilityScore >= 60 ? "Medium" : "Low";
    }
    
    // Coerce reasons (array of up to 4 non-empty strings)
    let reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    reasons = reasons
      .filter((r) => typeof r === "string" && r.trim().length > 0)
      .slice(0, 4)
      .map((r) => r.trim());
    
    // Coerce citations (integers within 1..maxRefIndex only)
    let citations = Array.isArray(assessment.citations) ? assessment.citations : [];
    citations = citations
      .filter((c) => typeof c === "number" && Number.isInteger(c) && c >= 1 && c <= maxRef)
      .sort((a, b) => a - b);
    
    coerced.push({
      text,
      assessment: {
        reliabilityScore,
        reliabilityLabel,
        reasons: reasons.length > 0 ? reasons : ["No specific assessment provided."],
        citations,
      },
    });
    
    // Cap at 25 statements
    if (coerced.length >= 25) break;
  }
  
  return coerced;
}

// Fallback extraction when model fails
function fallbackExtractAtomicStatements(draftText) {
  if (typeof draftText !== "string" || !draftText.trim()) return [];
  
  // Split into sentences (period, newline, or exclamation/question marks)
  const sentences = draftText
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10); // Filter very short fragments
  
  const statements = [];
  const seen = new Set();
  
  // Factual anchor patterns
  const hasFactualAnchor = (text) => {
    return (
      /\b(19|20)\d{2}\b/.test(text) || // Years
      /[$£€¥]\s*[\d,]+/.test(text) || // Currency
      /\b\d+(?:\.\d+)?\s*%/.test(text) || // Percentages
      /\b(nyse|nasdaq|tsx|lse|hkex|asx)\b/i.test(text) || // Exchanges
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text) // Months
    );
  };
  
  // Split compound sentences conservatively
  const splitCompound = (text) => {
    const parts = [];
    // Split on semicolons, " and ", " but " (conservative)
    const separators = /;\s*|,\s+and\s+|,\s+but\s+/i;
    if (separators.test(text)) {
      const split = text.split(separators);
      parts.push(...split.map((p) => p.trim()).filter((p) => p.length > 10));
    } else {
      parts.push(text);
    }
    return parts;
  };
  
  for (const sentence of sentences) {
    // Prefer sentences with factual anchors
    if (hasFactualAnchor(sentence)) {
      const parts = splitCompound(sentence);
      for (const part of parts) {
        if (part.length < 10) continue;
        const normalized = part.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        
        statements.push({
          text: part,
          assessment: {
            reliabilityScore: 25,
            reliabilityLabel: "Low",
            reasons: ["Auto-extracted from the draft due to analysis degradation; no supporting source (uploaded or web) was confirmed."],
            citations: [],
          },
        });
        
        if (statements.length >= 12) break;
      }
    }
    
    if (statements.length >= 12) break;
  }
  
  // If we still don't have enough, add non-anchored sentences
  if (statements.length < 12) {
    for (const sentence of sentences) {
      if (hasFactualAnchor(sentence)) continue; // Already processed
      
      const parts = splitCompound(sentence);
      for (const part of parts) {
        if (part.length < 15) continue; // Slightly longer for non-anchored
        const normalized = part.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        
        statements.push({
          text: part,
          assessment: {
            reliabilityScore: 25,
            reliabilityLabel: "Low",
            reasons: ["Auto-extracted from the draft due to analysis degradation; no supporting source (uploaded or web) was confirmed."],
            citations: [],
          },
        });
        
        if (statements.length >= 12) break;
      }
      
      if (statements.length >= 12) break;
    }
  }
  
  return statements;
}

// Detect if a statement contains anchor facts (years, dates, percentages, currency, exchanges)
function isAnchorFact(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  
  // Compiled regexes (declare once for efficiency)
  const yearPattern = /\b(19|20)\d{2}\b/;
  const monthPattern = /\b(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|Jun(e)?|Jul(y)?|Aug(ust)?|Sep(tember)?|Sept|Oct(ober)?|Nov(ember)?|Dec(ember)?)\b/i;
  const percentPattern = /\d+(\.\d+)?\s*%|\b(percent|percentage)\b/i;
  const currencySymbolPattern = /[$£€¥]/;
  const currencyCodePattern = /\b(USD|SGD|EUR|GBP|AUD|CAD|JPY|CNY|RMB)\b/i;
  const bigNumberPattern = /\b[\d,]+(?:\.\d+)?\s*(?:million|billion|trillion|m|b|t|k)\b/i;
  const exchangePattern = /\b(NYSE|NASDAQ|LSE|ASX|HKEX|SGX|TSX|SIX|Euronext)\b/i;
  // Conservative ticker pattern: only when preceded by ticker keyword or in parentheses like (NYSE: SHOP)
  const tickerPattern = /\b(ticker|symbol|listed|trades)\s+[A-Z]{1,5}\b|\([A-Z]{1,5}\)|\([A-Z]{2,5}:\s*[A-Z]{1,5}\)/i;
  
  return (
    yearPattern.test(text) ||
    monthPattern.test(text) ||
    percentPattern.test(text) ||
    currencySymbolPattern.test(text) ||
    currencyCodePattern.test(text) ||
    bigNumberPattern.test(text) ||
    exchangePattern.test(text) ||
    tickerPattern.test(text)
  );
}

// Apply anchor-fact gating: force Low if anchor fact has no citations
function applyAnchorGating(statements) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    const citations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const hasCitations = citations.length > 0;
    const isAnchor = isAnchorFact(text);
    
      // If anchor fact AND no citations: force Low
      // Citations can be from either uploaded sources or web references
      if (isAnchor && !hasCitations) {
        const existingScore = typeof assessment.reliabilityScore === "number" 
          ? assessment.reliabilityScore 
          : 30;
        const forcedScore = Math.min(existingScore, 35);
        
        let reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
        const anchorReason = "Anchor fact requires a supporting source (uploaded or web); none was cited for this version.";
        
        // Prepend anchor reason if not already present
        if (!reasons.some((r) => r && r.includes("Anchor fact requires"))) {
          reasons = [anchorReason, ...reasons].slice(0, 4); // Cap at 4
        }
        
        return {
          ...stmt,
          assessment: {
            ...assessment,
            reliabilityLabel: "Low",
            reliabilityScore: forcedScore,
            reasons: reasons.length > 0 ? reasons : [anchorReason],
            citations: [], // Ensure empty
          },
        };
      }
    
    // If NOT anchor fact AND no citations: add neutral reason if empty, but don't force Low
    if (!isAnchor && !hasCitations) {
      let reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
      if (reasons.length === 0) {
        reasons = ["No supporting source was cited; assess based on internal consistency and draft context."];
      }
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reasons: reasons.slice(0, 4), // Cap at 4
        },
      };
    }
    
    // If anchor fact AND has citations: leave as-is
    // If not anchor fact AND has citations: leave as-is
    return stmt;
  });
}

// Detect if reasons indicate strong unverifiability (blocks Medium calibration)
// Only strong signals that indicate the claim cannot be validated, not merely uncited
function isUncertaintyReason(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) return false;
  
  // Strong unverifiability keywords only (exclude generic "no supporting source" etc.)
  const strongUnverifiabilityKeywords = [
    "unnamed",
    "not identified",
    "no identifying details",
    "cannot verify",
    "cannot be verified",
    "not verifiable",
    "cannot corroborate",
    "unverifiable",
    "insufficient information",
    "cannot be validated",
    "cannot be confirmed",
    "no way to verify",
  ];
  
  const reasonsText = reasons
    .filter((r) => typeof r === "string")
    .join(" ")
    .toLowerCase();
  
  return strongUnverifiabilityKeywords.some((keyword) => reasonsText.includes(keyword));
}

// Calibrate non-anchor statements: allow Medium for uncited synthesis unless uncertain
function applyNonAnchorCalibration(statements) {
  if (!Array.isArray(statements)) return statements;
  
  return statements.map((stmt) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const assessment = stmt.assessment || {};
    const citations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    const hasCitations = citations.length > 0;
    const isAnchor = isAnchorFact(text);
    const isUncertain = isUncertaintyReason(reasons);
    
    // Skip anchor facts (already handled by A2.1 gating)
    if (isAnchor) return stmt;
    
    // Skip statements with citations (respect model scoring)
    if (hasCitations) return stmt;
    
    // Only process non-anchor, uncited statements
    let score = typeof assessment.reliabilityScore === "number"
      ? Math.max(0, Math.min(100, assessment.reliabilityScore))
      : 30;
    let label = typeof assessment.reliabilityLabel === "string"
      ? assessment.reliabilityLabel
      : score >= 80 ? "High" : score >= 60 ? "Medium" : "Low";
    
    if (isUncertain) {
      // Keep Low if uncertain (do not inflate)
      if (score > 35) {
        score = 35;
        label = "Low";
      }
    } else {
      // Not uncertain: raise to Medium default if too low
      if (score < 55) {
        score = 65;
        label = "Medium";
      } else if (score >= 60 && label !== "High" && label !== "Medium") {
        // Ensure label matches score if already in Medium/High range
        label = score >= 80 ? "High" : "Medium";
      }
      
      // Add calibrated note only if reasons are empty
      let updatedReasons = [...reasons];
      if (updatedReasons.length === 0) {
        updatedReasons = ["No supporting source was cited; assessment reflects internal consistency of the draft."];
      }
      updatedReasons = updatedReasons.slice(0, 4); // Cap at 4
      
      return {
        ...stmt,
        assessment: {
          ...assessment,
          reliabilityScore: score,
          reliabilityLabel: label,
          reasons: updatedReasons,
        },
      };
    }
    
    // If uncertain, return with adjusted score/label
    return {
      ...stmt,
      assessment: {
        ...assessment,
        reliabilityScore: score,
        reliabilityLabel: label,
      },
    };
  });
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: "Server is missing OPENAI_API_KEY" });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const versionId = typeof body.versionId === "string" ? body.versionId : null;
    const sources = Array.isArray(body.sources) ? body.sources : [];
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";

    if (!draftText.trim()) return res.status(400).json({ error: "Missing draftText" });

    // Format uploaded sources for prompt (version-scoped)
    const uploadedSources = sources.map((s) => ({
      id: s?.id || null,
      name: s?.name || s?.title || "Untitled source",
      text: s?.text || "",
      kind: s?.kind || s?.sourceType || "file",
      url: s?.url || null,
    }));

    // Build uploaded sources context for prompt
    let uploadedSourcesBlock = "";
    if (uploadedSources.length > 0) {
      const sourcesList = uploadedSources.map((s, idx) => {
        const name = s.name || "Untitled source";
        const text = s.text || "";
        const excerpt = text.length > 2000 ? text.substring(0, 2000) + "..." : text;
        return `[UPLOADED ${idx + 1}] ${name}\n${excerpt || "(no text content)"}`;
      }).join("\n\n");
      uploadedSourcesBlock = sourcesList;
    } else {
      uploadedSourcesBlock = "(none)";
    }

    // Analysis always uses web search
    // Force publicSearch = true regardless of client request (publicSearch from body is ignored)
    const publicSearch = true;
    const query = deriveQueryFromDraft(draftText);
    
    let search = { ok: false, results: [] };
    let webBlock = "";
    let webReferences = [];
    
    try {
      search = await tavilySearch({ query, maxResults: 6 });
      webBlock = formatWebResultsForPrompt(search);
      webReferences = webResultsToReferences(search?.results || []);
    } catch (searchErr) {
      // Continue with empty web results - analysis can still proceed
      search = { ok: false, results: [], error: searchErr?.message };
      webBlock = "(none)";
      webReferences = [];
    }

    // Create unified references list: uploaded first, then web
    // Uploaded references get IDs 1..N, web references get IDs (N+1)..(N+M)
    const uploadedReferences = uploadedSources.map((s, idx) => ({
      id: idx + 1,
      title: s.name || "Untitled source",
      url: s.url || null,
      type: "uploaded",
    }));

    const webRefStartId = uploadedReferences.length + 1;
    const webReferencesWithIds = webReferences.map((ref, idx) => ({
      ...ref,
      id: webRefStartId + idx,
      type: "web",
    }));

    const unifiedReferences = [...uploadedReferences, ...webReferencesWithIds];
    const maxRefIndex = unifiedReferences.length;

    const system = `
You are the "Review" engine inside Content Engine.

EXTRACTION RULES (CRITICAL):
- Extract ONLY atomic factual statements (verifiable claims).
- Exclude: opinions, hype/marketing fluff, recommendations, predictions, vague assertions.
- Split compound multi-claim sentences into separate statements.
- Minimal rewriting: keep statements close to draft wording.
- Deduplicate near-duplicates.

ATTRIBUTION RULES (HYBRID):
- Statements may be supported by EITHER uploaded sources OR web sources (or both).
- Uploaded sources are authoritative for memo facts and internal claims.
- Web sources provide external verification and public information.
- Synthesis is allowed if supported by uploaded sources OR web sources (citable with [n]).
- Numeric paraphrase allowed if consistent with uploaded sources OR web sources (citable).
- Anchor facts (years/dates, exchange/tickers, specific numbers) REQUIRE at least ONE citation [n] to either an uploaded source or a web reference.
- If a claim cannot be cited to any source (uploaded or web):
  - Set citations: []
  - For anchor facts: Set reliabilityLabel: "Low", reliabilityScore: 20-35
  - Include in reasons: "No supporting source found for this claim."
- Statements supported by uploaded sources alone (no web citations) can still be scored High/Medium if directly supported.

CITATIONS:
- Use bracket citations [1], [2], ... referencing the unified REFERENCES list (uploaded sources first, then web references).
- Citations must be integers within the range 1..${maxRefIndex}${uploadedReferences.length > 0 ? ` (where 1..${uploadedReferences.length} are uploaded sources${webReferencesWithIds.length > 0 ? `, ${uploadedReferences.length + 1}..${maxRefIndex} are web references` : ''})` : ''}.
- If no sources are available, do not invent sources; set citations: [] and mark appropriately.
- Do NOT invent citations.

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact schema:
{
  "statements": [
    {
      "text": "string (atomic factual statement)",
      "assessment": {
        "reliabilityScore": number (0-100),
        "reliabilityLabel": "High|Medium|Low",
        "reasons": ["string", ...] (up to 4 reasons),
        "citations": [1,2] (array of integers, empty if unsupported)
      }
    }
  ]
}

If no extractable statements are found, return: {"statements": []}
`.trim();

    const user = `
DRAFT:
${draftText}

UPLOADED SOURCES (used for this version):
${uploadedSourcesBlock}

UPLOADED REFERENCES:
${
  uploadedReferences.length > 0
    ? uploadedReferences.map((r) => `[${r.id}] ${r.title}${r.url ? ` — ${r.url}` : ""}`).join("\n")
    : "(none)"
}

WEB RESULTS:
${webBlock || "(none)"}

WEB REFERENCES:
${
  webReferencesWithIds.length > 0
    ? webReferencesWithIds.map((r) => `[${r.id}] ${r.title} — ${r.url}`).join("\n")
    : "(none)"
}

ALL REFERENCES (unified, for citation):
${
  unifiedReferences.length > 0
    ? unifiedReferences.map((r) => `[${r.id}] ${r.title}${r.url ? ` — ${r.url}` : ""} (${r.type})`).join("\n")
    : "(none)"
}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    
    // Extract JSON robustly
    let parsed = extractFirstJson(raw);
    let extractionQuality = "ok";
    
    // Coerce and validate statements (using unified references count)
    let statements = coerceStatements(parsed, maxRefIndex);
    
    // Graceful fallback if model output is invalid or empty
    if (statements.length === 0) {
      statements = fallbackExtractAtomicStatements(draftText);
      extractionQuality = "degraded";
    }
    
    // Apply anchor-fact gating (post-pass): force Low if anchor facts lack citations
    statements = applyAnchorGating(statements);
    
    // Apply non-anchor calibration: allow Medium for uncited synthesis unless uncertain
    statements = applyNonAnchorCalibration(statements);

    return res.status(200).json({
      ok: true,
      statements,
      references: unifiedReferences,
      meta: {
        webSearch: { enabled: true, used: Boolean(search?.ok && (search?.results || []).length) },
        extractionQuality,
        uploadedSourcesCount: uploadedReferences.length,
        webSourcesCount: webReferencesWithIds.length,
      },
    });
  } catch (err) {
    // Graceful degradation: even on error, return valid JSON with fallback statements
    try {
      const fallbackStatements = fallbackExtractAtomicStatements(
        typeof req.body === "string" ? safeJsonParse(req.body)?.draftText || "" : req.body?.draftText || ""
      );
      
      // Apply anchor-fact gating and calibration to fallback statements too
      const gatedFallbackStatements = applyAnchorGating(fallbackStatements);
      const calibratedFallbackStatements = applyNonAnchorCalibration(gatedFallbackStatements);
      
      // In fallback, try to get sources from body if available
      const fallbackBody = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
      const fallbackSources = Array.isArray(fallbackBody.sources) ? fallbackBody.sources : [];
      const fallbackUploadedReferences = fallbackSources.map((s, idx) => ({
        id: idx + 1,
        title: s?.name || s?.title || "Untitled source",
        url: s?.url || null,
        type: "uploaded",
      }));

      return res.status(200).json({
        ok: true,
        statements: calibratedFallbackStatements,
        references: fallbackUploadedReferences,
        meta: {
          webSearch: { enabled: true, used: false },
          extractionQuality: "degraded",
          uploadedSourcesCount: fallbackUploadedReferences.length,
          webSourcesCount: 0,
        },
      });
    } catch (fallbackErr) {
      // Last resort: return empty but valid response
      return res.status(200).json({
        ok: true,
        statements: [],
        references: [],
        meta: {
          webSearch: { enabled: true, used: false },
          extractionQuality: "degraded",
          uploadedSourcesCount: 0,
          webSourcesCount: 0,
        },
      });
    }
  }
}
