// Interactive Brokers Canada sells the IBKR group's stock and ETF universe.
// IBKR's public "Products & Exchanges" page lists, with no login, every
// product tradable on each exchange, and the same JSON answers it:
//
//   https://www.interactivebrokers.ca/en/trading/products-exchanges.php
//   POST https://www.interactivebrokers.com/webrest/search/products-by-exchangeId-productType
//        {domain:"ca", exchangeId, productType:["STK"|"ETF"], pageNumber, pageSize:"500"}
//
// The "ca" domain only takes product types away (metals, mutual funds,
// crypto, CFDs, structured products); shares and ETFs are the group's.
// The places read are the broker's places in broker-list.json. A title
// tradable on several places gets one row per place, with that place's
// line (its own conid and currency). The US venues are one NBBO tape:
// every US-listed title is one row, on the exchange IBKR flags as its
// primary listing. OTC Link titles are the OTC Markets place. IBKR files
// several books under one place: LSE + LSEETF (London), the CXE, BXE and
// DXE books (Cboe Europe), the Turquoise books, the Aquis Exchange books
// (broker-list calls them "Aquis Exchange"; they are the Aquis
// Exchange MTF, not the AQSE growth market).
//
// The Canadian Securities Exchange (IBKR code PURE) has no product list on
// the page. Cboe Canada trades every Canadian-listed share, so a Cboe
// Canada share line that is neither its own listing nor on the TSX or
// TSX Venture lists is a CSE listing, and is also written on that place.
// (ETFs are left to Cboe Canada: an unflagged one is a Cboe listing.)
// Alpha Exchange has no product list: it gets the TSX and TSX Venture share lines. STAR
// Market and ChiNext lines are kept with the remark that IBKR opens
// them to professional investors only (broker-list).
//
// Lines IBKR keeps on file that cannot be bought are then dropped against
// the exchanges' own lists and IBKR's own OTC rule: OTC Caveat Emptor and
// Grey Market names (IBKR FAQ 2892: no opening orders), Stock Connect,
// STAR and ChiNext lines HKEX files as sell-only, London lines the LSE
// shows as suspended, IOB receipts the LSE no longer lists, ASX lines that
// are not ordinary shares, units or ETPs (capital notes, preference shares,
// deferred-settlement lines, dead XTB units), US-tape titles missing from
// the Nasdaq Trader symbol directory, and Hong Kong codes missing from
// HKEX's List of Securities. Rules, sources and quotes are in
// ../ibkrus/ibkr_exchange_lists.mjs (shared by the nine IBKR scrapers).
// Expert Market names stay: IBKR only says its clients cannot see their
// quotes, not that they cannot buy them.
//
// Left out: warrants, rights, interim shares (BTA), dead contracts IBKR
// keeps renamed .OLD/.NEW/.BAD or without a currency, Russian ISINs
// (sanctions: closing orders only), and bonds (obligation.mjs).
//
//   node brokers/ibkrca/ibkrca_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pruneByExchangeLists, reportPruned } from "../ibkrus/ibkr_exchange_lists.mjs";
import fs from "node:fs";

const FOLDER = "ibkrca";
const BROKER = "Interactive Brokers Canada";
const DOMAIN = "ca";
const ENDPOINT = "https://www.interactivebrokers.com/webrest/search/products-by-exchangeId-productType";
const REFERER = "https://www.interactivebrokers.ca/en/trading/products-exchanges.php";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = 500;

const US_BOOKS = {
  NYSE: ["New York Stock Exchange", "XNYS"],
  NASDAQ: ["Nasdaq", "XNAS"],
  AMEX: ["NYSE American", "XASE"],
  ARCA: ["NYSE Arca", "ARCX"],
  BATS: ["Cboe BZX", "BATS"],
  TXSE: ["Texas Stock Exchange", "TXSE"],
};
const US_PLACES = new Set(Object.values(US_BOOKS).map(([name]) => name));
const CBOE_EU = ["CHIXEN", "CHIXDE", "CHIXUK", "CHIXES", "CHIXIT", "CHIXCH", "BATEEN", "BATEDE", "BATEUK", "BATEES", "BATEIT", "BATECH", "DXEEN", "DXEDE", "DXEDK", "DXEIT", "DXEAT", "DXEES"];
const TURQUOISE = ["TRQXDE", "TRQXEN", "TRQXES", "TRQXUK", "TRQXCH", "TGHEDE", "TGHEIT", "TGHEEN", "TGHEDK", "TGHEAT", "TGHEES"];
const AQUIS = ["AQEUEN", "AQEUES", "AQEUDK", "AQEUDE", "AQEUAT", "AQEUIT", "AQXECH", "AQXEUK"];

