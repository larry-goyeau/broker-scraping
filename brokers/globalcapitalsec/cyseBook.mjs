// The Cyprus Stock Exchange book, for the brokers whose place is the CSE
// (Global Capital Securities, Prochoice, National Bank of Greece): every
// share and listed fund the exchange's own price pages print today on its
// regulated markets and on the Emerging Companies Market, minus suspended
// and never-traded lines.
//
// Sources, public, no login (cse.com.cy):
//   Closing prices, one table per market, each line with its code, its
//   flags ("(AN)" = "TRADING SUSPENDED", "(EM)", "(Σ)" ...), currency, last
//   and previous price, the session's value and volume:
//     https://www.cse.com.cy/en-GB/regulated-market/market-indices/closing-prices/
//       MAIN MARKET, ALTERNATIVE MARKET, SURVEILLANCE MARKET, then
//       Treasury bills, government and corporate bonds (not read)
//     https://www.cse.com.cy/en-GB/non-regulated-market/market-indices/closing-prices/
//       "Emerging Companies Cyprus" and "ECM Market for issuers whose
//       Registry is not kept by the CSD" (the Emerging Companies Market,
//       ECM), then their bond tables (not read)
//   Market capitalisation, one table per market, with each code's company
//   name:
//     https://www.cse.com.cy/en-GB/regulated-market/market-indices/current-prices/market-capitalization/
//     https://www.cse.com.cy/en-GB/non-regulated-market/market-indices/current-prices/market-capitalization/
//   The CSE prints no ISIN. Each code's ISIN and kind come from
//   TradingView's symbol search for the exchange CSECY (the feed
//   ../../spreads/csecy-touch.mjs reads the touch from):
//     https://symbol-search.tradingview.com/symbol_search/v3/?exchange=CSECY
//
// Kept (exchange "Cyprus Stock Exchange", MIC XCYS, as spreads/venues.mjs
// writes it; ECM lines too, with "| ECM" in raw, as the Athens catalogues
// keep EN.A. lines on XATH):
// - Main, Alternative and Surveillance Market lines and the ECM lines, in
//   their trading currency (EUR). Type STOCK; a line TradingView files as a
//   fund (a listed closed-end investment fund or AIF) is FUND, which
//   stampRows drops from a catalogue, as for the Swiss listed funds.
// Left out:
// - A line flagged "(AN)", "TRADING SUSPENDED" in the page's legend.
// - A line with neither a last nor a previous price: never traded.
// - Treasury bills, government bonds, corporate bonds, EMTNs, ECM bonds.
// - A code TradingView does not carry (no ISIN): reported, not written.
//
// Use:
//   import { cyseBook } from "../globalcapitalsec/cyseBook.mjs";
//   const { rows, dropped } = await cyseBook();          // regulated + ECM
//   const { rows } = await cyseBook({ ecm: false });     // regulated only
//
//   node brokers/globalcapitalsec/cyseBook.mjs     (prints the counts)

import { fileURLToPath } from "node:url";

export const EXCHANGE = "Cyprus Stock Exchange";
export const MIC = "XCYS";

const CSE = "https://www.cse.com.cy/en-GB";
const PAGES = {
  regulated: {
    prices: `${CSE}/regulated-market/market-indices/closing-prices/`,
    caps: `${CSE}/regulated-market/market-indices/current-prices/market-capitalization/`,
    sections: { "MAIN MARKET": "Main Market", "ALTERNATIVE MARKET": "Alternative Market", "SURVEILLANCE MARKET": "Surveillance Market" },
  },
  ecm: {
    prices: `${CSE}/non-regulated-market/market-indices/closing-prices/`,
    caps: `${CSE}/non-regulated-market/market-indices/current-prices/market-capitalization/`,
    sections: { "EMERGING COMPANIES CYPRUS": "ECM", "ECM MARKET FOR ISSUERS WHOSE REGISTRY IS NOT KEPT BY THE CSD": "ECM (registry outside the CSD)" },
  },
};
// Table titles after which the lines are not shares.
const OTHER = /^(TREASURY BILLS|GOVERNMENT BONDS|GOVERMENT BONDS|CORPORATE BONDS|EMERGING COMPANIES CYPRUS BONDS|ECM BOND MARKET.*|PRICES ARE A PERCENTAGE.*)$/;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const SEARCH = "https://symbol-search.tradingview.com/symbol_search/v3/";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// The CSE writes "ΜΑRΚΕΤ" with Greek capitals; fold them to Latin.
const GREEK = { Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X" };
const fold = (text) => text.replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g, (c) => GREEK[c]).toUpperCase();

async function get(url, { json = false, headers = {} } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return json ? await response.json() : await response.text();
    } catch (error) {
      if (attempt >= 4) throw new Error(`${url}: ${error.message}`);
      await sleep(2000 * attempt);
    }
  }
}

