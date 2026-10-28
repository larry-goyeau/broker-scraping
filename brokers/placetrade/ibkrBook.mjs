// IBKR's stock and ETF universe for a list of places, for an introducing
// broker of Interactive Brokers whose clients trade on IBKR's own books
// (Place Trade, a clientam.com white label: its account opening, login and
// pricing pages all lead to clientam.com with partnerID=placetrade). It is
// the AGORA direct reading (../agoradirect/agoradirect_scraping.mjs) made a
// function, so that a scraper passes its own places.
//
// IBKR's public "Products & Exchanges" page lists, with no login, the
// products filed under each exchange, and the same JSON answers it:
//
//   https://www.clientam.com/en/trading/products-exchanges.php
//   POST https://www.clientam.com/webrest/search/products-by-exchangeId-productType
//        {domain:"com", exchangeId, productType:["STK"|"ETF"], pageNumber, pageSize:"500"}
//
// A contract is filed under one or a few exchanges only, while it trades
// on more (VWCE's EUR line is filed under Amsterdam and Tradeweb, not
// Xetra). So every contract read is then asked for IBKR's own list of the
// exchanges it trades on, from the public secdef the same page calls (no
// login, 200 contracts a call), and a row is written on each requested
// place found in its books or in that list (SWB2 and GETTEX2 are Stuttgart
// and gettex). A few Tradeweb and Aquis books are read for their contracts
// only (contracts filed only there).
//
//   GET https://www.clientam.com/portal.proxy/v1/mkt/trsrv/secdef?conids=...
//
// Places are broker-list names. A country name stands for its main
// exchange (Mexico: Bolsa Mexicana, Austria: Wiener Börse, Denmark: Nasdaq
// Copenhagen, Norway: Oslo Børs, Sweden: Nasdaq Stockholm, Switzerland:
// SIX, Japan: Tokyo, Singapore: SGX, ...); Italy is Euronext Milan plus
// ETFplus (funds only), the United Kingdom is the London Stock Exchange
// (LSE and LSEETF books) plus London IOB (depositary receipts only), the
// Baltic countries are the three Nasdaq Baltic markets. The US venues are
// one NBBO tape: when any US place is asked, every US-listed title is one
// row, on the exchange IBKR flags as its primary listing (the first US book
// that lists it when IBKR drops the flag), so Cboe BZX and Texas listings
// come too.
//
// Lines IBKR keeps on file that cannot be bought are then dropped against
// the exchanges' own lists: ../ibkrus/ibkr_exchange_lists.mjs (US titles
// missing from the Nasdaq Trader directory, Stock Connect sell-only lines,
// suspended London lines, IOB receipts the LSE no longer lists, ASX lines
// that are not shares, units or ETPs, Hong Kong codes missing from HKEX's
// list, OTC Caveat Emptor / Grey / Expert names), then
// ../easybroker/venue_lists.mjs (Stuttgart and gettex shares on no
// European list asked of their venue, SIX reference data in the row's
// currency, Euronext share/ETF/ETV/fund downloads, Nasdaq Nordic screeners,
// TMX directory, NSE lists, JPX lists with TOKYO PRO Market out, London
// reporting-only lines). Fund rows take the type Deutsche Börse files them
// under (ETF, ETC, ETN).
//
// Left out: warrants, rights, interim shares (BTA, BTU), when-issued,
// subscription-receipt, partly-paid and buy-back lines, test symbols,
// ISINs with a wrong check digit, Spanish SIL company shares, dead
// contracts IBKR keeps renamed .OLD/.NEW/.BAD or without a currency,
// Russian ISINs (sanctions), and bonds (obligation.mjs).
//
// No broker rule is applied here (KID, US-person fund bar, residency): the
// caller filters the rows it gets.
//
//   import { ibkrBook } from "../placetrade/ibkrBook.mjs";
//   const rows = await ibkrBook(places);   // rows: query, ticker, name, exchange, mic, currency, type, isin, raw
//
//   node brokers/placetrade/ibkrBook.mjs "Nasdaq" "Switzerland" ...   (prints counts, writes nothing;
//   IBKR_BOOK_CACHE=<file> keeps the IBKR read, IBKR_BOOK_OUT=<file> writes the rows)

import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { pruneByExchangeLists, reportPruned } from "../ibkrus/ibkr_exchange_lists.mjs";
import { leftOutLine, pruneByVenueLists, reportVenueLists } from "../easybroker/venue_lists.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = 500;
const SECDEF_PAUSE = 1000;

