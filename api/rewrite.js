// api/rewrite.js
//
// Rewrites an existing draft.
// Web search behaviour:
// - publicSearch === true: enrich with web search results
// - publicSearch === false: do not retrieve from web

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "../lib/web.js";
import {
  normalizeOutputType,
  normalizeVisibility,
  buildOutputIntent,
  getPromptGuidance,
  getOutputTypeLabel,
} from "../lib/output-intent.js";
import {
  normalizeEventType,
  getEventTypeLabel,
  getEventTypeFraming,
} from "../lib/event-type.js";
import { buildBasePrompt, detectRewriteClash } from "../lib/prompt-library/index.js";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normalizeBannedWords(input) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((word) => (typeof word === "string" ? word.trim().toLowerCase() : ""))
        .filter(Boolean)
    )
  );
}

// X3.1: Deterministic metrics for rewrite report
function countWords(text) {
  if (typeof text !== "string" || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countChars(text) {
  if (typeof text !== "string") return 0;
  return text.length;
}

// A5.13: Guards against low-signal instructions (e.g. "asdf")
// so the model does not invent behavior from meaningless input.
function normalizeRewriteInstructions(raw) {
  if (!raw || typeof raw !== "string") {
    return { text: "", ignored: false, reason: null };
  }

  const trimmed = raw.trim();

  if (!trimmed) {
    return { text: "", ignored: false, reason: null };
  }

  const alphaCount = (trimmed.match(/[a-zA-Z]/g) || []).length;
  const uniqueChars = new Set(trimmed).size;

  const looksGibberish =
    trimmed.length >= 6 &&
    alphaCount / trimmed.length < 0.6 &&
    uniqueChars < Math.min(4, trimmed.length);

  const shortWhitelist = [
    "shorter",
    "tighten",
    "expand",
    "clarify",
    "polish",
    "simplify",
  ];

  const isWhitelistedShort =
    trimmed.length <= 10 &&
    shortWhitelist.includes(trimmed.toLowerCase());

  if (looksGibberish && !isWhitelistedShort) {
    return {
      text: "",
      ignored: true,
      reason:
        "Instructions appeared to be low-signal placeholder text and were ignored.",
    };
  }

  return { text: trimmed, ignored: false, reason: null };
}

// Detect voice override in user instructions (Notes or Rewrite instructions)
function detectVoiceOverride(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  
  const lower = text.toLowerCase();
  
  // Check for explicit voice instructions
  const firstPersonPatterns = [
    /\b(use|write in|write|employ|adopt)\s+(first[\s-]?person|I|we|our|us)\b/,
    /\bfirst[\s-]?person\b/,
    /\buse\s+(I|we|our|us)\b/,
  ];
  
  const secondPersonPatterns = [
    /\b(use|write in|write|employ|adopt)\s+(second[\s-]?person|you|your)\b/,
    /\bsecond[\s-]?person\b/,
    /\buse\s+(you|your)\b/,
  ];
  
  const thirdPersonPatterns = [
    /\b(use|write in|write|employ|adopt)\s+(third[\s-]?person|it|they|them|their)\b/,
    /\bthird[\s-]?person\b/,
  ];
  
  // Check in order: explicit third-person override, then first, then second
  for (const pattern of thirdPersonPatterns) {
    if (pattern.test(lower)) return "third";
  }
  
  for (const pattern of firstPersonPatterns) {
    if (pattern.test(lower)) return "first";
  }
  
  for (const pattern of secondPersonPatterns) {
    if (pattern.test(lower)) return "second";
  }
  
  return null; // No override detected, use default (third-person)
}

// Extract citation numbers from text (e.g., [1], [2] -> [1, 2])
function extractCitations(text) {
  if (typeof text !== "string") return [];
  const citationPattern = /\[(\d+)\]/g;
  const citations = new Set();
  let match;
  while ((match = citationPattern.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (num > 0) citations.add(num);
  }
  return Array.from(citations).sort((a, b) => a - b);
}

// Helper: Normalize number token (e.g., "5.2m" -> 5200000)
function normalizeNumberToken(str) {
  if (typeof str !== "string") return null;
  const cleaned = str.replace(/[,\s]/g, "").toLowerCase();
  const match = cleaned.match(/^([\d.]+)([kmbt]?)$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = match[2];
  if (!Number.isFinite(num)) return null;
  const multipliers = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
  return num * (multipliers[unit] || 1);
}

// Helper: Parse currency and large number mentions from text
function parseCurrencyMentions(text) {
  if (typeof text !== "string") return [];
  const mentions = [];
  
  // Patterns: $5.2m, USD 5m, S$5m, £5m, €5m, $700B, 700 billion, 0.7T
  // Pattern 1: Currency symbols with numbers ($5.2m, £5m, €5m)
  const symbolPattern = /([$£€¥])\s*([\d,]+(?:\.\d+)?)\s*([kmbt]?)\b/gi;
  let match;
  while ((match = symbolPattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const numStr = match[2];
    const unit = (match[3] || "").toLowerCase();
    const value = normalizeNumberToken(numStr + unit);
    if (value === null) continue;
    
    const start = Math.max(0, match.index - 30);
    const end = Math.min(text.length, match.index + match[0].length + 30);
    const context = text.substring(start, end).toLowerCase();
    const approxKind = detectApproxKind(context);
    
    mentions.push({
      raw: fullMatch,
      value: value,
      unit: unit || "",
      approxKind: approxKind,
      context: match.index,
    });
  }
  
  // Pattern 2: Currency codes with numbers (USD 5m, SGD 5m)
  const codePattern = /\b(USD|SGD|GBP|EUR|JPY|AUD|CAD)\s+([\d,]+(?:\.\d+)?)\s*([kmbt]?)\b/gi;
  while ((match = codePattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const numStr = match[2];
    const unit = (match[3] || "").toLowerCase();
    const value = normalizeNumberToken(numStr + unit);
    if (value === null) continue;
    
    const start = Math.max(0, match.index - 30);
    const end = Math.min(text.length, match.index + match[0].length + 30);
    const context = text.substring(start, end).toLowerCase();
    const approxKind = detectApproxKind(context);
    
    mentions.push({
      raw: fullMatch,
      value: value,
      unit: unit || "",
      approxKind: approxKind,
      context: match.index,
    });
  }
  
  // Pattern 3: Plain large numbers with units (700 billion, 0.7T)
  const unitMap = { thousand: "k", million: "m", billion: "b", trillion: "t" };
  const plainPattern = /\b([\d,]+(?:\.\d+)?)\s+(thousand|million|billion|trillion|k|m|b|t)\b/gi;
  while ((match = plainPattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const numStr = match[1];
    const unit = (match[2] || "").toLowerCase();
    const normalizedUnit = unitMap[unit] || unit;
    const value = normalizeNumberToken(numStr + normalizedUnit);
    if (value === null) continue;
    
    const start = Math.max(0, match.index - 30);
    const end = Math.min(text.length, match.index + match[0].length + 30);
    const context = text.substring(start, end).toLowerCase();
    const approxKind = detectApproxKind(context);
    
    mentions.push({
      raw: fullMatch,
      value: value,
      unit: normalizedUnit || "",
      approxKind: approxKind,
      context: match.index,
    });
  }
  
  return mentions;
}

// Helper: Detect approximation kind from context
function detectApproxKind(context) {
  if (/\b(close to|nearly)\b/.test(context)) {
    return "close_to";
  } else if (/(about|around|roughly|approximately|~)/.test(context)) {
    return "approx";
  } else if (/(more than|over|at least|above)/.test(context)) {
    return "more_than";
  } else if (/(less than|under|at most|below)/.test(context)) {
    return "less_than";
  } else if (/(between|from|to|-|–|—)/.test(context)) {
    const rangeMatch = context.match(/([\d,]+(?:\.\d+)?)\s*(?:-|–|—|to)\s*([\d,]+(?:\.\d+)?)/);
    if (rangeMatch) {
      return "range";
    }
  }
  return "exact";
}

// Helper: Extract all numeric values from text (currency + plain large numbers)
function extractNumericValues(text) {
  if (typeof text !== "string") return [];
  const values = [];
  
  // Extract currency mentions
  const currencyMentions = parseCurrencyMentions(text);
  values.push(...currencyMentions.map((m) => m.value));
  
  // Extract plain large numbers (>= 10,000)
  const largeNumberPattern = /\b([\d,]+(?:\.\d+)?)\b/g;
  let match;
  while ((match = largeNumberPattern.exec(text)) !== null) {
    const numStr = match[1].replace(/,/g, "");
    const num = parseFloat(numStr);
    if (Number.isFinite(num) && num >= 10000) {
      values.push(num);
    }
  }
  
  return [...new Set(values)].sort((a, b) => a - b);
}

// Helper: Check if draft numeric claim is supported by uploaded context
function isNumericClaimSupported(draftMention, uploadedValues) {
  if (!Array.isArray(uploadedValues) || uploadedValues.length === 0) return false;
  if (!draftMention || typeof draftMention.value !== "number") return false;
  
  const draftValue = draftMention.value;
  const approxKind = draftMention.approxKind || "exact";
  
  for (const uploadedValue of uploadedValues) {
    if (typeof uploadedValue !== "number" || !Number.isFinite(uploadedValue)) continue;
    
    // Exact match
    if (draftValue === uploadedValue) return true;
    
    // Approximation tolerance
    if (approxKind === "approx") {
      // ±10% relative for amounts >= 10,000; ±2% for >= 100 million
      const threshold = uploadedValue >= 100_000_000 ? 0.02 : 0.10;
      const diff = Math.abs(draftValue - uploadedValue);
      const relativeDiff = diff / Math.max(uploadedValue, 1);
      if (relativeDiff <= threshold) return true;
      
      // Special: rounding to clean figures (e.g., $5.2m -> ~$5m)
      // If draft is a clean round number, use adjusted tolerance based on value size
      const isCleanRound = draftValue % (draftValue >= 1e9 ? 1e9 : draftValue >= 1e6 ? 1e6 : 1e3) === 0;
      if (isCleanRound) {
        const cleanRoundThreshold = draftValue < 100_000 ? 0.15 : 0.11; // ±15% for < 100k, ±11% otherwise
        if (relativeDiff <= cleanRoundThreshold) return true;
      }
    } else if (approxKind === "close_to") {
      // ±5% relative
      const diff = Math.abs(draftValue - uploadedValue);
      const relativeDiff = diff / Math.max(uploadedValue, 1);
      if (relativeDiff <= 0.05) return true;
    } else if (approxKind === "more_than") {
      // uploaded >= draft
      if (uploadedValue >= draftValue) return true;
    } else if (approxKind === "less_than") {
      // uploaded <= draft
      if (uploadedValue <= draftValue) return true;
    } else if (approxKind === "range") {
      // For ranges, we'd need to parse the range bounds
      // For now, check if uploaded is within ±20% of draft
      const diff = Math.abs(draftValue - uploadedValue);
      const relativeDiff = diff / Math.max(uploadedValue, 1);
      if (relativeDiff <= 0.20) return true;
    }
  }
  
  return false;
}

// Hybrid detection: flag only genuine uncited factual claims, not paraphrase
// Returns { unattributedEnrichment: boolean, notes: string|null, indicators: string[] }
function detectUnattributedEnrichment(draftText, webEnabled, usedReferenceIds, uploadedSources) {
  // If web not enabled or citations exist, no flag
  if (!webEnabled || usedReferenceIds.length > 0) {
    return { unattributedEnrichment: false, notes: null, indicators: [] };
  }

  // Build uploaded context string for comparison
  const uploadedContext = Array.isArray(uploadedSources)
    ? uploadedSources
        .map((s) => {
          if (typeof s === "string") return s;
          if (s && typeof s === "object") {
            return [s.name, s.title, s.url, s.content, s.text, s.snippet]
              .filter((x) => typeof x === "string")
              .join(" ");
          }
          return "";
        })
        .join(" ")
        .toLowerCase()
    : "";

  const draftLower = (typeof draftText === "string" ? draftText : "").toLowerCase();
  const indicators = [];
  const candidateFacts = [];

  // 1. Detect years/dates
  const yearPattern = /\b(19|20)\d{2}\b/g;
  const dateKeywords = /\b(ipo|acquired|founded|headquartered|established|launched|announced)\b/gi;
  const monthNames = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;

  let match;
  while ((match = yearPattern.exec(draftText)) !== null) {
    const year = match[0];
    if (!uploadedContext.includes(year)) {
      candidateFacts.push({ type: "year", value: year, context: match.index });
    }
  }

  if (dateKeywords.test(draftText) || monthNames.test(draftText)) {
    const hasDateContext = dateKeywords.test(uploadedContext) || monthNames.test(uploadedContext);
    if (!hasDateContext) {
      candidateFacts.push({ type: "date_keyword", value: "date-related keyword" });
    }
  }

  // 2. Detect ticker/exchange patterns
  const exchangePattern = /\b(nyse|nasdaq|tsx|lse|hkex|asx)\s*:?\s*([A-Z]{1,5})\b/gi;
  const tickerPattern = /\b([A-Z]{1,5})\s*(?:on|listed on|trades on)\s*(nyse|nasdaq|tsx|lse|hkex|asx)\b/gi;

  if (exchangePattern.test(draftText) || tickerPattern.test(draftText)) {
    const hasExchangeContext = /(nyse|nasdaq|tsx|lse|hkex|asx)/i.test(uploadedContext);
    if (!hasExchangeContext) {
      candidateFacts.push({ type: "ticker", value: "exchange/ticker" });
    }
  }

  // 3. Detect large numbers / currency / percentages
  const currencyPattern = /\$\s*[\d,]+(?:\.[\d]{2})?\s*(?:billion|million|thousand)?/gi;
  const percentPattern = /\b(\d+(?:\.\d+)?)\s*%/g;
  const largeNumberPattern = /\b[\d,]+(?:\.[\d]+)?\s*(?:billion|million|thousand)\b/gi;

  // Check percentages with numeric paraphrase tolerance
  while ((match = percentPattern.exec(draftText)) !== null) {
    const percent = parseFloat(match[1]);
    const percentStr = match[0];
    const beforeMatch = draftText.substring(Math.max(0, match.index - 50), match.index).toLowerCase();
    const hasApproximation = /(about|around|roughly|approximately|close to|more than|less than|~|nearly|over|under)/.test(beforeMatch);

    // Check if exact value exists in uploaded context
    if (uploadedContext.includes(percentStr.toLowerCase()) || uploadedContext.includes(match[1])) {
      continue; // Supported
    }

    // Check numeric approximation tolerance
    if (hasApproximation) {
      // Extract nearby percentages from uploaded context
      const uploadedPercentPattern = /\b(\d+(?:\.\d+)?)\s*%/g;
      const uploadedPercents = [];
      let upMatch;
      while ((upMatch = uploadedPercentPattern.exec(uploadedContext)) !== null) {
        uploadedPercents.push(parseFloat(upMatch[1]));
      }

      // Check if any uploaded percent is within tolerance window
      let isSupported = false;
      for (const upPercent of uploadedPercents) {
        if (beforeMatch.includes("more than") || beforeMatch.includes("over")) {
          if (upPercent >= percent - 2) isSupported = true; // +/-2pp tolerance
        } else if (beforeMatch.includes("less than") || beforeMatch.includes("under")) {
          if (upPercent <= percent + 2) isSupported = true;
        } else if (beforeMatch.includes("close to") || beforeMatch.includes("nearly")) {
          if (Math.abs(upPercent - percent) <= 2) isSupported = true;
        } else if (beforeMatch.includes("~") || beforeMatch.includes("about") || beforeMatch.includes("around") || beforeMatch.includes("roughly") || beforeMatch.includes("approximately")) {
          if (Math.abs(upPercent - percent) <= 2) isSupported = true; // +/-2pp for percentages
        }
      }

      if (!isSupported) {
        candidateFacts.push({ type: "percent", value: percentStr, context: match.index });
      }
    } else {
      // No approximation language - exact number required
      candidateFacts.push({ type: "percent", value: percentStr, context: match.index });
    }
  }

  // Check currency and large numbers with paraphrase tolerance
  const draftCurrencyMentions = parseCurrencyMentions(draftText);
  const uploadedNumericValues = extractNumericValues(uploadedContext);
  
  if (draftCurrencyMentions.length > 0) {
    for (const mention of draftCurrencyMentions) {
      if (!isNumericClaimSupported(mention, uploadedNumericValues)) {
        candidateFacts.push({ 
          type: "currency", 
          value: mention.raw,
          context: mention.context 
        });
      }
    }
  } else if (currencyPattern.test(draftText) || largeNumberPattern.test(draftText)) {
    // Fallback: simple pattern check if parsing didn't catch it
    const draftAmounts = draftText.match(currencyPattern) || [];
    const hasAmountContext = draftAmounts.some((amt) => {
      const amtLower = amt.toLowerCase();
      return uploadedContext.includes(amtLower) || 
             uploadedContext.includes(amtLower.replace(/\$/g, "").trim());
    });
    if (!hasAmountContext && draftAmounts.length > 0) {
      candidateFacts.push({ type: "currency", value: "currency amount" });
    }
  }

  // 4. Detect strong external superlatives
  const superlativePattern = /\b(largest|#1|number one|market leader|world'?s (?:largest|biggest|most)|most|top \d+|leading|dominant)\b/gi;
  if (superlativePattern.test(draftText)) {
    const hasSuperlativeContext = superlativePattern.test(uploadedContext);
    if (!hasSuperlativeContext) {
      candidateFacts.push({ type: "superlative", value: "superlative claim" });
    }
  }

  // Filter out purely qualitative phrases (only flag if paired with factual anchors)
  const hasFactualAnchor = candidateFacts.some((f) => 
    f.type === "year" || f.type === "ticker" || f.type === "percent" || f.type === "currency"
  );

  // Trigger flag only if there are candidate unsupported facts with factual anchors
  if (candidateFacts.length > 0 && hasFactualAnchor) {
    const factTypes = [...new Set(candidateFacts.map((f) => f.type))];
    const currencyFacts = candidateFacts.filter((f) => f.type === "currency");
    const currencyNote = currencyFacts.length > 0 
      ? ` Numeric claim not found in uploaded sources: '${currencyFacts[0].value}'.`
      : "";
    
    indicators.push(...factTypes);
    return {
      unattributedEnrichment: true,
      notes: "This version includes at least one specific factual claim (e.g., a date/number/ticker) that does not appear in the uploaded sources and is not cited to a web source." + currencyNote,
      indicators: factTypes,
    };
  }

  return { unattributedEnrichment: false, notes: null, indicators: [] };
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  const header = req?.headers?.["x-brightline-diag"] || null;
  const gateAllowsHeader = process.env.BRIGHTLINE_ALLOW_DIAG_HEADER === "1" || process.env.VERCEL_ENV !== "production";
  const envVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE === "1";
  const diagVerbose = envVerbose || (gateAllowsHeader && header === "verbose");
  console.log("[A3.14.24][VERBOSE_EFFECTIVE]", { header, gateAllowsHeader, envVerbose, diagVerbose });

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: "Server is missing OPENAI_API_KEY" });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const text = typeof body.text === "string" ? body.text : "";
    
    // Accept legacy frontend payloads:
    // - instructions (preferred)
    // - notes (Phase 2 frontend)
    // - rewriteNotes (defensive)
    const instructionsRaw =
      (typeof body.instructions === "string" ? body.instructions : "") ||
      (typeof body.notes === "string" ? body.notes : "") ||
      (typeof body.rewriteNotes === "string" ? body.rewriteNotes : "");

    const normalized = normalizeRewriteInstructions(instructionsRaw);
    const rewriteInstructions = normalized.text;

    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";
    const bannedWords = normalizeBannedWords(body.bannedWords);
    const bannedWordsInstruction = bannedWords.length
      ? `Do not use any of the following words in your output: ${bannedWords.join(", ")}.`
      : "";
    const publicSearch = Boolean(body.publicSearch);
    const sources = Array.isArray(body.sources) ? body.sources : [];
    // SPEC X2.0: Rewrite reuses same intent unless explicitly changed
    const outputType = normalizeOutputType(body.outputType ?? body.selectedTypes?.[0] ?? null);
    const visibility = normalizeVisibility(body.visibility ?? body.versionType ?? null);
    const rawEventType = typeof body.eventType === "string" ? body.eventType : (typeof body.scenario === "string" ? body.scenario : "");
    const eventType = normalizeEventType(rawEventType);
    const eventTypeLabel = getEventTypeLabel(eventType);
    // X3.2.3: Rewrite authority — value flow: body.maxWords (rewrite target) → effectiveMaxWords → meta.outputIntent.maxWords → version store → UI + report.
    // MUST NOT: clamp vs generate cap, fall back to generate, merge limits, or retain legacy cap. When rewrite sends a word target it fully replaces prior.
    const rewriteOverrideMaxWords =
      typeof body.maxWords === "number" && Number.isFinite(body.maxWords) && body.maxWords >= 1
        ? Math.min(2000, Math.max(1, Math.floor(body.maxWords)))
        : null;
    const priorMaxWords =
      typeof body.priorMaxWords === "number" && Number.isFinite(body.priorMaxWords) && body.priorMaxWords > 0
        ? Math.floor(body.priorMaxWords)
        : null;
    const effectiveMaxWords =
      Number.isFinite(rewriteOverrideMaxWords)
        ? rewriteOverrideMaxWords
        : Number.isFinite(priorMaxWords)
        ? priorMaxWords
        : null;

    const hasInstructions = typeof rewriteInstructions === "string" && rewriteInstructions.length > 0;
    const hasTarget = Number.isFinite(effectiveMaxWords);
    const isLengthOnly = !hasInstructions && hasTarget;

    if (!text.trim()) return res.status(400).json({ error: "Missing text" });
    if (!hasInstructions && !hasTarget) return res.status(400).json({ error: "Missing instructions or word limit" });

    let webResultsForPrompt = "";
    let webReferences = [];
    let web = { ok: false };

    if (publicSearch) {
      const query = deriveQueryFromDraft([rewriteInstructions, text].filter(Boolean).join("\n\n"));
      try {
        const results = await tavilySearch({ query, maxResults: 6 });
        webResultsForPrompt = formatWebResultsForPrompt(results);
        webReferences = webResultsToReferences(results?.results || []);
        web = results || { ok: false };
      } catch (e) {
        web = { ok: false, error: e?.message || String(e) };
        webResultsForPrompt = "";
        webReferences = [];
      }
    }

    // Detect voice override in Rewrite instructions (A5.13: use normalized only)
    const voiceOverride = detectVoiceOverride(rewriteInstructions);
    const voiceInstruction = voiceOverride === "first"
      ? "Write in first-person voice (use 'I', 'we', 'our', 'us')."
      : voiceOverride === "second"
      ? "Write in second-person voice (use 'you', 'your')."
      : "Write in third-person voice (use 'the firm', 'the company', 'it', 'they', 'their'). This is the default style, even if source documents use first or second person.";

    const eventFraming = getEventTypeFraming(eventType);
    const { basePromptText } = buildBasePrompt({ outputType, visibility, eventType });
    const systemPrompt = [basePromptText, bannedWordsInstruction].filter(Boolean).join("\n\n");

    // A5.13 HARD RULE: Prompt must use normalized instructions only. Raw instructions must never reach the model.
    const rewriteWinsLine =
      "User rewrite instructions are authoritative and override base guidance if they conflict (advisory conflicts may be reported, but do not block).";

    const prompt = isLengthOnly
      ? `LENGTH-ONLY REWRITE: Adjust the draft to approximately ${effectiveMaxWords} words (acceptable range: ${Math.round(0.9 * effectiveMaxWords)}–${Math.round(1.1 * effectiveMaxWords)} words). Do NOT add new facts, change tone beyond compression/expansion, or introduce new sections. Preserve meaning; remove or merge lower-priority detail first; do not truncate mid-sentence.

${rewriteWinsLine}

BASE GUIDANCE (output type):
${basePromptText}

DRAFT:
${text}

SOURCES (for context only; do not add new content):
${sources.length ? JSON.stringify(sources, null, 2) : "(none)"}

Return ONLY valid JSON with no markdown or extra text:
{
  "draftText": "string",
  "rewriteReport": {
    "summary": "string (e.g. 'Length-only rewrite: adjusted to ~N words.')",
    "instructionChecklist": [],
    "warnings": [ "string" ]
  }
}
`.trim()
      : `
Rewrite the draft based on the instructions. Keep the same output format and visibility intent unless the instructions ask to change it.

${rewriteWinsLine}

BASE GUIDANCE (output type):
${basePromptText}

FORMAT GUIDANCE: ${getPromptGuidance(outputType, visibility)}
${eventFraming ? `
EVENT TYPE FRAMING (${eventTypeLabel}):
${eventFraming}
` : ""}

INSTRUCTIONS:
${rewriteInstructions}

DRAFT:
${text}

WEB RESULTS:
${webResultsForPrompt || "(none)"}

SOURCES:
${sources.length ? JSON.stringify(sources, null, 2) : "(none)"}

VOICE REQUIREMENT:
${voiceInstruction}

CRITICAL ATTRIBUTION RULES (HYBRID):
${publicSearch && webReferences.length > 0 ? `
ALLOWED WITHOUT CITATIONS (from uploaded sources):
- Paraphrasing or synthesizing uploaded memo content
- Qualitative summaries (e.g., "strong growth") when based on memo metrics
- Numeric approximations derived from memo values:
  * "about/around/roughly ~25%" (rounded nearby, e.g., if source has 23%)
  * "more than 20%" (conservative inequality, e.g., if source has 23%)
  * "less than 25%"
  * "approximately 20–25%" (range that INCLUDES the source number)
  * NOT allowed: ranges that exclude the source value or overly wide ranges

REQUIRE CITATIONS [n] when adding facts NOT in uploaded sources:
- Dates/timelines (IPO year, acquisition dates, founding dates)
- Exchange listings/tickers (NYSE: SHOP, NASDAQ: AAPL)
- New numeric facts not in memo (percentages, dollar amounts, counts)
- Market share rankings, "largest", "#1", competitors, regulatory status
- Any verifiable factual claim not present in uploaded sources

Rules:
- If you use factual information from web results, you MUST cite it with inline bracket citations [1], [2], etc.
- Citations must match the numbered web sources (e.g., [1] refers to the first web source listed above).
- If you cannot cite a new factual claim to a web source, DO NOT include that claim.
- You MAY paraphrase uploaded source content without citations.
` : `
- Use only information from the uploaded sources provided above.
- You may paraphrase and synthesize uploaded content freely.
`}
${effectiveMaxWords != null ? `\nOutput constraints:\n- Keep output under ~${effectiveMaxWords} words where possible.\n` : ""}

REWRITE REPORT (self-assessment, optional but requested):
After producing the revised draft, provide a brief machine-readable report:
- summary: 1–2 sentences in plain language describing what you did.
- instructionChecklist: for each distinct instruction from the user, one entry: { "instruction": "short phrase", "status": "done" | "partial" | "not_done", "notes": "string or null" }. If you could not fully comply, explain in notes (e.g., "instruction conflicts with evidence", "insufficient source support").
- warnings: array of strings (or empty). Include if you could not add requested facts due to missing source support, or if any instruction was only partially applied.
Do NOT claim that facts were added unless they are supported by the provided sources. If you could not comply with an instruction, say why in notes or warnings.

Return ONLY valid JSON with no markdown or extra text:
{
  "draftText": "string",
  "rewriteReport": {
    "summary": "string",
    "instructionChecklist": [ { "instruction": "string", "status": "done" | "partial" | "not_done", "notes": "string or null" } ],
    "warnings": [ "string" ]
  }
}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
    });

    if (diagVerbose) {
      const rid = req?.body?.rid ?? req?.headers?.["x-request-id"] ?? null;
      const usage = completion?.usage;
      if (usage != null) {
        console.log("[DIAG][OPENAI_USAGE]", { rid, route: "rewrite", model: completion?.model ?? null, prompt_tokens: usage.prompt_tokens ?? null, completion_tokens: usage.completion_tokens ?? null, total_tokens: usage.total_tokens ?? null });
      } else {
        console.log("[DIAG][OPENAI_USAGE]", { rid, route: "rewrite", model: completion?.model ?? null, prompt_tokens: null, completion_tokens: null, total_tokens: null, usageMissing: true });
      }
    }

    let raw = completion?.choices?.[0]?.message?.content || "";
    // Strip optional markdown code fence so JSON parse succeeds
    const codeFence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;
    const match = raw.match(codeFence);
    if (match) raw = match[1].trim();
    const parsed = safeJsonParse(raw) || {};
    let finalDraftText = typeof parsed.draftText === "string" ? parsed.draftText.trim() : "";

    if (!finalDraftText || typeof finalDraftText !== "string") {
      return res.status(500).json({ ok: false, error: "Rewrite produced empty draftText" });
    }

    // A5.12: Soft-target correction pass (single pass, no truncation) when word limit set
    let wordLimitMiss = false;
    if (effectiveMaxWords != null) {
      const words = countWords(finalDraftText);
      const highThreshold = 1.25 * effectiveMaxWords;
      const lowThreshold = 0.75 * effectiveMaxWords;
      if (words > highThreshold || words < lowThreshold) {
        const targetMin = Math.round(0.9 * effectiveMaxWords);
        const targetMax = Math.round(1.1 * effectiveMaxWords);
        const correctionPrompt = `Rewrite the following draft to land within approximately ${targetMin} to ${targetMax} words (target ~${effectiveMaxWords} words).
Do not invent facts; preserve all factual claims from the draft; remove lower-priority detail first.
Do not truncate mid-sentence; produce a coherent final draft.

DRAFT:
---
${finalDraftText}
---

Return ONLY JSON:
{
  "draftText": "string"
}`.trim();
        try {
          const correctionCompletion = await client.chat.completions.create({
            model: modelId,
            temperature: 0.2,
            messages: [{ role: "user", content: correctionPrompt }],
          });
          const correctionRaw = correctionCompletion?.choices?.[0]?.message?.content || "";
          const correctionParsed = safeJsonParse(correctionRaw) || {};
          const correctedText = typeof correctionParsed.draftText === "string" ? correctionParsed.draftText.trim() : "";
          if (correctedText) {
            finalDraftText = correctedText;
            const wordsAfterCorrection = countWords(finalDraftText);
            if (wordsAfterCorrection > highThreshold || wordsAfterCorrection < lowThreshold) {
              wordLimitMiss = true;
            }
          }
        } catch {
          wordLimitMiss = true;
        }
      }
    }

    if (!finalDraftText || typeof finalDraftText !== "string") {
      return res.status(500).json({ ok: false, error: "Rewrite produced empty draftText" });
    }

    // X3.1: Deterministic metrics (authoritative) — use final draft text
    const wordsBefore = countWords(text);
    const wordsAfter = countWords(finalDraftText);
    const charsBefore = countChars(text);
    const charsAfter = countChars(finalDraftText);
    const targetMaxWords = effectiveMaxWords;
    const hitTarget =
      targetMaxWords == null
        ? null
        : wordsAfter >= Math.round(0.9 * targetMaxWords) && wordsAfter <= Math.round(1.1 * targetMaxWords);

    // X3.1: Parse optional rewriteReport from model (best-effort)
    const rawReport = parsed.rewriteReport;
    let summary = "Rewrite completed.";
    let instructionChecklist = [];
    let warnings = null;

    // X3.1b: Conservative instruction matching — user must have requested the intent for item to be scored
    const normalizedInstructions = (rewriteInstructions || "").toLowerCase();
    const LENGTH_REGEX = /word|length|short|tight|reduce|expand/;
    const DETAIL_REGEX = /add|expand|more detail|elaborate|include/;
    const TONE_REGEX = /tone|formal|neutral|concise|punchy/;

    function userRequestedCategory(itemInstruction) {
      const lower = (itemInstruction || "").toLowerCase();
      if (LENGTH_REGEX.test(lower)) return LENGTH_REGEX.test(normalizedInstructions);
      if (DETAIL_REGEX.test(lower)) return DETAIL_REGEX.test(normalizedInstructions);
      if (TONE_REGEX.test(lower)) return TONE_REGEX.test(normalizedInstructions);
      return false;
    }

    if (rawReport && typeof rawReport === "object") {
      if (typeof rawReport.summary === "string" && rawReport.summary.trim()) {
        summary = rawReport.summary.trim();
      }
      if (Array.isArray(rawReport.instructionChecklist)) {
        instructionChecklist = rawReport.instructionChecklist
          .filter((item) => item && typeof item === "object" && typeof item.instruction === "string")
          .map((item) => {
            const instruction = String(item.instruction).trim() || "—";
            const rawStatus = ["done", "partial", "not_done"].includes(item.status) ? item.status : "partial";
            const requested = userRequestedCategory(instruction);
            const status = requested ? rawStatus : "not_requested";
            return {
              instruction,
              status,
              notes: typeof item.notes === "string" ? item.notes.trim() || null : null,
            };
          });
      }
      if (Array.isArray(rawReport.warnings) && rawReport.warnings.length > 0) {
        warnings = rawReport.warnings
          .filter((w) => typeof w === "string" && w.trim())
          .map((w) => w.trim());
      }
    } else {
      warnings = ["Rewrite report unavailable for this run."];
    }

    if (isLengthOnly && typeof summary === "string" && !summary.toLowerCase().includes("length-only")) {
      summary = `Length-only rewrite: adjusted to ~${effectiveMaxWords} words. ${summary}`.trim();
    }

    const EXTRACTION_WARNING_CANONICAL = "Source formatting limited deep extraction of some details.";
    if (Array.isArray(warnings) && warnings.length > 0) {
      warnings = warnings.map((w) =>
        typeof w === "string" && /source|formatting|extraction|pdf|limited.*detail/i.test(w) ? EXTRACTION_WARNING_CANONICAL : w
      );
    }

    // X3.1.0: Advisory clash warning when rewrite instructions likely conflict with base guidance (do not block).
    const clash = detectRewriteClash({ outputType, rewriteInstructions });
    if (clash.hasClash) {
      const label = getOutputTypeLabel(outputType);
      const advisory = `Rewrite instructions may conflict with base guidance for ${label} (e.g. voice/output-type). Proceeding with rewrite as requested.`;
      if (!Array.isArray(warnings)) warnings = [];
      warnings.push(advisory);
    }

    // A5.13: Explicit transparency for instruction handling.
    const rewriteReport = {
      summary,
      metrics: {
        wordsBefore,
        wordsAfter,
        charsBefore,
        charsAfter,
        targetMaxWords,
        hitTarget,
      },
      wordTarget: effectiveMaxWords ?? null,
      isLengthOnly: isLengthOnly || undefined,
      instructionChecklist,
      warnings,
      instructionsReceived: instructionsRaw ?? "",
      instructionsUsed: rewriteInstructions,
      instructionsIgnored: normalized.ignored ? normalized.reason : null,
    };

    // Extract citations and derive usedReferenceIds
    const citations = extractCitations(finalDraftText);
    const usedReferenceIds = citations.filter((id) => 
      webReferences.some((ref) => ref.id === id)
    );

    // Detect unattributed enrichment (hybrid approach)
    const enrichmentResult = detectUnattributedEnrichment(
      finalDraftText,
      publicSearch,
      usedReferenceIds,
      sources
    );

    const flags = {
      unattributedEnrichment: Boolean(enrichmentResult.unattributedEnrichment),
      unattributedEnrichmentNotes: enrichmentResult.notes || null,
    };

    const outputIntent = buildOutputIntent(outputType, visibility);
    const metaOutputIntent = {
      outputType: outputIntent.outputType,
      visibility: outputIntent.visibility,
      outputTypeLabel: outputIntent.outputTypeLabel,
      visibilityLabel: outputIntent.visibilityLabel,
    };
    // X3.2.3: Version meta from rewrite only — effectiveMaxWords (new target or preserved prior). Never from generate cap or previousVersion.
    if (effectiveMaxWords != null) {
      metaOutputIntent.maxWords = effectiveMaxWords;
    }
    if (wordLimitMiss) {
      metaOutputIntent.wordLimitMiss = true;
    }

    return res.status(200).json({
      ok: true,
      draftText: finalDraftText,
      meta: {
        outputIntent: metaOutputIntent,
        eventType,
        eventTypeLabel,
        rewriteReport,
      },
      sourcesUsed: {
        web: {
          enabled: Boolean(publicSearch),
          used: Boolean(publicSearch === true && web.ok && webReferences.length),
          provider: "tavily",
          query: web?.query || null,
          references: webReferences,
          usedReferenceIds: usedReferenceIds.length > 0 ? usedReferenceIds : [],
        },
        flags,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Rewrite failed" });
  }
}
