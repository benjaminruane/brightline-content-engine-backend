import { runPipelineV3 } from "../lib/qc/pipeline-v3/qc-pipeline-v3.mjs";

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
    const sources = Array.isArray(body?.sources) ? body.sources : [];

    const result = await runPipelineV3(draft, sources);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Unknown error",
    });
  }
}