const US_BOOKS = {
  NYSE: ["New York Stock Exchange", "XNYS"],
  NASDAQ: ["Nasdaq", "XNAS"],
  AMEX: ["NYSE American", "XASE"],
  ARCA: ["NYSE Arca", "ARCX"],
  BATS: ["Cboe BZX", "BATS"],
  TXSE: ["Texas Stock Exchange", "TXSE"],
};
const US_PLACES = new Set([...Object.values(US_BOOKS).map(([name]) => name), "United States"]);
const CBOE_EU = ["CHIXEN", "CHIXDE", "CHIXUK", "CHIXES", "CHIXIT", "CHIXCH", "BATEEN", "BATEDE", "BATEUK", "BATEES", "BATEIT", "BATECH", "DXEEN", "DXEDE", "DXEDK", "DXEIT", "DXEAT", "DXEES"];
const TURQUOISE = ["TRQXDE", "TRQXEN", "TRQXES", "TRQXUK", "TRQXCH", "TGHEDE", "TGHEIT", "TGHEEN", "TGHEDK", "TGHEAT", "TGHEES"];
const AQUIS = ["AQEUEN", "AQEUES", "AQEUDK", "AQEUDE", "AQEUAT", "AQEUIT", "AQXECH", "AQXEUK"];

// Exchange name -> IBKR books, MIC written, and the types the place takes.
const EXCHANGES = {
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

// A country place -> the exchanges written for it.
export const COUNTRY_EXCHANGES = {
  Mexico: ["Bolsa Mexicana"],
  Austria: ["Wiener Börse"],
  Estonia: ["Nasdaq Tallinn"],
  Latvia: ["Nasdaq Riga"],
  Lithuania: ["Nasdaq Vilnius"],
  Belgium: ["Euronext Brussels"],
  "Czech Republic": ["Prague Stock Exchange"],
  Denmark: ["Nasdaq Copenhagen"],
  Finland: ["Nasdaq Helsinki"],
  France: ["Euronext Paris"],
  Hungary: ["Budapest Stock Exchange"],
  Israel: ["Tel Aviv Stock Exchange"],
  Italy: ["Euronext Milan", "ETFplus"],
  Netherlands: ["Euronext Amsterdam"],
  Norway: ["Oslo Børs"],
  Poland: ["Warsaw Stock Exchange"],
  Portugal: ["Euronext Lisbon"],
  Ireland: ["Euronext Dublin"],
  Romania: ["Bucharest Stock Exchange"],
  "Saudi Arabia": ["Tadawul"],
  Slovenia: ["Ljubljana Stock Exchange"],
  Spain: ["Bolsa de Madrid"],
  Sweden: ["Nasdaq Stockholm"],
  Switzerland: ["SIX Swiss Exchange"],
  "United Kingdom": ["London Stock Exchange", "London IOB"],
  Canada: ["Toronto Stock Exchange"],
  Brazil: ["B3 São Paulo"],
  "South Africa": ["Johannesburg Stock Exchange"],
  Japan: ["Tokyo Stock Exchange"],
  Singapore: ["Singapore Exchange"],
  "Hong Kong": ["Hong Kong Stock Exchange"],
  China: ["Shanghai-Hong Kong Stock Connect", "Shenzhen-Hong Kong Stock Connect"],
  India: ["National Stock Exchange of India"],
  Malaysia: ["Bursa Malaysia"],
  Taiwan: ["Taiwan Stock Exchange"],
  Korea: ["Korea Exchange"],
  "South Korea": ["Korea Exchange"],
  Australia: ["ASX"],
  Germany: ["Börse Xetra", "Börse Frankfurt"],
};

// Books read for their contracts only (see the header).
const SOURCE_ONLY = ["TRWBDE", "TRWBEN", "TRWBIT", "TRWBCH", "TRWBUKETF", "AQEUDE", "AQEUEN", "AQEUES", "AQEUIT", "AQXEUK", "AQXECH"];

const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const validIsin = (value) => (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value) ? value : "");

