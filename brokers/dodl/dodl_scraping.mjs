// What AJ Bell Dodl sells: a deliberately small, app-only range, published in
// full on two public pages (no login):
//
//   https://dodl.co.uk/investments/shares   (58 UK and US company cards, 2026-10-20)
//   https://dodl.co.uk/investments/themed   (29 themed funds: 14 of them ETFs/ETC)
//
// The cards give only a brand name ("Rolls-Royce", "Alphabet") and a
// location class (UK or US); no ticker or ISIN anywhere on the site. So the
// names are matched here to their listing, and a card whose name is not in
// the table below stops the run. UK companies are the London line in pence;
// US companies are the NYSE/Nasdaq line in dollars (Dodl takes a foreign
// exchange charge on them).
//
// From the themed page only the exchange-traded products are kept. Index
// funds, unit trusts, the LifeStrategy funds and the money market fund are
// mutual funds dealt at the fund's price, not on an exchange. Dodl is a
// sterling-only app and charges FX on US shares only, so each ETF is the
// sterling line of the fund on the London Stock Exchange. Where the fund
// name does not fix the share class (MSCI World SRI, HSBC Global Government
// Bond) the class with a sterling LSE line was taken.
//
//   node brokers/dodl/dodl_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SHARES = "https://dodl.co.uk/investments/shares";
const THEMED = "https://dodl.co.uk/investments/themed";

const UK = (ticker, isin, name) => ({ ticker, isin, name, exchange: "LSE", mic: "XLON", currency: "GBX" });
const NYSE = (ticker, isin, name) => ({ ticker, isin, name, exchange: "NYSE", mic: "XNYS", currency: "USD" });
const NASDAQ = (ticker, isin, name) => ({ ticker, isin, name, exchange: "NASDAQ", mic: "XNAS", currency: "USD" });

