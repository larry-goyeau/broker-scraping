// What DNB (Norway) sells in shares and ETFs, with no login. DNB's web
// share trading (aksjehandel) opens with a free market-data token and
// shows, per country, an "Alle" list of every share it trades. These are
// the same list queries the app sends: one POST per list that returns
// Reuters codes, then one GET per code for the ISIN, name, currency, MIC,
// type and tradable flag. The lists are the app's own (Oslo Børs, Euronext
// Expand and Growth Oslo, Euronext NOTC, Stockholm with First North,
// Spotlight and NGM, Helsinki, Copenhagen, NYSE, NYSE American, Nasdaq,
// Toronto and TSX Venture, SIX, London, Xetra in euros, Brussels, Paris,
// Amsterdam, Madrid). These are the countries of the price list. The
// German list is Xetra; the app has no Frankfurt floor list.
//
// ETFs are the app's ETF lists (all regions, plus the Norway, France, UK,
// Switzerland, Germany, Netherlands and Sweden ones). The app asks them
// for funds registered for sale in Norway (rfsCountries Norway) and UCITS,
// and so does this scraper. ETCs such as the Oslo gold line are not UCITS
// and stay out. DNB says that since 1 October Norwegians cannot buy ETFs
// listed in the US or Canada (PRIIPs, no KID); a US or Canadian ETF line
// would be dropped, and none comes back. Rights, warrants, ETNs and
// certificates are other products and are not written. A line the server
// marks not tradable (for example a US publicly traded partnership) is
// not written.
//
// DNB's API answers tradeable=true for lines that no longer trade, so
// every line is then checked against its exchange's own list
// (officialLists.mjs in this folder, shared with brokers/sbanken): Nasdaq
// Trader's symbol directory for the US, Euronext's equity and ETF files,
// the Nasdaq Nordic screeners, Deutsche Börse's Xetra instruments file,
// the LSE price explorer and instrument API, SIX reference data and the
// TSX directory. Lines missing there go, and so do suspended lines (LSE
// status S, no Nordic last price, no Euronext trading data), Euronext
// buy-back and treasury-share lines, SIX second trading lines, US
// when-issued lines, US SPAC and equity units, notes, warrants and
// rights, and by DNB's own segment the Paris titres participatifs, the
// Helsinki prelist, the Xetra EEX line and the London bond segments. The
// place label follows those lists when DNB's MIC is stale: the US
// listing exchange from Nasdaq Trader (NYSE Texas, Texas Stock Exchange,
// Cboe BZX, NYSE Arca), First North from the Nordic list, Euronext Growth
// Paris from Euronext, BME Growth from DNB's Madrid segment. Spotlight,
// NGM, NOTC and Madrid are not checked (no list read).
//
// The source gives the place and currency of every line, so a title
// listed on two exchanges is already two rows. DNB routes orders with its
// Smart Order Router to Aquis, Cboe and Turquoise as well (SOR page). As
// for Handelsbanken, a European share is written a second time on Cboe
// Europe DXE when Cboe's own symbol file lists that ISIN, currency and home
// MIC as live. Aquis and Turquoise publish no symbol file that can be read
// without a browser, so no rows are written there.
//
//   https://www.dnb.no/markets/aksjer/aksjehandel-privat
//   https://www.dnb.no/markets/aksjer/prisliste-aksjehandel
//   https://www.dnb.no/markets/aksjer/borshandlede-fond-etf/etf/etf-priips-kid
//   https://www.dnb.no/markets/aksjer/aksjehandel-privat/sor
//   https://www.dnb.no/markets/aksjer/execution-venues-and-brokers
//   https://www.dnb.no/sparing/aksjehandel/#/stocks
//   https://nettbank.api.dnb.no/equity-trader-open/srvs/instrument/query/rics
//   https://nettbank.api.dnb.no/equity-trader-open/srvs/instrument/ric?ric=DNB.OL
//   https://www.cboe.com/europe/equities/market_statistics/symbols_traded/csv/?mkt=dxe
//
//   node brokers/dnb/dnb_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { checkOfficialLists } from "./officialLists.mjs";
import fs from "node:fs";

const API = "https://nettbank.api.dnb.no/equity-trader-open/srvs/instrument";
const DXE_SYMBOLS = "https://www.cboe.com/europe/equities/market_statistics/symbols_traded/csv/?mkt=dxe";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

