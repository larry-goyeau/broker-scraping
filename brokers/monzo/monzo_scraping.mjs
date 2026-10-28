// What Monzo (UK) sells in Monzo Investments (a general investment account
// and a Stocks and Shares ISA), with no login. Monzo sells a curated range
// of 17 investments, all from BlackRock, and no single shares: "We have 17
// investments in total", "At Monzo, we keep things simple by offering
// curated themes rather than hundreds of niche options", "the only
// investment products we offer are managed by BlackRock".
//
//   https://monzo.com/investments (the 17 names shown in the app)
//   https://monzo.com/learn/money-tomorrow/what-are-etfs
//   https://monzo.com/legal/investments/terms-and-conditions ("funds
//     (including Exchange Traded Funds ...)" and "exchange traded
//     commodities (ETCs) ... traded on an exchange, such as the London Stock
//     Exchange"; payments "in pounds sterling")
//   https://monzo.com/legal/investments/fees (fees: 0.25% a year, 0.20% on
//     some plans, capped at £250 a year; no dealing fee)
//
// The current fee page no longer names the funds. Its version 2.4, still
// published by Monzo, maps each app name to the BlackRock fund ("Fund name
// in the Monzo app"); that table is read here for 15 of the 17. The Gold and
// Silver ETCs, added since, are named by Monzo only as "Gold" and "Silver"
// ("Tracks the daily price of gold / silver"). Monzo offers BlackRock
// products only, and BlackRock's only unhedged gold and silver ETCs on the
// LSE are iShares Physical Gold ETC (IE00B4ND3602) and iShares Physical
// Silver ETC (IE00B4NCWG09), so those are taken (the GBP-hedged gold ETC is
// another ISIN and stays out).
//
//   https://monzo.com/legal/investments/fees/version-2-4
//
// Monzo prints no ticker, ISIN or share class. Its custodian Seccl deals
// exchange-traded orders on the London Stock Exchange ("once a day at a
// single daily price"). An ETF or ETC becomes its LSE line(s) only when the fund
// name Monzo gives matches the LSE name of a single ISIN; then the sterling
// lines (GBP, GBX pence) are kept, since the account is paid in pounds. A
// fund the LSE lists in two share classes (accumulating and distributing:
// Emerging markets, Clean energy, Automation and robotics), a fund whose
// LSE name does not carry Monzo's name (iShares Core MSCI Europe) and the
// three ready-made MyMap funds (funds dealt with the manager, not on the
// exchange) stay one row with Monzo's name and no ticker.
//
// The LSE lines come from the shared crawl ../stratiphy/lseBook.mjs (LSE
// price explorer data API), which leaves out suspended lines.
//
//   node brokers/monzo/monzo_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { lseRows } from "../stratiphy/lseBook.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const RANGE = "https://monzo.com/investments";
const FUNDS = "https://monzo.com/legal/investments/fees/version-2-4";

// App name, BlackRock fund name (fee page 2.4), type, LSE name pattern.
const PRODUCTS = [
  ["Careful", "MyMap 3 Select ESG Fund", "FUND", null],
  ["Balanced", "MyMap 5 Select ESG Fund", "FUND", null],
  ["Adventurous", "MyMap 8 Select ESG Fund", "FUND", null],
  ["American companies", "iShares Core S&P 500 Fund", "ETF", /\bCORE S&P 500 UCITS ETF\b/],
  ["British companies", "iShares Core FTSE 100 Fund", "ETF", /\bCORE FTSE ?100 UCITS ETF\b/],
  ["Emerging markets", "iShares MSCI Emerging Markets ETF", "ETF", /\bISHARES MSCI EM UCITS ETF\b/],
  ["European companies", "iShares Core MSCI Europe ETF", "ETF", /\bCORE MSCI EUROPE\b/],
  ["Global companies", "iShares Core MSCI World ETF", "ETF", /\bCORE MSCI WORLD\b/],
  ["Tech focused", "iShares NASDAQ 100 UCITS ETF", "ETF", /\bNASDAQ ?100 UCITS ETF\b/],
  ["Healthcare innovation", "iShares Healthcare Innovation ETF", "ETF", /\bHEALTHCARE INN/],
  ["Metaverse", "iShares Metaverse ETF", "ETF", /\bMETAVERSE\b/],
  ["Clean energy", "iShares Global Clean Energy ETF", "ETF", /\bGLOBAL C(?:LEAN)? ENERGY\b/],
  ["Blockchain creators", "iShares Blockchain Technology ETF", "ETF", /\bBLOCKCHAIN\b/],
  ["Automation and robotics", "iShares Automation and Robotics ETF", "ETF", /\bAUTO(?:MAT)? & R(?:O)?BOT/],
  ["Short-term bonds", "iShares £ Ultrashort Bond ETF", "ETF", /£ ULTRASHORT BD\b/],
  ["Gold", "", "ETC", /\bPHYSICAL GOLD ETC\b/],
  ["Silver", "", "ETC", /\bPHYSICAL SILVER ETC\b/],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function text(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function page(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return text(await response.text());
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error.message;
    }
    await sleep(3000 * (attempt + 1));
  }
  throw new Error(`${url}: ${last}`);
}

const range = await page(RANGE);
await sleep(1500);
const funds = await page(FUNDS);

const total = range.match(/We have (\d+) investments in total/);
if (!total) throw new Error("the investments page no longer gives the number of investments");
if (Number(total[1]) !== PRODUCTS.length) throw new Error(`Monzo now offers ${total[1]} investments, not ${PRODUCTS.length}`);
for (const [app, fund] of PRODUCTS) {
  if (!range.includes(app)) throw new Error(`"${app}" is no longer on ${RANGE}`);
  if (fund && !funds.includes(fund)) throw new Error(`"${fund}" is no longer on ${FUNDS}`);
}

const lse = await lseRows();
const rows = [];
for (const [app, fund, type, pattern] of PRODUCTS) {
  const name = fund || app;
  const lines = pattern ? lse.filter((row) => /\bISH/i.test(row.name) && pattern.test(row.name.toUpperCase())) : [];
  const isins = [...new Set(lines.map((row) => row.isin))];
  const sterling = lines.filter((row) => row.currency === "GBP" || row.currency === "GBX");
  if (isins.length === 1 && lines[0].type === type) {
    const kept = sterling.length ? sterling : lines;
    for (const row of kept) rows.push({ ...row, raw: `${app} | ${name} | ${row.raw}` });
    console.error(`${app}: ${kept.map((row) => `${row.ticker} ${row.currency}`).join(", ")} (${isins[0]})`);
  } else {
    rows.push({ query: name, ticker: "", name, currency: "", type, isin: "", raw: `${app} | ${name} | BlackRock` });
    console.error(`${app}: no single LSE line (${isins.length} ISINs: ${isins.join(", ") || "none"})`);
  }
}

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("monzo-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));
console.error(`${kept.length} rows for ${PRODUCTS.length} Monzo investments`);
