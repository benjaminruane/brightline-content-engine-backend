// api/analyse-selected-statements.js
//
// A3.8.11: Selection mode endpoint for analyse-statements.
// A3.8.16: Hard validation + fail-closed error envelope
// A3.8.98: Rewritten as CORS-safe CommonJS wrapper using dynamic import

// A3.8.98: CommonJS module.exports (not ESM) to avoid CJS/ESM mismatch
// A3.8.98: Set CORS headers BEFORE any imports that might throw
function setCorsHeaders(req, res) {
  if (!res || typeof res.setHeader !== "function") return;
  
  const origin = req?.headers?.origin || req?.headers?.Origin || "";
  const allowedOrigins = [
    "https://brightline-content-engine-frontend.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000"
  ];
  
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

// A3.8.32: Safe wrapper to prevent ERR_HTTP_HEADERS_SENT
function safeSetCorsHeaders(req, res) {
  if (!res || res.headersSent) return;
  try { 
    setCorsHeaders(req, res); 
  } catch (_) {
    // Silently ignore if headers already sent
  }
}

// A3.8.16: Generate RID/SIG for logging
function generateRidSig() {
  const runId = Math.random().toString(36).substring(2, 15);
  const reqSig = Math.random().toString(36).substring(2, 10);
  return { runId, reqSig };
}

// A3.8.16: Diagnostic logger
function diag(runId, reqSig, ...args) {
  const message = args.map(arg => 
    typeof arg === "object" ? JSON.stringify(arg) : String(arg)
  ).join(" ");
  console.log(`[DIAG][RID=${runId}][SIG=${reqSig}] ${message}`);
}

// A3.8.16: Validate request body
function validateRequest(body) {
  const missing = [];
  const invalid = [];
  
  // Required fields
  if (!body || typeof body !== "object") {
    missing.push("body");
    return { valid: false, missing, invalid };
  }
  
  // selectionText: required, string, trimmed length >= 3, max 20000
  if (!body.selectionText) {
    missing.push("selectionText");
  } else if (typeof body.selectionText !== "string") {
    invalid.push("selectionText must be a string");
  } else {
    const trimmed = body.selectionText.trim();
    if (trimmed.length < 3) {
      invalid.push("selectionText must be at least 3 characters (after trimming)");
    } else if (body.selectionText.length > 20000) {
      invalid.push("selectionText exceeds maximum length of 20000 characters");
    }
  }
  
  // draftText: required, string, trimmed length > 0, max 200000
  if (!body.draftText) {
    missing.push("draftText");
  } else if (typeof body.draftText !== "string") {
    invalid.push("draftText must be a string");
  } else {
    const trimmed = body.draftText.trim();
    if (trimmed.length === 0) {
      invalid.push("draftText must not be empty (after trimming)");
    } else if (body.draftText.length > 200000) {
      invalid.push("draftText exceeds maximum length of 200000 characters");
    }
  }
  
  // instructions: optional, normalize to empty string if missing/invalid
  if (body.instructions !== undefined && typeof body.instructions !== "string") {
    invalid.push("instructions must be a string if provided");
  }
  
  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

// A3.8.17: Extract cause chain for logging
function extractCauseChain(err, maxDepth = 4) {
  const chain = [];
  let current = err;
  let depth = 0;
  
  while (current && depth < maxDepth) {
    if (current.cause) {
      chain.push({
        name: current.cause?.name || "Unknown",
        message: current.cause?.message || "",
        stack: current.cause?.stack || "",
      });
      current = current.cause;
      depth++;
    } else {
      break;
    }
  }
  
  return chain;
}

// A3.8.98: CommonJS handler (not ESM export)
module.exports = async function handler(req, res) {
  // A3.8.16: Generate RID/SIG early for all logging
  const { runId, reqSig } = generateRidSig();
  
  // A3.8.17: Phase tracker + debug context
  let phase = "init";
  let selectionChars = 0;
  let draftChars = 0;
  let hasInstructions = false;
  const dbg = { route: "analyse-selected-statements", phase: "init", selectionMode: true };
  
  // A3.8.16: Top-level try/catch to ensure JSON response always
  try {
    // A3.8.98: Set CORS headers IMMEDIATELY before any imports
    safeSetCorsHeaders(req, res);
    
    // A3.8.98: Handle OPTIONS preflight immediately
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    
    // A3.8.16: Reject non-POST methods
    if (req.method !== "POST") {
      return res.status(405).json({
        ok: false,
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "Only POST method is allowed",
        },
      });
    }
    
    // A3.8.17: Phase: parse_body
    phase = "parse_body";
    dbg.phase = phase;
    
    // A3.8.53: Build marker - confirms deployed build includes A3.8.53 changes
    diag(runId, reqSig, `[DIAG][A3.8.53][BUILD_MARKER] active=true`);
    
    // A3.8.16: Parse body safely
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") {
        throw new Error("Body must be an object");
      }
    } catch (parseErr) {
      diag(runId, reqSig, `BAD_REQUEST route=analyse-selected-statements phase=${phase} invalid=["JSON parse error: ${parseErr.message}"]`);
      return res.status(400).json({
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: "Request body must be valid JSON",
          details: {
            missing: [],
            invalid: [`JSON parse error: ${parseErr.message}`],
          },
        },
      });
    }
    
    // A3.8.17: Phase: validate
    phase = "validate";
    dbg.phase = phase;
    
    // A3.8.17: Harden: normalize unexpected types safely
    if (typeof body.selectionText !== "string") {
      diag(runId, reqSig, `BAD_REQUEST route=analyse-selected-statements phase=${phase} invalid=["selectionText must be a string"]`);
      return res.status(400).json({
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: "Request validation failed",
          details: {
            missing: [],
            invalid: ["selectionText must be a string"],
          },
        },
      });
    }
    
    if (typeof body.draftText !== "string") {
      diag(runId, reqSig, `BAD_REQUEST route=analyse-selected-statements phase=${phase} invalid=["draftText must be a string"]`);
      return res.status(400).json({
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: "Request validation failed",
          details: {
            missing: [],
            invalid: ["draftText must be a string"],
          },
        },
      });
    }
    
    // A3.8.16: Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      diag(runId, reqSig, `BAD_REQUEST route=analyse-selected-statements phase=${phase} missing=[${validation.missing.join(",")}] invalid=[${validation.invalid.join("; ")}]`);
      return res.status(400).json({
        ok: false,
        error: {
          code: "BAD_REQUEST",
          message: "Request validation failed",
          details: {
            missing: validation.missing,
            invalid: validation.invalid,
          },
        },
      });
    }
    
    // A3.8.17: Phase: normalize
    phase = "normalize";
    dbg.phase = phase;
    
    // A3.8.16: Normalize inputs
    const selectionTextNorm = body.selectionText.trim();
    const draftTextNorm = body.draftText.trim();
    const instructionsNorm = (body.instructions || null) ? String(body.instructions).trim() : "";
    
    selectionChars = selectionTextNorm.length;
    draftChars = draftTextNorm.length;
    hasInstructions = instructionsNorm.length > 0;
    dbg.selectionChars = selectionChars;
    dbg.draftChars = draftChars;
    dbg.hasInstructions = hasInstructions;
    
    // A3.8.16: Log START (once, with request shape summary)
    diag(runId, reqSig, `START route=analyse-selected-statements selectionChars=${selectionChars} draftChars=${draftChars} hasInstructions=${hasInstructions}`);
    
    // A3.8.16: Guard segmentation inputs
    // Normalize body for implementation
    const normalizedBody = {
      ...body,
      selectionText: selectionTextNorm,
      draftText: draftTextNorm,
      instructions: instructionsNorm,
      selectionUsed: true, // This endpoint always uses selection mode
    };
    
    // A3.8.17: Phase: segment (segmentation happens inside impl, but we track phase)
    phase = "segment";
    dbg.phase = phase;
    
    // A3.8.98: Phase: run_review_pipeline (dynamic import, not static import)
    phase = "run_review_pipeline";
    dbg.phase = phase;
    
    // A3.8.98: Dynamic-import the underlying implementation (DO NOT require())
    let analyseStatementsImpl;
    try {
      const mod = await import("./analyse-statements-impl.js");
      analyseStatementsImpl = mod.default || mod.handler || mod;
    } catch (importErr) {
      console.error("[A3.8.98][ANALYSE_SELECTED_FATAL]", importErr && importErr.stack ? importErr.stack : importErr);
      const e = new Error("REVIEW_PIPELINE_FAILED");
      e.cause = importErr;
      throw e;
    }
    
    // A3.8.19: Validate dynamic import result
    if (typeof analyseStatementsImpl !== "function") {
      const e = new Error("REVIEW_PIPELINE_FAILED");
      e.cause = new Error("analyse-statements-impl missing default export");
      throw e;
    }
    
    // A3.8.25: Pass diag context to implementation for unified RID/SIG
    const diagContext = { rid: runId, sig: reqSig };
    
    // A3.8.16: Call implementation with normalized body
    // Create a request-like object with normalized body and diag context
    const normalizedReq = {
      ...req,
      body: {
        ...normalizedBody,
        _diag: diagContext, // A3.8.25: Pass diag context via body
      },
    };
    
    // A3.8.29: Part A - Separate payload (JSON) from res (Vercel response object)
    // A3.8.17: Harden: wrap pipeline call in try/catch
    let payload;
    try {
      payload = await analyseStatementsImpl(normalizedReq, res);
    } catch (pipelineErr) {
      // A3.8.17: Re-throw with context to preserve phase tracking
      // A3.8.18: Node-18 safe error with cause
      const e = new Error("REVIEW_PIPELINE_FAILED");
      e.cause = pipelineErr;
      throw e;
    }
    
    // A3.8.32: Hard guard - ensure impl returned a plain payload object (not res)
    const looksLikeResponseObject =
      payload &&
      typeof payload === "object" &&
      ("_events" in payload || "outputData" in payload || typeof payload.status === "function");
    
    if (looksLikeResponseObject) {
      const e = new Error("IMPL_RETURNED_RESPONSE_OBJECT");
      e.cause = new Error("Implementation returned Node response object instead of JSON payload");
      throw e;
    }
    
    // A3.8.17: Harden: check pipeline result
    if (!payload || typeof payload !== "object") {
      phase = "respond";
      dbg.phase = phase;
      diag(runId, reqSig, `END route=analyse-selected-statements phase=${phase} segmentCount=0 statementCount=0 dropReasons=["PIPELINE_RETURNED_EMPTY"]`);
      return res.status(200).json({
        ok: true,
        statements: [],
        references: [],
        diagnostics: {
          selectionMode: true,
          segmentCount: 0,
          dropReasons: ["PIPELINE_RETURNED_EMPTY"],
        },
      });
    }
    
    // A3.8.17: Phase: respond
    phase = "respond";
    dbg.phase = phase;
    
    // A3.8.29: Compute counts from the JSON payload (not res object) - immediately before logging
    const statementCount = Array.isArray(payload?.statements) ? payload.statements.length : 0;
    
    // A3.8.29: Compute segmentCount from meta.selectionSegmentsKept or __selectionSegmentId
    let segmentCount = 0;
    if (typeof payload?.meta?.selectionSegmentsKept === "number") {
      segmentCount = payload.meta.selectionSegmentsKept;
    } else if (Array.isArray(payload?.statements)) {
      // Derive from unique __selectionSegmentId count (only finite numbers)
      const uniqueSegmentIds = new Set();
      for (const stmt of payload.statements) {
        if (stmt && typeof stmt === "object" && typeof stmt.__selectionSegmentId === "number" && isFinite(stmt.__selectionSegmentId)) {
          uniqueSegmentIds.add(stmt.__selectionSegmentId);
        }
      }
      segmentCount = uniqueSegmentIds.size;
    }
    
    // A3.8.29: Log END using counts from JSON payload with diagnostic info
    const payloadOk = payload && payload.ok === true;
    const payloadKeys = Object.keys(payload || {}).slice(0, 12).join(",");
    diag(runId, reqSig, `END route=analyse-selected-statements phase=${phase} segmentCount=${segmentCount} statementCount=${statementCount} payloadOk=${payloadOk} payloadKeys=${payloadKeys}`);
    
    // A3.8.29: Return JSON payload via res.json()
    return res.status(200).json(payload);
    
  } catch (err) {
    // A3.8.98: Ensure errors still return JSON and preserve CORS headers
    console.error("[A3.8.98][ANALYSE_SELECTED_FATAL]", err && err.stack ? err.stack : err);
    
    // A3.8.32: Only send error response if headers not already sent
    if (!res.headersSent) {
      // A3.8.98: Ensure CORS headers are set even on errors
      safeSetCorsHeaders(req, res);
      
      // A3.8.16: Top-level catch - ensure JSON response
      // A3.8.17: Extract cause chain
      const causeChain = extractCauseChain(err);
      
      // A3.8.17: Log error EXACTLY ONCE with full details
      diag(runId, reqSig, `ERROR route=analyse-selected-statements phase=${phase} name=${err?.name || "Error"} message=${err?.message || ""}`);
      
      // Log stack
      if (err?.stack) {
        diag(runId, reqSig, `stack=${err.stack}`);
      }
      
      // Log cause chain
      if (causeChain.length > 0) {
        causeChain.forEach((cause, idx) => {
          diag(runId, reqSig, `cause[${idx}] name=${cause.name} message=${cause.message}`);
          if (cause.stack) {
            diag(runId, reqSig, `cause[${idx}] stack=${cause.stack}`);
          }
        });
      }
      
      // Log debug context (NO TEXT)
      diag(runId, reqSig, `dbg=${JSON.stringify({ ...dbg, selectionChars, draftChars, hasInstructions })}`);
      
      return res.status(500).json({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal error in analyse-selected-statements",
          rid: runId,
          sig: reqSig,
          phase: phase,
          name: err?.name || "Error",
          detail: String(err && err.message ? err.message : err),
        },
      });
    }
    // A3.8.32: Headers already sent, just return (no-op)
    return;
  }
};
