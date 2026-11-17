// api/import-openai-test.js
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import OpenAI from "openai";

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://brightline-content-engine-frontend.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  res.status(200).json({
    ok: true,
    imported: true,
    openaiType: typeof OpenAI,
  });
}
