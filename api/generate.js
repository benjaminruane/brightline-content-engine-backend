import { withCors } from "../lib/http/with-cors.mjs";
// api/generate.js
//
// Generates a new draft.
// Web search behaviour:
// - publicSearch === true: enrich with web search results
// - publicSearch === false: do not retrieve from web
//
// NEW:
// - Returns sourcesUsedRows[] at the top-level for convenient frontend consumption.
// - The model is instructed to append a [SOURCES_USED] JSON block that we strip out.

console.log("[A3.14.3][IMPORT_OK] api/generate.js loaded");

import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { reportRouteFailure } from "../lib/problem-events.mjs";
import { refuseIfUnreadable } from "../lib/unreadable-source.mjs";
import { beginBillableRequest, endBillableRequest, enterRequestSpend } from "../lib/spend/ledger.mjs";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "../lib/web.js";
import {
  normalizeOutputType,
  buildOutputIntent,
  visibilityForDraft,
} from "../lib/output-intent.js";
import {
  normalizeEventType,
  getEventTypeLabel,
} from "../lib/event-type.js";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { lengthAllowanceWords, lengthFloorWords, outputTypeWordCeiling, sourcesCannotSupportLength } from "../lib/prompt-library/outputTypeGuidance.js";
import { omitDatelineWhenSourceHasBoth } from "../lib/press-dateline.mjs";
import { draftHouseStyleReport } from "../lib/qc/draft-house-style.mjs";
import { settlePublicDraft } from "../lib/style-guide/public-figures.mjs";
import { styleForRequest } from "../lib/style-guide/request-style.mjs";
import { fitToWordCeiling } from "../lib/qc/word-ceiling.mjs";
import { splitMethodologyOutput } from "../lib/prompt-library/methodology-note.mjs";
import { countWords } from "../lib/qc/token-estimate.mjs";
import { applyPlaceholderGuard } from "../lib/prompt-library/placeholder-guard.mjs";
import { callLLM, flushObservability, getLlmSpend, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { beginRequestBudget, FUNCTION_MAX_DURATION_MS } from "../lib/qc/request-budget.mjs";
import { sourcesForPrompt } from "../lib/source-role.mjs";
import { draftErrorFromProvider, sourcesForDraftPrompt } from "../lib/draft-sources.mjs";

// ------------------------------------------------------------------
// CORS

// ------------------------------------------------------------------

export const STYLE_GUIDE_INSTRUCTIONS = "";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clampMaxWords(maxWords) {
  if (typeof maxWords !== "number" || !Number.isFinite(maxWords) || maxWords <= 0) return null;
  return Math.floor(maxWords);
}

function stripSourcesUsedBlock(text) {
  if (typeof text !== "string") return "";
  const marker = "[SOURCES_USED]";
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return text.trim();
  return text.slice(0, idx).trim();
}

function extractSourcesUsedRows(text, sessionSources = []) {
  if (typeof text !== "string") return [];
  const marker = "[SOURCES_USED]";
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return [];

  const jsonPart = text.slice(idx + marker.length).trim();
  const parsed = safeJsonParse(jsonPart);
  const rows = Array.isArray(parsed?.sourcesUsedRows) ? parsed.sourcesUsedRows : [];
  const safeSessionSources = Array.isArray(sessionSources) ? sessionSources : [];
  const resolveSourceId = (row) => {
    const rowTitle = typeof row?.title === "string" ? row.title.trim() : "";
    const rowUrl = typeof row?.url === "string" ? row.url.trim() : "";
    if (!rowTitle && !rowUrl) return null;
    const matched = safeSessionSources.find((src) => {
      const srcName = typeof src?.name === "string" ? src.name.trim() : "";
      const srcUrl = typeof src?.url === "string" ? src.url.trim() : "";
      if (rowTitle && srcName && rowTitle === srcName) return true;
      if (rowUrl && srcUrl && rowUrl === srcUrl) return true;
      return false;
    });
    return matched?.id != null ? String(matched.id) : null;
  };

  return rows
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      title: typeof r.title === "string" ? r.title : "",
      url: typeof r.url === "string" ? r.url : "",
      snippet: typeof r.snippet === "string" ? r.snippet : "",
      usedFor: typeof r.usedFor === "string" ? r.usedFor : "",
      sourceId: resolveSourceId(r),
    }))
    .filter((r) => r.title || r.url || r.snippet);
}