// Dodl card name -> listing.
const COMPANIES = {
  "Aberdeen": UK("ABDN", "GB00BF8Q6K64", "Aberdeen Group plc"),
  "AJ Bell": UK("AJB", "GB00BFZNLB60", "AJ Bell plc"),
  "Barclays": UK("BARC", "GB0031348658", "Barclays PLC"),
  "HSBC": UK("HSBA", "GB0005405286", "HSBC Holdings plc"),
  "Legal & General": UK("LGEN", "GB0005603997", "Legal & General Group plc"),
  "Liontrust": UK("LIO", "GB0007388407", "Liontrust Asset Management plc"),
  "Lloyds Banking Group": UK("LLOY", "GB0008706128", "Lloyds Banking Group plc"),
  "M&G": UK("MNG", "GB00BKFB1C65", "M&G plc"),
  "NatWest": UK("NWG", "GB00BM8PJY71", "NatWest Group plc"),
  "Plus500": UK("PLUS", "IL0011284465", "Plus500 Ltd"),
  "Prudential": UK("PRU", "GB0007099541", "Prudential plc"),
  "Rolls-Royce": UK("RR.", "GB00B63H8491", "Rolls-Royce Holdings plc"),
  "GSK": UK("GSK", "GB00BN7SWP63", "GSK plc"),
  "Oxford Biomedica": UK("OXB", "GB00BDFBVT43", "Oxford BioMedica plc"),
  "Smith + Nephew": UK("SN.", "GB0009223206", "Smith & Nephew plc"),
  "BT": UK("BT.A", "GB0030913577", "BT Group plc"),
  "Vodafone": UK("VOD", "GB00BH4HKS39", "Vodafone Group plc"),
  "WPP": UK("WPP", "JE00B8KF9B49", "WPP plc"),
  "BP": UK("BP.", "GB0007980591", "BP plc"),
  "National Grid": UK("NG.", "GB00BDR05C01", "National Grid plc"),
  "Shell": UK("SHEL", "GB00BP6MXD84", "Shell plc"),
  "SSE": UK("SSE", "GB0007908733", "SSE plc"),
  "United Utilities": UK("UU.", "GB00B39J2M42", "United Utilities Group plc"),
  "easyJet": UK("EZJ", "GB00B7KR2P84", "easyJet plc"),
  "IAG": UK("IAG", "ES0177542018", "International Consolidated Airlines Group SA"),
  "ABF": UK("ABF", "GB0006731235", "Associated British Foods plc"),
  "B&M": UK("BME", "JE00BVSYJW51", "B&M European Value Retail plc"),
  "Greggs": UK("GRG", "GB00B63QSB39", "Greggs plc"),
  "M&S": UK("MKS", "GB0031274896", "Marks and Spencer Group plc"),
  "Next": UK("NXT", "GB0032089863", "Next plc"),
  "Ocado": UK("OCDO", "GB00B3MBS747", "Ocado Group plc"),
  "Sainsbury's": UK("SBRY", "GB00B019KW72", "J Sainsbury plc"),
  "Tesco": UK("TSCO", "GB00BLGZ9862", "Tesco plc"),
  "Unilever": UK("ULVR", "GB00BVZK7T90", "Unilever plc"),
  "Whitbread": UK("WTB", "GB00B1KJJ408", "Whitbread plc"),
  "Fresnillo": UK("FRES", "GB00B2QPKJ12", "Fresnillo plc"),
  "Glencore": UK("GLEN", "JE00B4T3BW64", "Glencore plc"),
  "Rio Tinto": UK("RIO", "GB0007188757", "Rio Tinto plc"),
  "Barratt Redrow": UK("BTRW", "GB0000811801", "Barratt Redrow plc"),
  "British Land": UK("BLND", "GB0001367019", "British Land Company plc"),
  "Hammerson": UK("HMSO", "GB00BRJQ8J25", "Hammerson plc"),
  "Persimmon": UK("PSN", "GB0006825383", "Persimmon plc"),
  "Rightmove": UK("RMV", "GB00BGDT3G23", "Rightmove plc"),
  "Taylor Wimpey": UK("TW.", "GB0008782301", "Taylor Wimpey plc"),
  "Berkshire Hathaway": NYSE("BRK.B", "US0846707026", "Berkshire Hathaway Inc. Class B"),
  "Pfizer": NYSE("PFE", "US7170811035", "Pfizer Inc."),
  "Coca-Cola": NYSE("KO", "US1912161007", "The Coca-Cola Company"),
  "Nike": NYSE("NKE", "US6541061031", "NIKE, Inc. Class B"),
  "PayPal": NASDAQ("PYPL", "US70450Y1038", "PayPal Holdings, Inc."),
  "Alphabet": NASDAQ("GOOGL", "US02079K3059", "Alphabet Inc. Class A"),
  "Amazon": NASDAQ("AMZN", "US0231351067", "Amazon.com, Inc."),
  "AMD": NASDAQ("AMD", "US0079031078", "Advanced Micro Devices, Inc."),
  "Apple": NASDAQ("AAPL", "US0378331005", "Apple Inc."),
  "Intel": NASDAQ("INTC", "US4581401001", "Intel Corporation"),
  "Meta": NASDAQ("META", "US30303M1027", "Meta Platforms, Inc. Class A"),
  "Microsoft": NASDAQ("MSFT", "US5949181045", "Microsoft Corporation"),
  "NVIDIA": NASDAQ("NVDA", "US67066G1040", "NVIDIA Corporation"),
  "Tesla": NASDAQ("TSLA", "US88160R1014", "Tesla, Inc."),
};

// Themed fund name ("What's the fund?") -> sterling LSE line.
const LSE = (ticker, isin, name, currency, type = "ETF") => ({ ticker, isin, name, exchange: "LSE", mic: "XLON", currency, type });
const ETFS = {
  "Vanguard FTSE 250 ETF": LSE("VMID", "IE00BKX55Q28", "Vanguard FTSE 250 UCITS ETF (Dist)", "GBP"),
  "SPDR S&P 500 ETF": LSE("SPX5", "IE00B6YX5C33", "SPDR S&P 500 UCITS ETF", "GBP"),
  "iShares Core MSCI Emerging Markets ETF": LSE("EMIM", "IE00BKM4GZ66", "iShares Core MSCI EM IMI UCITS ETF", "GBX"),
  "iShares MSCI World Islamic ETF": LSE("ISWD", "IE00B27YCN58", "iShares MSCI World Islamic UCITS ETF", "GBX"),
  "HSBC MSCI China ETF": LSE("HMCH", "IE00B44T3H88", "HSBC MSCI China UCITS ETF", "GBX"),
  "Franklin FTSE India ETF": LSE("FRIN", "IE00BHZRQZ17", "Franklin FTSE India UCITS ETF", "GBP"),
  "Xtrackers MSCI World Financials ETF": LSE("XWFS", "IE00BM67HL84", "Xtrackers MSCI World Financials UCITS ETF 1C", "GBP"),
  "iShares S&P 500 Energy Sector ETF": LSE("IESU", "IE00B42NKQ00", "iShares S&P 500 Energy Sector UCITS ETF", "GBX"),
  "iShares Physical Gold ETC": LSE("SGLN", "IE00B4ND3602", "iShares Physical Gold ETC", "GBX", "ETC"),
  "iShares Automation & Robotics ETF": LSE("RBTX", "IE00BYZK4552", "iShares Automation & Robotics UCITS ETF", "GBX"),
  "Xtrackers MSCI World Healthcare ETF": LSE("XWHS", "IE00BM67HK77", "Xtrackers MSCI World Health Care UCITS ETF 1C", "GBP"),
  "iShares Core UK Gilt ETF": LSE("IGLT", "IE00B1FZSB30", "iShares Core UK Gilts UCITS ETF", "GBP"),
  "HSBC Global Government Bond ETF": LSE("HGVG", "IE000Q7EQ7R4", "HSBC Global Government Bond UCITS ETF GBP Hedged", "GBP"),
  "iShares MSCI World Socially Responsible Investment ETF": LSE("SUWG", "IE00BDZZTM54", "iShares MSCI World SRI UCITS ETF", "GBP"),
};