function lines(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const num = (text) => {
  const value = Number(String(text || "").replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
};

// Code -> { section, flags, currency, last, previous, value, volume }.
function closingPrices(html, sections) {
  const out = new Map();
  let section = null;
  const text = lines(html);
  for (let i = 0; i < text.length; i++) {
    const title = fold(text[i]);
    if (sections[title]) { section = sections[title]; continue; }
    if (OTHER.test(title) && !/^PRICES ARE/.test(title)) { section = null; continue; }
    if (!section || !/^[A-Z][A-Z0-9]{1,11}$/.test(text[i]) || /^(EUR|USD|GBP)$/.test(text[i])) continue;
    let at = i + 1;
    let flags = [];
    const flagged = text[at]?.match(/^\(([^)]*)\)$/);
    if (flagged) { flags = flagged[1].split(",").map((f) => f.trim()); at++; }
    const currency = text[at];
    if (!/^[A-Z]{3}$/.test(currency || "")) continue;
    const cells = text.slice(at + 1, at + 12);
    // Open, High, Low, Last, Previous, Change, Change %, Total Value, Volume, Bid Depth, Offer Depth
    out.set(text[i], { section, flags, currency, last: num(cells[3]), previous: num(cells[4]), value: num(cells[7]), volume: num(cells[8]) });
  }
  return out;
}

// Code -> company name, from the market-capitalisation tables.
function names(html) {
  const out = new Map();
  const text = lines(html);
  for (let i = 0; i + 2 < text.length; i++) {
    if (/^[A-Z][A-Z0-9]{1,11}$/.test(text[i]) && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(text[i + 2])) out.set(text[i], text[i + 1]);
  }
  return out;
}

// Code -> { isin, type, description } from TradingView's symbol search.
async function tradingView() {
  const out = new Map();
  for (let start = 0; start < 1000; start += 50) {
    const url = `${SEARCH}?text=&exchange=CSECY&lang=en&domain=production&search_type=&start=${start}`;
    const body = await get(url, { json: true, headers: { Origin: "https://www.tradingview.com", Referer: "https://www.tradingview.com/" } });
    for (const symbol of body.symbols || []) {
      if (symbol.exchange !== "CSECY" || !symbol.isin) continue;
      out.set(String(symbol.symbol).replace(/<\/?em>/g, ""), { isin: symbol.isin, type: symbol.type, description: symbol.description });
    }
    if (!body.symbols?.length || !body.symbols_remaining) break;
    await sleep(400);
  }
  if (out.size < 60) throw new Error(`TradingView carries only ${out.size} CSECY symbols`);
  return out;
}

// { rows, dropped }. Rows in the house shape; dropped: "<code>: reason".
export async function cyseBook({ ecm = true } = {}) {
  const markets = ecm ? ["regulated", "ecm"] : ["regulated"];
  const prices = new Map();
  const named = new Map();
  for (const market of markets) {
    const page = PAGES[market];
    for (const [code, line] of closingPrices(await get(page.prices), page.sections)) prices.set(code, { ...line, market });
    for (const [code, name] of names(await get(page.caps))) named.set(code, name);
  }
  const tv = await tradingView();

  const rows = [];
  const dropped = [];
  for (const [code, line] of prices) {
    if (line.flags.includes("AN")) { dropped.push(`${code}: trading suspended (AN) on the ${line.section}`); continue; }
    if (!line.last && !line.previous) { dropped.push(`${code}: never traded (no last or previous price) on the ${line.section}`); continue; }
    const hit = tv.get(code);
    if (!hit) { dropped.push(`${code}: no ISIN (TradingView does not carry CSECY:${code})`); continue; }
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(hit.isin)) { dropped.push(`${code}: bad ISIN ${hit.isin}`); continue; }
    const type = hit.type === "fund" ? "FUND" : "STOCK";
    const name = named.get(code) || hit.description || code;
    rows.push({
      query: code,
      ticker: code,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: line.currency,
      type,
      isin: hit.isin,
      raw: [code, name, hit.isin, line.currency, line.section, line.flags.length ? `flags ${line.flags.join(",")}` : "", line.market === "ecm" ? "ECM" : ""].filter(Boolean).join(" | "),
    });
  }
  rows.sort((a, b) => a.ticker.localeCompare(b.ticker));

  // A broken read fails here.
  for (const code of ["BOCH", "DEM", "LOG", "KEO", "VCW"]) if (!rows.some((row) => row.ticker === code)) throw new Error(`${code} is missing from the CSE book`);
  const regulated = rows.filter((row) => !/\| ECM/.test(row.raw)).length;
  if (regulated < 35) throw new Error(`only ${regulated} regulated-market lines`);
  if (ecm && rows.length - regulated < 15) throw new Error(`only ${rows.length - regulated} ECM lines`);
  if (dropped.filter((d) => /no ISIN/.test(d)).length > 10) throw new Error(`too many codes without ISIN: ${dropped.join("; ")}`);
  return { rows, dropped };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { rows, dropped } = await cyseBook();
  const tally = {};
  for (const row of rows) {
    const key = `${row.raw.split(" | ")[4]} ${row.type}`;
    tally[key] = (tally[key] || 0) + 1;
  }
  console.log(`${rows.length} CSE lines`, tally);
  console.log("left out:", dropped.join("; "));
}
