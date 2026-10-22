// Easybroker (a trade name of DMA Europe B.V., Amsterdam) is an introducing
// broker of Interactive Brokers Ireland Limited (IBIE): the account is held
// at IBIE, which executes the orders. Easybroker's markets page sends the
// client to IBKR's product search for "de volledige, actuele lijst", so the
// book is IBKR's public "Products & Exchanges" list, read with no login:
//
//   https://www.easybroker.nl/informatie-over-interactive-brokers
//   https://www.easybroker.nl/markten
//   https://www.interactivebrokers.ie/en/trading/products-exchanges.php
//   POST https://www.interactivebrokers.com/webrest/search/products-by-exchangeId-productType
//        {domain:"ie", exchangeId, productType:["STK"|"ETF"], pageNumber, pageSize:"500"}
//
// The places read are Easybroker's places in broker-list.json, each mapped
// to the IBKR books Easybroker's markets page names for it (AEB, IBIS,
// LSE + LSEETF, BVME + BVME.ETF, SEHKNTL, ...). Cboe Europe, Turquoise and
// Aquis are the alternative platforms the same page says IBKR counts as
// markets; broker-list's "Aquis Stock Exchange" is the Aquis Exchange MTF
// books, written as "Aquis Exchange". Moscow is left out (the page: no
// trading because of sanctions), and so are Russian ISINs.
//
// Restrictions. broker-list says "No US-domiciled ETFs (PRIIPs/KID)" on the
// US places and "Only ETFs with a PRIIPs KID (most local ETFs excluded)" on
// the places outside Europe. Easybroker's ETF page confirms it: "Voor elke
// ETF die je als particuliere belegger koopt, moet een essentiële-
// informatiedocument (KID) beschikbaar zijn ... Is er geen KID, dan
// blokkeert Interactive Brokers de kooporder", and US ETFs "hebben meestal
// geen KID". The product list does not say which fund has a KID, so the
// fund's domicile stands for it: an ETF, ETC or ETN is kept only when its
// ISIN country is European (EEA, Switzerland, the UK, the Channel Islands,
// Isle of Man) or XS with a European issuer country. It is a domicile rule,
// so it applies on every place. Shares are not touched. The markets page
// says the same: "Voor ETF's geldt dat er een Europees essentiële-
// informatiedocument (KID) moet zijn."
//   https://www.easybroker.nl/etfs
//
// Fees: Easybroker publishes its own tariff (0.08% min. EUR 3 in euro,
// USD 0.008 a share in the US, per-currency rates for the rest).
//   https://www.easybroker.nl/tarieven
//
// STAR Market and ChiNext lines are kept with a remark: IBKR's Stock
// Connect page limits ChiNext and STAR shares to institutional
// professional investors, as HKEX's Stock Connect FAQ does. It is a rule
// on the client, not the title.
//   https://ibkb.interactivebrokers.com/hu/node/2267
//   https://www.hkex.com.hk/-/media/HKEX-Market/Mutual-Market/Stock-Connect/Getting-Started/Information-Booklet-and-FAQ/FAQ/FAQ_En.pdf
// "Northbound-eligible A-shares only" is the Stock Connect book itself;
// the lines HKEX files as sell-only are dropped by the exchange-list check
// below. Korea keeps KOSPI and KOSDAQ common and preference shares only
// (IBKR FAQ 28216713): no ETFs there, whatever the KID.
//
// A title tradable on several places gets one row per place, with that
// place's line (its own conid and currency). The US venues are one NBBO
// tape: every US-listed title is one row, on the exchange IBKR flags as its
// primary listing (the first US book that lists it when the flag is
// missing). Lines IBKR keeps on file that cannot be bought are dropped
// against the exchanges' own lists: the US tape, OTC, Hong Kong, Stock
// Connect, London and the ASX in ../ibkrus/ibkr_exchange_lists.mjs
// (shared with the IBKR entity scrapers), every other checked place in
// ./venue_lists.mjs (shared with ../agoradirect): Xetra and Frankfurt
// against Deutsche Börse's tradable-instrument files (Active lines only),
// Stuttgart, gettex and Tradegate shares, Turquoise and Aquis against the
// union of the exchange lists read, Cboe Europe against its live symbol
// files, SIX against its reference data in the row's currency, Euronext
// against its share/ETF/ETV/fund downloads (no Expert Market), Nasdaq
// Stockholm, Helsinki and Copenhagen against Nasdaq Nordic's screeners and
// search, Toronto and TSX Venture against TMX's company directory, the
// NSE against its equity, SME, REIT and InvIT lists, Tokyo against the
// JPX list, new-listing and delisting pages (TOKYO PRO Market, for
// professional investors only, goes), London reporting-only lines
// (market OTHERS). Fund rows take the type Deutsche Börse files them
// under (ETF, ETC, ETN). Rules and sources are in that file's header.
// Left out: warrants, rights, interim shares (BTA, Swedish BTU),
// when-issued, subscription-receipt, partly-paid and buy-back lines, test
// symbols, ISINs with a wrong check digit, Spanish SIL hedge-fund company
// shares (IBKR files them as ETFs), dead contracts (.OLD/.NEW/.BAD or no
// currency), and bonds (obligation.mjs).
//
//   node brokers/easybroker/easybroker_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pruneByExchangeLists, reportPruned } from "../ibkrus/ibkr_exchange_lists.mjs";
import { leftOutLine, pruneByVenueLists, reportVenueLists } from "./venue_lists.mjs";
import fs from "node:fs";