function buildInternalApiUrl(req, path) {
  const explicitBase = typeof process.env.BRIGHTLINE_API_BASE_URL === "string" ? process.env.BRIGHTLINE_API_BASE_URL.trim() : "";
  if (explicitBase) return `${explicitBase.replace(/\/$/, "")}${path}`;

  const host = req?.headers?.host;
  if (!host || typeof host !== "string") return null;
  const protoHeader = req?.headers?.["x-forwarded-proto"];
  const protocol = typeof protoHeader === "string" && protoHeader.trim() ? protoHeader.split(",")[0].trim() : "https";
  return `${protocol}://${host}${path}`;
}

async function populateSourceUsageSummaries(req, rows, draftText) {
  if (!Array.isArray(rows) || rows.length === 0 || typeof fetch !== "function") return;
  const apiUrl = buildInternalApiUrl(req, "/api/summarize-source-usage");
  if (!apiUrl) return;
  const draftExcerpt = typeof draftText === "string" ? draftText.slice(0, 1000) : "";
  if (!draftExcerpt) return;

  const tasks = rows.map((row) => {
    const sourceName =
      (typeof row?.title === "string" && row.title.trim()) ||
      (typeof row?.name === "string" && row.name.trim()) ||
      "";
    const snippet = typeof row?.snippet === "string" ? row.snippet.trim() : "";

    row.usedFor = "";
    if (!sourceName || !snippet) return Promise.resolve("");

    return fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceName,
        snippet,
        draftText: draftExcerpt,
      }),
    })
      .then((resp) => (resp?.ok ? resp.json() : null))
      .then((payload) => {
        row.usedFor = typeof payload?.usedFor === "string" ? payload.usedFor : "";
        return row.usedFor;
      })
      .catch(() => {
        row.usedFor = "";
        return "";
      });
  });

  await Promise.allSettled(tasks);
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

