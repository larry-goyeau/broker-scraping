// Caucasus Capital (Caucasus Capital Group, Tbilisi) is an introducing
// broker of Interactive Brokers. Its brokerage page says the clients'
// foreign securities accounts "are held with one of the leading US
// broker-dealers", protected by SIPC and Lloyd's of London: IBKR LLC. Its
// platforms are IBKR's, renamed "CCG Trader", and its account links go to
// clientam.com with wbid=Caucasus_C. The products page's "Product Search"
// link is IBKR's white-label contract search (wlId=Caucasus_C), which lands
// on clientam.com's public "Products & Exchanges" page. So the book is
// IBKR's stock and ETF universe, read with ../placetrade/ibkrBook.mjs (no
// login): the products filed under each exchange, then each contract's own
// list of exchanges from IBKR's public secdef, one row per place a contract
// trades on, and the lines that cannot be bought dropped against the
// exchanges' own lists (suspended, delisted and sell-only lines, OTC Caveat
// Emptor, Grey and Expert names, TOKYO PRO Market, ...). The US venues are
// one NBBO tape: one row per title, on its primary listing, so Nasdaq, NYSE
// American, NYSE Arca, Cboe BZX and Texas listings come with the NYSE.
//
// The places read are Caucasus Capital's places in broker-list.json, each
// priced on its commission page (United States, Canada, Mexico, Austria,
// Belgium, France, Germany with SWB, FWB, Xetra and "Chi-X / BATS /
// Turquoise DE / Tradegate", Italy, Norway, Portugal, Spain, Sweden,
// Switzerland, the United Kingdom with the "LSE International Order Book",
// Australia, Hong Kong with "Shanghai-Hong Kong Connect Stocks", Japan,
// Singapore). Italy is Euronext Milan plus ETFplus (funds only), London IOB
// keeps depositary receipts only. The page also prices "Netherlands"
// (euro and dollar lines), which broker-list.json leaves out: Euronext
// Amsterdam is read too.
//
// Shenzhen Connect, the STAR Market and ChiNext are not priced on the commission
// page, but IBKR offers both books to its clients, and Caucasus Capital's
// clients trade on IBKR's books. Owner's rule (2026-10-28): when a title's
// availability is uncertain it is kept. So Shenzhen-Hong Kong Stock
// Connect is read too (IBKR's SEHKSZSE, with HKEX's sell-only lines
// dropped by ibkrBook as for Shanghai), the STAR Market lines are added
// to the Shanghai Connect place and the ChiNext lines to the Shenzhen
// Connect place: IBKR files each board in a book of its own (SEHKSTAR,
// CHINEXT), which ibkrBook does not read, so both are read here from the
// same public products JSON, with ibkrBook's line filters and HKEX's
// Northbound buy-and-sell lists of SSE and SZSE securities.
//
// Left out:
// - The Georgian Stock Exchange. The brokerage page says the firm is a
//   founding member that "actively take[s] part in its trading sessions",
//   through its trading desk. No online channel for it is stated, the IBKR
//   platform does not carry GSE titles, and no list or GSE tariff is
//   published. A place not sold online is left out.
// - Warrants, rights, interim shares, when-issued, subscription-receipt and
//   partly-paid lines, test symbols, ISINs with a wrong check digit, Spanish
//   SIL company shares, dead contracts (.OLD/.NEW/.BAD, no currency),
//   Russian ISINs (sanctions) and bonds: all in ibkrBook.
//
// Restriction checked: broker-list.json says of Stock Connect
// "Northbound-eligible SSE securities only; STAR Market for institutional
// professional investors only". Caucasus Capital's pages say nothing more
// than "Shanghai-Hong Kong Connect Stocks" on the commission page. The
// first half is the Northbound book itself (IBKR's SEHKNTL, with HKEX's
// sell-only lines dropped by ibkrBook). The second is a property of the
// client, not of the title: STAR Market (688/689) lines are kept with the
// remark ../bocomhk/hkCatalogue.mjs uses (BOARD_REMARK.STAR), and ChiNext
// (300/301, and 302 since SZSE opened that range in 2025: 302132 AVIC
// Chengdu Aircraft) lines on Shenzhen Connect with BOARD_REMARK.ChiNext.
// The run stops if the STAR book holds anything but 688/689 codes or the
// ChiNext book anything but 300-302 codes, if either board has too few lines, or
// if a STAR or ChiNext line has no remark.
//
// No KID rule: the accounts are at a US broker-dealer for Georgian clients,
// so the EU retail KID bar does not apply, and US and Asian ETFs are kept.
//
// Currencies: every line keeps IBKR's own currency (a London title can
// have GBP, USD and EUR lines). The account holds IBKR's cash currencies;
// the interest page rates balances in USD, AUD, CAD, CHF, CNH, CZK, DKK,
// EUR, GBP, HKD, HUF, ILS, INR, JPY, KRW, MXN, NOK, NZD, PLN, RUB, SEK, SGD
// and ZAR, which covers every market currency read.
//
// Fees: the commission page (IBKR's fixed pricing: USD 0.015 a share in the
// US, 0.105% min. EUR 4 in most of Europe, GBP 6 in London, ...):
//   https://capital.ge/commissions/
// Sources:
//   https://capital.ge/products-2/          (Product Search link)
//   https://capital.ge/brokerage-2/         (US broker-dealer, GSE desk)
//   https://capital.ge/interest-and-financing/
//   https://misc.clientam.com/cstools/contract_info/v3.10/index.php?wlId=Caucasus_C
//   https://www.clientam.com/en/trading/products-exchanges.php
//
//   node brokers/caucasus/caucasus_scraping.mjs
//   (IBKR_BOOK_CACHE=<file> keeps the IBKR read for 24 h between runs)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { BOARD_REMARK } from "../bocomhk/hkCatalogue.mjs";
import { leftOutLine } from "../easybroker/venue_lists.mjs";
import { pruneByExchangeLists, reportPruned } from "../ibkrus/ibkr_exchange_lists.mjs";
import { ibkrBook } from "../placetrade/ibkrBook.mjs";
import fs from "node:fs";