// The exchanges a broker-list place stands for.
export function exchangesOf(place) {
  if (US_PLACES.has(place)) return [place];
  if (EXCHANGES[place]) return [place];
  if (COUNTRY_EXCHANGES[place]) return COUNTRY_EXCHANGES[place];
  return null;
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

// places: broker-list place names. Options: host (the IBKR site read,
// clientam.com by default), log (stderr by default; null for silence),
// cache (a file path, none by default: the rows read from IBKR before the
// exchange-list pass are kept there for 24 hours, so a run stopped by an
// exchange list that blocks for a while does not read IBKR again).
// Returns the rows, with rows.report = { byPlace, withheld, pruned, listed }.
export async function ibkrBook(places, { host = "www.clientam.com", log = (line) => console.error(line), cache = "" } = {}) {
  const say = log || (() => {});
  const unknown = places.filter((place) => !exchangesOf(place));
  if (unknown.length) throw new Error(`no IBKR book for ${unknown.join(", ")}`);
  const key = JSON.stringify([host, [...places].sort()]);
  if (cache) {
    try {
      const saved = JSON.parse(fs.readFileSync(cache, "utf8"));
      if (saved.key === key && Date.now() - saved.at < 86_400_000) {
        say(`${saved.rows.length} IBKR rows from ${cache}`);
        return finish(saved.rows, new Map(), { book: 0, secdef: 0 }, places, say, log);
      }
    } catch {}
  }
  const { rows, withheld, via } = await readIbkr(places, host, say);
  if (cache) fs.writeFileSync(cache, JSON.stringify({ key, at: Date.now(), rows }));
  return finish(rows, withheld, via, places, say, log);
}

async function readIbkr(places, host, say) {
  const endpoint = `https://${host}/webrest/search/products-by-exchangeId-productType`;
  const referer = `https://${host}/en/trading/products-exchanges.php`;
  const secdefUrl = `https://${host}/portal.proxy/v1/mkt/trsrv/secdef?conids=`;
  const wantUs = places.some((place) => US_PLACES.has(place));
  const exchanges = [...new Set(places.filter((place) => !US_PLACES.has(place)).flatMap(exchangesOf))];

  // IBKR code -> the exchanges written for it.
  const targets = new Map();
  for (const exchange of exchanges) {
    const rule = EXCHANGES[exchange];
    for (const id of rule.ids) targets.set(id, [...(targets.get(id) || []), { exchange, mic: rule.mic, types: rule.types }]);
  }
  // A "2" twin in a contract's exchange list (SWB2, GETTEX2, IBIS2, FWB2) is the same exchange.
  const codeOf = (code) => (targets.has(code) ? code : /2$/.test(code) && targets.has(code.slice(0, -1)) ? code.slice(0, -1) : "");

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
      const body = await post({ domain: "com", exchangeId: id, productType: [type], pageNumber: page, pageSize: String(PAGE), sortDirection: "asc", sortField: "symbol" });
      total ??= (body.productTypeCount || []).find((row) => row.productType === type)?.totalCount ?? 0;
      for (const product of body.products) found.set(String(product.conid), product);
      if (body.products.length < PAGE || found.size >= total) break;
      await sleep(200);
    }
    if (found.size > total || total - found.size > 3) throw new Error(`${id} ${type} announced ${total} and returned ${found.size}`);
    return [...found.values()];
  }

  // The secdef answers a burst with 429: one call at a time, a pause
  // between calls, and a long wait after a 429.
  async function secdef(conids) {
    let last = "";
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const response = await fetch(secdefUrl + conids.join(","), { headers: { "User-Agent": UA, Accept: "application/json", Referer: referer }, signal: AbortSignal.timeout(60_000) });
        if (response.ok) {
          const json = await response.json();
          if (Array.isArray(json.secdef)) return json.secdef;
          last = "no secdef array";
        } else last = `secdef ${response.status}`;
      } catch (error) {
        last = String(error.message || error);
      }
      await sleep(last === "secdef 429" ? 20_000 * (attempt + 1) : 1500 * (attempt + 1));
    }
    throw new Error(last);
  }

  const lists = new Map();
  const ids = [...new Set([...(wantUs ? Object.keys(US_BOOKS) : []), ...targets.keys(), ...(exchanges.length ? SOURCE_ONLY : [])])];
  {
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
  const productsOf = (id) => [...(lists.get(`${id}|STK`) || []), ...(lists.get(`${id}|ETF`) || [])];
  for (const id of ids) if (!SOURCE_ONLY.includes(id) && !productsOf(id).length) throw new Error(`${id} returned no shares or ETFs`);

  // Every contract read, the books it was read from, then IBKR's own list
  // of the exchanges it trades on.
  const contracts = new Map();
  for (const id of ids) {
    for (const product of productsOf(id)) {
      const conid = String(product.conid);
      if (!contracts.has(conid)) contracts.set(conid, { product, books: new Set(), exchanges: null });
      contracts.get(conid).books.add(id);
    }
  }
  if (exchanges.length) {
    const all = [...contracts.keys()];
    for (let at = 0; at < all.length; at += 200) {
      for (const definition of await secdef(all.slice(at, at + 200))) {
        const contract = contracts.get(String(definition.conid));
        if (contract) contract.exchanges = String(definition.allExchanges || "").split(",").filter(Boolean);
      }
      await sleep(SECDEF_PAUSE);
    }
    const missing = all.filter((conid) => !contracts.get(conid).exchanges).length;
    if (missing > all.length * 0.03) throw new Error(`secdef answered for ${all.length - missing} of ${all.length} contracts`);
    say(`${all.length} contracts read, ${missing} without a secdef (placed on their books only)`);
  }

  const withheld = new Map();
  const withhold = (reason) => withheld.set(reason, (withheld.get(reason) || 0) + 1);
  const rows = [];
  const seen = new Set();
  function write(product, exchange, mic, types) {
    const reason = leftOut(product);
    if (reason) return withhold(reason);
    const type = typeOf(product);
    if (!type) throw new Error(`${product.symbol} is ${product.type}`);
    if (types && !types.includes(type)) return withhold(`${type} on ${exchange}`);
    const isin = validIsin(normalize(product.isin).toUpperCase());
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
      raw: [product.type, product.symbol, product.localSymbol, product.description, product.exchangeId, product.currency, product.isin, `conid ${product.conid}`, product.isPrimeExchId === "T" ? "primary" : ""].filter(Boolean).join(" | "),
    });
  }

  // The US tape: one row per title, on its primary listing.
  const usTape = new Set();
  if (wantUs) {
    const primary = new Map();
    for (const id of Object.keys(US_BOOKS)) for (const product of productsOf(id)) if (product.isPrimeExchId === "T") primary.set(String(product.conid), id);
    let unflagged = 0;
    for (const [conid, contract] of contracts) {
      const books = Object.keys(US_BOOKS).filter((id) => contract.books.has(id));
      if (!books.length) continue;
      usTape.add(conid);
      let id = primary.get(conid);
      // IBKR now and then drops the primary flag on a title (CECO, Oct
      // 2026): such a title goes on the first US book that lists it.
      if (!id) {
        unflagged += 1;
        id = books[0];
      }
      if (unflagged > 50) throw new Error(`${unflagged} US titles have no primary listing`);
      const [exchange, mic] = US_BOOKS[id];
      write(contract.product, exchange, mic);
    }
  }

  // Every other place: the books a contract was read from and the
  // exchanges its secdef lists. A US-tape title is not written on OTC.
  const via = { book: 0, secdef: 0 };
  for (const [conid, contract] of contracts) {
    const codes = new Set();
    for (const id of contract.books) if (targets.has(id)) codes.add(id);
    const fromBooks = new Set(codes);
    for (const code of contract.exchanges || []) if (codeOf(code)) codes.add(codeOf(code));
    for (const code of codes) {
      for (const one of targets.get(code)) {
        if (usTape.has(conid) && one.mic === "OTCM") continue;
        const before = rows.length;
        write(contract.product, one.exchange, one.mic, one.types);
        if (rows.length > before) via[fromBooks.has(code) ? "book" : "secdef"] += 1;
      }
    }
  }

  return { rows, withheld, via };
}

