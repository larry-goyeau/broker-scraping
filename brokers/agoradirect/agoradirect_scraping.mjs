// AGORA direct (First Quant GmbH, Berlin) is an introducing broker: the
// account, the orders and the custody are at Interactive Brokers Ireland
// (IBIE), so the book is IBKR's stock and ETF universe. AGORA's share page
// links IBKR's white-label product search (contract.ibkr.info, wlId
// Agora_Ch1), which lands on clientam.com's "Products & Exchanges" page.
// That page lists, with no login, the products filed under each exchange,
// and the same JSON answers it:
//
//   POST https://www.clientam.com/webrest/search/products-by-exchangeId-productType
//        {domain:"com", exchangeId, productType:["STK"|"ETF"], pageNumber, pageSize:"500"}
//
// A contract is filed under one or a few exchanges only, while it trades
// on more: VWCE's EUR line is filed under Amsterdam and Tradeweb, not
// Xetra, and the Xetra book has 977 ETFs. So every contract read is then
// asked for IBKR's own list of the exchanges it trades on, from the
// public secdef the same page calls (no login, 200 contracts a call):
//
//   GET https://www.clientam.com/portal.proxy/v1/mkt/trsrv/secdef?conids=...
//       -> allExchanges "AEB,FWB2,IBIS2,BVME.ETF,GETTEX2,..."
//
// A row is written on each broker place found in the books the contract
// was read from or in that list (IBIS2, FWB2, GETTEX2 and SWB2 are Xetra,
// Frankfurt, gettex and Stuttgart). A few Tradeweb and Aquis books, no
// place of the broker, are read too, for the contracts filed only there.
//
// The places read are the broker's places in broker-list.json. "China" is
// the two Stock Connect books (AGORA prices "China" in CNH, and its news
// page of 2025 says foreign investors reach A-shares through Stock
// Connect), "Denmark" is Nasdaq Copenhagen and "Norway" is Oslo Børs (both
// priced on the share page). Euronext Milan takes both IBKR books (BVME
// and BVME.ETF), London LSE and LSEETF, Cboe Europe the CXE, BXE and DXE
// books, Turquoise its books. London IOB keeps depositary receipts only.
//
// Restrictions, checked on AGORA's own pages:
// - KID. The share page says: "Auf Grund von europäischen Richtlinien
//   dürfen Privatkunden nur ETF's handeln, welche ein sogenanntes KID (Key
//   Information Document) besitzen." This covers every place, not only the
//   non-EU ones broker-list names, so it is applied to every fund line
//   (ETF, ETC, ETN). Whether a fund has a KID is a property of the fund:
//   it is read from IBIE's own order-ticket notice ("does not have a KID")
//   stored by ../interactivebrokersie (same custodian, same retail rule).
//   An IBIE line the walk never settled (no currency, no notice) is not
//   read as a KID: such a fund falls to the domicile rule below.
//   A fund IBIE was not asked about keeps its line when its ISIN is from
//   the EEA or the European ETP domiciles (XS, GB, CH, JE, GG), where
//   IBIE shows a KID for almost every fund; any other domicile (US, CA,
//   AU, JP, HK, ...) or no ISIN is left out.
// - India. The price list says "Indien (nur mit indischem Pass)" and the
//   markets page "Only for Indian residents": the NSE is not read.
// - Russia. "Russische ... Aktien dürfen nur von einheimischen Bürgern
//   gehandelt werden": Russian ISINs are left out (sanctions too).
// - Not applied: the share page still says Swiss shares trade only on SIX
//   in CHF (rule of 2019); AGORA's own news of 9 May 2025 says they trade
//   again on Xetra and Frankfurt since May 2025, so they are kept.
//
// A title tradable on several places gets one row per place, with that
// place's line (its own conid and currency). The US venues are one NBBO
// tape: every US-listed title is one row, on the exchange IBKR flags as
// its primary listing (the first US book of the broker's places that
// lists it when IBKR drops the flag, or when the primary is a US venue
// AGORA does not list). OTC Link titles are the OTC Markets place.
//
// Pure Trading (IBKR code PURE, the CSE's book, which also trades TSX
// and TSX Venture names) and Alpha Exchange (ALPHA) have no product list
// on the page: they are read from the contracts' exchange lists only.
//
// Lines IBKR keeps on file that cannot be bought are then dropped against
// the exchanges' own lists (OTC Caveat Emptor and Grey Market names,
// Stock Connect sell-only lines, suspended London lines, IOB receipts the
// LSE no longer lists, ASX lines that are not shares, units or ETPs, US
// titles missing from the Nasdaq Trader directory, Hong Kong codes missing
// from HKEX's list); rules and sources are in ../ibkrus/ibkr_exchange_lists.mjs.
// Then the other places, in ../easybroker/venue_lists.mjs (shared with
// Easybroker, same IBIE books): Xetra and Frankfurt against Deutsche
// Börse's tradable-instrument files (Active lines in the row's currency),
// Stuttgart, gettex and Tradegate shares and Turquoise lines against the
// union of the exchange lists read, Cboe Europe against its live symbol
// files, SIX against its reference data in the row's currency, Euronext
// against its share/ETF/ETV/fund downloads (no Expert Market), Nasdaq
// Stockholm and Copenhagen against Nasdaq Nordic's screeners and search,
// Toronto and TSX Venture against TMX's company directory (and the Cboe
// Canada, Pure and Alpha rows of a contract dropped there), Tokyo against
// the JPX list, new-listing and delisting pages (TOKYO PRO Market, for
// professional investors only, goes), London reporting-only lines (market
// OTHERS, as XAD6 EUR from the Xetra conid's exchange list). Fund rows
// take the type Deutsche Börse files them under (ETF, ETC, ETN).
//
// Left out: warrants, rights, interim shares (BTA, Swedish BTU),
// when-issued, subscription-receipt, partly-paid and buy-back lines, test
// symbols, ISINs with a wrong check digit, Spanish SIL hedge-fund company
// shares (IBKR files them as ETFs), dead contracts IBKR keeps renamed
// .OLD/.NEW/.BAD or without a currency, and bonds (obligation.mjs).
//
// Sources:
//   https://www.agora-direct.com/de/aktien-etf-fonds/ (prices, KID, notes)
//   https://www.agora-direct.com/de/maerkte/ (places)
//   https://www.agora-direct.com/de/news/schweizer-aktien-der-comeback-am-deutschen-markt/
//   https://www.agora-direct.com/de/news/chinesische-aktien-mit-potenzial/
//   https://contract.ibkr.info/v3.10/index.php?wlId=Agora_Ch1
//   https://www.clientam.com/en/trading/products-exchanges.php
//
//   node brokers/agoradirect/agoradirect_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pruneByExchangeLists, reportPruned } from "../ibkrus/ibkr_exchange_lists.mjs";
import { leftOutLine, pruneByVenueLists, reportVenueLists } from "../easybroker/venue_lists.mjs";
import fs from "node:fs";

