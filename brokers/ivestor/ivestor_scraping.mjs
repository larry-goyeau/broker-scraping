// What iVestor sells in shares and exchange-traded funds, with no login.
// iVestor is the Dubai Financial Market's own app. It is not a broker: its
// FAQ says orders are executed by a partner broker (xCube today; BHM
// Capital is also named), and that only securities listed on DFM can be
// viewed. So the book is the DFM list itself, and the exchange's own pages
// are read. The fees are xCube's published commission (0.125% broker
// commission since 11/02/2026, plus market commission and VAT).
//
// DFM's listed-securities page loads its list from one API call
// (FreshSecuritiesLists). It names the exchange and the type of each
// security. Active DFM equities, ETFs and REITs are kept; a REIT is a
// listed share of a closed-end trust and is written as STOCK. Bonds,
// sukuk, listed mutual funds, rights issues and delisted names are left
// out. The same list carries the Nasdaq Dubai securities (DEPA, Hikma,
// Nasdaq Inc., the two REITs, bitcoin ETPs): another exchange, which the
// FAQ does not offer, so they are left out too.
//
// The market watch feed is the board itself. Each kept symbol must be on
// it, in dirhams. The company profile of each symbol gives the ISIN.
// Some names cap foreign ownership; that depends on the client, not the
// title, so nothing is filtered on it.
//
//   https://ivestor.ae/support/        ("Is iVestor a broker?", "What markets can I view")
//   https://www.xcube.ae/pricing/      (the executing broker's commission)
//   https://www.dfm.ae/the-exchange/market-information/listed-securities/equities
//   POST https://api2.dfm.ae/web/widgets/v1/data   Command=FreshSecuritiesLists
//   POST https://api2.dfm.ae/web/widgets/v1/data   Command=companyprofile&symbol=…
//   https://api2.dfm.ae/mw/v1/stocks
//
//   node brokers/ivestor/ivestor_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const API = "https://api2.dfm.ae/web/widgets/v1/data";
const BOARD = "https://api2.dfm.ae/mw/v1/stocks";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, body) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Referer: "https://www.dfm.ae/",
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = `${url} ${body || ""}: ${error.message}`;
    }
    await sleep(500 * (attempt + 1));
  }
  throw new Error(last);
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// The three shelves the listed-securities page has for what iVestor sells.
const SHELVES = { Equities: "STOCK", REITs: "STOCK", ETFs: "ETF" };

const lists = await getJson(API, "Command=FreshSecuritiesLists&Language=en&lang=en");
for (const shelf of [...Object.keys(SHELVES), "Bonds", "Sukuks", "Funds"]) {
  if (!Array.isArray(lists?.[shelf])) throw new Error(`DFM list has no ${shelf} shelf`);
}

const board = await getJson(BOARD);
if (!Array.isArray(board) || board.length < 200) throw new Error(`DFM board printed ${board?.length ?? 0} lines`);
const onBoard = new Map(board.map((line) => [clean(line.id).toUpperCase(), line]));

const picked = [];
const leftOut = { nasdaqDubai: [], inactive: 0 };
for (const [shelf, type] of Object.entries(SHELVES)) {
  for (const entry of lists[shelf]) {
    const ticker = clean(entry.SecuritySymbol).toUpperCase();
    if (!ticker) throw new Error(`unreadable ${shelf} entry ${JSON.stringify(entry).slice(0, 120)}`);
    if (!entry.Active) {
      leftOut.inactive += 1;
      continue;
    }
    if (entry.Exchange === "Nasdaq Dubai") {
      leftOut.nasdaqDubai.push(ticker);
      continue;
    }
    if (entry.Exchange !== "DFM") throw new Error(`${ticker} is on ${entry.Exchange}`);
    picked.push({ ticker, name: clean(entry.FullName), shelf, type });
  }
}
if (picked.length < 60) throw new Error(`DFM list gave only ${picked.length} active securities`);

// Every board line of the cash market must be one of the kept names, a
// rights issue (-RI) or a suspended old code; anything else means the list
// and the board have drifted apart.
const kept = new Set(picked.map((p) => p.ticker));
const listedElsewhere = new Set(
  ["Bonds", "Sukuks", "Funds"].flatMap((shelf) => lists[shelf].map((e) => clean(e.SecuritySymbol).toUpperCase())),
);
for (const line of board) {
  if (line.market !== "510" && line.market !== "520") continue;
  const id = clean(line.id).toUpperCase();
  if (kept.has(id) || listedElsewhere.has(id) || /-RI/.test(id) || line.suspended === "S") continue;
  throw new Error(`${id} trades on the DFM board but is not in the listed-securities page`);
}

const rows = [];
for (const item of picked) {
  const line = onBoard.get(item.ticker);
  if (!line) throw new Error(`${item.ticker} is listed but not on the DFM board`);
  // The board prices DFM's own lines in dirhams (rate 1); a dollar line has rate 3.67.
  if (Number(line.rate) !== 1) throw new Error(`${item.ticker} is quoted at rate ${line.rate}, not in dirhams`);
  const profile = await getJson(API, `Command=companyprofile&lang=en&symbol=${encodeURIComponent(item.ticker)}`);
  const card = Array.isArray(profile) ? profile[0] : profile;
  if (!card || clean(card.Symbol).toUpperCase() !== item.ticker) throw new Error(`no profile for ${item.ticker}`);
  if (card.Market !== "DFM") throw new Error(`${item.ticker} profile says market ${card.Market}`);
  const isin = clean(card.ISIN).toUpperCase();
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) throw new Error(`no ISIN for ${item.ticker}`);
  const kind = clean(card.InstrumentType);
  const expected = { Equities: "equities", REITs: "realEstateInvestmentTrust", ETFs: "exchangeTradedFunds" }[item.shelf];
  if (kind !== expected) throw new Error(`${item.ticker} is ${kind}, not ${expected}`);
  const name = item.name || clean(card.FullName);
  rows.push({
    query: item.ticker,
    ticker: item.ticker,
    name,
    exchange: "DFM",
    currency: "AED",
    type: item.type,
    isin,
    mic: "XDFM",
    raw: [item.ticker, name, "DFM", "AED", isin, item.type].join(" "),
  });
  await sleep(150);
}

const isins = new Set(rows.map((r) => r.isin));
if (isins.size !== rows.length) throw new Error("two DFM symbols share an ISIN");
rows.sort((left, right) => left.ticker.localeCompare(right.ticker));

fs.writeFileSync(new URL("ivestor-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const stocks = rows.filter((r) => r.type === "STOCK").length;
console.error(
  `${rows.length} listings (${stocks} STOCK, ${rows.length - stocks} ETF) on DFM; ` +
    `left out ${leftOut.nasdaqDubai.length} Nasdaq Dubai (${leftOut.nasdaqDubai.join(", ")}) and ${leftOut.inactive} inactive`,
);
