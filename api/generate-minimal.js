// api/generate-minimal.js

export default async function handler(req, res) {
  res.status(200).json({ ok: true, minimal: true });
}