const FOLDER = "easybroker";
const BROKER = "Easybroker";
const DOMAIN = "ie";
const ENDPOINT = "https://www.interactivebrokers.com/webrest/search/products-by-exchangeId-productType";
const REFERER = "https://www.interactivebrokers.ie/en/trading/products-exchanges.php";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = 500;

const US_BOOKS = {
  NYSE: ["New York Stock Exchange", "XNYS"],
  NASDAQ: ["Nasdaq", "XNAS"],
  AMEX: ["NYSE American", "XASE"],
  ARCA: ["NYSE Arca", "ARCX"],
  BATS: ["Cboe BZX", "BATS"],
};
const US_PLACES = new Set(Object.values(US_BOOKS).map(([name]) => name));
const CBOE_EU = ["CHIXEN", "CHIXDE", "CHIXUK", "CHIXES", "CHIXIT", "CHIXCH", "BATEEN", "BATEDE", "BATEUK", "BATEES", "BATEIT", "BATECH", "DXEEN", "DXEDE", "DXEDK", "DXEIT", "DXEAT", "DXEES"];
const TURQUOISE = ["TRQXDE", "TRQXEN", "TRQXES", "TRQXUK", "TRQXCH", "TGHEDE", "TGHEIT", "TGHEEN", "TGHEDK", "TGHEAT", "TGHEES"];
const AQUIS = ["AQEUEN", "AQEUES", "AQEUDK", "AQEUDE", "AQEUAT", "AQEUIT", "AQXECH", "AQXEUK"];

