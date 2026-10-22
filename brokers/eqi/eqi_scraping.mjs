// What EQi (Equiniti Financial Services, UK) sells in shares, investment
// trusts and exchange-traded products, with no login. EQi's "Find an
// investment" pages are a Morningstar screener whose settings sit in the
// page bundle (urlKey "qwlecbw3ro"), and each tab names its universes, one
// per exchange EQi deals on:
//
//   https://eqi.co.uk/info/stocks-and-shares/search   equities  E0EXG$<MIC>
//   https://eqi.co.uk/info/etfs/search                ETFs      ETEXG$<MIC>
//   https://eqi.co.uk/info/investment-trusts/search   trusts    CEEXG$<MIC>
//   https://eqi.co.uk/bundles/MorningStarScreener     (the universe lists)
//
// The universes are read from Morningstar's public screener API that the
// page calls, 1,000 lines a page by name:
//
//   https://lt.morningstar.com/api/rest.svc/qwlecbw3ro/security/screener?universeIds=E0EXG%24XLON&...
//
// The MICs named on the page are London, Xetra, Frankfurt, Berlin,
// Düsseldorf, Hamburg, Munich, Stuttgart, Milan, Dublin, Luxembourg,
// Madrid, Amsterdam, Brussels, Lisbon, Paris, Stockholm, Copenhagen,
// Helsinki, Oslo, SIX, Aquis (XPLU), NYSE, Nasdaq, NYSE American, NYSE
// Arca, OTC (PINX), Toronto and TSX Venture: the 29 places of
// broker-list.json, stored under its names. One line is one place and one
// currency, as Morningstar quotes it. The US places are one NBBO market;
// a title is listed on one of them only, so nothing is duplicated.
// Left out: funds (FOALL) and bonds are not shares or ETFs, and the
// screener's thirtieth universe, E0EXG$$LTS (3,975 shares in 18 currencies
// on 2026-10-21; the trust and ETF ones are empty). The bundle labels it
// "LSE international": every line carries a London "0xxx" TIDM (0IIF
// Vivendi, 0JVI Loews, 0Q48 Toya), and the LSE instrument API files those
// TIDMs in its "OTHERS" market, segments EQS and SSX4: the LSE's reporting
// codes for off-book trades in foreign shares, with no order book (of 210
// checked, 45 carry a market-maker quote, the rest none). They are not a
// place a client buys on: EQi deals a foreign share through "a UK-based
// market maker" priced on the home market (Pricing page), which is the
// home-place line already in this file for 3,475 of the 3,975 titles. The
// other 500 are on markets EQi names nowhere (Sofia 175, Warsaw 131,
// Bucharest 53, Athens, Reykjavik, Nicosia, Prague, Budapest...) or are
// dead (Silvergate, Arcimoto, Sorrento); 493 of them have no quote at the
// LSE either. iDealing keeps its 14 "0xxx" lines as London; here they would
// be 3,975 London rows priced as UK trades (no international fee) that EQi
// would charge as international ones, so they stay out. The same LSE
// codes reach the equity and ETF universes too; see London below.
//
// Aquis (XPLU) answers 0 lines in every tab, a valid empty answer rather
// than an error (rerun several times on 2026-10-21). EQi's bundle labels
// XPLU "Plus Markets Exchange (NEX Exchange)", the names Aquis Stock
// Exchange had before 2020; Morningstar now files that market under AQSE
// (E0EXG$AQSE: 274 shares, 76 of them Aquis Growth Market companies
// absent from London, such as Adnams, Shepherd Neame, Daniel Thwaites;
// ETEXG$AQSE: 228 London ETPs). EQi's own search therefore shows nothing on
// Aquis, and no EQi page names an Aquis title or the AQSE code, so nothing
// is read from AQSE: the Aquis place stays in the table, empty, and fills
// if EQi's screener moves to a code that answers.
//
// ISINs: Morningstar prints none for about a dozen lines. Each is looked up
// at its own exchange before the shared lists (fromExchanges below): the
// LSE instrument API (a TIDM it does not know is a dead line and goes:
// BAFV, the British & American 3.5% 2025 preference shares, matured), the
// Deutsche Börse Xetra and Frankfurt instrument lists by mnemonic and
// currency, Borsa Italiana's instrument pages (two lines, fixed below),
// the TSX ".U" line from its Canadian-dollar twin, OTC Markets' company
// profile (CUSIP; a symbol it does not know goes: EVFL, TSRD), and Nasdaq
// Trader's symbol directories (a Nasdaq/NYSE line absent from them is not
// trading today and goes: BIAI Bitari, still in SEC registration, and
// KMCM Key Mining, whose merger is pending). DNMXU (Dynamix III units)
// keeps the two ISINs the shared lists give it as `matches`; Nasdaq prints
// none.
//
// Checks on every line (the rules are in eqiChecks.mjs; counts of the
// 2026-10-22 run, on 89,628 lines before):
//
// - Rule 144A (212 lines, 74 titles: AA80 Air Astana GDR, BC94 Samsung
//   GDR, RLI Reliance GDR) stays out: SEC Rule 144A (17 CFR 230.144A)
//   resells to "qualified institutional buyers" only, not to a UK retail
//   client.
// - London: every TIDM is read from the LSE instrument API
//   (api.londonstockexchange.com/api/gw/lse/instruments/alldata/<TIDM>;
//   a line Morningstar prints with its ISIN for a TIDM is found by ISIN,
//   search/autocomplete?q=<ISIN>; answers kept a week in
//   eqi-lse-cache.json, the API answers a burst with 403). A TIDM the LSE
//   files in its "OTHERS" market (segments SSX4, EQS, ETFS) is the
//   off-book reporting code of the E0EXG$$LTS paragraph above, come in
//   through the equity and ETF universes, and stays out the same way
//   (0KZF SPDR Gold Shares, 0RV8 Aedas Homes, 0Y48 UBS Core S&P 500 hCHF).
//   A TIDM the LSE does not know (404), a suspended line (tradingstatus
//   "S") and a line with no close for three months and no bid or offer are
//   dead and stay out (HINC Henderson International Income, merged; ZAIM
//   Adalan Ventures, suspended since 2023; BKMA Bank Muscat DR, last close
//   2013). Where the LSE prints another ISIN for the TIDM, the LSE's is
//   taken (3LNE GraniteShares 3x Long Netflix, reissued; XCTU / XCJU, the
//   two Xtrackers Climate Transition funds Morningstar swaps), and a TIDM
//   that now names another instrument goes (OY85 and OY82, now a Barclays
//   and an SG note, are dead lines already).
// - US: a Nasdaq, NYSE, NYSE American or Arca line whose symbol is not in
//   Nasdaq Trader's symbol directories (nasdaqtrader.com/dynamic/SymDir/
//   nasdaqlisted.txt and otherlisted.txt) goes: TTO
//   CorEnergy (bankrupt), FLRU Franklin FTSE Russia (liquidated), FOXAV
//   (TFCF when-issued, 2019), BBVAP2 ("PFS PERPETUAL USD 200000", an
//   institutional CoCo), CWEN.A and BELP (no such line today). The
//   spellings Morningstar uses are matched first (BRK.B / BRKB, GAB$D /
//   GABPD / GABPRD / GAB.PR.D); a line with a stale or no symbol takes the
//   symbol Nasdaq Trader gives the same name (SOLT1 -> SOLT 2x Solana ETF,
//   EVYM, CCOR).
// - Germany: Deutsche Börse's T7 lists (XETR, XFRA "BF", read each run:
//   "Date Last Update: 22.10.2026" for this file), "Instrument Status"
//   Active. A Xetra or Frankfurt line whose ISIN is not active there goes
//   (AYO Abengoa, bankrupt; 4JMA Jumia ADR; 0A6 235 Holdings AD-Sofia). A
//   line in a currency the list does not trade the ISIN in goes when the
//   list's currency line is in the file already (PR1T Amundi US Treasury
//   0-1Y: USD at Morningstar, EUR on Xetra, the EUR line here too), and
//   otherwise takes the list's currency (PSH0 Sernova, CAD -> EUR). A
//   Düsseldorf, Hamburg, Munich, Stuttgart or Berlin line goes when its
//   ISIN is active on neither Xetra nor Frankfurt (0UAA Monitor Ventures,
//   Munich; 47N0 Citius Pharmaceuticals, Düsseldorf): those floors print
//   no list of their own.
// - Germany, off market. EQi's Order Execution Policy (v18, June 2026,
//   https://eqi.co.uk/info/important-information) names seven UK market
//   makers for "International Securities", and for "International
//   Securities (not listed on LSE or Aquis Exchange)": "Off Market"; the
//   Pricing page converts the price "by a UK-based market maker". EQi
//   names no German floor: a German line here only stands for a foreign
//   share EQi deals off market, priced on its home market. A share whose
//   ISIN country is the home of no EQi place (JP, AU, KY, CN, PL, HK, BM,
//   SG, ID, TH NVDRs, ZA, GR, MX, NZ ...) and whose ISIN is on no other
//   place of this file stays out, as the $$LTS titles on markets EQi names
//   nowhere do (5B8 ABC-Mart, 814 1414 Degrees, NVAA Advanced Info Service
//   NVDR). A share whose home line is in the file keeps its German lines
//   (one row per tradable place), and so does an Austrian share (Xetra is
//   its usual German line; Vienna is not an EQi place, asked of EQi).
// - One line per ISIN, place and currency: the one whose ISIN Morningstar
//   printed (BSRT.UN / HOM.UN BSR REIT and CIA Champion Iron, each twice
//   on TSX).
//
// Restrictions: broker-list.json names none for EQi, and EQi takes UK
// residents only (accepted.mjs). A fund or exchange-traded product is sold
// to a UK retail client with a UK KID (PRIIPs, now the CCI product
// summary); the Pricing page sends the client to "the prospectus, Key
// Information Document (KID) or Product Summary" and names no exception. A
// US- or Canada-domiciled ETF, ETN or ETC has none and is no UK recognised
// scheme, nor is a Swiss-law fund (CH ISIN, "(CH)" or ETF in the name:
// iShares (CH), UBS ETF (CH), SWC (CH), Raiffeisen ETF; Switzerland is
// outside the UK Overseas Funds Regime): those lines are marked
// `nonUkResident`. The other CH-ISIN products are notes (21Shares, AMINA,
// Valour, Leonteq "ETP on", UBS CMCI ETCs) and are not marked.
//
// Type: an equity line is a STOCK, and so is an investment trust, as the
// rest of the repository does. An ETF-universe line is an ETF unless its
// name says ETC or ETN.
//
// Morningstar's universes and the exchanges' lists are kept 12 hours in the
// system temp folder, so a rerun reads them once.
//
//   node brokers/eqi/eqi_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { GERMAN, US_LISTED, applyChecks, dedupe, parseNasdaqTrader, parseT7, residency } from "./eqiChecks.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCREEN = "https://lt.morningstar.com/api/rest.svc/qwlecbw3ro/security/screener";
const OUTPUT = new URL("eqi-parsed.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const PAGE = 1000;
const POINTS = ["SecId", "Name", "isin", "ticker", "exchangeCode", "Currency", "HoldingType"].join("|");

// Morningstar's MIC, the broker-list.json name, and the MIC this repository
// resolves (Morningstar's XMUN is the Munich exchange; here XMUN is gettex,
// so Munich is XMUC; Aquis is AQSE; OTC is OTCM).
const PLACES = [
  ["XLON", "London Stock Exchange", "XLON"],
  ["XETR", "Börse Xetra", "XETR"],
  ["XFRA", "Börse Frankfurt", "XFRA"],
  ["XBER", "Börse Berlin", null],
  ["XDUS", "Börse Düsseldorf", "XDUS"],
  ["XHAM", "Börse Hamburg", "XHAM"],
  ["XMUN", "Börse München", "XMUC"],
  ["XSTU", "Börse Stuttgart", "XSTU"],
  ["XMIL", "Euronext Milan", "XMIL"],
  ["XDUB", "Euronext Dublin", "XMSM"],
  ["XLUX", "Luxembourg Stock Exchange", "XLUX"],
  ["XMCE", "Bolsa de Madrid", "XMAD"],
  ["XAMS", "Euronext Amsterdam", "XAMS"],
  ["XBRU", "Euronext Brussels", "XBRU"],
  ["XLIS", "Euronext Lisbon", "XLIS"],
  ["XPAR", "Euronext Paris", "XPAR"],
  ["XSTO", "Nasdaq Stockholm", "XSTO"],
  ["XCSE", "Nasdaq Copenhagen", "XCSE"],
  ["XHEL", "Nasdaq Helsinki", "XHEL"],
  ["XOSL", "Oslo Børs", "XOSL"],
  ["XSWX", "SIX Swiss Exchange", "XSWX"],
  ["XPLU", "Aquis Stock Exchange", "AQSE"],
  ["XNYS", "New York Stock Exchange", "XNYS"],
  ["XNAS", "Nasdaq", "XNAS"],
  ["XASE", "NYSE American", "XASE"],
  ["ARCX", "NYSE Arca", "ARCX"],
  ["PINX", "OTC Markets", "OTCM"],
  ["XTSE", "Toronto Stock Exchange", "XTSE"],
  ["XTSX", "TSX Venture", "XTSX"],
];
// Universe prefix, the row type, and the tab it comes from.
const KINDS = [
  ["E0EXG", "STOCK", "equities"],
  ["CEEXG", "STOCK", "investment trusts"],
  ["ETEXG", "ETF", "ETFs"],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Morningstar escapes some names twice ("Units (1 Ord Cls A &amp;amp; 1/2 War)").
const entities = (s) =>
  String(s ?? "")
    .replace(/&amp;(?:amp;)*/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
const clean = (s) => entities(s).replace(/\s+/g, " ").trim();
const isinOf = (v) => (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(clean(v).toUpperCase()) ? clean(v).toUpperCase() : "");

async function page(universe, number, sort) {
  const url = new URL(SCREEN);
  url.searchParams.set("page", String(number));
  url.searchParams.set("pageSize", String(PAGE));
  url.searchParams.set("sortOrder", sort);
  url.searchParams.set("outputType", "json");
  url.searchParams.set("version", "1");
  url.searchParams.set("languageId", "en-GB");
  url.searchParams.set("currencyId", "GBP");
  url.searchParams.set("securityDataPoints", POINTS);
  url.searchParams.set("universeIds", universe);
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA, Referer: "https://eqi.co.uk/" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return response.json();
      last = `${response.status} ${universe}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// A value kept TEMP_HOURS in the system temp folder.
const TEMP_HOURS = 12;
async function inTemp(name, read) {
  const file = path.join(os.tmpdir(), `eqi-${name.replace(/[^A-Za-z0-9.-]+/g, "_")}`);
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < TEMP_HOURS * 3600_000) return JSON.parse(fs.readFileSync(file, "utf8"));
  const value = await read();
  fs.writeFileSync(file, JSON.stringify(value));
  return value;
}

// Every line of a universe; a second pass in the other order fills lines
// that moved between pages.
async function universe(id) {
  return inTemp(`morningstar-${id}.json`, () => universeRead(id));
}
async function universeRead(id) {
  const bySec = new Map();
  let total = 0;
  for (const sort of ["Name asc", "Name desc"]) {
    for (let n = 1; n < 100; n += 1) {
      const body = await page(id, n, sort);
      total = body.total ?? total;
      const rows = Array.isArray(body.rows) ? body.rows : [];
      for (const row of rows) bySec.set(row.SecId, row);
      if (rows.length < PAGE) break;
      await sleep(250);
    }
    if (bySec.size >= total) break;
  }
  return { lines: [...bySec.values()], total };
}

// ---- ISINs Morningstar leaves out, from the exchanges' own data ------------

const DB_PAGE = "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra";
const DB_FILES = [
  ["XETR", DB_PAGE, "t7-xetr-allTradableInstruments.csv"],
  ["XFRA", `${DB_PAGE}/boersefrankfurt`, "t7-xfra-BF-allTradableInstruments.csv"],
];
const NASDAQ_TRADER = ["https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt", "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"];
const OTC_PROFILE = "https://backend.otcmarkets.com/otcapi/company/profile/full/";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Borsa Italiana prints no list to download; its instrument pages, read
// 2026-10-21, give the ISIN of these two lines ("Alphanumeric Code").
//   https://www.borsaitaliana.it/borsa/etc-etn/scheda/XS2425312720-ETFP.html?lang=en
//   https://www.borsaitaliana.it/borsa/etf/scheda/IE000ZEOCR03.html?lang=en
const BORSA_ITALIANA = { HSC3L: "XS2425312720", QPEU: "IE000ZEOCR03" };

async function text(url, options = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, ...(options.headers || {}) }, signal: AbortSignal.timeout(60_000) });
      if (response.ok || response.status === 404) return { status: response.status, body: await response.text() };
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// The Deutsche Börse lists as text, by MIC.
async function deutscheBoerseFiles() {
  const out = {};
  for (const [mic, page, file] of DB_FILES) {
    out[mic] = await inTemp(file.replace(/\.csv$/, ".json"), async () => {
      const link = (await text(page)).body.match(new RegExp(`href="([^"]*${file.replace(/\./g, "\\.")})"`))?.[1];
      if (!link) throw new Error(`${page} no longer links ${file}`);
      return (await text(new URL(link, page).href)).body;
    });
  }
  return out;
}