const FOLDER = "agoradirect";
const BROKER = "AGORA";
const DOMAIN = "com";
const ENDPOINT = "https://www.clientam.com/webrest/search/products-by-exchangeId-productType";
const REFERER = "https://www.clientam.com/en/trading/products-exchanges.php";
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
const CBOE_EU = ["CHIXEN", "CHIXDE", "CHIXUK", "CHIXES", "CHIXIT", "CHIXCH", "BATEEN", "BATEDE", "BATEUK", "BATEES", "BATEIT", "BATECH", "DXEEN", "DXEDE", "DXEDK", "DXEIT", "DXEAT", "DXEES"];
const TURQUOISE = ["TRQXDE", "TRQXEN", "TRQXES", "TRQXUK", "TRQXCH", "TGHEDE", "TGHEIT", "TGHEEN", "TGHEDK", "TGHEAT", "TGHEES"];

// broker-list place -> IBKR books, the exchange name and MIC written, and
// which types the place takes. A place with several books under its own
// label (China) lists them in `books`.
const PLACES = {
  "OTC Markets": { ids: ["OTCLNKECN"], mic: "OTCM" },
  "Toronto Stock Exchange": { ids: ["TSE"], mic: "XTSE" },
  "TSX Venture": { ids: ["VENTURE"], mic: "XTSX" },
  "Cboe Canada": { ids: ["AEQLIT"], mic: "NEOE" },
  "London Stock Exchange": { ids: ["LSE", "LSEETF"], mic: "XLON" },
  "London IOB": { ids: ["LSEIOB1"], mic: "XLON", types: ["STOCK"] },
  "Cboe Europe": { ids: CBOE_EU, mic: "CHIX" },
  Turquoise: { ids: TURQUOISE, mic: "TRQX" },
  "Wiener Börse": { ids: ["VSE"], mic: "XWBO" },
  "Euronext Brussels": { ids: ["ENEXT.BE"], mic: "XBRU" },
  "Euronext Paris": { ids: ["SBF"], mic: "XPAR" },
  "Euronext Amsterdam": { ids: ["AEB"], mic: "XAMS" },
  "Euronext Lisbon": { ids: ["BVL"], mic: "XLIS" },
  "Euronext Milan": { ids: ["BVME", "BVME.ETF"], mic: "XMIL" },
  "Bolsa de Madrid": { ids: ["BM"], mic: "XMAD" },
  "Börse Xetra": { ids: ["IBIS"], mic: "XETR" },
  "Börse Frankfurt": { ids: ["FWB"], mic: "XFRA" },
  "Börse Stuttgart": { ids: ["SWB"], mic: "XSTU" },
  gettex: { ids: ["GETTEX"], mic: "XMUN" },
  Tradegate: { ids: ["TGATE"], mic: "XGAT" },
  Denmark: { ids: ["CPH"], mic: "XCSE", exchange: "Nasdaq Copenhagen" },
  Norway: { ids: ["OSE"], mic: "XOSL", exchange: "Oslo Børs" },
  "Nasdaq Stockholm": { ids: ["SFB"], mic: "XSTO" },
  "Warsaw Stock Exchange": { ids: ["WSE"], mic: "XWAR" },
  "Prague Stock Exchange": { ids: ["PRA"], mic: "XPRA" },
  "Budapest Stock Exchange": { ids: ["BUX"], mic: "XBUD" },
  "Nasdaq Tallinn": { ids: ["N.TALLINN"], mic: "XTAL" },
  "Nasdaq Riga": { ids: ["N.RIGA"], mic: "XRIS" },
  "Nasdaq Vilnius": { ids: ["N.VILNIUS"], mic: "XLIT" },
  "SIX Swiss Exchange": { ids: ["EBS"], mic: "XSWX" },
  "Hong Kong Stock Exchange": { ids: ["SEHK"], mic: "XHKG" },
  China: {
    books: [
      { ids: ["SEHKNTL"], mic: "XSHG", exchange: "Shanghai-Hong Kong Stock Connect" },
      { ids: ["SEHKSZSE"], mic: "XSHE", exchange: "Shenzhen-Hong Kong Stock Connect" },
    ],
  },
  "Tokyo Stock Exchange": { ids: ["TSEJ"], mic: "XTKS" },
  "Singapore Exchange": { ids: ["SGX"], mic: "XSES" },
  ASX: { ids: ["ASX"], mic: "XASX" },
  "Cboe Australia": { ids: ["CHIXAU"], mic: "CHIA" },
  "Tel Aviv Stock Exchange": { ids: ["TASE"], mic: "XTAE" },
  "Bolsa Mexicana": { ids: ["MEXI"], mic: "XMEX" },
  "Pure Trading": { ids: ["PURE"], mic: "PURE" },
  "Alpha Exchange": { ids: ["ALPHA"], mic: "XATS" },
};
const booksOf = (place) => PLACES[place]?.books || (PLACES[place] ? [{ ...PLACES[place], exchange: PLACES[place].exchange || place }] : []);
// Codes with no product list on the page: they are only met in a
// contract's list of exchanges.
const NO_BOOK = new Set(["PURE", "ALPHA"]);
// Books that are no place of the broker but hold contracts IBKR files
// under no place book (VWCE's EUR line is filed under AEB and TRWBEN, not
// IBIS): read for their contracts only.
const SOURCE_ONLY = ["TRWBDE", "TRWBEN", "TRWBIT", "TRWBCH", "TRWBUKETF", "AQEUDE", "AQEUEN", "AQEUES", "AQEUIT", "AQXEUK", "AQXECH"];
const SECDEF_PAUSE = 1000;
const SECDEF = "https://www.clientam.com/portal.proxy/v1/mkt/trsrv/secdef?conids=";