// broker-list place -> IBKR books, and the exchange name and MIC written.
const PLACES = {
  "Toronto Stock Exchange": { ids: ["TSE"], mic: "XTSE" },
  "TSX Venture": { ids: ["VENTURE"], mic: "XTSX" },
  "London Stock Exchange": { ids: ["LSE", "LSEETF"], mic: "XLON" },
  "Cboe Europe": { ids: CBOE_EU, mic: "CHIX" },
  Turquoise: { ids: TURQUOISE, mic: "TRQX" },
  "Aquis Stock Exchange": { ids: AQUIS, mic: "AQXE", exchange: "Aquis Exchange" },
  "Wiener Börse": { ids: ["VSE"], mic: "XWBO" },
  "Euronext Brussels": { ids: ["ENEXT.BE"], mic: "XBRU" },
  "Euronext Paris": { ids: ["SBF"], mic: "XPAR" },
  "Euronext Amsterdam": { ids: ["AEB"], mic: "XAMS" },
  "Euronext Lisbon": { ids: ["BVL"], mic: "XLIS" },
  "Euronext Dublin": { ids: ["ISED"], mic: "XMSM" },
  "Euronext Milan": { ids: ["BVME", "BVME.ETF"], mic: "XMIL" },
  "Bolsa de Madrid": { ids: ["BM"], mic: "XMAD" },
  "Börse Xetra": { ids: ["IBIS"], mic: "XETR" },
  "Börse Frankfurt": { ids: ["FWB"], mic: "XFRA" },
  "Börse Stuttgart": { ids: ["SWB"], mic: "XSTU" },
  gettex: { ids: ["GETTEX"], mic: "XMUN" },
  Tradegate: { ids: ["TGATE"], mic: "XGAT" },
  "Nasdaq Copenhagen": { ids: ["CPH"], mic: "XCSE" },
  "Nasdaq Helsinki": { ids: ["HEX"], mic: "XHEL" },
  "Nasdaq Stockholm": { ids: ["SFB"], mic: "XSTO" },
  "Oslo Børs": { ids: ["OSE"], mic: "XOSL" },
  "Warsaw Stock Exchange": { ids: ["WSE"], mic: "XWAR" },
  "Prague Stock Exchange": { ids: ["PRA"], mic: "XPRA" },
  "Budapest Stock Exchange": { ids: ["BUX"], mic: "XBUD" },
  "Bucharest Stock Exchange": { ids: ["BVB"], mic: "XBSE" },
  "Ljubljana Stock Exchange": { ids: ["LJSE"], mic: "XLJU" },
  "Nasdaq Tallinn": { ids: ["N.TALLINN"], mic: "XTAL" },
  "Nasdaq Riga": { ids: ["N.RIGA"], mic: "XRIS" },
  "Nasdaq Vilnius": { ids: ["N.VILNIUS"], mic: "XLIT" },
  "SIX Swiss Exchange": { ids: ["EBS"], mic: "XSWX" },
  "Hong Kong Stock Exchange": { ids: ["SEHK"], mic: "XHKG" },
  "Shanghai Stock Exchange": { ids: ["SEHKNTL"], mic: "XSHG" },
  "Shenzhen Stock Exchange": { ids: ["SEHKSZSE"], mic: "XSHE" },
  "STAR Market": { ids: ["SEHKSTAR"], mic: "XSHG" },
  ChiNext: { ids: ["CHINEXT"], mic: "XSHE" },
  "Tokyo Stock Exchange": { ids: ["TSEJ"], mic: "XTKS" },
  "Singapore Exchange": { ids: ["SGX"], mic: "XSES" },
  "Korea Exchange": { ids: ["KRX"], mic: "XKRX" },
  "Taiwan Stock Exchange": { ids: ["TWSE"], mic: "XTAI" },
  "Taipei Exchange": { ids: ["TPEX"], mic: "ROCO" },
  "Bursa Malaysia": { ids: ["BURSAMY"], mic: "XKLS" },
  ASX: { ids: ["ASX"], mic: "XASX" },
  "Cboe Australia": { ids: ["CHIXAU"], mic: "CHIA" },
  "Tel Aviv Stock Exchange": { ids: ["TASE"], mic: "XTAE" },
  Tadawul: { ids: ["TADAWUL"], mic: "XSAU" },
  "Abu Dhabi Securities Exchange": { ids: ["ADX"], mic: "XADS" },
  "Dubai Financial Market": { ids: ["DFM"], mic: "XDFM" },
  "Bolsa Mexicana": { ids: ["MEXI"], mic: "XMEX" },
  "B3 São Paulo": { ids: ["B3"], mic: "BVMF" },
  "Johannesburg Stock Exchange": { ids: ["JSE"], mic: "XJSE" },
  "National Stock Exchange of India": { ids: ["NSE"], mic: "XNSE" },
};
const PROFESSIONAL = new Set(["STAR Market", "ChiNext"]);