// "MIC|Mnemonic|CCY" -> ISIN of the active Deutsche Börse lines.
function deutscheBoerse(files) {
  const out = new Map();
  for (const [mic, , file] of DB_FILES) {
    const lines = files[mic].split(/\r?\n/);
    const at = lines.findIndex((line) => line.startsWith("Product Status;"));
    const header = (lines[at] || "").split(";");
    const [statusAt, isinAt, tickerAt, currencyAt] = ["Instrument Status", "ISIN", "Mnemonic", "Currency"].map((c) => header.indexOf(c));
    if (at < 0 || Math.min(statusAt, isinAt, tickerAt, currencyAt) < 0) throw new Error(`${file}: header changed`);
    for (const line of lines.slice(at + 1)) {
      const cells = line.split(";");
      if (cells[statusAt] === "Active" && isinOf(cells[isinAt]) && cells[tickerAt]) out.set(`${mic}|${cells[tickerAt].toUpperCase()}|${cells[currencyAt]}`, cells[isinAt]);
    }
  }
  return out;
}

// Nasdaq Trader's two symbol directories as text (Nasdaq, NYSE, NYSE
// American, Arca, Cboe).
async function nasdaqTraderFiles() {
  const out = [];
  for (const url of NASDAQ_TRADER) out.push(await inTemp(url.split("/").pop().replace(/\.txt$/, ".json"), async () => (await text(url)).body));
  return out;
}

