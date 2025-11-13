export default function handler(req, res) {
  // Very minimal health check to avoid any crashes
  try {
    // CORS header is nice to have but optional
    res.setHeader('Access-Control-Allow-Origin', '*');
  } catch (e) {
    // Ignore if setHeader fails for any reason
  }

  res.status(200).json({ ok: true });
}
