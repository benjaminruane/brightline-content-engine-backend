import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
// api/debug-node.js

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS" })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  res.status(200).json({
    ok: true,
    node: process.version,
    nodeOptions: process.env.NODE_OPTIONS || null,
    hasFetch: typeof fetch === "function",
  });
}
