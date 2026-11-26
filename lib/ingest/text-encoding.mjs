/**
 * B603 F65. Detect text encoding and decode uploads so Windows-1252 curly
 * quotes/apostrophes are not turned into U+FFFD.
 */

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);

/**
 * True when every byte sequence is valid UTF-8 (no overlong / surrogate / truncated).
 * @param {Buffer} buf
 */
export function isValidUtf8(buf) {
  if (!Buffer.isBuffer(buf)) return false;
  let i = 0;
  while (i < buf.length) {
    const b = buf[i];
    if (b <= 0x7f) {
      i += 1;
      continue;
    }
    let need = 0;
    let min = 0;
    if ((b & 0xe0) === 0xc0) {
      need = 1;
      min = 0x80;
      if (b < 0xc2) return false; // overlong
    } else if ((b & 0xf0) === 0xe0) {
      need = 2;
      min = 0x800;
    } else if ((b & 0xf8) === 0xf0) {
      need = 3;
      min = 0x10000;
      if (b > 0xf4) return false;
    } else {
      return false;
    }
    if (i + need >= buf.length) return false;
    let cp = b & (0xff >> (need + 1));
    for (let k = 1; k <= need; k += 1) {
      const c = buf[i + k];
      if ((c & 0xc0) !== 0x80) return false;
      cp = (cp << 6) | (c & 0x3f);
    }
    if (cp < min) return false;
    if (cp >= 0xd800 && cp <= 0xdfff) return false;
    if (cp > 0x10ffff) return false;
    i += need + 1;
  }
  return true;
}

/**
 * @param {Buffer|Uint8Array|string} input
 * @returns {"utf-8"|"utf-16le"|"utf-16be"|"windows-1252"}
 */
export function detectTextEncoding(input) {
  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input instanceof Uint8Array ? input : String(input));
  if (buf.length >= 3 && buf.subarray(0, 3).equals(UTF8_BOM)) return "utf-8";
  if (buf.length >= 2 && buf.subarray(0, 2).equals(UTF16LE_BOM)) return "utf-16le";
  if (buf.length >= 2 && buf.subarray(0, 2).equals(UTF16BE_BOM)) return "utf-16be";
  if (isValidUtf8(buf)) return "utf-8";
  return "windows-1252";
}

/**
 * Decode bytes (or a base64 string of bytes) to a JS string.
 * @param {Buffer|Uint8Array|string} input
 * @param {{ base64?: boolean }} [opts]
 */
export function decodeTextBytes(input, opts = {}) {
  let buf;
  if (opts.base64 === true && typeof input === "string") {
    buf = Buffer.from(input, "base64");
  } else if (Buffer.isBuffer(input)) {
    buf = input;
  } else if (input instanceof Uint8Array) {
    buf = Buffer.from(input);
  } else if (typeof input === "string") {
    // Already a string (e.g. browser FileReader UTF-8). Keep as-is unless it is
    // only replacement characters from a prior mis-decode — callers should pass bytes.
    return input;
  } else {
    return "";
  }

  const encoding = detectTextEncoding(buf);
  let start = 0;
  if (encoding === "utf-8" && buf.length >= 3 && buf.subarray(0, 3).equals(UTF8_BOM)) start = 3;
  if (encoding === "utf-16le" || encoding === "utf-16be") start = 2;

  if (encoding === "windows-1252") {
    return decodeWindows1252(buf.subarray(start));
  }
  if (encoding === "utf-16be") {
    const slice = Buffer.from(buf.subarray(start));
    for (let i = 0; i + 1 < slice.length; i += 2) {
      const a = slice[i];
      slice[i] = slice[i + 1];
      slice[i + 1] = a;
    }
    return slice.toString("utf16le");
  }
  if (encoding === "utf-16le") return buf.subarray(start).toString("utf16le");
  return buf.subarray(start).toString("utf8");
}

/** Windows-1252 byte → Unicode for the C1 range (0x80-0x9F). */
const CP1252_MAP = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

export function decodeWindows1252(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i += 1) {
    const b = buf[i];
    if (b >= 0x80 && b <= 0x9f && CP1252_MAP[b] != null) {
      out.push(String.fromCharCode(CP1252_MAP[b]));
    } else {
      out.push(String.fromCharCode(b));
    }
  }
  return out.join("");
}

/**
 * Prefer bytes when present; otherwise keep an already-decoded string.
 * @param {{ text?: string, contentBase64?: string, mimeType?: string, name?: string, fileName?: string }} source
 */
export function decodeSourceText(source) {
  const name = String(source?.name || source?.fileName || "");
  const mime = String(source?.mimeType || "");
  const isText = mime === "text/plain" || /\.txt$/i.test(name) || (!mime && typeof source?.contentBase64 === "string");
  if (isText && typeof source?.contentBase64 === "string" && source.contentBase64.length > 0) {
    return decodeTextBytes(source.contentBase64, { base64: true });
  }
  if (typeof source?.text === "string") return source.text;
  return "";
}
