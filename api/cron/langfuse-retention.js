import { runRetention } from "../../lib/langfuse-retention.mjs";

function authorized(req) {
  const secret = typeof process.env.CRON_SECRET === "string" ? process.env.CRON_SECRET.trim() : "";
  if (!secret) return false;
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  return header === `Bearer ${secret}`;
}

function wantsDryRun(req) {
  if (req.query?.dryRun === "1") return true;
  try {
    const url = new URL(req.url || "/", "http://localhost");
    return url.searchParams.get("dryRun") === "1";
  } catch {
    return false;
  }
}

function logLine(result) {
  if (result?.skipped) {
    console.log(`[langfuse-retention] skipped=${result.skipped}`);
    return;
  }
  console.log(
    `[langfuse-retention] cutoff=${result.cutoff} found=${result.found} deleted=${result.deleted} requests=${result.deleteRequests} capped=${result.capped} dryRun=${result.dryRun}`
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!authorized(req)) return res.status(401).json({ error: "unauthorized" });
  try {
    const result = await runRetention({ now: new Date(), dryRun: wantsDryRun(req) });
    logLine(result);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[langfuse-retention] failed", err instanceof Error ? err.message : "error");
    return res.status(500).json({ error: "retention_failed" });
  }
}
