// api/rewrite.js
export default function handler(req, res) {
  res.status(410).json({
    error:
      "This endpoint is deprecated. The frontend now uses /api/generate with mode='rewrite'.",
  });
}
