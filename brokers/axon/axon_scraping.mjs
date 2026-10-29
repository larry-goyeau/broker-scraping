// What Axon Securities (Axon Securities S.A., Athens, HCMC licence
// 7/560/02.09.2010; a NAGA white label at axontrader.eu) sells as shares
// and ETFs, with no login. CFDs are left out.
//
// Real stocks. Axon's Hours and Fees page carries, in its page source
// (__NEXT_DATA__, props.pageProps), one table per asset group. The
// "real_stocks" table is the list of real (".re") shares a client owns,
// with Axon's code (in the "instrument" field: ADSGn.re, MMM.re, 700.re),
// the title (in the "symbol" field), the currency, the trading hours (UK
// time) and the fee per transaction ("3*": "*Opening and closing a trade
// equals to 2 transactions"). Every other table there is CFDs, the "etfs"
// table too (margin and swaps): Axon sells no real ETF, as broker-list.json
// says ("Stocks only, no ETFs").
//   https://axontrader.eu/trading/hours-and-fees
//
// Place of each line. The currency and the opening time fix a block of
// hours, and the Real Stocks page types each code by country ("Real-Stocks
// USA", "GER", "FRA", "ESP", "HK"). That type list is a JS array in one of
// the page's Next.js chunks, found by its content:
//   https://axontrader.eu/investing/markets/real-stocks
//   USD, 14:31-20:58 UK time: United States. One NBBO market, so a title is
//     one row on its primary listing, from the US exchange book of the day
//     (../wellstrade/usBook.mjs). Axon writes RIC class letters (BRKb):
//     the ticker is BRK.B.
//   HKD, 01:31-07:58: Hong Kong Exchanges (XHKG). The code is the HKEX
//     stock code; the line is the HKD counter of ../primehk/hkexBook.mjs.
//   EUR, 08:01-16:28 (09:01-17:28 Frankfurt time): Xetra, Paris and Madrid
//     share these hours, and the page's type names the country. Axon names
//     no venue. The hours are Xetra's (Frankfurt's floor and Tradegate trade
//     08:00-22:00), so "GER" is Börse Xetra (XETR); "FRA" is Euronext Paris
//     (XPAR) and "ESP" Bolsa de Madrid (XMAD), each country's one share
//     market at those hours. A EUR line the page does not type (DHER, EVTG,
//     HFGG, MBG, VANTI on 2026-10-28) takes the one of the three markets
//     whose book holds it (by code, else by title).
//   PLN, 08:01-15:48: Warsaw Stock Exchange (XWAR), from
//     ../trigondommaklers/gpwBook.mjs. broker-list.json names no Polish
//     place, but Axon's own table sells these seven lines with a fee, and
//     PLN is an account currency, so they are kept.
// A block not listed here stops the run.
//
// Each line must be listed today on its market: the books are the
// exchanges' own lists less suspended lines (Xetra: Deutsche Börse's
// tradable-instruments file, Instrument Status "Active", read here directly
// as ../1822direkt/germanyBook.mjs reads it, since that module rewrites its
// day cache in its own folder; Paris: ../monabanq/euronextParisBook.mjs;
// Madrid: ../kutxabank/bmeBook.mjs). The table is partly stale. A company
// that now trades under another symbol is followed to its current listing
// and kept (MOVED, by ISIN: SQ is Block's XYZ, BK is BNY, TNP is TEN, FB is
// META, GOLD is Barrick Mining's B): when a title's availability is
// uncertain, it is kept. Only a company that no longer exists is left out
// and reported: taken over (ATVI, EA, X, WBA, PDCO, ODP), delisted or gone
// (BBBY, Leoni, Aareal, Kloeckner, Rallye), bankrupt with no successor
// share (SPWR, NKLA, BIG). Matching:
//   US and HK: the code itself, and the titles must share a word unless
//     RENAMED says the company was renamed; NOT_SAME leaves out a symbol
//     another company took although a word is shared (SPWR is the former
//     Complete Solaria; SunPower Corp's own share is gone).
//   Xetra, Paris, Madrid, Warsaw: the market's code (Axon's code without
//     RIC letters: ADSGn -> ADS, ALVG -> ALV, VOWG_p -> VOW3), else the
//     title, as in ../nagacy/nagacy_scraping.mjs: the best listed title
//     when the two mostly agree and no other ISIN comes close, or the one
//     listed title holding every word of Axon's. BY_HAND places the lines
//     whose code and title both mislead, checked by hand: the Henkel,
//     Porsche SE and Fuchs preference lines, Merck KGaA, TUI, Grifols A,
//     Allegro (ALE), and renamed companies (QSC is q.beyond, Essilor is
//     EssilorLuxottica, Plastic Omnium is OPmobility).
// Every row is written in the currency Axon gives the line.
//
// Athens Stock Exchange. Axon sells Greek shares online on a live account
// ("Axon Securities SA offers the opportunity for you to invest in Greek
// shares"; examples only: Alpha Bank, Hellenic Telecom, Jumbo), with no
// list and no exception named. So the place is the exchange's whole book
// (../hellenicamerican/athexBook.mjs): the shares of the Main Market and
// EN.A. Growth and the exchange's ETF (all shares of a place include its
// ETFs), less the lines the exchange marks suspended. In euros, MIC XATH.
// No Axon page prices Greek shares (the real-stock table has no Athens
// block); the Costs and Charges Policy gives one stock commission, "0.99EUR
// (or equivalent in other currencies) for an in/out transaction".
//   https://axontrader.eu/greek-stock-market
//   https://axontrader.eu/documents/cost_and_charges_policy
//
// Account currencies (for deposits.mjs): EUR, USD and PLN ("using EUR, USD
// or PLN currency as a base for your account", Hours and Fees page).
// Clients: "Axon Securities S.A. offers services to Greek residents" (site
// footer); not Japan, Canada or the USA.
//
//   node brokers/axon/axon_scraping.mjs
//   node brokers/axon/axon_scraping.mjs --verbose   (matches and lines left out)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { hkexBook } from "../primehk/hkexBook.mjs";
import { parisBook } from "../monabanq/euronextParisBook.mjs";
import { madridBook } from "../kutxabank/bmeBook.mjs";
import { gpwBook } from "../trigondommaklers/gpwBook.mjs";
import { athexBook } from "../hellenicamerican/athexBook.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SITE = "https://axontrader.eu";
const HOURS = `${SITE}/trading/hours-and-fees`;
const REAL_STOCKS = `${SITE}/investing/markets/real-stocks`;
const GREEK = `${SITE}/greek-stock-market`;
const XETRA_PAGE = "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra";
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