async function handler(req, res) {
  console.log("[A3.14.3][HANDLER_ENTER] generate");
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS", headers: ["x-brightline-diag"] })) return;
  const header = req?.headers?.["x-brightline-diag"] || null;
  const gateAllowsHeader = process.env.BRIGHTLINE_ALLOW_DIAG_HEADER === "1" || process.env.VERCEL_ENV !== "production";
  const envVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE === "1";
  const diagVerbose = envVerbose || (gateAllowsHeader && header === "verbose");
  console.log("[A3.14.24][VERBOSE_EFFECTIVE]", { header, gateAllowsHeader, envVerbose, diagVerbose });

  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (!(await beginBillableRequest(res, account))) return;
  enterRequestSpend();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const routeStartedAt = Date.now();
  const modelConfig = STAGE_MODELS["writing-generate"];
  beginRequestBudget({
    startedAt: routeStartedAt,
    maxDurationMs: FUNCTION_MAX_DURATION_MS,
    model: modelConfig.model,
  });
  if (!hasProviderApiKey(modelConfig.provider)) {
    await reportRouteFailure({
      account,
      route: "generate",
      req,
      status: 500,
      error: "Server is missing provider API key for writing-generate",
      startedAt: routeStartedAt,
    });
    return res.status(500).json({ ok: false, error: "Server is missing provider API key for writing-generate" });
  }

  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const houseStyle = await styleForRequest(account, body);
    const {
      title,
      notes,
      scenario,
      selectedTypes,
      versionType,
      outputType: bodyOutputType,
      visibility: bodyVisibility,
      maxWords,
      model,
      publicSearch,
      sources,
      authoringOrganisation,
    } = body;

    const modelId = typeof model === "string" && model.trim() ? model.trim() : modelConfig.model;

    const safeTitle = typeof title === "string" ? title : "";
    const safeNotes = typeof notes === "string" ? notes : "";
    const rawEventType =
      typeof body.eventType === "string" && body.eventType.trim()
        ? body.eventType
        : typeof scenario === "string"
          ? scenario
          : "";
    const eventType = normalizeEventType(rawEventType);
    const safeTransactionDate =
      typeof body.transactionDate === "string" ? body.transactionDate.trim() : "";
    const safeInvestment = typeof body.investment === "string" ? body.investment.trim() : "";
    const safeSpecialInstructions =
      typeof body.specialInstructions === "string" ? body.specialInstructions.trim() : "";
    const eventTypeLabel = getEventTypeLabel(eventType);
    const safeScenario = rawEventType;
    const safeSelectedTypes = Array.isArray(selectedTypes) ? selectedTypes : [];
    // SPEC X2.0: Accept outputType/visibility; fallback to selectedTypes[0]/versionType; apply defaults
    const rawOutputType = typeof bodyOutputType === "string" && bodyOutputType.trim()
      ? bodyOutputType
      : (safeSelectedTypes[0] ?? null);
    const rawVisibility = typeof bodyVisibility === "string" && bodyVisibility.trim()
      ? bodyVisibility
      : (typeof versionType === "string" ? versionType : null);
    const outputType = normalizeOutputType(rawOutputType);
    const visibility = visibilityForDraft(outputType, rawVisibility);
    const typedMaxWords = clampMaxWords(maxWords);
    const effectiveMaxWords = typedMaxWords ?? outputTypeWordCeiling(outputType);
    const safeVersionType = visibility === "PUBLIC" ? "public" : "complete";
    const safePublicSearch = Boolean(publicSearch);
    const preparedSources = await sourcesForDraftPrompt(Array.isArray(sources) ? sources : []);
    if (preparedSources.error) {
      return res.status(400).json({ ok: false, error: preparedSources.error });
    }
    const safeSources = preparedSources.sources;
    if (Array.isArray(sources) && sources.length > 0) {
      const refusal = await refuseIfUnreadable({
        sources: safeSources,
        account,
        req,
        route: "generate",
        startedAt: routeStartedAt,
      });
      if (refusal) return res.status(200).json(refusal);
    }

    let webResultsForPrompt = "";
    let webReferences = [];
    let web = { ok: false };

    if (safePublicSearch) {
      const query = deriveQueryFromDraft(
        [safeTitle, safeNotes, safeScenario, safeSelectedTypes.join(" ")]
          .filter(Boolean)
          .join("\n\n")
      );

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

    const { basePromptText } = buildBasePrompt({
      outputType,
      visibility,
      eventType,
      transactionDate: safeTransactionDate,
      investment: safeInvestment,
      specialInstructions: safeSpecialInstructions,
      sources: safeSources,
      dealStatus: typeof body.dealStatus === "string" ? body.dealStatus : "",
      maxWords: typedMaxWords,
      authoringOrganisation: typeof authoringOrganisation === "string" ? authoringOrganisation : "",
      houseStyle,
      styleChoices: houseStyle,
    });
    const modelLimit = effectiveMaxWords;
    const ceilingLine = modelLimit
      ? `Hard length ceiling: ${modelLimit} words. A draft longer than that is wrong. Cover the essential points inside that number and leave out the optional ones.`
      : "";
    const systemContent = [ceilingLine, basePromptText].filter(Boolean).join("\n\n");

    const userPrompt = `
You are generating a draft. Follow the style guide.

Inputs:
Title: ${safeTitle || "(none)"}
Notes: ${safeNotes || "(none)"}
Scenario: ${safeScenario || "(none)"}
Output type: ${outputType}
Visibility: ${visibility}
Version type: ${safeVersionType || "(none)"}

Web search enabled: ${safePublicSearch ? "true" : "false"}

WEB RESULTS:
${webResultsForPrompt || "(none)"}

SOURCES (user uploaded / URLs):
${safeSources.length ? JSON.stringify(sourcesForPrompt(safeSources), null, 2) : "(none)"}

CRITICAL ATTRIBUTION RULES (HYBRID):
${safePublicSearch && webReferences.length > 0 ? `
ALLOWED WITHOUT CITATIONS (from uploaded sources):
- Paraphrasing or synthesizing uploaded memo content
- Qualitative summaries (e.g., "strong growth") when based on memo metrics
- Numeric approximations derived from memo values:
  * "about/around/roughly ~25%" (rounded nearby, e.g., if source has 23%)
  * "more than 20%" (conservative inequality, e.g., if source has 23%)
  * "less than 25%"
  * "approximately 20-25%" (range that INCLUDES the source number)
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

IMPORTANT:
At the END of your output, append a line with exactly: [SOURCES_USED]
Then append JSON with:
{
  "sourcesUsedRows": [
    { "title": "string", "url": "string", "snippet": "string" }
  ]
}

Return ONLY JSON:
{
  "draftText": "string"
}
`.trim();

    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelId,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userPrompt },
      ],
      traceName: "writing-generate",
      spanName: "writing-generate",
      metadata: { route: "generate" },
    });

    if (diagVerbose) {
      const rid = req?.body?.rid ?? req?.headers?.["x-request-id"] ?? null;
      const usage = completion?.usage;
      if (usage != null) {
        console.log("[DIAG][OPENAI_USAGE]", { rid, route: "generate", model: completion?.model ?? null, prompt_tokens: usage.inputTokens ?? null, completion_tokens: usage.outputTokens ?? null, total_tokens: (Number(usage.inputTokens) || 0) + (Number(usage.outputTokens) || 0) });
      } else {
        console.log("[DIAG][OPENAI_USAGE]", { rid, route: "generate", model: completion?.model ?? null, prompt_tokens: null, completion_tokens: null, total_tokens: null, usageMissing: true });
      }
    }

    const raw = completion?.text || "";
    const parsed = safeJsonParse(raw) || {};
    const rawDraftText = typeof parsed.draftText === "string" ? parsed.draftText : "";
    const sourcesUsedRows = extractSourcesUsedRows(rawDraftText, safeSources);
    const splitDraft = splitMethodologyOutput(stripSourcesUsedBlock(rawDraftText));
    const houseOpts = {
      outputType,
      authoringOrganisation: typeof authoringOrganisation === "string" ? authoringOrganisation : "",
      houseStyle,
      sources: safeSources,
      title: safeTitle,
    };
    const styleFixes = [];
    const drafted = draftHouseStyleReport(splitDraft.commentary, houseOpts);
    let currentDraftText = drafted.text;
    styleFixes.push(...drafted.fired);
    const noted = draftHouseStyleReport(splitDraft.methodologyNote, houseOpts);
    const methodologyNote = noted.text;
    styleFixes.push(...noted.fired);
    const ceilingWords = lengthAllowanceWords(effectiveMaxWords);
    if (ceilingWords && countWords(currentDraftText) > ceilingWords) {
      const shorten = await callLLM({
        provider: modelConfig.provider,
        model: modelId,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `Rewrite the draft so it is at most ${modelLimit} words. Keep the essential points. Drop optional points first. Do not add facts. Do not change a figure, a name, or a date. Return JSON only: {"draftText":"..."}.`,
          },
          { role: "user", content: currentDraftText },
        ],
        traceName: "writing-generate-shorten",
        spanName: "writing-generate-shorten",
        metadata: { route: "generate" },
      });
      const shortened = safeJsonParse(shorten?.text || "");
      if (shortened && typeof shortened.draftText === "string" && shortened.draftText.trim()) {
        const shortenedStyle = draftHouseStyleReport(shortened.draftText, houseOpts);
        currentDraftText = shortenedStyle.text;
        styleFixes.push(...shortenedStyle.fired);
      }
      currentDraftText = fitToWordCeiling(currentDraftText, ceilingWords);
      console.log(JSON.stringify({
        event: "output_type_word_count",
        words: countWords(currentDraftText),
        maxWords: effectiveMaxWords,
        ceiling: ceilingWords,
      }));
    }

    const sourceText = safeSources
      .map((row) => (typeof row?.text === "string" ? row.text : ""))
      .filter((part) => part.trim())
      .join("\n\n");
    let publicFigureNote = "";
    const settled = await settlePublicDraft({
      draft: currentDraftText,
      sources: safeSources,
      visibility,
      regenerate: async (figures) => {
        const named = figures.map((row) => row.surface).join(", ");
        const retry = await callLLM({
          provider: modelConfig.provider,
          model: modelId,
          temperature: 0,
          messages: [
            {
              role: "system",
              content: `Rewrite the draft so it does not state these confidential figures or return measures, because they do not appear in a public source: ${named}. A return measure stays out however it is worded or rounded. Do not add facts. Do not delete any other sentence. Return JSON only: {"draftText":"..."}.`,
            },
            { role: "user", content: currentDraftText },
          ],
          traceName: "writing-generate-public-figures",
          spanName: "writing-generate-public-figures",
          metadata: { route: "generate" },
        });
        const parsedRetry = safeJsonParse(retry?.text || "");
        return parsedRetry && typeof parsedRetry.draftText === "string" ? parsedRetry.draftText : "";
      },
    });
    if (settled.regenerated && settled.text !== currentDraftText) {
      const restyled = draftHouseStyleReport(settled.text, houseOpts);
      currentDraftText = restyled.text;
      styleFixes.push(...restyled.fired);
      const again = await settlePublicDraft({
        draft: currentDraftText,
        sources: safeSources,
        visibility,
        regenerate: async () => currentDraftText,
      });
      publicFigureNote = again.note;
    } else {
      publicFigureNote = settled.note;
      if (settled.text) currentDraftText = settled.text;
    }

    if (outputType === "PRESS_RELEASE") {
      currentDraftText = omitDatelineWhenSourceHasBoth(currentDraftText, sourceText);
    }
    if (outputType === "GENERAL_TEXT") {
      const floor = lengthFloorWords(outputType, typedMaxWords);
      const sourceWords = countWords(sourceText);
      const wordsNow = countWords(currentDraftText);
      console.log(JSON.stringify({
        event: "general_length_floor",
        words: wordsNow,
        floor,
        sourceWords,
        waived: Boolean(floor) && wordsNow < floor && sourcesCannotSupportLength(sourceWords, floor),
      }));
    }

    await populateSourceUsageSummaries(req, sourcesUsedRows, currentDraftText);

    if (!currentDraftText.trim()) {
      await reportRouteFailure({
        account,
        route: "generate",
        req,
        status: 500,
        error: "Draft could not be generated. Please try again, or provide more notes and/or sources.",
        startedAt: routeStartedAt,
      });
      return res.status(500).json({
        ok: false,
        error: "Draft could not be generated. Please try again, or provide more notes and/or sources.",
      });
    }

    const guardedGenerate = applyPlaceholderGuard(currentDraftText, "", "Generate");
    if (!guardedGenerate.accepted) {
      return res.status(422).json({
        ok: false,
        error: guardedGenerate.message,
        code: "PLACEHOLDER_IN_OUTPUT",
      });
    }

    // Extract citations and derive usedReferenceIds
    const citations = extractCitations(currentDraftText);
    const usedReferenceIds = citations.filter((id) => 
      webReferences.some((ref) => ref.id === id)
    );

    // Detect unattributed enrichment (hybrid approach)
    const enrichmentResult = detectUnattributedEnrichment(
      currentDraftText,
      safePublicSearch,
      usedReferenceIds,
      safeSources
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
    if (typedMaxWords != null) {
      metaOutputIntent.maxWords = typedMaxWords;
    }

    return res.status(200).json({
      ok: true,
      draftText: currentDraftText,
      methodologyNote,
      styleFixes: [...new Set(styleFixes)],
      publicFigureNote,
      sourcesUsedRows,
      meta: {
        outputIntent: metaOutputIntent,
        eventType,
        eventTypeLabel,
        llmSpend: getLlmSpend(),
      },
      sourcesUsed: {
        web: {
          enabled: Boolean(safePublicSearch),
          used: Boolean(safePublicSearch === true && web.ok && webReferences.length),
          provider: "tavily",
          query: web?.query || null,
          references: webReferences,
          usedReferenceIds: usedReferenceIds.length > 0 ? usedReferenceIds : [],
        },
        flags,
      },
    });
  } catch (err) {
    const plain = draftErrorFromProvider(err);
    const status = plain ? 400 : 500;
    const message = plain || err?.message || "Unknown error";
    await reportRouteFailure({
      account,
      route: "generate",
      req,
      status,
      error: message,
      startedAt: routeStartedAt,
    });
    if (plain) return res.status(400).json({ ok: false, error: plain });
    return res.status(500).json({
      ok: false,
      error: message,
    });
  } finally {
    await endBillableRequest({ account, route: "generate", req, spend: getLlmSpend() });
    await flushObservability();
  }
}

export default withCors(handler, { problemRoute: "generate" });