// The LSE instrument API, answers kept LSE_DAYS in eqi-lse-cache.json
// (only the fields the checks read); the API blocks a burst for a while
// (403), so a 403 waits a minute and more.
const LSE_API = "https://api.londonstockexchange.com/api/gw/lse/";
const LSE_CACHE = new URL("eqi-lse-cache.json", import.meta.url);
const LSE_DAYS = 7;
const LSE_FIELDS = ["tidm", "isin", "currency", "market", "segment", "suspend", "tradingstatus", "lastclosedate", "lastpricedate", "bid", "offer", "description", "issuername"];
const lseCache = fs.existsSync(LSE_CACHE) ? JSON.parse(fs.readFileSync(LSE_CACHE, "utf8")) : {};
let lseAsked = 0;
const lseSave = () => fs.writeFileSync(LSE_CACHE, JSON.stringify(lseCache));
function lseTrim(route, body) {
  if (!body) return null;
  if (route.startsWith("search/")) return { instruments: (body.instruments || []).map(({ code, tidm, islse, description }) => ({ code, tidm, islse, description })) };
  return Object.fromEntries(LSE_FIELDS.map((k) => [k, body[k] ?? null]));
}
async function lseJson(route) {
  const saved = lseCache[route];
  if (saved && Date.now() - Date.parse(saved.at) < LSE_DAYS * 86400_000) return saved.body;
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await sleep(400);
    try {
      const response = await fetch(LSE_API + route, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      if (response.status === 404 || response.ok) {
        const body = lseTrim(route, response.ok ? await response.json() : null);
        lseCache[route] = { at: new Date().toISOString(), body };
        if (++lseAsked % 50 === 0) lseSave();
        return body;
      }
      last = `${response.status} ${route}`;
      if (response.status === 403 || response.status === 429) {
        lseSave();
        await sleep(60_000 * (attempt + 1));
        continue;
      }
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  lseSave();
  console.error(`  LSE unread: ${last}`);
  return undefined;
}
const lseRecord = (tidm) => lseJson(`instruments/alldata/${encodeURIComponent(tidm)}`);
const lseHeld = (currency) => (String(currency || "").toUpperCase() === "GBX" ? "GBP" : String(currency || "").toUpperCase());

// The London TIDM of an ISIN, in the line's currency when there are several.
async function lseByIsin(isin, currency) {
  const search = await lseJson(`search/autocomplete?q=${isin}`);
  if (search === undefined) return undefined;
  const found = [];
  for (const item of search?.instruments || []) {
    if (item.code !== isin || item.islse !== true || !item.tidm) continue;
    const record = await lseRecord(item.tidm);
    if (record?.isin === isin) found.push(record);
  }
  return found.find((r) => lseHeld(r.currency) === lseHeld(currency)) || (found.length === 1 ? found[0] : null);
}

// ISIN of a CUSIP (country US unless the CUSIP is a CINS number, whose
// letter names the issuer's country, which this file does not resolve).
function isinOfCusip(cusip) {
  if (!/^\d{3}[A-Z0-9]{5}\d$/.test(cusip)) return "";
  const body = `US${cusip}`;
  const digits = [...body].map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55))).join("");
  let sum = 0;
  [...digits].reverse().forEach((d, i) => {
    let v = Number(d) * (i % 2 === 0 ? 2 : 1);
    if (v > 9) v -= 9;
    sum += v;
  });
  return body + ((10 - (sum % 10)) % 10);
}