const FOLDER = "caucasus";
const BROKER = "Caucasus Capital";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const GSE = "Georgian Stock Exchange";
const CONNECT = "Shanghai-Hong Kong Stock Connect";
const SHENZHEN = "Shenzhen-Hong Kong Stock Connect";
// Priced on the commission page ("Netherlands"), missing from broker-list.json.
const EXTRA = ["Euronext Amsterdam"];
// Not priced, offered by IBKR, kept (owner's rule of 2026-10-28).
const OFFERED = [SHENZHEN];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The pages still say what the header quotes, or the run stops.
async function evidence(url, patterns) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const html = await response.text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
  for (const pattern of patterns) if (!pattern.test(text) && !pattern.test(html)) throw new Error(`${url} no longer says ${pattern}`);
}

// A Stock Connect board IBKR files in a book of its own (SEHKSTAR,
// CHINEXT), every page, as ibkrBook reads a book, written on its Connect
// place in ibkrBook's row shape. Lines are left out as ibkrBook leaves
// them out; HKEX's sell-only lines are dropped after.
const BOARDS = {
  STAR: { id: "SEHKSTAR", codes: /^68[89]\d{3}$/, exchange: CONNECT, mic: "XSHG", least: 300 },
  ChiNext: { id: "CHINEXT", codes: /^30[0-2]\d{3}$/, exchange: SHENZHEN, mic: "XSHE", least: 500 },
};
async function boardBook(board) {
  const { id, codes, exchange, mic } = BOARDS[board];
  const endpoint = "https://www.clientam.com/webrest/search/products-by-exchangeId-productType";
  const referer = "https://www.clientam.com/en/trading/products-exchanges.php";
  async function post(body) {
    let last = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json", Referer: referer },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
        const text = await response.text();
        if (response.ok) {
          const json = JSON.parse(text);
          if (Array.isArray(json.products)) return json;
          last = `no products for ${id}`;
        } else last = `${response.status} for ${id}`;
      } catch (error) {
        last = String(error.message || error);
      }
      await sleep(1500 * (attempt + 1));
    }
    throw new Error(last);
  }
  const found = new Map();
  let total = null;
  for (let page = 1; page < 50; page += 1) {
    const body = await post({ domain: "com", exchangeId: id, productType: ["STK"], pageNumber: page, pageSize: "500", sortDirection: "asc", sortField: "symbol" });
    total ??= (body.productTypeCount || []).find((row) => row.productType === "STK")?.totalCount ?? 0;
    for (const product of body.products) found.set(String(product.conid), product);
    if (body.products.length < 500 || found.size >= total) break;
    await sleep(200);
  }
  if (found.size > total || total - found.size > 3) throw new Error(`${id} STK announced ${total} and returned ${found.size}`);
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const rows = [];
  const withheld = new Map();
  for (const product of found.values()) {
    const ticker = normalize(product.symbol).toUpperCase();
    if (!codes.test(ticker)) throw new Error(`${id} holds ${ticker}, not a ${board} code: check the header`);
    const currency = normalize(product.currency).toUpperCase();
    const isin = normalize(product.isin).toUpperCase();
    const reason = !/^[A-Z]{3}$/.test(currency) ? "dead contract (no currency)" : leftOutLine(product);
    if (reason) {
      withheld.set(reason, (withheld.get(reason) || 0) + 1);
      continue;
    }
    rows.push({
      query: ticker,
      ticker,
      name: normalize(product.description),
      exchange,
      mic,
      currency,
      type: "STOCK",
      isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "",
      raw: [product.type, product.symbol, product.localSymbol, product.description, product.exchangeId, product.currency, product.isin, `conid ${product.conid}`, product.isPrimeExchId === "T" ? "primary" : ""].filter(Boolean).join(" | "),
    });
  }
  const read = rows.length;
  reportPruned(await pruneByExchangeLists(rows));
  console.error(`${board}: ${found.size} IBKR lines, ${read} written, ${rows.length} on HKEX's buy-and-sell list${withheld.size ? `; left out ${[...withheld].map(([reason, count]) => `${count} ${reason}`).join(", ")}` : ""}`);
  return rows;
}