// Fund domiciles that can carry a PRIIPs KID (see the header).
const KID_DOMICILES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IS", "IT", "LI",
  "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK", "CH", "GB", "JE", "GG", "IM",
]);

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(body) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json", Referer: REFERER },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text();
      if (response.ok) {
        const json = JSON.parse(text);
        if (Array.isArray(json.products)) return json;
        last = `no products for ${body.exchangeId}`;
      } else last = `${response.status} for ${body.exchangeId}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// One book, one type, every page. IBKR's announced count now and then
// counts one contract it does not return; more than a few is a fault.
async function book(id, type) {
  const found = new Map();
  let total = null;
  for (let page = 1; page < 200; page += 1) {
    const body = await post({ domain: DOMAIN, exchangeId: id, productType: [type], pageNumber: page, pageSize: String(PAGE), sortDirection: "asc", sortField: "symbol" });
    total ??= (body.productTypeCount || []).find((row) => row.productType === type)?.totalCount ?? 0;
    for (const product of body.products) found.set(String(product.conid), product);
    if (body.products.length < PAGE || found.size >= total) break;
    await sleep(200);
  }
  if (found.size > total || total - found.size > 3) throw new Error(`${id} ${type} announced ${total} and returned ${found.size}`);
  return [...found.values()];
}

const lists = new Map();
async function readBooks(ids) {
  const queue = ids.flatMap((id) => ["STK", "ETF"].map((type) => [id, type]));
  let next = 0;
  await Promise.all(
    [0, 1, 2].map(async () => {
      while (next < queue.length) {
        const [id, type] = queue[next++];
        lists.set(`${id}|${type}`, await book(id, type));
      }
    })
  );
}
function productsOf(id) {
  return [...(lists.get(`${id}|STK`) || []), ...(lists.get(`${id}|ETF`) || [])];
}

const entry = JSON.parse(fs.readFileSync(new URL("../../broker-list.json", import.meta.url), "utf8")).find((item) => item.name === BROKER);
if (!entry) throw new Error(`${BROKER} is not in broker-list.json`);
const places = Object.keys(entry.exchanges);
const unknownPlaces = places.filter((place) => !PLACES[place] && !US_PLACES.has(place));
if (unknownPlaces.length) throw new Error(`no IBKR book for ${unknownPlaces.join(", ")}`);
const wantUs = places.some((place) => US_PLACES.has(place));

function bannedFund(type, isin, country) {
  if (type === "STOCK") return "";
  const domicile = isin && !isin.startsWith("XS") ? isin.slice(0, 2) : normalize(country).toUpperCase();
  if (!domicile) return `${type} of unknown domicile (no KID)`;
  if (domicile === "US") return `US-domiciled ${type} (no KID)`;
  if (!KID_DOMICILES.has(domicile)) return `non-European ${type} (no KID)`;
  return "";
}

const ids = new Set();
if (wantUs) Object.keys(US_BOOKS).forEach((id) => ids.add(id));
for (const place of places) for (const id of PLACES[place]?.ids || []) ids.add(id);
await readBooks([...ids]);
for (const id of ids) if (!productsOf(id).length) throw new Error(`${id} returned no shares or ETFs`);

const withheld = new Map();
function withhold(reason) {
  withheld.set(reason, (withheld.get(reason) || 0) + 1);
}

function typeOf(product) {
  if (product.type === "STK") return "STOCK";
  if (product.type !== "ETF") return "";
  const name = normalize(product.description);
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b/i.test(name)) return "ETC";
  return "ETF";
}

// Contracts that are not a share or fund for sale.
function leftOut(product) {
  const symbol = normalize(product.symbol).toUpperCase();
  const name = normalize(product.description).toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalize(product.currency))) return "dead contract (no currency)";
  if (/\.(OLD|NEW|BAD)[A-Z0-9]*$/.test(symbol)) return "dead contract (.OLD/.NEW/.BAD)";
  if (/^RU/.test(normalize(product.isin).toUpperCase())) return "Russian ISIN";
  const line = leftOutLine(product);
  if (line) return line;
  if (product.type !== "STK") return "";
  if (/\.RT\b/.test(symbol) || /(-|\s)RTS\b|-\s*RIGHTS?\b|\bRIGHTS?$|\bRT(-[A-Z])?$|\bRT W\/I\b/.test(name)) return "right";
  if (/\.WT\b/.test(symbol) || /\bWARRANTS?\b|-\s?WTS?\b|\bCW\d{2}\b/.test(name)) return "warrant";
  if (/-\s?BTA\b/.test(name)) return "interim share (BTA)";
  return "";
}

const rows = [];
const seen = new Set();
function write(product, exchange, mic) {
  const reason = leftOut(product);
  if (reason) {
    withhold(reason);
    return;
  }
  const type = typeOf(product);
  if (!type) throw new Error(`${product.symbol} is ${product.type}`);
  const raw = normalize(product.isin).toUpperCase();
  const isin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(raw) ? raw : "";
  const banned = bannedFund(type, isin, product.country);
  if (banned) {
    withhold(banned);
    return;
  }
  const currency = normalize(product.currency).toUpperCase();
  const key = `${isin || product.conid}|${mic}|${exchange}|${currency}`;
  if (seen.has(key)) return;
  seen.add(key);
  const ticker = normalize(product.symbol).toUpperCase();
  rows.push({
    query: ticker,
    ticker,
    name: normalize(product.description),
    exchange,
    mic,
    currency,
    type,
    isin,
    raw: [product.type, product.symbol, product.localSymbol, product.description, product.exchangeId, product.currency, product.isin, product.country, `conid ${product.conid}`, product.isPrimeExchId === "T" ? "primary" : ""].filter(Boolean).join(" | "),
    ...(PROFESSIONAL.has(exchange) ? { remark: `${exchange} is for institutional professional investors only.` } : {}),
  });
}

// The US tape: one row per title, on its primary listing.
if (wantUs) {
  const primary = new Map();
  const titles = new Map();
  const seenOn = new Map();
  for (const id of Object.keys(US_BOOKS)) {
    for (const product of productsOf(id)) {
      const conid = String(product.conid);
      titles.set(conid, product);
      if (!seenOn.has(conid)) seenOn.set(conid, id);
      if (product.isPrimeExchId === "T") primary.set(conid, id);
    }
  }
  let unflagged = 0;
  for (const [conid, product] of titles) {
    let id = primary.get(conid);
    if (!id) {
      unflagged += 1;
      id = seenOn.get(conid);
    }
    if (unflagged > 50) throw new Error(`${unflagged} US titles have no primary listing`);
    const [exchange, mic] = US_BOOKS[id];
    write(product, exchange, mic);
  }
}

for (const place of places) {
  const rule = PLACES[place];
  if (!rule) continue;
  const conids = new Set();
  for (const id of rule.ids) {
    for (const product of productsOf(id)) {
      if (conids.has(String(product.conid))) continue;
      conids.add(String(product.conid));
      write(product, rule.exchange || place, rule.mic);
    }
  }
}

// Lines IBKR keeps on file that cannot be bought (see the header).
const pruned = await pruneByExchangeLists(rows);
// The other places, against their exchanges' own lists (./venue_lists.mjs).
const listed = await pruneByVenueLists(rows);
rows.sort((left, right) => left.type.localeCompare(right.type) || left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const byPlace = new Map();
for (const row of rows) byPlace.set(row.exchange, (byPlace.get(row.exchange) || 0) + 1);

if (rows.length < 80_000) throw new Error(`only ${rows.length} rows`);
const floors = { "Toronto Stock Exchange": 1000, "TSX Venture": 1200, "London Stock Exchange": 3000, "Börse Frankfurt": 8000, "Hong Kong Stock Exchange": 2500, "Tokyo Stock Exchange": 3500, ASX: 1500, "Euronext Amsterdam": 300, "Börse Xetra": 1500, Nasdaq: 3000, "New York Stock Exchange": 2000 };
for (const [place, floor] of Object.entries(floors)) {
  if (places.includes(place) && (byPlace.get(place) || 0) < floor) throw new Error(`only ${byPlace.get(place) || 0} rows on ${place}`);
}
// Known titles: present, or absent when the KID rule bans them.
const must = [
  ["US0378331005", "Nasdaq", "USD", "STOCK", "Apple on Nasdaq", true],
  ["US46625H1005", "New York Stock Exchange", "USD", "STOCK", "JPMorgan on the NYSE", true],
  ["US78462F1030", "NYSE Arca", "USD", "ETF", "SPY on NYSE Arca", false],
  ["CA46432F1027", "Toronto Stock Exchange", "CAD", "ETF", "iShares S&P/TSX 60 (XIU) on Toronto", false],
  ["CA7800871021", "Toronto Stock Exchange", "CAD", "STOCK", "Royal Bank of Canada on Toronto", true],
  ["NL0010273215", "Euronext Amsterdam", "EUR", "STOCK", "ASML on Amsterdam", true],
  ["IE00B4L5Y983", "Euronext Amsterdam", "EUR", "ETF", "iShares Core MSCI World (IWDA) on Amsterdam", true],
  ["GB00BP6MXD84", "London Stock Exchange", "GBP", "STOCK", "Shell on London", true],
  ["IE00B4L5Y983", "London Stock Exchange", "USD", "ETF", "iShares Core MSCI World on London", true],
  ["DE0007164600", "Börse Xetra", "EUR", "STOCK", "SAP on Xetra", true],
  ["CH0038863350", "SIX Swiss Exchange", "CHF", "STOCK", "Nestlé on SIX", true],
  ["FR0000121014", "Euronext Paris", "EUR", "STOCK", "LVMH on Paris", true],
  ["JP3633400001", "Tokyo Stock Exchange", "JPY", "STOCK", "Toyota on Tokyo", true],
  ["KYG875721634", "Hong Kong Stock Exchange", "HKD", "STOCK", "Tencent on Hong Kong", true],
  ["AU000000BHP4", "ASX", "AUD", "STOCK", "BHP on the ASX", true],
  ["AU000000IOZ4", "ASX", "AUD", "ETF", "iShares Core S&P/ASX 200 on the ASX", false],
  ["CNE0000018R8", "Shanghai Stock Exchange", "CNH", "STOCK", "Kweichow Moutai via Shanghai Connect", true],
  ["KR7005930003", "Korea Exchange", "KRW", "STOCK", "Samsung Electronics on Korea", true],
  ["TW0002330008", "Taiwan Stock Exchange", "TWD", "STOCK", "TSMC on Taiwan", true],
];
for (const [isin, place, currency, , label, wanted] of must) {
  if (!places.includes(place)) continue;
  const found = rows.some((row) => row.isin === isin && row.exchange === place && row.currency === currency);
  if (wanted && !found) throw new Error(`${label} is missing`);
  if (!wanted && found) throw new Error(`${label} is kept although it has no KID`);
}

// IBKR's Korea Exchange FAQ (28216713): only KOSPI and KOSDAQ common and
// preference shares are available; ETFs/ETPs, REITs, depositary receipts,
// rights and KONEX are not, for any client.
const koreaOffered = (row) => row.mic !== "XKRX" || (row.type === "STOCK" && !/\bREITS?\d*\b|INFRA/i.test(row.name || ""));
const kept = stampRows(withoutObligations(rows.filter(koreaOffered)));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const counts = new Map();
for (const row of kept) counts.set(`${row.exchange} ${row.type}`, (counts.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(`${kept.length} rows over ${new Set(kept.map((row) => row.isin)).size} ISINs: ${[...counts].sort().map(([label, count]) => `${count} ${label}`).join(", ")}`);
if (withheld.size) console.error(`left out ${[...withheld].map(([reason, count]) => `${count} ${reason}`).join(", ")}`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds or Korea non-shares left out`);
reportPruned(pruned);
reportVenueLists(listed);
