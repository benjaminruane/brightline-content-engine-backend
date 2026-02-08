// api/analyse-selected-statements.js
//
// A3.8.11: Selection mode endpoint for analyse-statements.
// A3.8.16: Hard validation + fail-closed error envelope
// A3.8.99: ESM default export with CORS-safe preflight handling
// A3.8.101: Use ESM dynamic import() to load ESM impl module

// A3.9.53: Module-scope version stamp — verbose-only (quiet-by-default)
if (process.env.BRIGHTLINE_DIAG_VERBOSE === "1") {
  console.log("[A3.9.40][WRAPPER_VERSION]", { ts: new Date().toISOString(), url: import.meta.url });
}

// A3.8.99: ESM default export (not CommonJS module.exports)
export default async function handler(req, res) {
  // A3.8.99: Set CORS headers BEFORE any awaits/imports that might throw
  const origin = req?.headers?.origin || req?.headers?.Origin || "";
  const allowedOrigins = [
    "https://brightline-content-engine-frontend.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000"
  ];
  
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  // A3.8.99: Set CORS headers immediately
  if (res && typeof res.setHeader === "function") {
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  
  // A3.8.99: Handle OPTIONS preflight immediately
  if (req.method === "OPTIONS") {
    if (res && typeof res.status === "function") {
      return res.status(204).end();
    }
    return;
  }
  
  // A3.8.99: Enforce POST only
  if (req.method !== "POST") {
    if (res && typeof res.status === "function" && typeof res.json === "function") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }
    return;
  }

  // A3.9.35: Request RID (pre-import) for deterministic logging
  const rid = (req.headers && (req.headers["x-brightline-rid"] || req.headers["X-Brightline-Rid"])) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  req._brightlineRid = rid;
  // A3.9.53: Log tiers — verbose gated by BRIGHTLINE_DIAG_VERBOSE (quiet-by-default)
  const earlyDiagVerbose = process.env.BRIGHTLINE_DIAG_VERBOSE === "1";
  const logA = (...args) => console.log(...args);
  const logVEarly = (...args) => { if (earlyDiagVerbose) console.log(...args); };
  // A3.9.55: Imports-only gate for init/URL diagnostics (BRIGHTLINE_DIAG_IMPORTS)
  const diagImports = (process.env.BRIGHTLINE_DIAG_IMPORTS === "1");
  const logImports = (...args) => { if (diagImports) console.log(...args); };
  logVEarly("[A3.9.35][WRAPPER_MARKER]", {
    rid,
    route: "analyse-selected-statements",
    method: req.method,
    ts: new Date().toISOString(),
    selectionUsed: Boolean(req.body && req.body.selectionText),
  });
  
  // A3.8.131: Prove env var presence at runtime (verbose-only)
  const diagFlag = String(process.env.BRIGHTLINE_DIAG_IMPORTS || "");
  logVEarly("[A3.8.131][DIAG_ENV]", { BRIGHTLINE_DIAG_IMPORTS: diagFlag, enabled: diagFlag === "1" });
  
  // A3.8.123: Probe: sequentially import impl dependency graph (conditional via env flags)
  // Execute BEFORE any dynamic imports that can throw
  if (earlyDiagVerbose && diagFlag === "1") {
    // A3.8.148: Probe /var/task/lib before import-graph loop
    try {
      const { readdir, access } = await import("node:fs/promises");
      try {
        const entries = await readdir("/var/task/lib");
        const sorted = entries.sort().slice(0, 80);
        console.log("[A3.8.148][TASK_LIB_LIST]", { count: entries.length, sample: sorted });
        
        // Check existence of key files
        let hasWeb = false;
        let hasPkg = false;
        let hasImpl = false;
        
        try {
          await access("/var/task/lib/web.js");
          hasWeb = true;
        } catch (_) {}
        
        try {
          await access("/var/task/lib/package.json");
          hasPkg = true;
        } catch (_) {}
        
        try {
          await access("/var/task/lib/analyse-statements-impl.mjs");
          hasImpl = true;
        } catch (_) {}
        
        console.log("[A3.8.148][TASK_LIB_HAS]", { hasWeb, hasPkg, hasImpl });
      } catch (fsErr) {
        console.log("[A3.8.148][TASK_LIB_PROBE_FAIL]", {
          name: fsErr?.name || "Error",
          message: fsErr?.message || String(fsErr)
        });
      }
    } catch (importErr) {
      console.log("[A3.8.148][TASK_LIB_PROBE_FAIL]", {
        name: importErr?.name || "Error",
        message: importErr?.message || String(importErr)
      });
    }
    
    try {
      const { readFile } = await import("node:fs/promises");
      // A3.8.134: Probe reads from lib/ where impl was moved to avoid Vercel bundling
      const implUrl = new URL("../lib/analyse-statements-impl.mjs", import.meta.url);
      const implText = await readFile(implUrl, "utf8");

      const targets = [];
      const fromRe = /\bimport\s+[^;]*?\s+from\s+["']([^"']+)["']/g;
      const sideRe = /\bimport\s+["']([^"']+)["']/g;
      const exportFromRe = /\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g;

      let m;
      while ((m = fromRe.exec(implText))) targets.push(m[1]);
      while ((m = sideRe.exec(implText))) targets.push(m[1]);
      while ((m = exportFromRe.exec(implText))) targets.push(m[1]);

      const seen = new Set();
      const importTargets = targets.filter(t => (seen.has(t) ? false : (seen.add(t), true)));

      for (const target of importTargets) {
        try {
          // A3.8.135: Resolve relative imports relative to implUrl to avoid incorrect resolution
          if (target.startsWith(".")) {
            const resolved = new URL(target, implUrl).href;
            await import(resolved);
          } else {
            await import(target);
          }
        } catch (e) {
          console.error("[A3.8.135][IMPORT_GRAPH_FAIL]", {
            target,
            name: e?.name,
            message: e?.message,
            stack: e?.stack
          });
          throw e;
        }
      }
    } catch (e) {
      // fall through; existing outer catch will return JSON error
      throw e;
    }
  }
  
  // A3.8.16: Generate RID/SIG for logging
  // A3.9.37: Use wrapper RID so pre-import DIAG lines match [A3.9.35][WRAPPER_MARKER] rid
  const runId = req._brightlineRid || Math.random().toString(36).substring(2, 15);
  const reqSig = Math.random().toString(36).substring(2, 10);
  
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
  
  // A3.8.17: Phase tracker + debug context
  let phase = "init";
  let selectionChars = 0;
  let draftChars = 0;
  let hasInstructions = false;
  const dbg = { route: "analyse-selected-statements", phase: "init", selectionMode: true };
  
  // A3.14.8: Safe request-body parse (non-throwing); explicit 400 on invalid JSON
  function safeJsonParseLocal(str) {
    if (typeof str !== "string") return { ok: false, errorMessage: "expected string" };
    try {
      const value = JSON.parse(str);
      return { ok: true, value };
    } catch (parseErr) {
      return { ok: false, errorMessage: parseErr?.message ? String(parseErr.message) : "Invalid JSON" };
    }
  }

  // A3.8.16: Top-level try/catch to ensure JSON response always
  try {
    // A3.8.17: Phase: parse_body
    phase = "parse_body";
    dbg.phase = phase;
    
    // A3.14.8: Parse body without throwing; return 400 with meta on invalid JSON
    let body;
    if (typeof req.body === "string") {
      const parsed = safeJsonParseLocal(req.body);
      if (!parsed.ok) {
        const fatalErrorMessage = (parsed.errorMessage || "Invalid JSON").slice(0, 240);
        console.log("[A3.14.8][REQ_BODY_INVALID_JSON]", {
          bodyType: typeof req.body,
          bodyLen: req.body.length,
          contentType: req.headers["content-type"] || null,
        });
        return res.status(400).json({
          ok: false,
          statements: [],
          references: [],
          meta: {
            fatalStage: "request_body_invalid_json",
            fatalErrorClass: "invalid_json",
            fatalErrorMessage,
            bodyType: "string",
          },
        });
      }
      body = parsed.value;
    } else {
      body = req.body || {};
    }
    if (!body || typeof body !== "object") {
      logA("[A3.9.53][BAD_REQUEST]", { rid: req._brightlineRid || runId, route: "analyse-selected-statements", phase, invalid: "Body must be an object" });
      return res.status(400).json({
        ok: false,
        statements: [],
        references: [],
        meta: {
          fatalStage: "request_body_invalid_json",
          fatalErrorClass: "invalid_json",
          fatalErrorMessage: "Body must be an object",
          bodyType: typeof req.body,
        },
      });
    }
    // A3.9.53: Quiet-by-default — diagVerbose from body or BRIGHTLINE_DIAG_VERBOSE; log tiers
    const diagVerbose = Boolean(body?._diag?.verbose) || (process.env.BRIGHTLINE_DIAG_VERBOSE === "1");
    const logV = (...args) => { if (diagVerbose) console.log(...args); };
    // A3.9.53: Always-on request summary (one line per request); replaces START/END spam
    const selectionUsed = Boolean(body?.selectionText);
    selectionChars = (body?.selectionText && typeof body.selectionText === "string") ? body.selectionText.trim().length : 0;
    const uploadedSourcesCount = Array.isArray(body?.uploadedSources) ? body.uploadedSources.length : 0;
    logA("[A3.9.53][REQ_SUMMARY]", { rid: req._brightlineRid || runId, route: "analyse-selected-statements", method: req.method, selectionUsed, selectionChars, uploadedSourcesCount, diagVerbose });
    // A3.9.34: Build marker — always-on handler-level marker
    logA("[A3.9.34][BUILD_MARKER]", { active: true, build: "A3.14.8" });
    
    // A3.8.17: Phase: validate
    phase = "validate";
    dbg.phase = phase;
    
    // A3.8.17: Harden: normalize unexpected types safely
    if (typeof body.selectionText !== "string") {
      logA("[A3.9.53][BAD_REQUEST]", { rid: req._brightlineRid || runId, route: "analyse-selected-statements", phase, invalid: "selectionText must be a string" });
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
      logA("[A3.9.53][BAD_REQUEST]", { rid: req._brightlineRid || runId, route: "analyse-selected-statements", phase, invalid: "draftText must be a string" });
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
      logA("[A3.9.53][BAD_REQUEST]", { rid: req._brightlineRid || runId, route: "analyse-selected-statements", phase, missing: validation.missing.join(","), invalid: validation.invalid.join("; ") });
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
    
    // A3.8.16: Log START (verbose-only; REQ_SUMMARY replaces always-on)
    logV("START route=analyse-selected-statements", { selectionChars, draftChars, hasInstructions });
    
    // A3.10.10 / A3.13.2: Treat sources[kind=file] as uploadedSources when selection mode and uploadedSources missing/empty
    const fileSources = Array.isArray(body?.sources)
      ? body.sources.filter(s => s && s.kind === "file" && typeof s.text === "string" && s.text.trim().length > 0)
      : [];
    const uploadedMissingOrEmpty = !Array.isArray(body?.uploadedSources) || body.uploadedSources.length === 0;
    if (selectionUsed && fileSources.length > 0 && uploadedMissingOrEmpty) {
      body.uploadedSources = fileSources.map((s, i) => ({
        id: s.id != null ? s.id : `file_${i}_${Date.now().toString(36)}`,
        name: (s.name != null && typeof s.name === "string") ? s.name : "uploaded_file",
        title: (s.name != null && typeof s.name === "string") ? s.name : "uploaded_file",
        text: s.text,
        url: null,
        sourceType: "uploaded"
      }));
    }
    
    // A3.9.41: Derive uploadedSources from sources (uploaded) before strict contract; single source of truth
    const sourcesArr = Array.isArray(body?.sources) ? body.sources : [];
    const uploadedFromSources = sourcesArr.filter(s =>
      s && (s.sourceType === "uploaded" || s.source_type === "uploaded")
    );
    const rawUploaded = body?.uploadedSources ?? body?.uploadedDocs ?? body?.uploadedDocuments ?? [];
    const originalUploadedSourcesLen = Array.isArray(rawUploaded) ? rawUploaded.length : 0;
    if (Array.isArray(body?.uploadedSources) && body.uploadedSources.length > 0) {
      // keep existing (no derivation)
    } else if (uploadedFromSources.length > 0) {
      body.uploadedSources = uploadedFromSources;
    } else {
      body.uploadedSources = [];
    }
    delete body.uploadedDocs;
    delete body.uploadedDocuments;
    if (body.uploadedSources.length === uploadedFromSources.length && uploadedFromSources.length > 0 && originalUploadedSourcesLen === 0) {
      logV("[A3.9.41][UPLOADS_DERIVED_FROM_SOURCES]", {
        rid: req._brightlineRid || runId,
        derivedCount: uploadedFromSources.length
      });
    }

    // A3.9.50: Synthesize uploadedSources placeholder for versionId-backed selection runs (explicit, no silent fallback)
    const selectionTextLen = (typeof body.selectionText === "string") ? body.selectionText.trim().length : 0;
    const isSelection = selectionTextLen > 0 || body.selectionUsed === true;
    let uploadedSourcesSynthetic = false;
    if (isSelection && body.versionId) {
      if (!Array.isArray(body.uploadedSources) || body.uploadedSources.length === 0) {
        body.uploadedSources = [{
          sourceType: "uploaded",
          title: "versionId-backed uploads",
          url: null,
          meta: { versionId: String(body.versionId) }
        }];
        uploadedSourcesSynthetic = true;
      }
    }
    console.log("[A3.9.50][WRAP_UPLOADS_EFFECTIVE]", {
      rid: req._brightlineRid || runId,
      isSelection,
      versionIdPresent: Boolean(body.versionId),
      uploadedSourcesCount: Array.isArray(body.uploadedSources) ? body.uploadedSources.length : -1,
      uploadedSourcesSynthetic
    });

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
    
    // A3.8.101: Phase: run_review_pipeline (ESM dynamic import)
    phase = "run_review_pipeline";
    dbg.phase = phase;
    
    // A3.8.101: Delegate to analyse-statements-impl.js using ESM dynamic import()
    // A3.8.130: Import via entry wrapper to avoid Vercel bundling issues with huge impl module
    // A3.8.131: Log import target to confirm entry module is being used
    const implHref = "./analyse-statements-entry.js";
    logV("[A3.8.131][IMPORT_TARGET]", { target: implHref });
    logImports("[A3.9.35][WRAPPER_IMPL_URL]", { rid: req._brightlineRid || rid, implHref });
    try {
      const mod = await import(implHref);
      logV("[A3.9.35][WRAPPER_IMPORT_OK]", { rid: req._brightlineRid || rid });
      const implHandler = mod?.default;
      
      if (typeof implHandler !== "function") {
        throw new Error("analyse-statements-entry.js default export is not a function");
      }
      
      // A3.8.99: Read body safely and force selectionUsed=true for this endpoint
      const bodyForImpl = req.body || {};
      req.body = { ...bodyForImpl, selectionUsed: true, ...normalizedBody };
      
      // A3.8.25: Pass diag context to implementation for unified RID/SIG
      // A3.9.51: Preserve _diag.verbose from body so impl can gate verbose corpus logs
      const diagContext = { rid: runId, sig: reqSig, verbose: diagVerbose };
      req.body._diag = { ...(req.body._diag || {}), ...diagContext };
      
      // A3.9.40 / A3.9.41: Definitive wrapper log right before calling impl (A3.9.52: verbose-only)
      logV("[A3.9.40][WRAP_UPLOADS]", {
        rid: req._brightlineRid || runId,
        uploadedSourcesCount: Array.isArray(req.body.uploadedSources) ? req.body.uploadedSources.length : -1,
        bodyKeysHasUploadedSources: Object.prototype.hasOwnProperty.call(req.body, "uploadedSources"),
        bodyKeysSample: Object.keys(req.body || {}).slice(0, 20),
        sourcesCount: sourcesArr.length,
        sourcesUploadedCount: uploadedFromSources.length
      });
      
      // A3.8.16: Call implementation with normalized body
      const normalizedReq = {
        ...req,
        body: req.body,
      };
      
      // A3.8.29: Part A - Separate payload (JSON) from res (Vercel response object)
      // A3.8.17: Harden: wrap pipeline call in try/catch
      let payload;
      try {
        payload = await implHandler(normalizedReq, res);
      } catch (pipelineErr) {
        // A3.8.17: Re-throw with context to preserve phase tracking
        // A3.8.18: Node-18 safe error with cause
        const e = new Error("REVIEW_PIPELINE_FAILED");
        e.cause = pipelineErr;
        throw e;
      }
      
      // A3.14.5: Impl never sends; always returns payload. Wrapper sends once.
      // A3.8.169: Defensive check for Node response object (should not occur under A3.14.5)
      if (
        payload &&
        typeof payload === "object" &&
        (typeof payload.statusCode === "number" || typeof payload.end === "function" || typeof payload.writeHead === "function")
      ) {
        logV("[A3.8.169][ENTRY_RETURNED_NODE_RESPONSE][OK]", { statusCode: payload?.statusCode ?? null });
        return;
      }
      if (
        payload &&
        typeof payload === "object" &&
        ("_events" in payload || "outputData" in payload || typeof payload.status === "function")
      ) {
        // Legacy check: only throw if it's not a recognized Node response pattern
        const e = new Error("IMPL_RETURNED_RESPONSE_OBJECT");
        e.cause = new Error("Implementation returned Node response object instead of JSON payload");
        throw e;
      }
      
      // A3.8.17: Harden: check pipeline result
      if (!payload || typeof payload !== "object") {
        phase = "respond";
        dbg.phase = phase;
        logV("END route=analyse-selected-statements", { phase, segmentCount: 0, statementCount: 0, dropReasons: ["PIPELINE_RETURNED_EMPTY"] });
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
      
      // A3.8.29: Log END (verbose-only)
      const payloadOk = payload && payload.ok === true;
      const payloadKeys = Object.keys(payload || {}).slice(0, 12).join(",");
      logV("END route=analyse-selected-statements", { phase, segmentCount, statementCount, payloadOk, payloadKeys });
      
      // A3.13.2: Evidence Posture Fatal Meta (failure responses only; selection mode; meta-only)
      if (payload && payload.ok === false) {
        const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
        const extractionQuality = meta.extractionQuality ?? null;
        const reasons = Array.isArray(meta.extractionQualityReasons) ? meta.extractionQualityReasons : [];
        const fatalText = typeof meta.fatal === "string" ? meta.fatal : "";
        let evidencePostureFatal = "unexpected_fatal";
        if (extractionQuality === "failed" && reasons.includes("selection_mode_fatal_error") && reasons.includes("fallback_prevented")) {
          evidencePostureFatal = "thin_evidence_fatal";
        } else if (
          fatalText.includes("selectionText not found") ||
          fatalText.includes("selection text not found") ||
          fatalText.includes("selection anchor") ||
          fatalText.includes("selection mismatch") ||
          fatalText.includes("selection segmentation")
        ) {
          evidencePostureFatal = "selection_anchor_fatal";
        }
        const effectiveUploadedInputCount = Array.isArray(req.body?.uploadedSources) ? req.body.uploadedSources.length : (meta.uploadedSourcesCount != null ? meta.uploadedSourcesCount : null);
        const selectionTextLen = typeof req.body?.selectionText === "string" ? req.body.selectionText.trim().length : null;
        const webSearchUsed = meta.webSearch && typeof meta.webSearch.used !== "undefined" ? Boolean(meta.webSearch.used) : null;
        meta.evidencePostureFatal = evidencePostureFatal;
        meta.evidencePostureFatalSignals = {
          effectiveUploadedInputCount,
          selectionTextLen,
          webSearchUsed,
          extractionQualityReasons: reasons
        };
        payload.meta = meta;
      }
      
      // A3.8.29: Return JSON payload via res.json()
      return res.status(200).json(payload);
      
    } catch (err) {
      // A3.9.53: Always-on fatal log — single-line, rid, no body/stack dump
      logA("[A3.9.53][FATAL]", { rid: req._brightlineRid || rid, route: "analyse-selected-statements", phase, name: err?.name, message: err?.message });
      // Verbose: full details for debugging
      if (earlyDiagVerbose || (typeof diagVerbose !== "undefined" && diagVerbose)) {
        console.error("[A3.8.132][IMPORT_ERR_PROPS]", Object.getOwnPropertyNames(err || {}).reduce((o, k) => ({ ...o, [k]: err[k] }), {}));
        if (err?.cause) console.error("[A3.8.133][CAUSE_ERR_PROPS]", Object.getOwnPropertyNames(err.cause).reduce((o, k) => ({ ...o, [k]: err.cause[k] }), {}));
        if (err?.stack) console.error("[A3.8.133][ANALYSE_SELECTED_FATAL]", err.stack);
      }
      
      // A3.14.5: Wrapper sends once; impl never sends. Use 200 + ok:false payload.
      if (res && typeof res.status === "function" && typeof res.json === "function") {
        return res.status(200).json({
          ok: false,
          statements: [],
          references: [],
          error: {
            code: "INTERNAL_ERROR",
            message: "Internal error in analyse-selected-statements",
            rid: runId,
            sig: reqSig,
            phase: phase,
            name: err?.name || "Error",
            detail: String(err && err.message ? err.message : err),
          },
          meta: { fatalStage: "route_exception", extractionQuality: "failed", extractionQualityReasons: ["route_exception"] },
        });
      }
    }
    
  } catch (err) {
    // A3.9.53: Always-on fatal log — single-line, rid; verbose stack only when BRIGHTLINE_DIAG_VERBOSE=1
    logA("[A3.9.53][FATAL]", { rid: req._brightlineRid || rid, route: "analyse-selected-statements", phase: "pre_impl", name: err?.name, message: err?.message });
    if (earlyDiagVerbose && err?.stack) console.error("[A3.8.133][ANALYSE_SELECTED_FATAL]", err.stack);
    
    // A3.14.5: Wrapper sends once. Use 200 + ok:false payload.
    if (res && typeof res.status === "function" && typeof res.json === "function") {
      return res.status(200).json({
        ok: false,
        statements: [],
        references: [],
        meta: { fatal: String(err && err.message ? err.message : err).slice(0, 300), fatalStage: "route_exception", extractionQuality: "failed", extractionQualityReasons: ["route_exception"] },
      });
    }
  }
}