// currency + opening time -> block.
const BLOCK = {
  "USD 14:31": { label: "US", places: ["US"], type: "Real-Stocks USA" },
  "HKD 01:31": { label: "Hong Kong", places: ["XHKG"], type: "Real-Stocks HK" },
  "PLN 08:01": { label: "Warsaw", places: ["XWAR"], type: "" },
  "EUR 08:01": { label: "continental", places: ["XETR", "XPAR", "XMAD"] },
};
// Real Stocks page type -> place, in the continental block.
const PAGE_TYPE = { "Real-Stocks GER": "XETR", "Real-Stocks FRA": "XPAR", "Real-Stocks ESP": "XMAD" };
const PLACE = {
  XETR: ["Börse Xetra", "XETR"],
  XPAR: ["Euronext Paris", "XPAR"],
  XMAD: ["Bolsa de Madrid", "XMAD"],
  XHKG: ["HKEX", "XHKG"],
  XWAR: ["Warsaw Stock Exchange", "XWAR"],
};
// US lines whose title in Axon's table is the company's old name, checked by
// hand to be the same company on the same symbol (2026-10-28).
const RENAMED = {
  GE: "GE Aerospace, formerly General Electric",
  GOOGL: "Alphabet, formerly Google",
  GOOG: "Alphabet, formerly Google",
  HPQ: "HP Inc., formerly Hewlett-Packard",
  IBM: "International Business Machines",
  NTAP: "NetApp, formerly Network Appliance",
  SLB: "SLB, formerly Schlumberger",
  SFL: "SFL Corporation, formerly Ship Finance International",
  D: "Dominion Energy, formerly Dominion Resources",
  APA: "APA Corporation, formerly Apache",
  SNAP: "Snap Inc., formerly Snapchat",
  UAL: "United Airlines Holdings, formerly United Continental",
  SIRI: "SiriusXM Holdings, formerly Sirius Satellite Radio",
  HIG: "The Hartford Insurance Group, formerly Hartford Financial",
  XOM: "Exxon Mobil",
};
// US lines whose company now trades under another symbol, checked by hand
// (2026-10-28): the line is the company's current listing, found by its
// ISIN in the US book, never by the stale symbol (FB is now a ProShares ETF,
// GOLD is Gold.com). The run stops if the ISIN is no longer listed.
const MOVED = {
  SQ: { ticker: "XYZ", isin: "US8522341036", why: "Square is Block, Inc., XYZ since 2025" },
  BK: { ticker: "BNY", isin: "US0640581007", why: "The Bank of New York Mellon, now BNY" },
  TNP: { ticker: "TEN", isin: "BMG9108L1735", why: "Tsakos Energy Navigation, now TEN" },
  FB: { ticker: "META", isin: "US30303M1027", why: "Facebook is Meta Platforms, META since 2022" },
  GOLD: { ticker: "B", isin: "CA06849F1080", why: "Barrick Gold is Barrick Mining, B since 2025" },
};
// US symbols another company took over although the titles share a word,
// checked by hand (2026-10-28): the line is left out.
const NOT_SAME = {
  SPWR: "SunPower Corp went bankrupt in 2024 with no successor share; SPWR is Complete Solaria, renamed SunPower Inc.",
};
// Lines whose code and title both mislead, placed by hand (2026-10-28).
const BY_HAND = {
  // Henkel's preference share (Vorzugsaktie, "VZ") is HEN3 on Xetra.
  HNKG_p: { mic: "XETR", ticker: "HEN3" },
  // Porsche Automobil Holding SE's preference share, PAH3 (not Porsche AG,
  // P911): PSHG is the Refinitiv code of Porsche Automobil Holding.
  PSHG_p: { mic: "XETR", ticker: "PAH3" },
  // Fuchs SE's preference share, FPE3.
  FPEG_p: { mic: "XETR", ticker: "FPE3" },
  // Merck KGaA is MRK; the title alone also fits Merck & Co.'s Xetra line.
  MRCG: { mic: "XETR", ticker: "MRK" },
  // QSC AG is q.beyond AG, on its new line since the 2026 share change.
  QSCG: { mic: "XETR", ticker: "QBY0" },
  // Essilor International is EssilorLuxottica since the 2018 merger (same
  // share, FR0000121667).
  ESSI: { mic: "XPAR", ticker: "EL" },
  // Plastic Omnium is OPmobility since 2024 (same share, FR0000124570).
  PLOF: { mic: "XPAR", ticker: "OPM" },
  // Grifols' class A share (GRLS is its Refinitiv code; class B is GRLS_p).
  GRLS: { mic: "XMAD", ticker: "GRF" },
  // TUI's share is TUI1; TUIA ("N.NA", new shares) is a second, temporary line.
  TUIGn: { mic: "XETR", ticker: "TUI1" },
  // Allegro.eu is ALE on the GPW; ALG there is All in! Games.
  ALG: { mic: "XWAR", ticker: "ALE" },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function page(url, accept = "text/html") {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(1000 * 2 ** attempt);
  }
  throw new Error(last);
}