// Fund domiciles kept when IBIE's KID notice is not on file (see header).
const KID_DOMICILES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK",
  "XS", "GB", "CH", "JE", "GG",
]);

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const validIsin = (value) => (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value) ? value : "");

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
const restrictionOf = (place) => entry.exchanges[place]?.restriction || "";
// The NSE is for Indian residents only (see the header): not read.
const offLimits = Object.keys(entry.exchanges).filter((place) => /residents only/i.test(restrictionOf(place)));
const places = Object.keys(entry.exchanges).filter((place) => !offLimits.includes(place));
const usPlaces = new Set(Object.values(US_BOOKS).map(([name]) => name).filter((name) => places.includes(name)));
const unknownPlaces = places.filter((place) => !PLACES[place] && !usPlaces.has(place));
if (unknownPlaces.length) throw new Error(`no IBKR book for ${unknownPlaces.join(", ")}`);
const usIds = Object.keys(US_BOOKS).filter((id) => usPlaces.has(US_BOOKS[id][0]));

// IBKR exchange code -> the places written for it.
const targets = new Map();
for (const place of places) {
  for (const one of booksOf(place)) for (const id of one.ids) targets.set(id, [...(targets.get(id) || []), one]);
}
// Some books carry a "2" twin in a contract's exchange list (IBIS2, FWB2,
// GETTEX2, SWB2): the same exchange.
const codeOf = (code) => (targets.has(code) ? code : /2$/.test(code) && targets.has(code.slice(0, -1)) ? code.slice(0, -1) : "");

