// api/analyse-statements-entry.js
// A3.8.132: Small ESM entry wrapper that imports the huge impl dynamically at call time.
// A3.8.134: Imports from lib/ to avoid Vercel route-handler bundling
export default async function handler(req, res) {
  const mod = await import("../lib/analyse-statements-impl.js");
  const impl = mod?.default;
  if (typeof impl !== "function") {
    throw new Error("analyse-statements-impl default export is not a function");
  }
  return impl(req, res);
}