function nextData(html, url) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`${url} has no __NEXT_DATA__`);
  return JSON.parse(match[1]).props?.pageProps || {};
}

const plain = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// ---- Axon ---------------------------------------------------------------

async function realStocks() {
  const html = await page(HOURS);
  const props = nextData(html, HOURS);
  const lines = props.real_stocks;
  if (!Array.isArray(lines)) throw new Error("the Hours and Fees page has no real_stocks table");
  if (lines.length < 300) throw new Error(`the real_stocks table has only ${lines.length} lines`);
  for (const line of lines) {
    for (const key of ["symbol", "instrument", "fee", "currency", "trading_hours"]) {
      if (typeof line[key] !== "string" || !line[key].trim()) throw new Error(`real_stocks line without ${key}: ${JSON.stringify(line)}`);
    }
    if (!/\.re$/.test(line.instrument)) throw new Error(`real_stocks line ${line.instrument} is not a .re instrument`);
  }
  // The ETF table must still be CFDs (margin and swaps), or Axon now sells
  // real ETFs and the catalogue must take them.
  const etfs = props.etfs;
  if (!Array.isArray(etfs) || !etfs.length || etfs.some((line) => !line.margin || line.swap_long === undefined)) throw new Error("the ETF table is no longer a CFD table, check it");
  return lines;
}