// broker-list place -> IBKR books, the exchange name and MIC written, and
// which types the place takes.
const PLACES = {
  "OTC Markets": { ids: ["OTCLNKECN"], mic: "OTCM" },
  "Toronto Stock Exchange": { ids: ["TSE"], mic: "XTSE" },
  "TSX Venture": { ids: ["VENTURE"], mic: "XTSX" },
  "Cboe Canada": { ids: ["AEQLIT"], mic: "NEOE" },
  "London Stock Exchange": { ids: ["LSE", "LSEETF"], mic: "XLON" },
  "London IOB": { ids: ["LSEIOB1"], mic: "XLON", types: ["STOCK"] },
  "Cboe Europe": { ids: CBOE_EU, mic: "CHIX" },
  Turquoise: { ids: TURQUOISE, mic: "TRQX" },
  "Aquis Exchange": { ids: AQUIS, mic: "AQXE" },
  "Wiener Börse": { ids: ["VSE"], mic: "XWBO" },
  "Euronext Brussels": { ids: ["ENEXT.BE"], mic: "XBRU" },
  "Euronext Paris": { ids: ["SBF"], mic: "XPAR" },
  "Euronext Amsterdam": { ids: ["AEB"], mic: "XAMS" },
  "Euronext Lisbon": { ids: ["BVL"], mic: "XLIS" },
  "Euronext Dublin": { ids: ["ISED"], mic: "XMSM" },
  "Euronext Milan": { ids: ["BVME"], mic: "XMIL" },
  ETFplus: { ids: ["BVME.ETF"], mic: "XMIL", types: ["ETF", "ETC", "ETN"] },
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
  "Shanghai-Hong Kong Stock Connect": { ids: ["SEHKNTL"], mic: "XSHG" },
  "Shenzhen-Hong Kong Stock Connect": { ids: ["SEHKSZSE"], mic: "XSHE" },
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
};
// Places with no product list on the page.
const UNLISTED = new Set();
const ALPHA = ["Alpha Exchange", "XATS"];
// Places IBKR opens to professional investors only: their lines are kept
// with a remark, as futu does.
const PROFESSIONAL = new Set(["STAR Market", "ChiNext"]);
const CSE = ["Canadian Securities Exchange", "XCNQ"];

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
  const queue = ids.flatMap((id) => ["STK", "ETF"].map((type) => [id, type])).filter(([id, type]) => !lists.has(`${id}|${type}`));
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
const unknownPlaces = places.filter((place) => !PLACES[place] && !US_PLACES.has(place) && !UNLISTED.has(place) && place !== CSE[0] && place !== ALPHA[0]);
if (unknownPlaces.length) throw new Error(`no IBKR book for ${unknownPlaces.join(", ")}`);
const wantUs = places.some((place) => US_PLACES.has(place));
const wantCse = places.includes(CSE[0]);

const ids = new Set();
if (places.includes(ALPHA[0])) ["TSE", "VENTURE"].forEach((id) => ids.add(id));
if (wantUs) Object.keys(US_BOOKS).forEach((id) => ids.add(id));
if (wantCse) ["AEQLIT", "TSE", "VENTURE"].forEach((id) => ids.add(id));
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
  if (product.type !== "STK") return "";
  if (/\.RT\b/.test(symbol) || /(-|\s)RTS\b|-\s*RIGHTS?\b|\bRIGHTS?$|\bRT(-[A-Z])?$|\bRT W\/I\b/.test(name)) return "right";
  if (/\.WT\b/.test(symbol) || /\bWARRANTS?\b|-\s?WTS?\b|\bCW\d{2}\b/.test(name)) return "warrant";
  if (/-\s?BTA\b/.test(name)) return "interim share (BTA)";
  return "";
}

const rows = [];
const seen = new Set();
const byPlace = new Map();
function write(product, exchange, mic, place) {
  const reason = leftOut(product);
  if (reason) {
    withhold(reason);
    return;
  }
  const type = typeOf(product);
  if (!type) throw new Error(`${product.symbol} is ${product.type}`);
  const rule = PLACES[place];
  if (rule?.types && !rule.types.includes(type)) {
    withhold(`${type} on ${place}`);
    return;
  }
  const isin = normalize(product.isin).toUpperCase();
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
    isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "",
    raw: [product.type, product.symbol, product.localSymbol, product.description, product.exchangeId, product.currency, product.isin, `conid ${product.conid}`, product.isPrimeExchId === "T" ? "primary" : ""].filter(Boolean).join(" | "),
    ...(PROFESSIONAL.has(exchange) ? { remark: `${exchange} is for institutional professional investors only.` } : {}),
  });
  byPlace.set(exchange, (byPlace.get(exchange) || 0) + 1);
}

// The US tape: one row per title, on its primary listing.
if (wantUs) {
  const primary = new Map();
  const titles = new Map();
  const seenOn = new Map();
  for (const id of Object.keys(US_BOOKS)) {
    for (const product of productsOf(id)) {
      titles.set(String(product.conid), product);
      if (!seenOn.has(String(product.conid))) seenOn.set(String(product.conid), id);
      if (product.isPrimeExchId === "T") primary.set(String(product.conid), id);
    }
  }
  // IBKR now and then drops the primary flag on a title (CECO, Oct 2026).
  // Such a title goes on the first US book that lists it; a large number
  // of unflagged titles means the feed changed, and the run stops.
  let unflagged = 0;
  for (const [conid, product] of titles) {
    let id = primary.get(conid);
    if (!id) {
      unflagged += 1;
      id = seenOn.get(conid);
    }
    if (unflagged > 50) throw new Error(`${unflagged} US titles have no primary listing`);
    const [exchange, mic] = US_BOOKS[id];
    write(product, exchange, mic, exchange);
  }
}

