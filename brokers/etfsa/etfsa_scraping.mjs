// What etfSA (South Africa) sells, with no login. etfSA sells no single
// shares, only exchange-traded products on the JSE. Its DIY page says the
// Investor Hub "gives you easy access to all JSE-listed ETFs", and the ETP
// fund library links a PDF, "Products offered through ETFSA", that lists
// "all the Exchange-Traded Products that ETFSA gives you access to": ETFs,
// actively managed ETFs, ETNs and actively managed certificates, each with
// its JSE share code (printed in blue). The library's own HTML table shows
// only the ETF tab, so the PDF is the list.
//
//   https://etfsa.co.za/product/diy/                       (fees)
//   https://etfsa.co.za/information-centre/fund-library/etp/
//   https://etfsa.co.za/wp-content/uploads/2026/09/ETFSA-products-v144-11Sept2026.pdf  (at the time of writing)
//
// The type follows the PDF's white section bands: an ETF or AMETF section
// is ETF (commodity ETFs such as NewGold included), an ETN section is ETN
// (single-stock, index, commodity and currency ETNs), and the actively
// managed certificates (AMCs, notes issued by Absa or Standard Bank on a
// managed basket) are ETN too. The name is the bold fund name above the
// code. Every line is a JSE listing in rand.
//
// The PDF has no ISINs. A code gets the ISIN that the shared catalogues
// (../../assets/etfs.csv, stocks.csv) and the other brokers' JSE lines
// give it, when they give exactly one.
//
// etfsa.co.za sits behind Cloudflare, so the page and the PDF are read in
// the local Chrome (started with --remote-debugging-port=9222). Reading
// the PDF needs python3 with PyMuPDF (fitz).
//
//   node brokers/etfsa/etfsa_scraping.mjs

import puppeteer from "puppeteer-core";
import { stampRows } from "../../accepted.mjs";
import { catalogueRows } from "../../catalogues.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LIBRARY = "https://etfsa.co.za/information-centre/fund-library/etp/";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });
const page = await browser.newPage();
let link = "";
let pdf = null;
try {
  for (let attempt = 0; attempt < 4 && !link; attempt += 1) {
    await page.goto(LIBRARY, { waitUntil: "domcontentloaded", timeout: 90_000 });
    for (let wait = 0; wait < 20 && !link; wait += 1) {
      await sleep(1_000);
      link = await page.evaluate(() => [...document.querySelectorAll("a[href$='.pdf']")].map((a) => a.href).find((href) => /ETFSA-products/i.test(href)) || "");
    }
  }
  if (!link) throw new Error("no ETFSA-products PDF linked from the fund library");
  const encoded = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return `!${response.status}`;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let text = "";
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(text);
  }, link);
  if (encoded.startsWith("!")) throw new Error(`${link} answered ${encoded.slice(1)}`);
  pdf = Buffer.from(encoded, "base64");
} finally {
  await page.close();
  browser.disconnect();
}
if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${link} is not a PDF`);

// Spans of the PDF: blue codes, white section bands, bold left-column names.
const SCRIPT = `
import fitz, json, sys
doc = fitz.open(sys.argv[1])
out = []
for number, page in enumerate(doc):
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                text = span["text"].strip()
                if text:
                    out.append([number, round(span["bbox"][0]), round(span["bbox"][1]), span["color"], span["flags"], text])
json.dump(out, sys.stdout)
`;
const pdfPath = path.join(os.tmpdir(), `etfsa-${process.pid}.pdf`);
fs.writeFileSync(pdfPath, pdf);
const result = spawnSync("python3", ["-c", SCRIPT, pdfPath], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
fs.rmSync(pdfPath, { force: true });
if (result.status !== 0) throw new Error(result.stderr || "python3 could not read the etfSA PDF (PyMuPDF)");
const spans = JSON.parse(result.stdout);

const BLUE = 7701437;
const WHITE = 16777215;
const total = spans.map((span) => span[5]).join(" ").match(/Total Number of Products.*?Total (\d+)/)?.[1];
const asOf = spans.find((span) => /^\d{1,2} \w+ 20\d\d$/.test(span[5]))?.[5] || "";

const typeOf = (band) => (/AMC/i.test(band) ? "ETN" : /ETN/i.test(band) ? "ETN" : /ETF/i.test(band) ? "ETF" : "");
const rows = [];
const seen = new Set();
let band = "";
let names = [];
for (const [pageNo, x, y, color, flags, text] of spans) {
  if (pageNo === 0) continue;
  if (color === WHITE && x < 200) { band = text; names = []; continue; }
  if (color === BLUE && text !== "JSE Share Code" && x < 200) {
    if (!/^[A-Z0-9]{3,10}$/.test(text)) throw new Error(`code ${text} on page ${pageNo + 1}`);
    // The fund name: the bold lines just above the code (or on its line).
    // The code sits up to 18pt below the name; name lines are 13-15pt
    // apart, and a sub-heading stands 17pt or more above the name.
    const block = [];
    let lastY = y;
    for (const name of [...names].reverse()) {
      if (lastY - name.y > (block.length ? 15 : 18)) break;
      block.unshift(name.text);
      lastY = name.y;
    }
    names = [];
    const type = typeOf(band);
    if (!type) throw new Error(`no type for section "${band}" (${text})`);
    if (seen.has(text)) continue;
    seen.add(text);
    rows.push({ query: text, ticker: text, name: block.join(" ").replace(/\s+/g, " ").trim() || text, exchange: "JSE", mic: "XJSE", currency: "ZAR", type, isin: "", raw: "", band: band.replace(/\s*-\s*continued$/i, "") });
    continue;
  }
  if (color === 0 && (flags & 16) && x < 200 && !/^(Fund|Description|Dividends|Paid\*)$/.test(text)) names.push({ y, text });
  if (y > 700) names = [];
}
if (total && Math.abs(rows.length - Number(total)) > 2) throw new Error(`${rows.length} codes read, the PDF counts ${total}`);
if (rows.length < 250) throw new Error(`only ${rows.length} products in the PDF`);

// JSE code -> ISINs from the shared catalogues and the other brokers' JSE lines.
const known = new Map();
const remember = (code, isin) => {
  code = String(code || "").trim().toUpperCase();
  isin = String(isin || "").trim().toUpperCase();
  if (!code || !ISIN.test(isin)) return;
  if (!known.has(code)) known.set(code, new Set());
  known.get(code).add(isin);
};
for (const file of ["etfs.csv", "stocks.csv"]) {
  for (const line of fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8").split(/\r?\n/)) {
    const [ticker, place, isin] = line.split(",");
    if (place === "JSE") remember(ticker.split(":").pop(), isin);
  }
}
for (const row of catalogueRows()) {
  if (row.broker === "etfsa") continue;
  if (row.mic === "XJSE" || /^(JSE|XJSE)$/i.test(row.exchange || "")) remember(row.ticker, row.isin);
}
for (const row of rows) {
  const found = known.get(row.ticker);
  if (found?.size === 1) row.isin = [...found][0];
  row.raw = [row.ticker, row.name, row.band, row.isin].filter(Boolean).join(" | ");
  delete row.band;
}

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const kept = withoutObligations(rows);
fs.writeFileSync(new URL("etfsa-parsed.json", import.meta.url), JSON.stringify(stampRows(kept), null, 2));
const counts = {};
for (const row of kept) counts[row.type] = (counts[row.type] || 0) + 1;
console.error(counts);
console.error(`${kept.length} JSE products (PDF of ${asOf}, total ${total}), ${kept.filter((row) => row.isin).length} with an ISIN; ${link}`);
