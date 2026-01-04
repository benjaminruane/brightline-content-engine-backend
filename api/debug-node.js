// api/debug-node.js
export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    node: process.version,
    nodeOptions: process.env.NODE_OPTIONS || null,
    hasFetch: typeof fetch === "function",
  });
}