// symbol -> CUSIP from OTC Markets' company profile, or null when OTC
// Markets answers that it has no such symbol. otcmarkets.com answers plain
// HTTP clients with a "Temporarily Unavailable" page, so the profile is read
// from a headless Chrome on its own site, as ibkr_exchange_lists.mjs does.
async function otcProfiles(symbols) {
  const out = new Map();
  if (!symbols.length) return out;
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(`https://www.otcmarkets.com/stock/${symbols[0]}/security`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    for (const symbol of symbols) {
      const body = await page.evaluate(async (url) => (await fetch(url)).text(), `${OTC_PROFILE}${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}`);
      const profile = JSON.parse(body);
      const security = (profile.securities || []).find((s) => String(s.symbol).toUpperCase() === symbol);
      out.set(symbol, security ? { cusip: clean(security.cusip).toUpperCase(), tier: clean(security.tierName) } : null);
      await sleep(400);
    }
  } finally {
    await browser.close();
  }
  return out;
}

// Fills the ISIN of a line Morningstar prints without one, from the
// exchange the line is on, and drops the line when that exchange has no
// such symbol today. Returns what was done, for the log.
async function fromExchanges(rows, { dbFiles, nasdaqFiles }) {
  const missing = rows.filter((r) => !r.isin);
  const done = { filled: [], dropped: [], left: [] };
  if (!missing.length) return { rows, done };
  const drop = new Set();
  const fill = (row, isin, source) => {
    row.isin = isin;
    row.raw += ` | ISIN from ${source}`;
    done.filled.push(`${row.ticker} ${row.mic} ${isin} (${source})`);
  };
  const german = deutscheBoerse(dbFiles);
  const listed = parseNasdaqTrader(nasdaqFiles).symbols;
  const otcSymbols = missing.filter((r) => r.mic === "OTCM").map((r) => r.ticker);
  let otc = new Map();
  try {
    otc = await otcProfiles(otcSymbols);
  } catch (error) {
    console.error(`  OTC Markets profiles unread: ${error.message || error}`);
  }
  for (const row of missing) {
    if (row.mic === "XLON") {
      const line = await lseRecord(row.ticker);
      if (line === null) drop.add(row);
      else if (isinOf(line?.isin)) fill(row, line.isin, "the LSE instrument API");
    } else if (GERMAN.has(row.mic)) {
      const isin = german.get(`${row.mic === "XETR" ? "XETR" : "XFRA"}|${row.ticker}|${row.currency}`) || german.get(`XETR|${row.ticker}|${row.currency}`) || german.get(`XFRA|${row.ticker}|${row.currency}`);
      if (isin) fill(row, isin, "the Deutsche Börse instrument lists");
    } else if (row.mic === "XMIL" && BORSA_ITALIANA[row.ticker]) {
      fill(row, BORSA_ITALIANA[row.ticker], "Borsa Italiana");
    } else if (row.mic === "XTSE" || row.mic === "XTSX") {
      // TSX's ".U" line is the US-dollar book of the same shares.
      const base = row.ticker.replace(/\.U$/, "");
      const twin = base !== row.ticker && rows.find((r) => r.mic === row.mic && r.ticker === base && r.isin);
      if (twin) fill(row, twin.isin, `the TSX ${base} line (same shares, USD book)`);
    } else if (US_LISTED.has(row.mic)) {
      if (!listed.has(row.ticker)) drop.add(row);
    } else if (row.mic === "OTCM" && otc.has(row.ticker)) {
      const profile = otc.get(row.ticker);
      if (!profile) drop.add(row);
      else if (isinOfCusip(profile.cusip)) fill(row, isinOfCusip(profile.cusip), `OTC Markets CUSIP ${profile.cusip}`);
    }
  }
  for (const row of missing) {
    if (drop.has(row)) done.dropped.push(`${row.ticker} ${row.mic} ${row.name}`);
    else if (!row.isin) done.left.push(`${row.ticker} ${row.mic} ${row.name}`);
  }
  return { rows: rows.filter((r) => !drop.has(r)), done };
}