// Code -> "Real-Stocks GER": the JS array behind the Real Stocks page table.
async function pageTypes() {
  const html = await page(REAL_STOCKS);
  if (!/Real-Stocks USA/.test(html)) throw new Error("the Real Stocks page no longer shows types");
  const chunks = [...new Set([...html.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((match) => match[1]))];
  for (const chunk of chunks) {
    const js = await page(SITE + chunk, "*/*");
    const items = [...js.matchAll(/\{symbol:"([^"]+)",name:"[^"]*",type:"(Real-Stocks [A-Z]+)"\}/g)];
    if (items.length < 200) continue;
    return new Map(items.map((match) => [match[1], match[2]]));
  }
  throw new Error("no chunk of the Real Stocks page holds the type list");
}

// The Greek page must still offer Greek shares.
async function greekEvidence() {
  const text = plain(await page(GREEK));
  if (!/offers the opportunity for you to invest in Greek shares/.test(text)) throw new Error(`${GREEK} no longer offers Greek shares`);
  if (!/Live or free Demo account/.test(text)) throw new Error(`${GREEK} no longer points to a live account`);
}

// ---- Xetra --------------------------------------------------------------

function semicolonCells(line) {
  return [...line.matchAll(/("([^"]|"")*"|[^;]*)(;|$)/g)].map((m) => m[1].replace(/^"|"$/g, "").replace(/""/g, '"').trim()).slice(0, -1);
}

// Active Xetra share lines in euros: [{ ticker (Mnemonic), isin, name }].
async function xetraShares() {
  const html = await page(XETRA_PAGE);
  const link = html.match(/href="([^"]*t7-xetr-[A-Za-z-]*allTradableInstruments\.csv)"/)?.[1];
  if (!link) throw new Error(`${XETRA_PAGE} no longer links its allTradableInstruments.csv`);
  const lines = (await page(new URL(link, XETRA_PAGE).href, "text/csv,*/*")).split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith("Product Status;"));
  if (at < 0) throw new Error("Xetra: header row not found");
  const header = semicolonCells(lines[at]);
  const col = Object.fromEntries(["Instrument Status", "Instrument", "ISIN", "Mnemonic", "Instrument Type", "Currency", "Last Trading Date"].map((name) => [name, header.indexOf(name)]));
  const missing = Object.entries(col).filter(([, index]) => index < 0).map(([name]) => name);
  if (missing.length) throw new Error(`Xetra: columns missing (${missing.join(", ")})`);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const names = assetNames("XETR");
  const out = [];
  for (const line of lines.slice(at + 1)) {
    const c = semicolonCells(line);
    if (c[col["Instrument Type"]] !== "CS" || c[col["Instrument Status"]] !== "Active" || c[col.Currency] !== "EUR") continue;
    const last = c[col["Last Trading Date"]];
    if (last && last < today) continue;
    const isin = c[col.ISIN];
    if (!ISIN.test(isin)) continue;
    out.push({ ticker: c[col.Mnemonic], isin, name: names.get(isin) || c[col.Instrument], listed: c[col.Instrument] });
  }
  if (out.length < 1500) throw new Error(`Xetra: only ${out.length} active share lines in euros`);
  return out;
}

