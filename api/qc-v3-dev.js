import { runPipelineV3 } from "../lib/qc/pipeline-v3/qc-pipeline-v3.mjs";
import { resolveQcTestSourceFiles } from "../lib/resolve-qc-test-sources.mjs";

export default async function handler(req, res) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.BRIGHTLINE_V3_DEV_ENDPOINT !== "1"
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const draft = typeof body?.draft === "string" ? body.draft : "";
    const directSources = Array.isArray(body?.sources) ? body.sources : [];
    const sourceFiles = Array.isArray(body?.sourceFiles) ? body.sourceFiles : [];

    let sources = [];
    if (directSources.length > 0) {
      sources = directSources;
    } else if (sourceFiles.length > 0) {
      const resolved = await resolveQcTestSourceFiles(sourceFiles);
      if (resolved?.error) {
        return res.status(400).json({
          error: resolved.error.code,
          message: resolved.error.message,
        });
      }
      sources = Array.isArray(resolved?.sources) ? resolved.sources : [];
    }

    const result = await runPipelineV3(draft, sources);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Unknown error",
    });
  }
}