async function finish(rows, withheld, via, places, say, log) {
  const exchanges = [...new Set(places.filter((place) => !US_PLACES.has(place)).flatMap(exchangesOf))];
  // Lines IBKR keeps on file that cannot be bought (see the header).
  const pruned = await pruneByExchangeLists(rows);
  const listed = await pruneByVenueLists(rows);
  const kept = withoutObligations(rows);
  kept.sort((left, right) => left.type.localeCompare(right.type) || left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));

  const byPlace = new Map();
  for (const row of kept) byPlace.set(`${row.exchange} ${row.type}`, (byPlace.get(`${row.exchange} ${row.type}`) || 0) + 1);
  for (const exchange of exchanges) if (![...byPlace.keys()].some((key) => key.startsWith(`${exchange} `))) throw new Error(`no row on ${exchange}`);

  if (log) {
    say([...byPlace].sort().map(([label, count]) => `${count} ${label}`).join(", "));
    if (withheld.size) say(`left out ${[...withheld].sort((a, b) => b[1] - a[1]).map(([reason, count]) => `${count} ${reason}`).join(", ")}`);
    say(`${via.book} rows from a place book, ${via.secdef} from the contract's exchange list`);
    if (kept.length < rows.length) say(`${rows.length - kept.length} bonds left out`);
    reportPruned(pruned);
    reportVenueLists(listed);
  }
  kept.report = { byPlace, withheld, pruned, listed };
  return kept;
}

// Run alone: print counts for the places given (or Place Trade's).
if (import.meta.url === `file://${process.argv[1]}`) {
  let places = process.argv.slice(2);
  if (!places.length) {
    const entry = JSON.parse(fs.readFileSync(new URL("../../broker-list.json", import.meta.url), "utf8")).find((item) => item.name === "Place Trade");
    places = Object.keys(entry.exchanges);
  }
  const rows = await ibkrBook(places, { cache: process.env.IBKR_BOOK_CACHE || "" });
  const types = new Map();
  for (const row of rows) types.set(row.type, (types.get(row.type) || 0) + 1);
  console.error(`${rows.length} rows (${[...types].map(([type, count]) => `${count} ${type}`).join(", ")}) on ${new Set(rows.map((row) => row.exchange)).size} exchanges, ${rows.filter((row) => !row.isin).length} without ISIN`);
  if (process.env.IBKR_BOOK_OUT) fs.writeFileSync(process.env.IBKR_BOOK_OUT, JSON.stringify(rows));
}