// ISIN -> name of the ../../assets/stocks.csv line of that place.
function assetNames(place) {
  const names = new Map();
  for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split(/\r?\n/).slice(1)) {
    const cells = line.match(/("[^"]*"|[^,]*)(,|$)/g).map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, ""));
    if (cells[1] === place && ISIN.test(cells[2] || "") && !names.has(cells[2])) names.set(cells[2], cells[3]);
  }
  return names;
}

// ---- matching a title (as in ../nagacy/nagacy_scraping.mjs) --------------

// Words that say nothing of which company a title is.
const FILLER = new Set(
  ("ag sa se nv spa p plc group groupe grupo holding holdings co company cie inc corp corporation the de des del di " +
    "of and et gmbh class ltd limited pjsc psc bsc sab ord shares share st reg ae sca scs socimi oyj asa ab " +
    "industries industry industrial commercial enterprises s a n v b common stock na kgaa vz").split(" "),
);

function words(text) {
  return String(text || "")
    .replace(/ä/gi, "ae").replace(/ö/gi, "oe").replace(/ü/gi, "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bo\.n\./g, " ") // Xetra's "NA O.N." (no par value)
    .replace(/\.(?=[a-z]{2})/g, ". ") // MUENCH.RUECKVERS. -> MUENCH. RUECKVERS.
    .replace(/&/g, " ")
    .replace(/\b(\w)\.(?=\w\.)/g, "$1") // L.V.M.H. -> LVMH
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b[a-z](?: [a-z]\b)+/g, (letters) => letters.replace(/ /g, "")) // F N B -> FNB
    .split(" ")
    .filter((word) => word && !FILLER.has(word));
}

// Two words agree when equal; a word of three letters or more may stand
// for a longer one ("Bay Mot Werke", "Muench. Rueck"), which counts less.
function agree(word, other) {
  if (word === other) return 1;
  if (word.length >= 3 && other.length >= 3 && (other.startsWith(word) || word.startsWith(other))) return 0.6;
  return 0;
}

// How rare each word is among a place's titles.
const RARITY = new WeakMap();
function rarity(entries) {
  if (RARITY.has(entries)) return RARITY.get(entries);
  const count = new Map();
  for (const entry of entries) for (const word of new Set(words(entry.name))) count.set(word, (count.get(word) || 0) + 1);
  const weight = (word) => Math.log((entries.length + 1) / ((count.get(word) || 0) + 1)) + 1;
  RARITY.set(entries, weight);
  return weight;
}

// The balance (F1) of how much of each title the other holds, weighted by
// rarity. 0 when no word of Axon's is found.
function likeness(ours, theirs, weight = () => 1) {
  const a = words(ours);
  const b = words(theirs);
  if (!a.length || !b.length) return 0;
  const cover = (from, to) => {
    let got = 0;
    let all = 0;
    for (const word of from) {
      all += weight(word);
      got += weight(word) * Math.max(0, ...to.map((other) => agree(word, other)));
    }
    return got / all;
  };
  const forward = cover(a, b);
  const back = cover(b, a);
  return forward && back ? (2 * forward * back) / (forward + back) : 0;
}