// The secdef answers a burst with 429: one call at a time, a pause
// between calls, and a long wait after a 429.
async function secdef(conids) {
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(SECDEF + conids.join(","), { headers: { "User-Agent": UA, Accept: "application/json", Referer: REFERER }, signal: AbortSignal.timeout(60_000) });
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

// IBIE's KID notice per fund ISIN, from the signed-in IBIE walk: a line
// IBIE shows "does not have a KID" on carries the remark "Professional
// clients only." (older files flagged it nonEuResident).
const IBIE_FILE = new URL("../interactivebrokersie/interactivebrokersie-parsed.json", import.meta.url);
const IBIE_NO_KID = "Professional clients only.";
const ibieKid = new Map();
let ibieUnsettled = 0;
for (const row of JSON.parse(fs.readFileSync(IBIE_FILE, "utf8"))) {
  if (!["ETF", "ETC", "ETN"].includes(row.type) || !validIsin(row.isin || "")) continue;
  const noKid = row.remark === IBIE_NO_KID || row.nonEuResident === true;
  // A line IBIE's walk never settled (no currency, no notice read: GLDX,
  // XST on Toronto) says nothing about the KID; the domicile rule decides.
  if (!noKid && row.currency == null) {
    ibieUnsettled += 1;
    continue;
  }
  ibieKid.set(row.isin, (ibieKid.get(row.isin) ?? false) || noKid);
}
if (ibieKid.size < 10_000) throw new Error(`only ${ibieKid.size} fund ISINs in ${IBIE_FILE.pathname}`);
// A file with no no-KID fund means its notice field changed: every fund
// would pass.
{
  const flagged = [...ibieKid.values()].filter(Boolean).length;
  if (flagged < 2_000) throw new Error(`only ${flagged} no-KID fund ISINs in ${IBIE_FILE.pathname}`);
}
const kidSource = { ibie: 0, domicile: 0 };
function noKid(type, isin) {
  if (type === "STOCK") return "";
  if (!isin) return `${type} without ISIN (KID unknown)`;
  if (ibieKid.has(isin)) {
    kidSource.ibie += 1;
    return ibieKid.get(isin) ? `${type} without KID (IBIE notice)` : "";
  }
  kidSource.domicile += 1;
  return KID_DOMICILES.has(isin.slice(0, 2)) ? "" : `${type} domiciled ${isin.slice(0, 2)} (no KID)`;
}

const ids = new Set([...usIds, ...targets.keys(), ...SOURCE_ONLY]);
await readBooks([...ids].filter((id) => !NO_BOOK.has(id)));
for (const id of ids) if (!NO_BOOK.has(id) && !SOURCE_ONLY.includes(id) && !productsOf(id).length) throw new Error(`${id} returned no shares or ETFs`);

// Every contract read, the books it was read from, then IBKR's own list
// of the exchanges it trades on (public secdef, 200 contracts a call).
const contracts = new Map();
for (const id of ids) {
  for (const product of productsOf(id)) {
    const conid = String(product.conid);
    if (!contracts.has(conid)) contracts.set(conid, { product, books: new Set(), exchanges: null });
    contracts.get(conid).books.add(id);
  }
}
{
  const all = [...contracts.keys()];
  const batches = [];
  for (let at = 0; at < all.length; at += 200) batches.push(all.slice(at, at + 200));
  for (const batch of batches) {
    for (const definition of await secdef(batch)) {
      const contract = contracts.get(String(definition.conid));
      if (contract) contract.exchanges = String(definition.allExchanges || "").split(",").filter(Boolean);
    }
    await sleep(SECDEF_PAUSE);
  }
  const missing = all.filter((conid) => !contracts.get(conid).exchanges).length;
  if (missing > all.length * 0.03) throw new Error(`secdef answered for ${all.length - missing} of ${all.length} contracts`);
  console.error(`${all.length} contracts read, ${missing} without a secdef (placed on their books only)`);
}

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
function write(product, exchange, mic, types) {
  const reason = leftOut(product);
  if (reason) {
    withhold(reason);
    return;
  }
  const type = typeOf(product);
  if (!type) throw new Error(`${product.symbol} is ${product.type}`);
  if (types && !types.includes(type)) {
    withhold(`${type} on ${exchange}`);
    return;
  }
  const isin = validIsin(normalize(product.isin).toUpperCase());
  const banned = noKid(type, isin);
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
    raw: [product.type, product.symbol, product.localSymbol, product.description, product.exchangeId, product.currency, product.isin, `conid ${product.conid}`, product.isPrimeExchId === "T" ? "primary" : ""].filter(Boolean).join(" | "),
  });
}

