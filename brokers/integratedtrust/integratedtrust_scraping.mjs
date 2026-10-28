// What Integrated Trust & Investment Limited sells through ITI Trade, with
// no login: every share and ETF on the Nigerian Exchange, its only place.
// Its "Guide to ITI Trade (Online Trading)" says the platform "Provides
// easy access for you to buy and sell stocks on the floor of the NSE" with
// a "Direct interface with the NSE using our FIX-enabled online platform",
// and the application form authorises trading "on all my investment(s) in
// shares of companies, domiciled with the CSCS Plc". No page excludes a
// board, a segment or ETFs, and none names a list of its own, so the book
// is the exchange's whole listing of the day, read by
// ../morgancapital/ngxWhole.mjs (shares, listed REITs and ETFs; closed-end
// funds, suspended and delisting lines left out, as written there). The
// "fixed income securities" the guide also names are not shares and are
// not written. Everything trades in naira.
//
// Fees: the same guide, "5. FEES & CHARGES: Our fees and charges for ITI
// Trade services ...: SELL CHARGES – 2.255%, Buy Charges – 1.88%". The run
// reads the PDF with PyMuPDF (pip install pymupdf, as ../atlass does) and
// checks these lines.
//
//   https://integratedtrustng.com/forms/Application-Form-Guide-to-Online-Trading.pdf
//
//   node brokers/integratedtrust/integratedtrust_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const GUIDE = "https://integratedtrustng.com/forms/Application-Form-Guide-to-Online-Trading.pdf";
const EVIDENCE = [
  /buy and sell stocks on the floor of the NSE/,
  /Direct interface with the NSE/,
  /SELL CHARGES\s*[–-]\s*2\.255%/,
  /Buy Charges\s*[–-]\s*1\.88%/,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBytes(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
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
  const python = spawnSync(
    "python3",
    [
      "-c",
      `
import sys
import fitz
doc = fitz.open(stream=sys.stdin.buffer.read(), filetype="pdf")
sys.stdout.write("\\n".join(page.get_text() for page in doc))
`,
    ],
    { input: bytes, maxBuffer: 64 * 1024 * 1024, encoding: "utf8" }
  );
  if (python.status !== 0) throw new Error(`PyMuPDF failed: ${python.stderr}`);
  return python.stdout.replace(/\s+/g, " ");
}

const text = pdfText(await fetchBytes(GUIDE));
for (const pattern of EVIDENCE) {
  if (!pattern.test(text)) throw new Error(`ITI Trade guide no longer says ${pattern}`);
}

const { rows, day, dolDay, dropped, leftOut } = await ngxWhole();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("integratedtrust-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `integratedtrust: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
    `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
    `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