// A listed line's titles: the assets name and the exchange's own.
const titlesOf = (entry) => [entry.name, entry.listed].filter(Boolean);
const bestLikeness = (name, entry, weight) => Math.max(...titlesOf(entry).map((title) => likeness(name, title, weight)));
// Every word of Axon's title is in the listed title, or both titles are
// the same letters once spaces go ("Cap Gemini", CAPGEMINI).
function holds(name, entry) {
  const ours = words(name);
  return ours.length > 0 && titlesOf(entry).some((title) => {
    const theirs = words(title);
    return ours.every((word) => theirs.includes(word)) || ours.join("") === theirs.join("");
  });
}

// Axon's code, and the code with its RIC letters cut: the lower-case class
// letters (DTEGn -> DTEG), and on Xetra the "G" of the German RIC too
// (DTEGn -> DTE, ALVG -> ALV). A preference line (_p) is Xetra's "3" line.
function codesOf(code, mic) {
  if (/_p$/.test(code)) {
    const bare = code.replace(/_p$/, "");
    return [`${bare.replace(/G$/, "")}3`.toUpperCase()];
  }
  const out = [code.toUpperCase()];
  const bare = code.replace(/_[a-z]$/i, "").replace(/[a-z]+$/, "");
  out.push(bare.toUpperCase());
  if (mic === "XETR" && /.G$/.test(bare)) out.push(bare.slice(0, -1).toUpperCase());
  return [...new Set(out)].filter(Boolean);
}

const TITLE_MIN = 0.6;
const STEM_MIN = 0.4;

// Madrid's own code is Axon's code (SAN, ITX, BBVA): there the code alone
// is enough.
const BARE = new Set(["XMAD"]);

function match(entries, code, name, mic) {
  const codes = codesOf(code, mic);
  const byCode = [];
  for (const [rank, wanted] of codes.entries()) {
    for (const entry of entries) {
      if (entry.ticker !== wanted) continue;
      const score = bestLikeness(name, entry);
      if (score > 0 || (BARE.has(mic) && rank === 0)) byCode.push({ ...entry, score, rank, how: "code" });
    }
  }
  if (byCode.length) {
    byCode.sort((a, b) => a.rank - b.rank || b.score - a.score);
    return byCode[0];
  }
  const weight = rarity(entries);
  const best = new Map();
  for (const entry of entries) {
    const score = bestLikeness(name, entry, weight);
    if (score > (best.get(entry.isin)?.score || 0)) best.set(entry.isin, { ...entry, score });
  }
  const ranked = [...best.values()].sort((a, b) => b.score - a.score);
  const [top, next] = ranked;
  if (top && (!next || top.score - next.score >= 0.15) && top.score >= TITLE_MIN) return { ...top, how: "title" };
  const whole = [...new Set(entries.filter((entry) => holds(name, entry)).map((entry) => entry.isin))];
  if (whole.length === 1) return { ...best.get(whole[0]), how: "all words of the title" };
  const stem = codes.at(-1).slice(0, 3);
  const alike = ranked.filter((entry) => stem.length === 3 && entry.ticker.startsWith(stem) && entry.score >= STEM_MIN);
  if (alike.length === 1 && (alike[0] === top || alike[0].score - top.score > -0.15)) return { ...alike[0], how: "code start and title" };
  return { how: "none", near: ranked.slice(0, 3).map((entry) => `${entry.ticker} ${entry.name} ${entry.score.toFixed(2)}`) };
}

// ---- read ---------------------------------------------------------------

const lines = await realStocks();
const types = await pageTypes();
await greekEvidence();

const us = await usBook();
const usByTicker = new Map(us.map((row) => [row.ticker, row]));
const usByIsin = new Map(us.filter((row) => row.isin).map((row) => [row.isin, row]));
const hk = (await hkexBook()).rows.filter((row) => row.currency === "HKD");
const hkByCode = new Map(hk.map((row) => [row.ticker, row]));
const books = {
  XETR: await xetraShares(),
  XPAR: (await parisBook()).listed.filter((row) => row.type === "STOCK"),
  XMAD: (await madridBook()).listed.filter((row) => row.type === "STOCK"),
  XWAR: (await gpwBook({ newConnect: false, etps: false })).filter((row) => row.type === "STOCK"),
};
const athens = await athexBook();

