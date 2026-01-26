// api/analyse-statements-entry.js
// A3.8.132: Small ESM entry wrapper that imports the huge impl dynamically at call time.
// A3.8.134: Imports from lib/ to avoid Vercel route-handler bundling

// A3.8.137: Entry-level diagnostics
console.log("[A3.8.137][ENTRY_META]", { entryMetaUrl: import.meta.url });

export default async function handler(req, res) {
  // A3.8.137: Resolve impl URL and log before importing
  const implHref = new URL("../lib/analyse-statements-impl.js", import.meta.url).href;
  console.log("[A3.8.137][IMPL_URL]", { implHref });
  
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