function typeOf(kind, name) {
  if (kind !== "ETF") return "STOCK";
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name)) return "ETC";
  return "ETF";
}

const rows = [];
const counts = [];
let noIsin = 0;
for (const [prefix, kind, label] of KINDS) {
  for (const [msMic, exchange, mic] of PLACES) {
    const id = `${prefix}$${msMic}`;
    const { lines, total } = await universe(id);
    if (lines.length < total) console.error(`  ${id}: ${lines.length} of ${total}`);
    counts.push([`${label} ${exchange}`, lines.length]);
    for (const line of lines) {
      const name = clean(line.Name);
      const isin = isinOf(line.isin);
      const ticker = clean(line.ticker).toUpperCase();
      const currency = clean(line.Currency).toUpperCase();
      if (!currency || (!isin && !ticker)) continue;
      if (!isin) noIsin += 1;
      rows.push({
        query: ticker || isin,
        ticker: ticker || isin,
        name,
        exchange,
        ...(mic ? { mic } : {}),
        currency,
        type: typeOf(kind, name),
        isin: isin || null,
        raw: [ticker, name, clean(line.exchangeCode), currency, isin, line.SecId, label].filter(Boolean).join(" | "),
      });
    }
    await sleep(250);
  }
}

// A title both in the trusts and the equities universe of one place keeps
// one line.
const seen = new Set();
const unique = rows.filter((row) => {
  const key = `${row.isin || row.ticker}|${row.exchange}|${row.currency}|${row.type}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
const dbFiles = await deutscheBoerseFiles();
const nasdaqFiles = await nasdaqTraderFiles();
const { rows: filled, done } = await fromExchanges(unique, { dbFiles, nasdaqFiles });

// London: the LSE's record of every TIDM; a line Morningstar prints with
// its ISIN for a TIDM takes the London TIDM of that ISIN.
const lse = new Map();
for (const row of filled.filter((r) => r.mic === "XLON")) {
  if (isinOf(row.ticker)) {
    const record = await lseByIsin(row.ticker, row.currency);
    if (record?.tidm) {
      row.raw += ` | TIDM ${record.tidm} from the LSE (by ISIN)`;
      row.ticker = record.tidm;
      row.query = record.tidm;
    } else if (record === null) lse.set(row.ticker, null);
    if (!record) continue;
  }
  if (!lse.has(row.ticker)) lse.set(row.ticker, await lseRecord(row.ticker));
}
lseSave();
for (const [tidm, record] of lse) if (record === undefined) lse.delete(tidm);

const t7 = { XETR: parseT7(dbFiles.XETR), XFRA: parseT7(dbFiles.XFRA) };
const nasdaq = parseNasdaqTrader(nasdaqFiles);
const { rows: checked, log } = applyChecks(filled, { t7, nasdaq, lse, today: new Date().toISOString().slice(0, 10) });
const kept = residency(dedupe(stampRows(withoutObligations(checked)), log), log);

const count = (place, type) => kept.filter((r) => r.exchange === place && (!type || r.type === type)).length;
if (count("London Stock Exchange", "STOCK") < 1000) throw new Error("London shares below 1,000");
if (count("London Stock Exchange", "ETF") < 3000) throw new Error("London ETFs below 3,000");
if (count("Nasdaq", "STOCK") + count("New York Stock Exchange", "STOCK") < 4000) throw new Error("US shares below 4,000");
for (const [isin, place] of [["GB0007980591", "London Stock Exchange"], ["US0378331005", "Nasdaq"], ["IE00B4L5Y983", "London Stock Exchange"]]) {
  if (!kept.some((r) => r.isin === isin && r.exchange === place)) throw new Error(`${isin} missing on ${place}`);
}

fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));
console.error(counts.filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", "));
for (const [label, list] of [["ISIN from the exchange", done.filled], ["dropped, unknown to its exchange today", done.dropped], ["no ISIN at the exchange", done.left]]) {
  if (list.length) console.error(`  ${label}: ${list.join("; ")}`);
}
for (const [rule, list] of log) console.error(`  ${rule}: ${list.length} (${list.slice(0, 3).join("; ")}${list.length > 3 ? "; ..." : ""})`);
console.error(`${kept.length} lines, ${new Set(kept.map((r) => r.isin).filter(Boolean)).size} ISINs, ${kept.filter((r) => !r.isin).length} without ISIN (${noIsin} from Morningstar, ${done.filled.length} filled from the exchanges, ${done.dropped.length} dropped, then the shared lists)`);
