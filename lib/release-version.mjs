import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../VERSION");

/** The release number both repos share. A missing or odd file is an error. */
export function readReleaseVersion() {
  let raw = "";
  try {
    raw = readFileSync(VERSION_FILE, "utf8");
  } catch (err) {
    throw new Error(`VERSION could not be read: ${err?.message || err}`);
  }
  const version = String(raw).trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`VERSION is not a release number: ${JSON.stringify(version)}`);
  }
  return version;
}
