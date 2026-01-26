// api/analyse-statements-entry.js
// A3.8.132: Small ESM entry wrapper that imports the huge impl dynamically at call time.
// A3.8.134: Imports from lib/ to avoid Vercel route-handler bundling

// A3.8.137: Entry-level diagnostics
console.log("[A3.8.137][ENTRY_META]", { entryMetaUrl: import.meta.url });

export default async function handler(req, res) {
  // A3.8.147: Diagnostic probe for /var/task/lib contents (env-gated)
  const diagFlag = String(process.env.BRIGHTLINE_DIAG_IMPORTS || "");
  if (diagFlag === "1") {
    try {
      const { readdir, access } = await import("node:fs/promises");
      const taskLibPath = "/var/task/lib";
      
      try {
        const entries = await readdir(taskLibPath);
        const sorted = entries.sort().slice(0, 80);
        console.log("[A3.8.147][TASK_LIB_LIST]", { count: entries.length, sample: sorted });
        
        // Check for web.js existence
        try {
          await access("/var/task/lib/web.js");
          console.log("[A3.8.147][TASK_LIB_HAS_WEB]", { hasWeb: true });
        } catch (accessErr) {
          console.log("[A3.8.147][TASK_LIB_HAS_WEB]", { hasWeb: false });
        }
      } catch (fsErr) {
        console.error("[A3.8.147][TASK_LIB_PROBE_FAIL]", {
          message: fsErr?.message || String(fsErr),
          name: fsErr?.name || "Error"
        });
      }
    } catch (importErr) {
      console.error("[A3.8.147][TASK_LIB_PROBE_FAIL]", {
        message: importErr?.message || String(importErr),
        name: importErr?.name || "Error"
      });
    }
  }
  
  // A3.8.137: Resolve impl URL and log before importing
  const implUrl = new URL("../lib/analyse-statements-impl.mjs", import.meta.url);
  const implHref = implUrl.href;
  console.log("[A3.8.137][IMPL_URL]", { implHref });
  
  // A3.8.153: Pre-import scan for leftover "export" tokens (env-gated)
  if (diagFlag === "1") {
    try {
      const { readFile } = await import("node:fs/promises");
      try {
        const implText = await readFile(implUrl, "utf8");
        const lines = implText.split(/\r?\n/);
        const exportSamples = [];
        
        for (let i = 0; i < lines.length && exportSamples.length < 12; i++) {
          if (lines[i].includes("export")) {
            const trimmed = lines[i].trim();
            const preview = trimmed.length > 200 ? trimmed.substring(0, 200) : trimmed;
            exportSamples.push({
              lineNumber: i + 1,
              preview: preview
            });
          }
        }
        
        console.log("[A3.8.153][IMPL_EXPORT_SCAN]", {
          count: exportSamples.length,
          samples: exportSamples
        });
        
        // A3.8.155: Precompile with vm.SourceTextModule to get precise SyntaxError location
        try {
          const vm = await import("node:vm");
          if (typeof vm.SourceTextModule === "function") {
            try {
              // compile-only; do not link/evaluate
              new vm.SourceTextModule(implText, { identifier: implUrl.href });
              console.log("[A3.8.155][VM_COMPILE_OK]", { implHref: implUrl.href });
            } catch (e) {
              const props = {};
              try {
                for (const k of Object.getOwnPropertyNames(e || {})) {
                  props[k] = e[k];
                }
              } catch (_) {}
              console.error("[A3.8.155][VM_COMPILE_FAIL]", {
                name: e?.name,
                message: e?.message,
                stack: e?.stack,
                props
              });
            }
          } else {
            console.log("[A3.8.155][VM_NO_SOURCETEXTMODULE]", { ok: false });
          }
        } catch (vmErr) {
          console.error("[A3.8.155][VM_COMPILE_FAIL]", {
            name: vmErr?.name || "Error",
            message: vmErr?.message || String(vmErr)
          });
        }
        
        // A3.8.160: Scan for handler definition patterns and export context
        try {
          const handlerPatterns = [
            { pattern: /\basync\s+function\s+handler\s*\(/, name: "async function handler(" },
            { pattern: /\bfunction\s+handler\s*\(/, name: "function handler(" },
            { pattern: /\bconst\s+handler\s*=\s*/, name: "const handler =" },
            { pattern: /\blet\s+handler\s*=\s*/, name: "let handler =" },
            { pattern: /\bvar\s+handler\s*=\s*/, name: "var handler =" }
          ];
          
          for (const { pattern, name } of handlerPatterns) {
            const matchIndex = implText.search(pattern);
            if (matchIndex !== -1) {
              // Calculate 1-based line number
              const textBeforeMatch = implText.substring(0, matchIndex);
              const lineNumber = textBeforeMatch.split(/\r?\n/).length;
              
              // Extract context lines [line-3 .. line+3] (7 lines total)
              const contextStart = Math.max(0, lineNumber - 4); // 0-based index for line-3
              const contextEnd = Math.min(lines.length, lineNumber + 3); // 0-based index for line+3 (exclusive)
              const contextLines = lines.slice(contextStart, contextEnd);
              
              console.log("[A3.8.160][IMPL_HANDLER_MATCH]", {
                pattern: name,
                lineNumber,
                contextLines
              });
            }
          }
          
          // Find export default handler; context
          const exportIndex = implText.lastIndexOf("export default handler;");
          if (exportIndex !== -1) {
            const textBeforeExport = implText.substring(0, exportIndex);
            const exportLineNumber = textBeforeExport.split(/\r?\n/).length;
            
            // Extract context lines [line-3 .. line+3] (7 lines total)
            const contextStart = Math.max(0, exportLineNumber - 4); // 0-based index for line-3
            const contextEnd = Math.min(lines.length, exportLineNumber + 3); // 0-based index for line+3 (exclusive)
            const contextLines = lines.slice(contextStart, contextEnd);
            
            console.log("[A3.8.160][IMPL_EXPORT_CONTEXT]", {
              lineNumber: exportLineNumber,
              contextLines
            });
          }
        } catch (scanErr) {
          console.error("[A3.8.160][IMPL_TEXT_SCAN_FAIL]", {
            name: scanErr?.name || "Error",
            message: scanErr?.message || String(scanErr),
            stack: scanErr?.stack
          });
        }
      } catch (readErr) {
        console.error("[A3.8.153][IMPL_EXPORT_SCAN_FAIL]", {
          name: readErr?.name || "Error",
          message: readErr?.message || String(readErr)
        });
      }
    } catch (importErr) {
      console.error("[A3.8.153][IMPL_EXPORT_SCAN_FAIL]", {
        name: importErr?.name || "Error",
        message: importErr?.message || String(importErr)
      });
    }
  }
  
  // A3.8.137: Direct import by href with detailed error logging
  let mod;
  try {
    mod = await import(implHref);
    console.log("[A3.8.137][IMPL_IMPORT_OK]", { implHref });
  } catch (e) {
    const props = {};
    try { 
      for (const k of Object.getOwnPropertyNames(e || {})) {
        props[k] = e[k];
      }
    } catch (_) {}
    console.error("[A3.8.137][IMPL_IMPORT_FAIL]", { 
      implHref, 
      name: e?.name, 
      message: e?.message, 
      props, 
      stack: e?.stack 
    });
    throw e;
  }
  
  const impl = mod?.default;
  if (typeof impl !== "function") {
    throw new Error("analyse-statements-impl default export is not a function");
  }
  return impl(req, res);
}
