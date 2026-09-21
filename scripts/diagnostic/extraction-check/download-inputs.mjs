#!/usr/bin/env node
/**
 * Fetch the eleven public PDFs listed in REPORT.md lines 104-114.
 * Skip a file already on disk. Binaries stay gitignored.
 *
 *   node scripts/diagnostic/extraction-check/download-inputs.mjs
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUTS_DIR = path.join(__dirname, "inputs");

const FILES = [
  {
    name: "pg-annual-results-2024.pdf",
    url: "https://www.partnersgroup.com/~/media/Files/P/Partnersgroup/Universal/shareholders/reports-and-presentations/2025/annual-results-2024-presentation.pdf",
  },
  {
    name: "pg-ir-july-2025.pdf",
    url: "https://www.partnersgroup.com/~/media/Files/P/Partnersgroup/Universal/shareholders/reports-and-presentations/2025/partners-group-ir-presentation-july-2025.pdf",
  },
  {
    name: "3i-fy25-presentation.pdf",
    url: "https://www.3i.com/media/vl1d3svk/3igroupfy25-presentation.pdf",
  },
  {
    name: "3i-overview-and-strategy-2025.pdf",
    url: "https://www.3i.com/media/kvkhybyl/3i-group-2025-overview-and-strategy.pdf",
  },
  {
    name: "hpif-factsheet-march-2026.pdf",
    url: "https://harbourvest.com/content/dam/hv/web/files/en/funds/hpif/HPIF-Factsheet-March-2026.pdf",
  },
  {
    name: "hpif-report-march-2026.pdf",
    url: "https://harbourvest.com/content/dam/hv/web/files/en/funds/hpif/HPIF%20Report%20-%20March%202026.pdf",
  },
  {
    name: "hpif-annual-fs-2026.pdf",
    url: "https://harbourvest.com/content/dam/hv/web/files/en/funds/hpif/HPIF-Annual-Financial-Statements-March-31-2026.pdf",
  },
  {
    name: "3i-audited-fs-2025.pdf",
    url: "https://www.3i.com/media/u3ojrc3a/3i-group-2025-audited-financial-statements.pdf",
  },
  {
    name: "3i-press-release-fy2025.pdf",
    url: "https://www.3i.com/media/o13kcz40/3i-group-press-release-fy2025.pdf",
  },
  {
    name: "3i-press-release-fy25-highlights.pdf",
    url: "https://www.3i.com/media/trxnuzha/3i-group-press-release-fy25-highlights.pdf",
  },
  {
    name: "3i-ar-2025.pdf",
    url: "https://www.3i.com/media/cxwbwcdw/3i-group-annual-report-2025-interactive.pdf",
  },
];

async function fileBytes(filePath) {
  try {
    const s = await stat(filePath);
    return s.isFile() ? s.size : 0;
  } catch {
    return 0;
  }
}

async function fetchOne(entry) {
  const dest = path.join(INPUTS_DIR, entry.name);
  const existing = await fileBytes(dest);
  const res = await fetch(entry.url, {
    redirect: "follow",
    headers: { "user-agent": "brightline-extraction-check/1.0" },
  });
  const status = res.status;
  if (existing > 0) {
    await res.arrayBuffer().catch(() => null);
    return { name: entry.name, bytes: existing, httpStatus: status, skipped: true, ok: status >= 200 && status < 400 };
  }
  if (!res.ok) {
    return { name: entry.name, bytes: 0, httpStatus: status, skipped: false, ok: false };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return { name: entry.name, bytes: buf.length, httpStatus: status, skipped: false, ok: true };
}

async function main() {
  await mkdir(INPUTS_DIR, { recursive: true });
  const rows = [];
  for (const entry of FILES) {
    try {
      const row = await fetchOne(entry);
      rows.push(row);
      const skip = row.skipped ? " skip" : "";
      console.log(`${row.name}  bytes=${row.bytes}  HTTP ${row.httpStatus}${skip}`);
    } catch (err) {
      rows.push({
        name: entry.name,
        bytes: 0,
        httpStatus: 0,
        skipped: false,
        ok: false,
        error: err?.message || String(err),
      });
      console.log(`${entry.name}  bytes=0  HTTP 0  error=${err?.message || String(err)}`);
    }
  }
  const failed = rows.filter((r) => !r.ok).map((r) => r.name);
  console.log(`done files=${rows.length} failed=${failed.length}${failed.length ? ` ${failed.join(",")}` : ""}`);
  if (failed.length > 2) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