const decode = (value) =>
  String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

// One <li> card per investment: classes (location-uk / location-us), <h4> title.
function investmentCards(page) {
  const out = [];
  const pattern = /<li(?: class="([^"]*)")?>\s*<article role="article" class="node--investment[\s\S]*?<\/article>\s*<\/li>/g;
  for (const match of page.matchAll(pattern)) {
    const block = match[0];
    const title = decode(block.match(/<h4>([\s\S]*?)<\/h4>/)?.[1]);
    const fund = decode(block.match(/What's the fund\?<\/h4>\s*<p>([\s\S]*?)<\/p>/)?.[1]);
    out.push({ classes: match[1] || "", title, fund, raw: decode(block).slice(0, 300) });
  }
  return out;
}

const rows = [];
const unknown = [];

const sharePage = await get(SHARES);
const shareCards = investmentCards(sharePage);
for (const card of shareCards) {
  const listing = COMPANIES[card.title];
  if (!listing) {
    unknown.push(`share "${card.title}"`);
    continue;
  }
  const us = /location-us/.test(card.classes);
  const uk = /location-uk/.test(card.classes);
  if (us === uk || us !== (listing.currency === "USD")) {
    throw new Error(`${card.title}: card says ${card.classes}, table says ${listing.exchange}`);
  }
  rows.push({
    query: listing.isin,
    ticker: listing.ticker,
    name: listing.name,
    exchange: listing.exchange,
    mic: listing.mic,
    currency: listing.currency,
    type: "STOCK",
    isin: listing.isin,
    raw: `${card.title} (${us ? "US" : "UK"} share)`,
  });
}

await sleep(500);
const themedPage = await get(THEMED);
const themedCards = investmentCards(themedPage);
const funds = [];
for (const card of themedCards) {
  const fund = card.fund.replace(/\s+/g, " ").trim();
  if (!/\b(ETF|ETC|ETN)\b/i.test(fund)) {
    funds.push(fund);
    continue;
  }
  const listing = ETFS[fund];
  if (!listing) {
    unknown.push(`themed "${fund}"`);
    continue;
  }
  rows.push({
    query: listing.isin,
    ticker: listing.ticker,
    name: listing.name,
    exchange: listing.exchange,
    mic: listing.mic,
    currency: listing.currency,
    type: listing.type,
    isin: listing.isin,
    raw: `${card.title}: ${fund}`,
  });
}

if (unknown.length) throw new Error(`cards not in the table, add them: ${unknown.join(", ")}`);
if (shareCards.length < 50) throw new Error(`only ${shareCards.length} share cards`);
if (themedCards.length < 20) throw new Error(`only ${themedCards.length} themed cards`);
for (const [isin, label] of [["GB0007980591", "BP"], ["US0378331005", "Apple"], ["IE00BKX55Q28", "Vanguard FTSE 250 ETF"]]) {
  if (!rows.some((row) => row.isin === isin)) throw new Error(`${label} missing`);
}
const seen = new Set();
for (const row of rows) {
  const key = `${row.isin}|${row.exchange}`;
  if (seen.has(key)) throw new Error(`two cards for ${row.name}`);
  seen.add(key);
}

const count = new Map();
for (const row of rows) count.set(`${row.exchange} ${row.type}`, (count.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(`${rows.length} rows: ${[...count].map(([key, n]) => `${n} ${key}`).join(", ")}`);
console.error(`left out, not exchange-traded (${funds.length}): ${funds.join("; ")}`);

fs.writeFileSync(new URL("dodl-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