// The US tape: one row per title, on its primary listing.
const usTape = new Set();
if (usIds.length) {
  let unflagged = 0;
  for (const [conid, contract] of contracts) {
    const books = Object.keys(US_BOOKS).filter((id) => contract.books.has(id));
    if (!books.length) continue;
    usTape.add(conid);
    let id = contract.product.isPrimeExchId === "T" && contract.product.exchangeId;
    // The book that flags the title as primary, when the product kept is
    // another book's copy.
    if (!US_BOOKS[id]) id = books.find((book) => productsOf(book).some((product) => String(product.conid) === conid && product.isPrimeExchId === "T"));
    // IBKR now and then drops the primary flag on a title (CECO, Oct
    // 2026): such a title goes on the first US book that lists it. Many
    // unflagged titles means the feed changed, and the run stops.
    if (!id) unflagged += 1;
    if (unflagged > 50) throw new Error(`${unflagged} US titles have no primary listing`);
    if (!id || !usIds.includes(id)) id = books.find((book) => usIds.includes(book));
    if (!id) continue;
    const [exchange, mic] = US_BOOKS[id];
    write(contract.product, exchange, mic);
  }
}

// Every other place: the books a contract was read from and the
// exchanges its secdef lists. A US-tape title is not written again on
// OTC Markets (IBKR lists PINK on some of them).
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