await evidence("https://capital.ge/products-2/", [/contract_info\/v3\.10\/index\.php\?wlId=Caucasus_C/]);
await evidence("https://capital.ge/commissions/", [/USD 0\.015 per share/, /Netherlands/, /Shanghai-Hong Kong Connect Stocks/, /LSE International Order Book/]);
await evidence("https://capital.ge/brokerage-2/", [/held with one of the leading US broker-dealers/, /founding member of the Georgian Stock Exchange/]);

const entry = JSON.parse(fs.readFileSync(new URL("../../broker-list.json", import.meta.url), "utf8")).find((item) => item.name === BROKER);
if (!entry) throw new Error(`${BROKER} is not in broker-list.json`);
const listed = Object.keys(entry.exchanges);
if (!listed.includes(GSE)) throw new Error(`${GSE} is no longer a place in broker-list.json: check the header`);
const unhandled = listed.filter((place) => entry.exchanges[place].restriction && place !== CONNECT);
if (unhandled.length) throw new Error(`broker-list restrictions not handled: ${unhandled.join(", ")}`);
const places = [...listed.filter((place) => place !== GSE), ...[...EXTRA, ...OFFERED].filter((place) => !listed.includes(place))];

const rows = await ibkrBook(places, { cache: process.env.IBKR_BOOK_CACHE || "" });

// STAR Market (688/689) and ChiNext (300-302): IBKR's own books, added to
// the Shanghai and Shenzhen Connect places unless ibkrBook's read already
// has the line.
const onFile = new Set(rows.map((row) => `${row.isin || row.ticker}|${row.exchange}|${row.currency}`));
for (const board of Object.keys(BOARDS)) {
  rows.push(...(await boardBook(board)).filter((row) => !onFile.has(`${row.isin || row.ticker}|${row.exchange}|${row.currency}`)));
}

// STAR and ChiNext lines: institutional professional investors only.
for (const row of rows) {
  if (row.exchange === CONNECT && /^68[89]/.test(row.ticker)) row.remark = BOARD_REMARK.STAR;
  if (row.exchange === SHENZHEN && /^30[0-2]/.test(row.ticker)) row.remark = BOARD_REMARK.ChiNext;
}
for (const [board, { codes, exchange, least }] of Object.entries(BOARDS)) {
  const lines = rows.filter((row) => row.exchange === exchange && codes.test(row.ticker));
  if (lines.length < least) throw new Error(`only ${lines.length} ${board} lines on ${exchange}`);
  if (lines.some((row) => row.remark !== BOARD_REMARK[board])) throw new Error(`a ${board} line has no remark`);
}