// [name, query, floor]. The floor is about 80% of the count on 2026-10-21.
const STOCK_LISTS = [
  ["Oslo", { mics: ["XOSL", "XOAM", "XOAS"], instrumentTypes: ["STOCK"] }, 160],
  ["Euronext Expand Oslo", { instrumentTypes: [], mics: ["XOAS"] }, 6],
  ["Euronext Growth Oslo", { currencyCodes: ["NOK"], instrumentTypes: ["STOCK"], mics: ["MERK"] }, 65],
  ["Euronext NOTC", { instrumentTypes: [], marketSegments: [], mics: ["NOTC"] }, 15],
  ["Stockholm", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XSTO", "SSME", "FNSE"] }, 590],
  ["Spotlight", { mics: ["XSAT"] }, 110],
  ["NGM", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XNGM"] }, 80],
  ["Helsinki", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XHEL"] }, 120],
  ["First North Finland", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["FSME"] }, 35],
  ["Copenhagen", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XCSE"] }, 90],
  ["First North Denmark", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["DSME"] }, 20],
  ["NYSE", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XNYS"] }, 1900],
  ["NYSE American", { instrumentTypes: ["STOCK"], mics: ["XASE"] }, 190],
  ["Nasdaq", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XNAS", "XNGS", "XNCM", "XNMS"] }, 3000],
  ["Toronto", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XTSE", "XTSX"] }, 570],
  ["SIX", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XSWX"] }, 200],
  ["London", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XLON"] }, 600],
  ["Xetra", { currencyCodes: ["EUR"], instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XETR"] }, 1100],
  ["Brussels", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XBRU"] }, 85],
  ["Paris", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XPAR"] }, 470],
  ["Amsterdam", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XAMS"] }, 95],
  ["Madrid", { instrumentTypes: ["STOCK"], marketSegments: [], mics: ["XMCE"] }, 210],
];

const ETF_ALL = ["XOSL", "XASE", "XNYS", "XNAS", "XNGS", "XNCM", "XNMS", "ARCX", "XBRU", "XPAR", "XLON", "XSWX", "XETR", "XAMS", "XSTO", "SSME", "FNSE"];
const NORWAY_UCITS = { rfsCountries: ["Norway"], ucits: true };
const ETF_LISTS = [
  ["ETF all", { instrumentTypes: ["ETF"], marketSegments: [], mics: ETF_ALL, ...NORWAY_UCITS }, 4200],
  ["ETF Norway", { instrumentTypes: [], marketSegments: ["ETF"], mics: ["XOSL"], ...NORWAY_UCITS }, 1],
  ["ETF France", { instrumentTypes: ["ETF"], marketSegments: [], mics: ["XPAR", "XPMC"], ...NORWAY_UCITS }, 0],
  ["ETF UK", { instrumentTypes: ["ETF"], marketSegments: [], mics: ["XLON"], ...NORWAY_UCITS }, 0],
  ["ETF Switzerland", { instrumentTypes: ["ETF"], marketSegments: [], mics: ["XSWX"], ...NORWAY_UCITS }, 0],
  ["ETF Germany", { currencyCodes: ["EUR"], instrumentTypes: ["ETF"], marketSegments: [], mics: ["XETR"], ...NORWAY_UCITS }, 0],
  ["ETF Netherlands", { instrumentTypes: ["ETF"], marketSegments: [], mics: ["XAMS", "XAMC"], ...NORWAY_UCITS }, 0],
  ["ETF Sweden", { instrumentTypes: ["ETF"], marketSegments: [], mics: ["XSTO", "SSME", "FNSE"], ...NORWAY_UCITS }, 0],
];

// MIC of a line -> exchange label that resolves in spreads/venues.mjs.
// NOTC (Euronext's Norwegian OTC list) is not in venues.mjs; the label is
// the bare "NOTC" of the price list, since "Euronext NOTC" would resolve to
// an unnamed Euronext place.
const PLACE = {
  XOSL: "Oslo Børs", XOAM: "Oslo Børs", XOAS: "Euronext Expand Oslo", MERK: "Euronext Growth Oslo", NOTC: "NOTC",
  XSTO: "Nasdaq Stockholm", SSME: "First North Stockholm", FNSE: "First North Stockholm", XSAT: "Spotlight Stock Market", XNGM: "Nordic Growth Market",
  XHEL: "Nasdaq Helsinki", FSME: "First North Helsinki", XCSE: "Nasdaq Copenhagen", DSME: "First North Denmark",
  XNYS: "NYSE", XASE: "NYSE American", XNAS: "Nasdaq", XNGS: "Nasdaq", XNCM: "Nasdaq", XNMS: "Nasdaq", ARCX: "NYSE Arca",
  XTSE: "Toronto Stock Exchange", XTSX: "TSX Venture", XSWX: "SIX Swiss Exchange", XLON: "London Stock Exchange",
  XETR: "Xetra", XBRU: "Euronext Brussels", XPAR: "Euronext Paris", XPMC: "Euronext Paris", XAMS: "Euronext Amsterdam",
  XAMC: "Euronext Amsterdam", XMCE: "Bolsa de Madrid",
  // Places the official lists give when DNB's MIC is stale.
  ALXP: "Euronext Growth Paris", ALXB: "Euronext Growth Brussels", MABX: "BME Growth",
  BATS: "Cboe BZX", XCHI: "NYSE Texas", TXSE: "Texas Stock Exchange", IEXG: "IEX",
};
const NORTH_AMERICA = new Set(["XNYS", "XASE", "XNAS", "XNGS", "XNCM", "XNMS", "ARCX", "BATS", "XTSE", "XTSX"]);
// EEA home markets whose shares Cboe Europe DXE trades.
const DXE_HOMES = new Set(["XOSL", "XOAS", "MERK", "XSTO", "SSME", "FNSE", "XSAT", "XNGM", "XHEL", "FSME", "XCSE", "DSME", "XETR", "XBRU", "XPAR", "XAMS", "XMCE"]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function call(url, options = {}) {
  let last = "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let status = 0;
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, "X-DNBAPI-Trace-Id": crypto.randomUUID(), ...(options.headers || {}) },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return await response.json();
      last = `${url} answered ${response.status}`;
      status = response.status;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await new Promise((resolve) => setTimeout(resolve, status === 403 ? 60_000 : 600 * (attempt + 1)));
  }
  throw new Error(last);
}

async function listRics([name, query, floor]) {
  const rics = await call(`${API}/query/rics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!Array.isArray(rics) || rics.some((ric) => typeof ric !== "string")) throw new Error(`${name} list is not a list of codes`);
  if (rics.length < floor) throw new Error(`${name} list has only ${rics.length} codes (floor ${floor})`);
  return rics;
}

// The edge (Akamai) shuts the host for some minutes after a burst of a few
// hundred calls. Calls go out slowly, a 403 waits and tries again, and each
// answer is kept in dnb-cache.jsonl so a stopped run starts where it was.
// An answer older than a week is asked again.
const CACHE = new URL("dnb-cache.jsonl", import.meta.url);
const WEEK = 7 * 24 * 3600 * 1000;

async function instrument(ric) {
  const url = `${API}/ric?ric=${encodeURIComponent(ric)}`;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let status = 0;
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, "X-DNBAPI-Trace-Id": crypto.randomUUID() }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return await response.json();
      status = response.status;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, status === 403 ? 60_000 : 2_000 * (attempt + 1)));
  }
  throw new Error(`${url} kept failing`);
}

async function details(rics) {
  const out = new Map();
  if (fs.existsSync(CACHE)) {
    for (const line of fs.readFileSync(CACHE, "utf8").split("\n").filter(Boolean)) {
      const { at, item } = JSON.parse(line);
      if (Date.now() - at < WEEK && item?.ric) out.set(item.ric, item);
    }
  }
  const todo = rics.filter((ric) => !out.has(ric));
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const ric = todo[next++];
      const item = await instrument(ric);
      if (item?.ric !== ric) throw new Error(`${ric}: the instrument answer is for ${item?.ric}`);
      out.set(ric, item);
      fs.appendFileSync(CACHE, `${JSON.stringify({ at: Date.now(), item })}\n`);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  await Promise.all(Array.from({ length: 2 }, worker));
  return out;
}

// Cboe's DXE symbol file: a stamp line, a header, then one line per book.
// Returns "ISIN|CCY|home MIC" keys of the live lines.
async function dxeLive() {
  const response = await fetch(DXE_SYMBOLS, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Cboe DXE symbol file answered ${response.status}`);
  const lines = (await response.text()).split(/\r?\n/).slice(1).filter(Boolean);
  const cells = (line) => [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"')).slice(0, -1);
  const header = cells(lines[0]);
  const [isinAt, currencyAt, micAt, liveAt] = ["isin", "currency", "mic", "live"].map((name) => header.indexOf(name));
  if (isinAt < 0 || currencyAt < 0 || micAt < 0 || liveAt < 0) throw new Error("Cboe DXE symbol file header moved");
  const live = new Set();
  for (const line of lines.slice(1)) {
    const row = cells(line);
    if (row[liveAt] === "t") live.add(`${row[isinAt]}|${row[currencyAt]}|${row[micAt]}`);
  }
  if (live.size < 3000) throw new Error(`Cboe DXE symbol file has only ${live.size} live lines`);
  return live;
}

const wanted = new Map();
for (const list of STOCK_LISTS) for (const ric of await listRics(list)) if (!wanted.has(ric)) wanted.set(ric, "STOCK");
for (const list of ETF_LISTS) for (const ric of await listRics(list)) wanted.set(ric, "ETF");

const items = await details([...wanted.keys()]);
const skipped = {};
const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
const rows = [];
const segmentOf = new Map();
for (const [ric, kind] of wanted) {
  const item = items.get(ric);
  const type = clean(item.instrumentType || item.type).toUpperCase();
  if (type !== kind) { skip(`${kind} list line typed ${type || "blank"}`); continue; }
  if (item.tradeable !== true) { skip("not tradable"); continue; }
  const mic = clean(item.mic).toUpperCase();
  const exchange = PLACE[mic];
  if (!exchange) throw new Error(`${ric}: no place for MIC ${mic}`);
  if (kind === "ETF" && NORTH_AMERICA.has(mic)) { skip("US or Canadian ETF (PRIIPs)"); continue; }
  if (kind === "ETF" && (item.ucits !== true || !/norway/i.test(String(item.rfsCountries)))) throw new Error(`${ric}: ETF list line is not a UCITS registered in Norway`);
  const isin = clean(item.isin).toUpperCase();
  const currency = clean(item.currency).toUpperCase();
  const ticker = clean(item.ticker) || ric.split(".")[0];
  const name = clean(item.displayName || item.description || item.longName);
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) throw new Error(`${ric}: no ISIN (${item.isin})`);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${ric}: no currency (${item.currency})`);
  if (!name) throw new Error(`${ric}: no name`);
  const row = {
    query: ticker,
    ticker,
    name,
    exchange,
    currency,
    type: kind,
    isin,
    mic,
    raw: [ric, ticker, name, exchange, mic, currency, isin, kind, clean(item.marketSegment)].join(" "),
  };
  rows.push(row);
  segmentOf.set(row, clean(item.marketSegment));
}

// One row per RIC; two RICs on one place and currency for the same ISIN
// (a share class code twice) would be the same book.
const seen = new Set();
const unique = rows.filter((row) => {
  const key = `${row.isin}|${row.mic}|${row.currency}`;
  if (seen.has(key)) { skip("same ISIN, place and currency twice"); return false; }
  seen.add(key);
  return true;
});

// Each line against its exchange's own list (see officialLists.mjs).
const { verdicts, notes } = await checkOfficialLists(unique.map((row) => ({ code: row.mic, isin: row.isin, currency: row.currency, ticker: row.ticker, type: row.type, segment: segmentOf.get(row) })));
const dropped = {};
const relabel = new Map();
const listed = unique.filter((row, index) => {
  const { drop, mic } = verdicts[index];
  if (drop) { dropped[drop] = (dropped[drop] || 0) + 1; return false; }
  if (mic) relabel.set(row, mic);
  return true;
});
const dropTotal = Object.values(dropped).reduce((a, b) => a + b, 0);
if (dropTotal > unique.length * 0.05) throw new Error(`the official lists drop ${dropTotal} of ${unique.length} lines: ${JSON.stringify(dropped)}`);

// Cboe keeps one book per home market, so a share listed in Paris and on
// Xetra can match twice. It is one place and one currency: the home-market
// line wins over the Xetra one.
const dxe = await dxeLive();
const onCboeSeen = new Set();
const onCboe = listed
  .filter((row) => row.type === "STOCK" && DXE_HOMES.has(row.mic) && dxe.has(`${row.isin}|${row.currency}|${row.mic === "XOAM" ? "XOSL" : row.mic}`))
  .sort((a, b) => (a.mic === "XETR") - (b.mic === "XETR"))
  .filter((row) => {
    const key = `${row.isin}|${row.currency}`;
    if (onCboeSeen.has(key)) return false;
    onCboeSeen.add(key);
    return true;
  })
  .map((row) => ({ ...row, exchange: "Cboe Europe DXE", mic: "CEUX", raw: `${row.raw} Cboe DXE` }));
if (onCboe.length < 1000) throw new Error(`only ${onCboe.length} shares matched on Cboe DXE`);

// The place of the official list, once the Cboe twins (read on DNB's
// home MIC) are made.
const placed = listed.map((row) => {
  const mic = relabel.get(row);
  if (!mic) return row;
  if (!PLACE[mic]) throw new Error(`${row.ticker}: no place for listed MIC ${mic}`);
  return { ...row, exchange: PLACE[mic], mic, raw: `${row.raw} listed ${PLACE[mic]}` };
});
const relabelled = {};
for (const [, mic] of relabel) relabelled[PLACE[mic]] = (relabelled[PLACE[mic]] || 0) + 1;

const all = [...placed, ...onCboe].sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
const written = stampRows(withoutObligations(all));
fs.writeFileSync(new URL("dnb-parsed.json", import.meta.url), JSON.stringify(written, null, 2));

const count = (key) => Object.entries(written.reduce((acc, row) => ({ ...acc, [row[key]]: (acc[row[key]] || 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(", ");
console.error(
  `${written.length} listings (${count("type")}); ${count("exchange")}; left out: ${Object.entries(skipped).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}; ` +
    `dropped on the official lists: ${Object.entries(dropped).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}; ` +
    `place from the official list: ${Object.entries(relabelled).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}; ${notes.join("; ")}`
);
