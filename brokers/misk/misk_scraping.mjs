// Misk (MISC) Financial Brokerage, owned by Safwa Islamic Bank, trades only
// Amman Stock Exchange shares that pass its semi-annual Shari'a screening,
// "to ensure that all traded shares are compliant". The product page links
// the current screened list as a PDF: number, ASE company code, name, ticker
// and market (1 = first market, 2 = second market, OTC = third market).
//
//   https://www.safwabank.com/en/product/misc/
//   https://www.safwabank.com/wp-content/uploads/2026/10/Misk-Brokerage-1.pdf  (at the time of writing)
//
// All rows are ASE shares in dinars. The ASE has no ETFs. The PDF carries
// no ISINs. The place is written out in full: "ASE" alone reads as NYSE
// American in the venue table. Reading the PDF needs python3 with pypdf.
//
//   node brokers/misk/misk_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://www.safwabank.com/en/product/misc/";
const MARKETS = { 1: "First Market", 2: "Second Market", OTC: "OTC" };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, accept) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

function pdfText(bytes) {
  const pdfPath = path.join(os.tmpdir(), `misk-${process.pid}.pdf`);
  fs.writeFileSync(pdfPath, bytes);
  const script = [
    "from pypdf import PdfReader",
    "import sys",
    "reader = PdfReader(sys.argv[1])",
    "sys.stdout.write('\\n'.join((page.extract_text() or '') for page in reader.pages))",
  ].join("; ");
  const result = spawnSync("python3", ["-c", script, pdfPath], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  fs.rmSync(pdfPath, { force: true });
  if (result.status !== 0) throw new Error(result.stderr || "python3 could not read the Misk PDF (pypdf).");
  return result.stdout;
}

const page = (await get(PAGE, "text/html")).toString("utf8");
const link = page.match(/<a href="([^"]+\.pdf)">\s*Sharia-Compliant Stocks List\s*<\/a>/i)?.[1];
if (!link) throw new Error("no Sharia-Compliant Stocks List link on the product page");
const text = pdfText(await get(link, "application/pdf"));
const asOf = text.match(/compliant shares at of ([\d/]+)/i)?.[1] || "";

const rows = [];
const seen = new Set();
let highest = 0;
for (const raw of text.split(/\r?\n/)) {
  const line = raw.replace(/\s+/g, " ").trim();
  const match = line.match(/^(\d+) (\d{6}) (.+) ([A-Z]{3,6}) (1|2|OTC)$/);
  if (!match) continue;
  const [, number, code, name, ticker, market] = match;
  highest = Math.max(highest, Number(number));
  if (seen.has(ticker)) continue;
  seen.add(ticker);
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: "Amman Stock Exchange",
    mic: "XAMM",
    currency: "JOD",
    type: "STOCK",
    isin: "",
    raw: [ticker, name, code, MARKETS[market]].join(" | "),
  });
}
// The list numbers its rows; a few numbers are skipped in the file itself.
if (rows.length < 80 || rows.length < highest - 5) throw new Error(`parsed ${rows.length} rows, list runs to ${highest}`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("misk-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) {
  const key = `ASE ${row.raw.split(" | ").at(-1)} ${row.type}`;
  counts[key] = (counts[key] || 0) + 1;
}
console.error(counts);
console.error(`${rows.length} rows, list numbered to ${highest}, as of ${asOf}`);