const byPlace = new Map();
for (const row of rows) byPlace.set(row.exchange, (byPlace.get(row.exchange) || 0) + 1);
if (rows.length < 70_000) throw new Error(`only ${rows.length} rows`);
const floors = {
  "New York Stock Exchange": 1800, Nasdaq: 2500, "NYSE Arca": 1500, "OTC Markets": 4000, "Toronto Stock Exchange": 900, "TSX Venture": 1200,
  "Cboe Canada": 2000, "Bolsa Mexicana": 1000, "London Stock Exchange": 4500, "Börse Frankfurt": 8000, "Börse Xetra": 1500,
  "Börse Stuttgart": 2000, Tradegate: 3000, "Cboe Europe": 2000, Turquoise: 1000, ETFplus: 1500, "SIX Swiss Exchange": 2000,
  "Euronext Paris": 800, "Euronext Amsterdam": 300, "Hong Kong Stock Exchange": 2000, [CONNECT]: 1400, [SHENZHEN]: 900, "Tokyo Stock Exchange": 3500,
  ASX: 1500, "Cboe Australia": 1000, "Singapore Exchange": 400,
};
for (const [place, floor] of Object.entries(floors)) {
  if ((byPlace.get(place) || 0) < floor) throw new Error(`only ${byPlace.get(place) || 0} rows on ${place}`);
}
for (const place of places) if (!byPlace.has(place)) throw new Error(`no row on ${place}`);
const must = [
  ["US0378331005", "Nasdaq", "USD", "Apple on Nasdaq"],
  ["US46625H1005", "New York Stock Exchange", "USD", "JPMorgan on the NYSE"],
  ["US78462F1030", "NYSE Arca", "USD", "SPY on NYSE Arca"],
  ["CA7800871021", "Toronto Stock Exchange", "CAD", "Royal Bank of Canada on Toronto"],
  ["GB00BP6MXD84", "London Stock Exchange", "GBP", "Shell on London"],
  ["IE00B4L5Y983", "London Stock Exchange", "USD", "iShares Core MSCI World on London"],
  ["IE00BK5BQT80", "Börse Xetra", "EUR", "Vanguard FTSE All-World on Xetra"],
  ["DE0007164600", "Tradegate", "EUR", "SAP on Tradegate"],
  ["NL0010273215", "Euronext Amsterdam", "EUR", "ASML on Amsterdam"],
  ["CH0038863350", "SIX Swiss Exchange", "CHF", "Nestlé on SIX"],
  ["FR0000121014", "Euronext Paris", "EUR", "LVMH on Paris"],
  ["JP3633400001", "Tokyo Stock Exchange", "JPY", "Toyota on Tokyo"],
  ["KYG875721634", "Hong Kong Stock Exchange", "HKD", "Tencent on Hong Kong"],
  ["AU000000BHP4", "ASX", "AUD", "BHP on the ASX"],
  ["AU000000IOZ4", "ASX", "AUD", "iShares Core S&P/ASX 200 on the ASX"],
  ["CNE0000018R8", CONNECT, "CNH", "Kweichow Moutai via Shanghai Connect"],
  ["CNE1000041W8", CONNECT, "CNH", "SMIC (STAR Market) via Shanghai Connect"],
  ["CNE000000040", SHENZHEN, "CNH", "Ping An Bank via Shenzhen Connect"],
  ["CNE100003662", SHENZHEN, "CNH", "CATL (ChiNext) via Shenzhen Connect"],
  ["NO0010096985", "Oslo Børs", "NOK", "Equinor on Oslo"],
];
for (const [isin, place, currency, label] of must) {
  if (!rows.some((row) => row.isin === isin && row.exchange === place && row.currency === currency)) throw new Error(`${label} is missing`);
}

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const types = new Map();
for (const row of kept) types.set(row.type, (types.get(row.type) || 0) + 1);
const counts = new Map();
for (const row of kept) counts.set(row.exchange, (counts.get(row.exchange) || 0) + 1);
console.error(
  `${kept.length} rows (${[...types].map(([type, count]) => `${count} ${type}`).join(", ")}) on ${counts.size} places: ` +
    [...counts].sort((a, b) => b[1] - a[1]).map(([place, count]) => `${count} ${place}`).join(", ")
);
const remarks = new Map();
for (const row of kept) if (row.remark) remarks.set(row.remark, (remarks.get(row.remark) || 0) + 1);
for (const [remark, count] of remarks) console.error(`${count} rows remarked: ${remark}`);
