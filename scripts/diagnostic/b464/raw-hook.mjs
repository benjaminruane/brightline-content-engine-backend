/**
 * B464. Diagnostic loader only. Copies the note and craft replies
 * into globalThis.__b464Raw. It does not change the product.
 */
const MARK = "const latencyMs = Date.now() - startedAt;";
const INSERT = `${MARK}
    if (Array.isArray(globalThis.__b464Raw)) {
      const spanName = typeof span === "string" ? span : "";
      if (spanName === "b404-note" || spanName === "b404-note-retry" || spanName === "b404-writer" || spanName === "b404-writer-retry") {
        globalThis.__b464Raw.push({
          span: spanName,
          model: typeof model === "string" ? model : "",
          text: typeof attempt.text === "string" ? attempt.text : "",
        });
      }
    }`;

export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context);
  if (!String(url).endsWith("/lib/observability.js")) return loaded;
  const source = loaded.source.toString();
  if (!source.includes(MARK)) {
    throw new Error("b464: callLLM no longer has the latency mark. The raw-reply hook was not applied.");
  }
  return { ...loaded, source: source.replace(MARK, INSERT), format: "module" };
}
