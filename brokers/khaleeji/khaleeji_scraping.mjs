// What Khaleeji Bank (Bahrain) sells through Khaleeji eTrade, with no
// login. The eTrade page says the platform is for "trading any BHB-listed
// stocks" (run by Mubasher Financial Services, endorsed by Bahrain Bourse)
// and names no other market. So the book is Bahrain Bourse's own list.
//
//   https://khaleeji.bank/pages-sidebar-nav/khaleeji-etrade/
//   https://bahrainbourse.com/en/Quotes%20and%20Market/Stocks/Pages/Quotes.aspx
//   https://bahrainbourse.com/en/Bahrain%20Clear/ISINCodes
//
// The quotes page lists every listed share by sector with its symbol and
// trading currency (BHD, or USD for ABC, ARIG, GFH, INOVEST, ITHMR and
// KFH); each title trades in one currency, so the row keeps it. The
// Bahrain Clear ISIN page gives the ISIN by symbol, and its "Bahrain
// Investment Market (BIM)" section adds the BIM shares (in dinars, as
// their FISN says), which the quotes page does not carry. Left out: a line
// the quotes page marks "(Suspended)", and its "Closed Companies" section
// (unlisted closed companies the bourse matches outside the listed
// market). Eskan Bank Realty Income Trust is a listed REIT unit (Bahrain
// Clear types it "Mutual Fund") and stays as a share. Bank Muscat's line
// has no ISIN on the Bahrain Clear page and stays without one. The bourse lists no ETFs; bonds and sukuk are not read.
//
// bahrainbourse.com sits behind Cloudflare, so the pages are read in the
// local Chrome (started with --remote-debugging-port=9222).
//
//   node brokers/khaleeji/khaleeji_scraping.mjs

import puppeteer from "puppeteer-core";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const QUOTES = "https://bahrainbourse.com/en/Quotes%20and%20Market/Stocks/Pages/Quotes.aspx";
const ISINS = "https://bahrainbourse.com/en/Bahrain%20Clear/ISINCodes";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9222", defaultViewport: null });

// The tables as text cells, read once the page has drawn them.
async function tables(url, ready) {
  const page = await browser.newPage();
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      for (let wait = 0; wait < 20; wait += 1) {
        await sleep(1_000);
        const found = await page.evaluate(() =>
          [...document.querySelectorAll("table")].map((table) =>
            [...table.querySelectorAll("tr")].map((row) => [...row.querySelectorAll("th,td")].map((cell) => cell.innerText.replace(/\s+/g, " ").trim())),
          ),
        );
        if (ready(found)) return found;
      }
    }
    throw new Error(`${url} never showed its table`);
  } finally {
    await page.close();
  }
}

const quoteTables = await tables(QUOTES, (found) => found.some((rows) => rows.filter((cells) => cells.length >= 4).length > 30));
const isinTables = await tables(ISINS, (found) => found.some((rows) => rows.some((cells) => /^BH[A-Z0-9]{10}$/.test(cells[1] || ""))));
browser.disconnect();

// Symbol -> ISIN, by section of the Bahrain Clear page.
const isinOf = new Map();
const bim = [];
let section = "";
for (const cells of isinTables.find((rows) => rows.some((cells) => /^BH[A-Z0-9]{10}$/.test(cells[1] || "")))) {
  if (cells.length === 1) { section = cells[0]; continue; }
  const [symbol, isin, issuer, description] = cells;
  if (!/Equities|Investment Market/i.test(section) || !/Share|Fund/i.test(description || "")) continue;
  if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) isinOf.set(symbol, isin);
  if (/Investment Market/i.test(section)) bim.push({ symbol, isin, issuer });
}

const rows = [];
const seen = new Set();
const left = { suspended: [], closed: [] };
section = "";
const board = quoteTables.find((rows) => rows.some((cells) => cells[1] === "Company" && cells[3] === "Currency"));
if (!board) throw new Error("no Company/Symbol/Currency table on the quotes page");
for (const cells of board) {
  if (cells.length === 1 || (cells.length > 1 && cells.slice(1).every((cell) => !cell))) { section = cells[0]; continue; }
  const [, company, symbol, currency] = cells;
  if (company === "Company" || !symbol) continue;
  if (/Closed Companies/i.test(section)) { left.closed.push(symbol); continue; }
  if (/\(Suspended\)/i.test(company)) { left.suspended.push(symbol); continue; }
  if (!/^(BHD|USD)$/.test(currency)) throw new Error(`${symbol} quoted in ${currency}`);
  if (seen.has(symbol)) continue;
  seen.add(symbol);
  const name = company.replace(/^[^A-Za-z0-9]+/, "").trim();
  rows.push({ query: symbol, ticker: symbol, name, exchange: "Bahrain Bourse", mic: "XBAH", currency, type: "STOCK", isin: isinOf.get(symbol) || "", raw: [symbol, name, currency, section].join(" | ") });
}
for (const { symbol, isin, issuer } of bim) {
  if (seen.has(symbol)) continue;
  seen.add(symbol);
  rows.push({ query: symbol, ticker: symbol, name: issuer, exchange: "Bahrain Bourse", mic: "XBAH", currency: "BHD", type: "STOCK", isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "", raw: [symbol, issuer, "BHD", "Bahrain Investment Market (BIM)"].join(" | ") });
}
// 40 listed shares on 2026-10-22.
if (rows.length < 32) throw new Error(`only ${rows.length} Bahrain Bourse shares`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const kept = withoutObligations(rows);
fs.writeFileSync(new URL("khaleeji-parsed.json", import.meta.url), JSON.stringify(stampRows(kept), null, 2));
const counts = {};
for (const row of kept) counts[row.currency] = (counts[row.currency] || 0) + 1;
console.error(counts);
console.error(`${kept.length} shares, ${kept.filter((row) => row.isin).length} with an ISIN; left out suspended ${left.suspended.join(",") || "-"}, closed companies ${left.closed.join(",") || "-"}`);