// Lines IBKR keeps on file that cannot be bought (see the header).
const pruned = await pruneByExchangeLists(rows);
// The other places, against their exchanges' own lists (../easybroker/venue_lists.mjs).
const listed = await pruneByVenueLists(rows);
rows.sort((left, right) => left.type.localeCompare(right.type) || left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const byPlace = new Map();
for (const row of rows) byPlace.set(row.exchange, (byPlace.get(row.exchange) || 0) + 1);

if (rows.length < 80_000) throw new Error(`only ${rows.length} rows`);
const floors = {
  "Toronto Stock Exchange": 900, "TSX Venture": 1200, "Cboe Canada": 3000, "London Stock Exchange": 4500, "Börse Frankfurt": 8000,
  "Hong Kong Stock Exchange": 2000, "Tokyo Stock Exchange": 3500, "OTC Markets": 4000, ASX: 1500, Nasdaq: 2500, "New York Stock Exchange": 1800,
  "Börse Xetra": 1500, "Shanghai-Hong Kong Stock Connect": 400, "Shenzhen-Hong Kong Stock Connect": 400, "Nasdaq Copenhagen": 100, "Oslo Børs": 150,
  "Pure Trading": 3000, "Alpha Exchange": 2000, gettex: 3000, Tradegate: 3000,
};
for (const [place, floor] of Object.entries(floors)) {
  if ((byPlace.get(place) || 0) < floor) throw new Error(`only ${byPlace.get(place) || 0} rows on ${place}`);
}
// Known titles: present, or absent because they have no KID.
const must = [
  ["US0378331005", "Nasdaq", "USD", true, "Apple on Nasdaq"],
  ["US46625H1005", "New York Stock Exchange", "USD", true, "JPMorgan on the NYSE"],
  ["US78462F1030", "NYSE Arca", "USD", false, "SPY on NYSE Arca (US fund, no KID)"],
  ["CA7800871021", "Toronto Stock Exchange", "CAD", true, "Royal Bank of Canada on Toronto"],
  ["GB00BP6MXD84", "London Stock Exchange", "GBP", true, "Shell on London"],
  ["IE00B4L5Y983", "London Stock Exchange", "USD", true, "iShares Core MSCI World on London"],
  ["IE00B4L5Y983", "Börse Xetra", "EUR", true, "iShares Core MSCI World on Xetra"],
  ["IE00BK5BQT80", "Börse Xetra", "EUR", true, "Vanguard FTSE All-World on Xetra"],
  ["IE00BK5BQT80", "gettex", "EUR", true, "Vanguard FTSE All-World on gettex"],
  ["DE0007164600", "Börse Xetra", "EUR", true, "SAP on Xetra"],
  ["DE0007164600", "Tradegate", "EUR", true, "SAP on Tradegate"],
  ["CH0038863350", "SIX Swiss Exchange", "CHF", true, "Nestlé on SIX"],
  ["FR0000121014", "Euronext Paris", "EUR", true, "LVMH on Paris"],
  ["JP3633400001", "Tokyo Stock Exchange", "JPY", true, "Toyota on Tokyo"],
  ["KYG875721634", "Hong Kong Stock Exchange", "HKD", true, "Tencent on Hong Kong"],
  ["AU000000BHP4", "ASX", "AUD", true, "BHP on the ASX"],
  ["AU000000IOZ4", "ASX", "AUD", false, "iShares S&P/ASX 200 (AU fund, no KID)"],
  ["CNE0000018R8", "Shanghai-Hong Kong Stock Connect", "CNH", true, "Kweichow Moutai via Shanghai Connect"],
  ["DK0062498333", "Nasdaq Copenhagen", "DKK", true, "Novo Nordisk on Copenhagen"],
  ["NO0010096985", "Oslo Børs", "NOK", true, "Equinor on Oslo"],
];
for (const [isin, place, currency, wanted, label] of must) {
  const found = rows.some((row) => row.isin === isin && row.exchange === place && row.currency === currency);
  if (found !== wanted) throw new Error(`${label} is ${found ? "kept" : "missing"}`);
}
if (rows.some((row) => row.mic === "XNSE")) throw new Error("NSE rows written");

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL(`${FOLDER}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

const counts = new Map();
for (const row of kept) counts.set(`${row.exchange} ${row.type}`, (counts.get(`${row.exchange} ${row.type}`) || 0) + 1);
const types = new Map();
for (const row of kept) types.set(row.type, (types.get(row.type) || 0) + 1);
console.error([...counts].sort().map(([label, count]) => `${count} ${label}`).join(", "));
if (withheld.size) console.error(`left out ${[...withheld].sort((a, b) => b[1] - a[1]).map(([reason, count]) => `${count} ${reason}`).join(", ")}`);
console.error(`${via.book} rows from a place book, ${via.secdef} from the contract's exchange list`);
console.error(`KID read from IBIE's notice for ${kidSource.ibie} fund lines, from the domicile for ${kidSource.domicile} (${ibieUnsettled} unsettled IBIE lines not read as a KID)`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
reportPruned(pruned);
reportVenueLists(listed);
if (offLimits.length) console.error(`not read (residents of another country only): ${offLimits.join(", ")}`);
console.error(`${kept.length} rows (${[...types].map(([type, count]) => `${count} ${type}`).join(", ")}) on ${new Set(kept.map((row) => row.exchange)).size} places`);