const rows = [];
const left = [];
const notes = [];
const leave = (line, why) => left.push(`${line.instrument} (${line.symbol.trim()}): ${why}`);

for (const line of lines) {
  const code = line.instrument.replace(/\.re$/, "");
  // "Meituan CFD" is a real-stock line all the same (3690.re).
  const name = line.symbol.replace(/\s+/g, " ").replace(/ CFD$/, "").trim();
  const opens = line.trading_hours.match(/Open: (\d\d:\d\d)/)?.[1];
  const block = BLOCK[`${line.currency} ${opens}`];
  if (!block) throw new Error(`${line.instrument}: no known market for ${line.currency} ${line.trading_hours}`);
  const type = types.get(line.instrument) || "";
  const raw = [line.instrument, name, line.currency, line.trading_hours, `fee ${line.fee}`, type].filter(Boolean).join(" | ");
  if (block.type && type && type !== block.type) {
    leave(line, `the Real Stocks page says ${type}, which the ${block.label} hours do not fit`);
    continue;
  }

  if (block.places[0] === "US") {
    const ticker = code.replace(/([A-Z])([a-z])$/, (_, a, b) => `${a}.${b.toUpperCase()}`);
    if (MOVED[ticker]) {
      const moved = MOVED[ticker];
      const now = usByIsin.get(moved.isin);
      if (!now) throw new Error(`${line.instrument}: ${moved.why}, but ${moved.isin} is no longer on a US exchange`);
      if (now.ticker !== moved.ticker) throw new Error(`${line.instrument}: ${moved.isin} is now ${now.ticker}, not ${moved.ticker}`);
      notes.push(`${line.instrument} ${name} -> ${now.mic} ${now.ticker} ${now.isin} "${now.name}" (moved: ${moved.why})`);
      rows.push({ ...now, query: line.instrument, name, currency: line.currency, raw: `${raw} | ${now.raw} (moved: ${moved.why})` });
      continue;
    }
    const listed = usByTicker.get(ticker);
    if (!listed) {
      leave(line, "not on a US exchange today (US exchange book)");
      continue;
    }
    if (NOT_SAME[ticker]) {
      leave(line, NOT_SAME[ticker]);
      continue;
    }
    if (!RENAMED[ticker] && likeness(name, listed.name) === 0) {
      leave(line, `the US line ${ticker} is "${listed.name}", not this title`);
      continue;
    }
    rows.push({ ...listed, query: line.instrument, name, currency: line.currency, raw: `${raw} | ${listed.raw}` });
    continue;
  }

  if (block.places[0] === "XHKG") {
    const ticker = code.padStart(5, "0");
    const listed = hkByCode.get(ticker);
    if (!listed) {
      leave(line, `HKEX lists no trading HKD line ${ticker} today`);
      continue;
    }
    if (likeness(name, listed.name) === 0 && likeness(name, listed.raw.split(" | ")[1]) === 0) {
      leave(line, `HKEX ${ticker} is "${listed.name}", not this title`);
      continue;
    }
    rows.push({ ...listed, query: line.instrument, name, currency: line.currency, raw: `${raw} | ${listed.raw}` });
    continue;
  }

  // Xetra, Paris, Madrid, Warsaw.
  let mic = block.places.length === 1 ? block.places[0] : PAGE_TYPE[type] || "";
  if (type && block.places.length > 1 && !mic) {
    leave(line, `the Real Stocks page says ${type}, which the ${block.label} hours do not fit`);
    continue;
  }
  let hit;
  if (BY_HAND[code]) {
    const hand = BY_HAND[code];
    mic = hand.mic;
    hit = books[mic].find((entry) => entry.ticker === hand.ticker);
    if (!hit) throw new Error(`${code}: ${hand.ticker} is no longer on ${mic}`);
    hit = { ...hit, how: "by hand" };
  } else if (mic) {
    hit = match(books[mic], code, name, mic);
  } else {
    // Untyped: the one market of the block whose book holds it.
    const found = block.places.map((place) => ({ place, hit: match(books[place], code, name, place) })).filter((one) => one.hit.how !== "none");
    const byCode = found.filter((one) => one.hit.how === "code");
    const pick = byCode.length === 1 ? byCode[0] : found.length === 1 ? found[0] : null;
    if (!pick) {
      leave(line, `not typed on the Real Stocks page, and ${found.length ? `found on ${found.map((one) => one.place).join("/")}` : "on no market of its hours"}`);
      continue;
    }
    mic = pick.place;
    hit = pick.hit;
    notes.push(`${line.instrument} ${name}: not typed, ${mic} by ${hit.how} (${hit.ticker} ${hit.name})`);
  }
  if (hit.how === "none") {
    leave(line, `not on ${PLACE[mic][0]} today${hit.near?.length ? ` (closest: ${hit.near.join("; ")})` : ""}`);
    continue;
  }
  if (hit.how !== "code") notes.push(`${line.instrument} ${name} -> ${mic} ${hit.ticker} ${hit.isin} "${hit.name}" (${hit.how})`);
  const [exchange] = PLACE[mic];
  rows.push({ query: line.instrument, ticker: hit.ticker, name, exchange, mic, currency: line.currency, type: "STOCK", isin: hit.isin, raw: `${raw} | ${mic} ${hit.ticker} ${hit.name} (${hit.how})` });
}