for (const place of places) {
  const rule = PLACES[place];
  if (!rule) continue;
  const exchange = rule.exchange || place;
  const conids = new Set();
  for (const id of rule.ids) {
    for (const product of productsOf(id)) {
      if (conids.has(String(product.conid))) continue;
      conids.add(String(product.conid));
      write(product, exchange, rule.mic, place);
    }
  }
}

if (wantCse) {
  const listed = new Set([...productsOf("TSE"), ...productsOf("VENTURE")].map((product) => String(product.conid)));
  for (const product of productsOf("AEQLIT")) {
    if (product.type !== "STK" || product.isPrimeExchId === "T" || listed.has(String(product.conid))) continue;
    write(product, CSE[0], CSE[1], CSE[0]);
  }
}

// Alpha Exchange (TSX Alpha) trades TSX and TSX Venture listed securities,
// and IBKR publishes no product list for it: the TSX and TSX Venture share
// lines are written on it too.
if (places.includes(ALPHA[0])) {
  for (const id of ["TSE", "VENTURE"]) {
    for (const product of productsOf(id)) {
      if (product.type === "STK") write(product, ALPHA[0], ALPHA[1], ALPHA[0]);
    }
  }
}

rows.sort((left, right) => left.type.localeCompare(right.type) || left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));

// Lines IBKR keeps on file that cannot be bought (see the header).
const pruned = await pruneByExchangeLists(rows);
byPlace.clear();
for (const row of rows) byPlace.set(row.exchange, (byPlace.get(row.exchange) || 0) + 1);

if (rows.length < 100_000) throw new Error(`only ${rows.length} rows`);
const floors = { "Toronto Stock Exchange": 2000, "TSX Venture": 1200, "Cboe Canada": 4000, "London Stock Exchange": 4500, "Börse Frankfurt": 8000, "Hong Kong Stock Exchange": 2500, "Tokyo Stock Exchange": 3500, "OTC Markets": 5000 };
for (const [place, floor] of Object.entries(floors)) {
  if (places.includes(place) && (byPlace.get(place) || 0) < floor) throw new Error(`only ${byPlace.get(place) || 0} rows on ${place}`);
}
if (wantCse && (byPlace.get(CSE[0]) || 0) < 300) throw new Error(`only ${byPlace.get(CSE[0]) || 0} CSE rows`);
const must = [
  ["US0378331005", "XNAS", "USD", "Apple on Nasdaq"],
  ["US46625H1005", "XNYS", "USD", "JPMorgan on the NYSE"],
  ["US78462F1030", "ARCX", "USD", "SPY on NYSE Arca"],
  ["CA7800871021", "XTSE", "CAD", "Royal Bank of Canada on Toronto"],
  ["GB00BP6MXD84", "XLON", "GBP", "Shell on London"],
  ["IE00B4L5Y983", "XLON", "USD", "iShares Core MSCI World on London"],
  ["DE0007164600", "XETR", "EUR", "SAP on Xetra"],
  ["CH0038863350", "XSWX", "CHF", "Nestlé on SIX"],
  ["FR0000121014", "XPAR", "EUR", "LVMH on Paris"],
  ["JP3633400001", "XTKS", "JPY", "Toyota on Tokyo"],
  ["KYG875721634", "XHKG", "HKD", "Tencent on Hong Kong"],
  ["AU000000BHP4", "XASX", "AUD", "BHP on the ASX"],
  ["CNE0000018R8", "XSHG", "CNH", "Kweichow Moutai via Shanghai Connect"],
  ["KR7005930003", "XKRX", "KRW", "Samsung Electronics on Korea"],
  ["TW0002330008", "XTAI", "TWD", "TSMC on Taiwan"],
];
for (const [isin, mic, currency, label] of must) {
  if (!rows.some((row) => row.isin === isin && row.mic === mic && row.currency === currency)) throw new Error(`${label} is missing`);
}

// IBKR's Korea Exchange FAQ (28216713): only KOSPI and KOSDAQ common and
// preference shares are available; ETFs/ETPs, REITs, depositary receipts,
// rights and KONEX are not, for any client.
const koreaOffered = (row) => row.mic !== "XKRX" || (row.type === "STOCK" && !/\bREITS?\d*\b|INFRA/i.test(row.name || ""));
const kept = stampRows(withoutObligations(rows.filter(koreaOffered)));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const counts = new Map();
for (const row of kept) counts.set(`${row.exchange} ${row.type}`, (counts.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(`${kept.length} rows over ${new Set(kept.map((row) => row.isin)).size} ISINs`);
console.error([...counts].sort().map(([label, count]) => `${count} ${label}`).join(", "));
if (withheld.size) console.error(`left out ${[...withheld].map(([reason, count]) => `${count} ${reason}`).join(", ")}`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
reportPruned(pruned);
const skipped = places.filter((place) => UNLISTED.has(place));
if (skipped.length) console.error(`no product list for ${skipped.join(", ")}`);
