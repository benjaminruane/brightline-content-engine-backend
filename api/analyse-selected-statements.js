// api/analyse-selected-statements.js
//
// A3.8.11: Selection mode endpoint for analyse-statements.
// A3.8.16: Hard validation + fail-closed error envelope

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
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

export default async function handler(req, res) {
  // A3.8.16: Generate RID/SIG early for all logging
  const { runId, reqSig } = generateRidSig();
  
  // A3.8.16: Top-level try/catch to ensure JSON response always
  try {
    // A3.8.16: Set CORS and Content-Type headers immediately
    setCorsHeaders(req, res);
    
    // A3.8.16: Handle OPTIONS preflight
    if (req.method === "OPTIONS") {
      return res.status(200).end();
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
    
    // A3.8.16: Parse body safely
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (parseErr) {
      diag(runId, reqSig, `BAD_REQUEST route=analyse-selected-statements invalid=["JSON parse error: ${parseErr.message}"]`);
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
    
    // A3.8.16: Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      diag(runId, reqSig, `BAD_REQUEST route=analyse-selected-statements missing=[${validation.missing.join(",")}] invalid=[${validation.invalid.join("; ")}]`);
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
    
    // A3.8.16: Normalize inputs
    const selectionTextNorm = body.selectionText.trim();
    const draftTextNorm = body.draftText.trim();
    const instructionsNorm = (body.instructions || "").trim();
    
    // A3.8.16: Log START (once, with request shape summary)
    diag(runId, reqSig, `START route=analyse-selected-statements selectionChars=${selectionTextNorm.length} draftChars=${draftTextNorm.length} hasInstructions=${instructionsNorm.length > 0}`);
    
    // A3.8.16: Guard segmentation inputs
    // Normalize body for implementation
    const normalizedBody = {
      ...body,
      selectionText: selectionTextNorm,
      draftText: draftTextNorm,
      instructions: instructionsNorm,
      selectionUsed: true, // This endpoint always uses selection mode
    };
    
    // A3.8.16: Lazy-load implementation
    let mod;
    let impl;
    try {
      mod = await import("./analyse-statements-impl.js");
      impl = mod?.default;
      if (typeof impl !== "function") {
        throw new Error("analyse-statements-impl missing default export");
      }
    } catch (importErr) {
      diag(runId, reqSig, `ERROR route=analyse-selected-statements name=${importErr?.name} message=${importErr?.message}`);
      return res.status(500).json({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal error in analyse-selected-statements",
          rid: runId,
          sig: reqSig,
        },
      });
    }
    
    // A3.8.16: Call implementation with normalized body
    // Create a request-like object with normalized body
    const normalizedReq = {
      ...req,
      body: normalizedBody,
    };
    
    return await impl(normalizedReq, res);
    
  } catch (err) {
    // A3.8.16: Top-level catch - ensure JSON response
    setCorsHeaders(req, res);
    
    // A3.8.16: Log error with request shape summary (not full text)
    const requestShape = {
      hasBody: !!req.body,
      bodyType: typeof req.body,
      bodySize: typeof req.body === "string" ? req.body.length : (req.body ? JSON.stringify(req.body).length : 0),
      method: req.method,
    };
    
    diag(runId, reqSig, `ERROR route=analyse-selected-statements name=${err?.name} message=${err?.message} requestShape=${JSON.stringify(requestShape)} stack=${err?.stack?.split("\n").slice(0, 3).join(" | ") || "no stack"}`);
    
    return res.status(500).json({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal error in analyse-selected-statements",
        rid: runId,
        sig: reqSig,
      },
    });
  }
}