// Two Axon lines cannot be one listed line.
const seen = new Map();
for (const row of rows) {
  const key = `${row.mic}|${row.isin || row.ticker}`;
  if (seen.has(key)) throw new Error(`${row.query} and ${seen.get(key)} are both ${key}`);
  seen.set(key, row.query);
}

// Athens: the whole book.
for (const row of athens.rows) rows.push({ ...row, raw: `${row.raw} | Athens book, no Axon list` });

// Every place written must be one the venue table knows.
for (const row of rows) {
  const { venue } = resolveVenue({ exchange: row.exchange, mic: row.mic, currency: row.currency });
  if (!venue || venue.mic !== row.mic) throw new Error(`unresolved venue ${row.exchange}|${row.mic}|${row.currency}`);
}

const realKept = rows.length - athens.rows.length;
if (realKept < lines.length * 0.8) throw new Error(`only ${realKept} of ${lines.length} real-stock lines kept, check the matching`);

for (const row of rows) if (!row.isin) delete row.isin;
rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));
const kept = withoutObligations(rows);
const debt = rows.filter((row) => !kept.includes(row)).map((row) => row.query);
const stamped = stampRows(kept);
fs.writeFileSync(new URL("axon-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));

// --verbose: every match not made by code, and every line left out, why.
if (process.argv.includes("--verbose")) {
  for (const item of notes) console.error(`  matched: ${item}`);
  for (const item of left) console.error(`  left out: ${item}`);
}
const counts = {};
for (const row of stamped) {
  const key = `${row.mic} ${row.type}`;
  counts[key] = (counts[key] || 0) + 1;
}
console.error(`axon: ${stamped.length} rows (${Object.entries(counts).map(([key, count]) => `${key} ${count}`).join(", ")}); ${realKept} of ${lines.length} real-stock lines, ${left.length} left out (${left.map((item) => item.split(" ")[0]).join(" ")}); Athens ${athens.rows.length}, suspended ${athens.dropped.map((item) => item.split(" ")[0]).join(" ") || "none"} (trade date ${athens.tradeDate})${debt.length ? `; dropped as debt ${debt.join(" ")}` : ""}`);
