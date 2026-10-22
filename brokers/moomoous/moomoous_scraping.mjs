// What moomoo US (Moomoo Financial Inc., "MFI", FINRA/SIPC member) sells to
// a client living in the United States: US stocks and ETFs, Hong Kong stocks
// and ETFs, and China A-shares through Stock Connect.
//
// The markets are the ones MFI's own fee schedule for US residents prices
// ("Updated on 1 October, 2026": 1. U.S. Stocks, 4. Hong Kong Stocks,
// 5. China A-shares, each with its commission, platform and regulatory fees,
// and margin rates "for U.S. stocks", "for Hong Kong stocks" and "for China
// A-shares"). The help centre's "What is A-shares" page: "After opening a
// China A-share account, investors can directly trade eligible stocks in the
// Shanghai and Shenzhen markets through Moomoo Financial Inc."; its "Universal
// Account" page: one account "supports trading securities in various markets
// (US, HK, and CN)". Read on 2026-10-21.
//   https://www.moomoo.com/us/support/topic4_66    fee schedule, US residents
//   https://www.moomoo.com/us/support/topic4_64    What is A-shares
//   https://www.moomoo.com/us/support/topic4_475   Universal Account
//
// MFI publishes no list of its own. moomoo.com/us/quote lands on the moomoo
// group's quote site, and the lists below are the group's market lists, i.e.
// what is quoted on each exchange, each checked against the exchange's own
// list:
//
// US. The group's "all US stocks" list, read from its public JSON endpoint
// (signed with a quote-token header, as in brokers/futuhk). It carries only
// exchange-listed lines: on 21 October 2026 every one of its 11,870 codes but
// 160 was in the Nasdaq Trader symbol directory, and those 160 are delisted
// names ("Warner Bros Discovery(Delisted)"), matured baby bonds and closed
// ETFs. Each code is placed on the exchange the directory names (Nasdaq, the
// NYSE, NYSE American, NYSE Arca, Cboe BZX, the Texas Stock Exchange, NYSE
// Texas: one NBBO market, one row a title); a code the directory does not
// have stays out. In otherlisted.txt exchange code F is the Texas Stock
// Exchange (TXSE: its test lines are "ZZZTA|TXSE Test Stk 1 Common
// Stock|F|..."; DDS, TCBI, ET, WSLS list there) and M is NYSE Texas
// ("MTEST|NYSE Texas, Inc. TEST Common Stock|M|...", 22 October 2026); the
// place names and MICs are brokers/ibkrus's ("Texas Stock Exchange", TXSE). ETF when the
// directory's ETF flag says so or when the name makes it an exchange-traded
// note (ETN) or a gold, silver, bitcoin or currency trust; any other line is
// a share, a closed-end fund, a BDC or a REIT that moomoo files as a fund
// included. A code with a halt still open in Nasdaq Trader's trade-halts feed
// that began before today stays out (an SEC suspension, a halt since 2019);
// when the feed answers with its Incapsula bot check (as on 21 October 2026),
// the run says so and leaves nothing out for a halt.
// Debt lines (baby bonds named "... Notes due 2076") are left out by
// withoutObligations, on moomoo's name or the directory's.
//   https://www.moomoo.com/quote/us/stock-list/all-us-stocks
//   https://www.moomoo.com/quote-api/quote-v2/get-stock-list?marketType=2&plateType=1&rankType=3&page=0&pageSize=50
//   https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//   https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//   https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts
//
// OTC Markets. MFI sells OTC stocks online. Its US stocks page: "Trade US
// exchange-listed stocks, over-the-counter stocks (OTCs), and ETFs"; its
// fee schedule (topic4_66 and /us/pricing): "Stocks include individual
// stocks, OTC stocks, preferred stocks, fractional shares etc." at $0, with
// a CAT rate for "OTC Stocks: $0.00000003/Share". The only page that names
// OTC tiers is "Can I transfer OTC stocks?" (topic4_551): "Only OTC stocks
// classified under the OTCQX, OTCQB, and Pink Market tiers are
// transferrable. Those within the Grey Market and Expert Market tiers are
// not eligible for transfer." Read on 2026-10-22, with every help page the
// help centre's search gives for OTC, Pink, Grey, Expert Market, Caveat
// and restricted stock. None says more about which OTC titles can be
// bought:
//   - Caveat Emptor: no MFI page names it (the search finds nothing);
//   - a minimum price: none. Under $5 a first buy asks the client to accept
//     the penny-stock risk disclosure, "but there are no restrictions on
//     closing positions" (topic4_311, topic4_455);
//   - microcaps (market value up to $300 million): daily volume caps of
//     10-30% of the 30-day ADV across Futu clients and 5-15% per client
//     (topic4_311), and firm risk controls that "may limit, delay, or
//     reject orders" in "low-priced, micro-cap, nano-cap, or less liquid
//     securities" (topic4_698, topic4_699): per order, not per title;
//   - ADRs and foreign ordinary shares (F-shares): no rule. The stocks page
//     says "Trade ADRs and global markets all from one account";
//   - "Transferable Assets" (topic4_265) lists "Pink Sheet Stocks" and
//     "Other OTC Stocks" as not available for transfer, an older page that
//     topic4_551 narrows; neither is about buying.
// The OTC lines are taken from those OTC Markets files on the OTCQX, OTCQB
// and Pink tiers (OTC Markets split Pink into OTCID, the former Pink
// Current, and Pink Limited; the "no information" Pink names went to the
// Expert Market in 2021). Grey Market and Expert Market lines stay out: MFI
// will not take them in, the Grey Market has no quote to buy at and the
// Expert Market's quotes are not public. A Caveat Emptor line stays out too
// (OTC Markets' public-interest warning; E*TRADE, IBKR and Schwab refuse
// opening buys, brokers/ibkrus leaves them out, and MFI's risk controls "may
// limit, delay, or reject orders"). One row a title on "OTC Markets" (mic
// OTCM, USD), as the other US catalogues write it.
//
// Those tiers hold some 11,000 titles, but moomoo sells far fewer: a broker
// review (topratedfirms.com, "Updated on 9/11/2026") says "moomoo currently
// offers nearly 3,000 OTC securities" and that it "only provides access to
// approved OTC securities". MFI publishes no list of them (its quote site
// shows a page even for Expert Market names, AAGH, and for lines with no
// data, AAKAY, so a quote page proves nothing). The catalogue therefore
// keeps the OTC_KEEP (3,000) best-known lines, an approximation of moomoo's
// approved list, not the list itself (otcBestKnown below):
//   1. lines with no last sale on record (OTC Markets' screener price 0:
//      mostly unsponsored ADRs and F-shares that never traded OTC) and
//      Caveat Emptor lines are left out first;
//   2. so are the "ETFs" / "Structured Product" lines of non-US funds (Irish,
//      UK and Luxembourg UCITS ETFs, Canadian and Cayman funds): not
//      registered with the SEC, so not offered to US persons (brokers/ibkrus,
//      read from IBKR's own data, has none), whatever their rank;
//   3. the rest are ranked by the company's market value, OTC Markets'
//      "marketCap" of the inside quote (its profile's estimatedMarketCap),
//      largest first; equal or missing values by recent dollar volume (the
//      30-day average volume times the last sale), largest first; the first
//      3,000 are written.
//   https://topratedfirms.com/trading/otc/moomoo-penny-stocks.aspx
//   https://backend.otcmarkets.com/otcapi/stock/trade/inside/NSRGY?symbol=NSRGY
//   https://www.moomoo.com/us/invest/stocks
//   https://www.moomoo.com/us/support/topic4_551   Can I transfer OTC stocks?
//   https://www.moomoo.com/us/support/topic4_311   What is penny stock and microcap?
//   https://www.moomoo.com/us/support/topic4_698   Firm Risk Controls Disclosure
//   https://www.moomoo.com/us/support/topic4_375   OTC securities risk disclosure
// MFI and the group quote site publish no list of the OTC titles they quote
// (the quote site's US lists are all exchange-listed), so the titles and
// their tiers are OTC Markets' own stock screener, read by
// moomoous_otc.mjs (market codes and the reading are written there):
//   https://www.otcmarkets.com/research/stock-screener/api?market=1   OTCQX
//   https://www.otcmarkets.com/research/stock-screener/api?market=10  OTCQB
//   https://www.otcmarkets.com/research/stock-screener/api?market=20  OTCID
//   https://www.otcmarkets.com/research/stock-screener/api?market=21  Pink Limited
// A screener line is kept when its security type is a share, an ADR or
// GDR, a preferred share, a fund, a trust or partnership unit (Canadian
// REITs, income funds) or "Other" (CDIs, stapled securities, NVDRs, REITs);
// ETN when the name says so (iPath, Deutsche Bank ETNs). OTC Markets files
// a few company shares as "ETFs" (ASMIY "ASM INTL NV NY REG SHS", ARCAY
// "ARCADIS NV S/ADR", FMTYF "BANCO INVEX SA FIBR REIT", LTPLF "LTR PHARMA
// LTD"): a name that says ADR, NY Registry, FIBRA or REIT, or that of a
// company named in OTC_ETF_SHARES, makes it a share; the other "ETFs" and
// "Structured Product" lines are the non-US funds left out above. Warrants, rights,
// blank-check (SPAC) units and debt stay out, as moomoo's own US list has
// none. A symbol that is already an exchange-listed row of this
// catalogue is not written twice. ISIN: the shared lists (stampRows, their
// "OTC" place); then the ISIN brokers/ibkrus and brokers/webullus read from
// their broker for the same OTC symbol, when they agree; then the CUSIP OTC
// Markets prints on the security's profile, made an ISIN when it is a CUSIP
// (not a CINS: first character a digit) of a US or Canadian issuer or of an
// ADR (US for an ADR or a US issuer, CA for a Canadian one). A line still
// without one (a foreign ordinary share, an "F-share", whose CUSIP is a
// CINS, J02571107 for AAHIF Asahi Co.) takes the ISIN of the same share's
// home listing when it is certain (moomoous_otc.mjs, otcIsinsFromHome,
// where the method and its safeguards are written): the home exchange and
// ticker OTC Markets prints on the profile (Tokyo Stock Exchange 3333),
// looked up in the shared lists with an agreeing name and country; the
// ISIN every other catalogue of the repo gives for the same OTC symbol;
// both must agree when both answer. Without a home ticker, the one list
// ISIN whose name is the profile's company name word for word on the
// country's exchanges, of the issuer's country. A conflict, a second ISIN
// or a name shared by two companies leaves the line without an ISIN (it is
// then not shown). The profiles are kept in otc-home-cache.json.
//
// Hong Kong. The group's "all HK stocks" list as brokers/futuhk read it from
// the same endpoint (../futuhk/futuhk-parsed.json; --live reads it again),
// kept when the HKEX list of securities files the code as equity, an ETP or
// a REIT; currency and ISIN are HKEX's. Shared reader:
// ../moomooau/moomooau_markets.mjs. Written on "Hong Kong Stock Exchange",
// the place name broker-list.json gives.
//
// China A-shares. The HKEX China Connect lists, names eligible for buy and
// sell, quoted in CNH (shared reader). MFI's A-share trading rules: "only
// A-shares and ETFs are included in Shanghai and Shenzhen Stock Connect" and
// "Second-board Market currently only supports institutional transactions";
// its A-share FAQ (question 6, read on 2026-10-22): "The trading of SZSE
// Securities which are listed on the ChiNext market and SSE Securities which
// are listed on the STAR market will be only limited to institutional
// professional investors. Institutional professional investors refer to
// companies that manage investment schemes, such as banks, insurance
// companies and brokerages." No retail client of MFI can be one, so ChiNext
// (Shenzhen 300-302) and STAR (Shanghai 688-689) lines are left out.
//   https://www.moomoo.com/us/support/topic4_192   A-shares trading rules
//   https://www.moomoo.com/us/support/topic4_171   FAQ about A-shares
//
// US sanctions. MFI's help page on Chinese companies quotes EO 14032: it
// "prohibits U.S. persons from engaging in the purchase or sale of any
// publicly traded securities ... of any entity identified as a CMIC", the
// list being OFAC's NS-CMIC list. The prohibition is on the entity's
// securities, every listing of it, not only those OFAC prints. So a line
// stays out, once the entity's effective date has passed, when:
//   - its ISIN or exchange code is one OFAC gives for a CMIC (China Mobile
//     00941, CNOOC 00883, China Telecom 00728, ...; OFAC writes "Equity
//     Ticker 600685  CN" with two spaces and "603019CN" with none);
//   - it shares its ISIN with a line so matched (a second counter of the
//     same share, an OTC F-share);
//   - it is a listing of a CMIC that OFAC prints without it (CMIC_LISTINGS
//     below, each keyed on the OFAC entity, so it lapses with the entry): the
//     Shanghai A-shares of China Mobile (600941), China Telecom (601728) and
//     CNOOC (600938), whose entries give the Hong Kong and US ISINs only, and
//     SenseTime (00020, 80020, OTC SNTMF) and CloudWalk (688327), whose
//     entries give no ISIN or ticker at all.
// Funds holding such shares are not named by OFAC and stay.
//   https://www.moomoo.com/us/support/topic4_122
//   https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/CONS_PRIM.CSV
//
// The moomoo endpoint blocks an address for five to ten minutes after a dozen
// to two dozen calls, and two back ends answer it in turn with different
// totals. The US list is therefore read once and kept in
// moomoous-list-cache.json for seven days; a run with no fresh cache first
// takes the US list brokers/moomooca read from the same endpoint (its
// moomooca-list-cache.json, while that is three days old or less), and only
// then walks the endpoint, slowly, with moomooca's walk (the reasons are
// written there). On 21 October 2026 the list came from moomooca's walk of
// that day (11,870 codes of 11,890 announced).
//
// ISINs: Hong Kong from HKEX; US and A-shares from the shared lists
// (stampRows). A US ticker the lists give two ISINs (old and new, after a
// reverse split) is settled by the ISIN brokers/ibkrus or brokers/webullus
// read from their broker for that ticker and place, when it is one of the
// two (settleMatches below). A US line the lists do not have yet (an IPO,
// a new ETF or a renamed company of the last weeks) takes its ISIN from
// ISIN_FILLS below, each read from the issuer's or the SEC's own document.
//
// A Hong Kong counter named "-OLD" or after a board lot ("WENGE AI-200",
// "EASY SMART-2K") is the temporary counter of a parallel trading
// arrangement (a board-lot change, a share consolidation or subdivision):
// HKEX closes it after a few weeks and the share keeps trading on its main
// counter (WENGE AI-50 01956, EASY SMART-100 02442, YUNJI-NEW 02670, ...),
// which is written. The temporary counter is not: one HKEX lists with no
// ISIN, and, ISIN or not, one whose name stem another Hong Kong row of the
// catalogue carries with "-NEW", no suffix or another board lot on a lower
// (the original) code (BONJOUR H-OLD 02920 beside BONJOUR H-NEW 00653,
// TECHTRONIC-500 02916 beside TECHTRONIC-100 00669, QINGDA ORI-4000 08582,
// GF HEALTH-OLD 08567).
//
// Hong Kong stocks suspended for three months or more stay out: HKEX's
// monthly prolonged suspension status reports (Main Board and GEM) list
// "companies which have been suspended for three months or more", with the
// date of suspension and the end of the remedial period after which the
// listing is cancelled (18 months on the Main Board, 12 on GEM; 84 + 14
// companies at 30 September 2026, some past their deadline: 00059 SKYFAME
// REALTY, 00468 GAPACK). A reported code is kept only when the latest HKEX
// daily quotations show it trading again (not "TRADING SUSPENDED").
//   https://www2.hkexnews.hk/Exchange-Reports/Monthly-Prolonged-Suspension-Status-Report/Main-Board?sc_lang=en
//   https://www2.hkexnews.hk/Exchange-Reports/Monthly-Prolonged-Suspension-Status-Report/GEM?sc_lang=en
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/d261022e.htm
//   https://www.hkex.com.hk/eng/stat/smstat/dayquot/GEM/e_G261022.htm
//
//   node brokers/moomoous/moomoous_scraping.mjs
//   node brokers/moomoous/moomoous_scraping.mjs --live   (re-reads the US and HK lists and the OTC screener)
//
// A run without --live calls no moomoo endpoint while moomoous-list-cache.json
// is fresh (seven days); the OTC screener is read again when its cache
// (otc-screener-cache.json) is more than three days old. OTC Markets
// profiles are read only for lines not yet in otc-profile-cache.json or
// otc-home-cache.json (or stale there), one every 1.5 s: about 4,000 home
// listings took two and a half hours on 22 October 2026, a rerun reads none.
// The OTC inside quotes (market value, 30-day volume) are kept in
// otc-size-cache.json for 30 days: the first read of the ~10,700 ranked
// lines, one every 1.2 s, took about five hours on 22 October 2026.

import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stampRows } from "../../accepted.mjs";
import { isObligation, withoutObligations } from "../../obligation.mjs";
import { logCounts, moomooRows, normalize, requireListing } from "../moomooau/moomooau_markets.mjs";
import { OTC_TIERS, isinFromCusip, otcHomes, otcIsinsFromHome, otcProfiles, otcScreener, otcSizes } from "./moomoous_otc.mjs";

const LIVE = process.argv.includes("--live");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HOSTS = ["https://www.moomoo.com", "https://www.moomooapp.com"];
const LIST_PATH = "/quote-api/quote-v2/get-stock-list";
const NASDAQ_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";
const TRADE_HALTS = "https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts";
const OFAC = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/CONS_PRIM.CSV";
const US_MARKET = 2;
const PAGE_SIZE = 50;
const GAP = 8000;
const BLOCK_WAIT = 300_000;

const LIST_CACHE = new URL("moomoous-list-cache.json", import.meta.url);
const MOOMOOCA_CACHE = new URL("../moomooca/moomooca-list-cache.json", import.meta.url);
const LIST_DAYS = 7;
const MOOMOOCA_DAYS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBytes(url, accept = "*/*") {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// ---- the moomoo US list ---------------------------------------------------

function quoteToken(params) {
  const body = JSON.stringify(Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])));
  const hex = createHmac("sha512", "quote_web").update(body).digest("hex");
  return createHash("sha256").update(hex.slice(0, 10)).digest("hex").slice(0, 10);
}

let lastCall = 0;
let host = 0;

async function listPage(params) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const wait = Math.max(0, lastCall + GAP - Date.now());
    if (wait) await sleep(wait);
    lastCall = Date.now();
    const target = new URL(LIST_PATH, HOSTS[host]);
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
    let text = "";
    try {
      const response = await fetch(target, {
        headers: { "User-Agent": UA, Accept: "application/json", Referer: `${HOSTS[host]}/quote`, "quote-token": quoteToken(params) },
        signal: AbortSignal.timeout(60_000),
      });
      text = await response.text();
    } catch (error) {
      text = String(error.message || error);
    }
    if (text.startsWith("{")) {
      const payload = JSON.parse(text);
      if (payload.code === 0) return payload.data;
      throw new Error(`moomoo list answered code ${payload.code}: ${payload.message}`);
    }
    // "403 - Operations too frequent": try the other domain, wait once both
    // have refused.
    host = (host + 1) % HOSTS.length;
    if (host === 0) {
      console.error(`moomoo list page ${params.page}: blocked, waiting`);
      await sleep(BLOCK_WAIT);
    }
  }
  throw new Error("the moomoo list stayed blocked");
}

function readCache() {
  return fs.existsSync(LIST_CACHE) ? JSON.parse(fs.readFileSync(LIST_CACHE, "utf8")) : {};
}

function saveCache(update) {
  const temporary = new URL("moomoous-list-cache.json.tmp", import.meta.url);
  try {
    fs.writeFileSync(temporary, JSON.stringify({ ...readCache(), ...update }));
    fs.renameSync(temporary, LIST_CACHE);
  } catch (error) {
    console.error(`moomoo list cache not saved: ${error.message}`);
    fs.rmSync(temporary, { force: true });
  }
}

const fresh = (list, days) => list && Date.now() - Date.parse(list.at) < days * 86400_000 && list.lines?.length >= list.total * 0.997;

// The walk of brokers/moomooca/moomooca_scraping.mjs (marketList), which says
// why: two back ends answer with different books, the order moves with
// prices, so lines are gathered per announced total and the walk ends when
// the books near the largest total hold that many codes (0.3% short is
// accepted once every page has been read).
async function walkList(label, marketType) {
  const NEAR = 0.005;
  const SHORT = 0.003;
  const WINDOW = 24;
  const PASSES = 4;
  const books = Object.fromEntries(
    Object.entries(readCache()[`${label} books`] || {}).filter(([, book]) => Date.now() - Date.parse(book.at) < 20 * 3600_000),
  );
  const recent = [];
  const lead = () => Math.max(0, ...(recent.length ? recent : Object.keys(books).map(Number)));
  const near = (total) => total <= lead() && total >= lead() * (1 - NEAR);
  const family = () => Object.entries(books).filter(([total]) => near(Number(total)));
  const held = () => {
    const codes = {};
    for (const [, book] of family()) Object.assign(codes, book.codes);
    return codes;
  };
  const answered = new Map();
  for (const [total, book] of family()) for (const page of book.pages || []) answered.set(page, Number(total));
  const count = () => Math.max(0, ...family().map(([, book]) => book.count));
  let passes = 0;
  for (let page = 0; ; page += 1) {
    const top = lead();
    if (top && Object.keys(held()).length >= top) break;
    if (top && page >= count()) {
      if ([...answered.values()].filter(near).length >= count()) {
        if (Object.keys(held()).length >= top * (1 - SHORT)) break;
        passes += 1;
        if (passes >= PASSES) throw new Error(`the moomoo ${label} list holds ${Object.keys(held()).length} of ${top} codes after ${passes} walks`);
        const owner = new Map(answered);
        for (let at = 1; at < count(); at += 1) if (owner.get(at) !== owner.get(at - 1)) answered.delete(at);
      }
      page = -1;
      continue;
    }
    if (top && answered.has(page) && near(answered.get(page))) continue;
    const data = await listPage({ marketType, plateType: 1, rankType: 3, page, pageSize: PAGE_SIZE });
    const total = data?.pagination?.total;
    const pageCount = data?.pagination?.pageCount;
    if (!Number.isInteger(total) || !Number.isInteger(pageCount) || !Array.isArray(data.list)) throw new Error(`the moomoo ${label} list has no pagination`);
    const book = (books[total] ||= { at: new Date().toISOString(), count: pageCount, pages: [], codes: {} });
    for (const item of data.list) {
      const code = normalize(item.stockCode).toUpperCase();
      if (!code || item.marketLabel !== label) throw new Error(`moomoo ${label} list line ${JSON.stringify(item).slice(0, 120)}`);
      book.codes[code] = { stockCode: item.stockCode, name: item.name, marketLabel: item.marketLabel, instrumentType: item.instrumentType };
    }
    if (!book.pages.includes(page)) book.pages.push(page);
    saveCache({ [`${label} books`]: books });
    recent.push(total);
    if (recent.length > WINDOW) recent.shift();
    if (near(total)) answered.set(page, total);
    else page -= 1;
  }
  const list = { at: new Date().toISOString(), total: lead(), lines: Object.values(held()), source: "moomoo endpoint, walked by this scraper" };
  saveCache({ [label]: list, [`${label} books`]: undefined });
  return list;
}

async function usList() {
  const own = readCache().US;
  if (!LIVE && fresh(own, LIST_DAYS)) return own;
  if (!LIVE && fs.existsSync(MOOMOOCA_CACHE)) {
    const theirs = JSON.parse(fs.readFileSync(MOOMOOCA_CACHE, "utf8")).US;
    if (fresh(theirs, MOOMOOCA_DAYS)) {
      const list = { at: theirs.at, total: theirs.total, lines: theirs.lines, source: "moomoo endpoint, walked by brokers/moomooca" };
      saveCache({ US: list });
      return list;
    }
  }
  return walkList("US", US_MARKET);
}

// ---- US exchange lists ----------------------------------------------------

const US_PLACE = {
  Q: { exchange: "Nasdaq", mic: "XNAS" },
  N: { exchange: "New York Stock Exchange", mic: "XNYS" },
  A: { exchange: "NYSE American", mic: "XASE" },
  P: { exchange: "NYSE Arca", mic: "ARCX" },
  Z: { exchange: "Cboe BZX", mic: "BATS" },
  // Code F is the Texas Stock Exchange, M NYSE Texas (see the header).
  F: { exchange: "Texas Stock Exchange", mic: "TXSE" },
  M: { exchange: "NYSE Texas", mic: "XCHI" },
};

// The web host sometimes answers with a bot check: the same files are on
// its FTP server.
async function directoryText(url, header) {
  const text = await fetchBytes(url, "text/plain").then((bytes) => bytes.toString("utf8"), () => "");
  if (text.startsWith(header)) return text;
  const ftp = `ftp://ftp.nasdaqtrader.com/symboldirectory/${url.split("/").at(-1)}`;
  const run = spawnSync("curl", ["-s", "--max-time", "120", ftp], { encoding: "utf8", maxBuffer: 64 << 20 });
  if (run.status === 0 && run.stdout.startsWith(header)) return run.stdout;
  throw new Error(`the symbol directory ${url} could not be read`);
}

async function usDirectory() {
  const nasdaq = await directoryText(NASDAQ_LISTED, "Symbol|Security Name|");
  const other = await directoryText(OTHER_LISTED, "ACT Symbol|Security Name|");
  const book = new Map();
  const add = (symbol, place, etf, title) => {
    const code = normalize(symbol).toUpperCase();
    if (code && !book.has(code)) book.set(code, { ...place, etf, title: normalize(title) });
  };
  for (const cells of nasdaq.split(/\r?\n/).slice(1).map((line) => line.split("|"))) {
    if (cells.length < 8 || cells[3] === "Y") continue;
    add(cells[0], US_PLACE.Q, cells[6] === "Y", cells[1]);
  }
  for (const cells of other.split(/\r?\n/).slice(1).map((line) => line.split("|"))) {
    if (cells.length < 8 || cells[6] === "Y" || !US_PLACE[cells[2]]) continue;
    add(cells[0], US_PLACE[cells[2]], cells[4] === "Y", cells[1]);
    if (cells[7] && cells[7] !== cells[0]) add(cells[7], US_PLACE[cells[2]], cells[4] === "Y", cells[1]);
  }
  if (book.size < 8000) throw new Error(`the symbol directory has ${book.size} names`);
  return book;
}

// moomoo writes a share class with a dot (BRK.B), the directory's Nasdaq
// file with a dot and its other file with a slash or a dash.
function usListing(book, code) {
  return book.get(code) || book.get(code.replaceAll(".", "/")) || book.get(code.replaceAll(".", "-"));
}

const ETN_BY_NAME = /\bETNs?\b|\bExchange[- ]Traded Notes?\b/i;
const ETF_BY_NAME = /\b(Gold|Silver|Platinum|Palladium|Precious Metals?|Bitcoin|Ether(eum)?|Crypto|Currency) (Trust|Shares)\b/i;

// US symbols with a halt still open (no resumption trade time) that began
// before today in New York.
async function openHalts() {
  let xml = await fetchBytes(TRADE_HALTS, "application/rss+xml").then((bytes) => bytes.toString("utf8"), () => "");
  if (!/<description>NASDAQ Trade Halts<\/description>/.test(xml)) {
    const run = spawnSync("curl", ["-s", "--max-time", "120", "-A", UA, TRADE_HALTS], { encoding: "utf8", maxBuffer: 16 << 20 });
    xml = run.status === 0 ? run.stdout : "";
  }
  if (!/<description>NASDAQ Trade Halts<\/description>/.test(xml)) {
    console.error("the Nasdaq Trader trade-halts feed answered with its bot check: no line is left out for a halt this run");
    return new Map();
  }
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  const field = (item, tag) => {
    const match = item.match(new RegExp(`<ndaq:${tag}\\s*/>|<ndaq:${tag}>([^<]*)</ndaq:${tag}>`));
    return match ? normalize(match[1]) : null;
  };
  const [month, day, year] = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("/");
  const today = `${year}-${month}-${day}`;
  const halts = new Map();
  for (const item of items) {
    const symbol = field(item, "IssueSymbol");
    const date = field(item, "HaltDate")?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const resumed = field(item, "ResumptionTradeTime");
    if (!symbol || !date || resumed === null) throw new Error(`the trade-halts feed has an item it cannot read: ${item.slice(0, 160)}`);
    const since = `${date[3]}-${date[1]}-${date[2]}`;
    if (!resumed && since < today) halts.set(symbol.toUpperCase(), `${field(item, "ReasonCode")} since ${since}`);
  }
  return halts;
}

// ---- OFAC NS-CMIC ---------------------------------------------------------

function csvLines(text) {
  const out = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length) out.push([...row, cell]);
  return out;
}

const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// ISINs and exchange codes ("0728 HK", "601989 CN") of the NS-CMIC entries
// whose prohibition is in force.
async function cmicBook() {
  const text = (await fetchBytes(OFAC, "text/csv")).toString("utf8");
  const entries = csvLines(text).filter((cells) => /\bCMIC\b/.test(cells[3] || ""));
  if (entries.length < 50) throw new Error(`the OFAC list has ${entries.length} CMIC entries`);
  const isins = new Set();
  const codes = new Set();
  const names = new Set();
  let inForce = 0;
  for (const cells of entries) {
    const remarks = cells.at(-1) || "";
    const effective = remarks.match(/Effective Date \(CMIC\) (\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/);
    if (effective && Date.UTC(Number(effective[3]), MONTHS[effective[2]], Number(effective[1])) > Date.now()) continue;
    inForce += 1;
    for (const match of remarks.matchAll(/ISIN ([A-Z]{2}[A-Z0-9]{9}\d)/g)) isins.add(match[1]);
    names.add(normalize(cells[1]).toUpperCase());
    // "Equity Ticker 0728 HK", "Equity Ticker 600685  CN" (two spaces),
    // "Equity Ticker 603019CN" (none).
    for (const match of remarks.matchAll(/Equity Ticker ([A-Z0-9.]+?)\s*(HK|CN|CH|US)\b/g)) {
      const [, ticker, market] = match;
      if (market === "HK" && /^\d+$/.test(ticker)) codes.add(`HK:${ticker.padStart(5, "0")}`);
      else if (/^(CN|CH)$/.test(market) && /^\d{6}$/.test(ticker)) codes.add(`CN:${ticker}`);
    }
  }
  if (isins.size < 100) throw new Error(`the OFAC CMIC entries give ${isins.size} ISINs`);
  // Listings of an entity in force that its entry does not print.
  let added = 0;
  for (const [entity, listings] of Object.entries(CMIC_LISTINGS)) {
    if (!names.has(entity)) {
      console.error(`CMIC_LISTINGS: "${entity}" is not an NS-CMIC entry in force any more; its listings are not left out`);
      continue;
    }
    for (const listing of listings) {
      if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(listing)) isins.add(listing);
      else codes.add(listing);
      added += 1;
    }
  }
  return { isins, codes, entries: inForce, added };
}

// Listings of NS-CMIC entities that the OFAC entry does not print, keyed on
// the entry's name (an ISIN, or HK:/CN: and the exchange code). Each was
// read in the HKEX list of securities or the HKEX China Connect list (ISIN,
// company) on 22 October 2026.
const CMIC_LISTINGS = {
  // OFAC: "ISIN US16941M1099; alt. ISIN HK0941009539" (00941 and the old
  // NYSE ADR). Shanghai A-share 600941 CHINA MOBILE, CNE1000055G1.
  "CHINA MOBILE LIMITED": ["CN:600941", "CNE1000055G1"],
  // OFAC: H-share and ADR ISINs, "Equity Ticker 0728 HK". Shanghai A-share
  // 601728 CHINA TELECOM CORPORATION, CNE100004QG0.
  "CHINA TELECOM CORPORATION LIMITED": ["CN:601728", "CNE100004QG0"],
  // OFAC: "Equity Ticker 00883 HK", HK and ADR ISINs. Shanghai A-share
  // 600938 CNOOC, CNE100005980.
  "CNOOC LIMITED": ["CN:600938", "CNE100005980"],
  // OFAC: "Equity Ticker 00317  HK; alt. Equity Ticker 600685  CN", ISIN
  // CNE100000395 (the H share). A-share 600685, CNE000000BP2.
  "CSSC OFFSHORE & MARINE ENGINEERING (GROUP) COMPANY LIMITED": ["CN:600685", "CNE000000BP2"],
  // OFAC prints no ISIN or ticker ("C.R. No. 2162198 (Hong Kong)").
  // SENSETIME-W 00020 and its RMB counter SENSETIME-WR 80020, class B share
  // KYG8062L1041 (also OTC SNTMF).
  "SENSETIME GROUP LIMITED": ["HK:00020", "HK:80020", "KYG8062L1041"],
  // OFAC prints no ISIN or ticker (USCC 914401153314442716). STAR 688327
  // CLOUDWALK TECHNOLOGY, CNE100005QP8.
  "CLOUDWALK TECHNOLOGY CO., LTD.": ["CN:688327", "CNE100005QP8"],
};

// A Hong Kong or A-share code names one company; a US ticker is given to a
// new listing once the old one is gone (CHA, China Telecom's ADR until
// 2021, is Chagee Holdings now), so US lines are matched on the ISIN only.
function cmicKey(row) {
  if (row.mic === "XHKG") return `HK:${row.ticker}`;
  if (row.mic === "XSHG" || row.mic === "XSHE") return `CN:${row.ticker}`;
  return "";
}

// A US line the shared lists give several ISINs for (an old and a new code
// after a reverse split or a redomiciliation: ACB, ALKS, AMRN) keeps them in
// `matches`. The US catalogues that read an ISIN from their broker
// (brokers/ibkrus from IBKR's contract data, brokers/webullus from Webull's)
// settle it when the ISIN they give the same ticker on the same US place is
// one of those matches, and both agree.
function settleMatches(rows) {
  const known = new Map();
  for (const folder of ["ibkrus", "webullus"]) {
    const file = new URL(`../${folder}/${folder}-parsed.json`, import.meta.url);
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const row of Array.isArray(parsed) ? parsed : parsed.rows || []) {
      if (row.currency !== "USD" || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(row.isin || "")) continue;
      const key = `${String(row.ticker).toUpperCase()}|${row.mic}`;
      (known.get(key) || known.set(key, new Set()).get(key)).add(row.isin);
    }
  }
  let settled = 0;
  for (const row of rows) {
    if (row.isin || !row.matches?.length) continue;
    const said = known.get(`${row.ticker}|${row.mic}`);
    if (!said || said.size !== 1) continue;
    const isin = [...said][0];
    if (!row.matches.includes(isin)) continue;
    row.isin = isin;
    row.query = isin;
    delete row.matches;
    settled += 1;
  }
  return settled;
}

// US lines the shared lists do not have yet, keyed ticker|MIC. Each ISIN is
// read from the issuer's or the SEC's own document (read 2026-10-21); where
// the document gives a CUSIP, the ISIN is the issuer's country code (US; KY,
// VG or CA for a Cayman, BVI or Canadian issuer, as the document says) +
// CUSIP + the ISIN check digit. An entry is used only while the lists give
// the line nothing; once they do, it stops mattering and can go.
const ISIN_FILLS = {
  // ETFs: the issuer's fund page or fact sheet, CUSIP.
  "ACIV|BATS": ["US41653L1237", "hartfordfunds.com/funds/aciv.html: CUSIP 41653L123"],
  "HINC|XNAS": ["US41653L1310", "hartfordfunds.com/funds/hinc.html: CUSIP 41653L131"],
  "SQBR|BATS": ["US33740U2327", "ftportfolios.com ETF summary SQBR: CUSIP 33740U232, ISIN US33740U2327"],
  "AHIC|XNAS": ["US01988X7479", "allspringglobal.com short-term-high-income-etf: CUSIP 01988X747 (ETF class)"],
  "AHYM|XNAS": ["US01988X7701", "allspringglobal.com high-yield-municipal-bond-etf: CUSIP 01988X770 (ETF class)"],
  "ASTM|XNAS": ["US01988X7396", "allspringglobal.com strategic-municipal-bond-etf: CUSIP 01988X739 (ETF class)"],
  "MTGG|XNAS": ["US88636N7599", "maytechetf.com: MTGG, CUSIP 88636N759"],
  "AIBN|ARCX": ["US88637M8597", "defianceetfs.com/aibn: CUSIP 88637M859"],
  "AIED|ARCX": ["US30151E7803", "defianceetfs.com/aied: CUSIP 30151E780"],
  "GMIE|ARCX": ["US36262F8555", "GMO Trust 485BPOS 2026-09-29 (SEC 0001104659-26-111993), fund codes, International Equity Fund ETF Class GMIE: 36262F 855"],
  "POMG|ARCX": ["US74160Q4001", "primecap.com primecap-odyssey-etf: POMG, CUSIP 74160Q400"],
  "RBTX|ARCX": ["US09290C5748", "ishares.com product 354128 (RBTX): CUSIP 09290C574"],
  "SCIN|ARCX": ["US8085245731", "schwabassetmanagement.com/products/scin: CUSIP 808524573"],
  "SEQ|ARCX": ["US6649257572", "sequoiaetf.com performance page: SEQ, CUSIP 664925757"],
  // WisdomTree's prospectus names the Texas Stock Exchange as listing
  // exchange, as the Nasdaq Trader directory does (code F).
  "WSLS|TXSE": ["US97717Y1477", "wisdomtree.com/us/products/capital-efficient/wsls: CUSIP 97717Y147"],
  "WTAL|TXSE": ["US97717Y1543", "wisdomtree.com/us/products/capital-efficient/wtal: CUSIP 97717Y154"],
  // Shares: SEC filings.
  // Renamed Mint Incorporation (MIMI, VGG6146G1173, BVI). 6-K 2026-10-20:
  // 2-for-5 reverse split, trading post-split from the open of 22 October
  // 2026, "The new CUSIP number following the Reverse Stock Split will be
  // G6146G125".
  "AXNX|XNAS": ["VGG6146G1256", "SEC 6-K 0001213900-26-110831: post-split CUSIP G6146G125 from 2026-10-22"],
  // Renamed Universal Safety Products (UUU) on 2026-10-19; 8-K 2026-10-07
  // ex. 99.1: "The Company's common stock CUSIP will remain unchanged";
  // 13D/A 2026-10-01: CUSIP 913821302.
  "DCM|XASE": ["US9138213023", "SEC 8-K 0001104659-26-114373 ex99.1 and 13D/A 0000921895-26-002701: CUSIP 913821302"],
  // Renamed La Rosa Holdings (LRHC) on 2026-10-19; 8-K 2026-10-19: "The
  // CUSIP number ... did not change"; 8-K 2026-09-08: post-reverse-split
  // CUSIP 50172T509.
  "SRTM|XNAS": ["US50172T5092", "SEC 8-K 0001213900-26-110734 and 8-K 0001213900-26-097860: CUSIP 50172T509"],
  // Renamed AIxCrypto Holdings (AIXC, formerly Qualigen) on 2026-09-30;
  // the rename 8-K names no new CUSIP; 13G/A 2026-01-29 on AIxCrypto: CUSIP
  // 74754R301.
  "FFR|XNAS": ["US74754R3012", "SEC 8-K 0001493152-26-044923 (rename) and 13G/A 0001213900-26-009481: CUSIP 74754R301"],
  // Lion Copper Corp. (British Columbia), Nasdaq listing per its 8-A12B of
  // 2026-10-14; news release in 8-K 2026-09-16: "new CUSIP number is
  // 53621C101 and its new ISIN number is CA53621C1014".
  "LCU|XNAS": ["CA53621C1014", "SEC 8-K 0001062993-26-004984 ex99.1: ISIN CA53621C1014"],
  // SPACs (Cayman Islands), Class A ordinary shares.
  "JONE|XNAS": ["KYG517761055", "SEC S-1/A 0001213900-26-075567 ex4.3, specimen share certificate: CUSIP G51776 105"],
  "PNAQ|XNYS": ["KYG7115W1096", "SEC 13D/A 0001213900-26-102692, Class A Ordinary Shares: CUSIP G7115W109"],
};

function fillIsins(rows) {
  let filled = 0;
  const used = new Set();
  for (const row of rows) {
    const key = `${row.ticker}|${row.mic}`;
    const fill = ISIN_FILLS[key];
    if (!fill) continue;
    used.add(key);
    if (row.isin) {
      if (row.isin !== fill[0]) console.error(`ISIN_FILLS ${key}: the lists now give ${row.isin}, not ${fill[0]}`);
      continue;
    }
    if (row.matches?.length) continue;
    row.isin = fill[0];
    filled += 1;
  }
  for (const key of Object.keys(ISIN_FILLS)) if (!used.has(key)) console.error(`ISIN_FILLS ${key}: no such line in the list`);
  return filled;
}

// OTC lines the shared lists leave without an ISIN: the ISIN brokers/ibkrus
// and brokers/webullus read from their broker for the same OTC symbol (one
// ISIN, and both agree when both have it); then the CUSIP of OTC Markets'
// profile, when it is a CUSIP of a US or Canadian issuer or of an ADR.
async function fillOtcIsins(rows) {
  const said = new Map();
  for (const folder of ["ibkrus", "webullus"]) {
    const file = new URL(`../${folder}/${folder}-parsed.json`, import.meta.url);
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const row of Array.isArray(parsed) ? parsed : parsed.rows || []) {
      if (row.mic !== "OTCM" || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(row.isin || "")) continue;
      const key = String(row.ticker).toUpperCase();
      (said.get(key) || said.set(key, new Set()).get(key)).add(row.isin);
    }
  }
  const counts = { brokers: 0, cusip: 0, cins: 0, noCusip: 0, foreign: 0 };
  const open = rows.filter((row) => row.mic === "OTCM" && !row.isin);
  for (const row of open) {
    const isins = said.get(row.ticker);
    if (!isins || isins.size !== 1) continue;
    const isin = [...isins][0];
    if (row.matches?.length && !row.matches.includes(isin)) continue;
    row.isin = isin;
    delete row.matches;
    counts.brokers += 1;
  }
  // A CUSIP makes an ISIN only for a US or Canadian issuer or an ADR (or
  // GDR): the profile is read for those lines only. A foreign ordinary
  // share of an issuer elsewhere carries a CINS, not its home ISIN.
  const still = open.filter((row) => {
    if (row.isin || row.matches?.length) return false;
    const stock = otcStock.get(row.ticker);
    if (stock && (["USA", "Canada"].includes(stock.country) || ["ADRs", "New York Registry Shs"].includes(stock.type))) return true;
    counts.foreign += 1;
    return false;
  });
  const profiles = await otcProfiles(still.map((row) => row.ticker));
  for (const row of still) {
    const profile = profiles.get(row.ticker);
    const cusip = profile?.cusip || "";
    if (!/^[0-9A-Z]{9}$/.test(cusip)) {
      counts.noCusip += 1;
      continue;
    }
    const adr = /\b(ADRs?|ADS|GDR|Depositary|New York Registry)\b/i.test(`${profile.className} ${otcStock.get(row.ticker)?.type}`);
    const country = adr || profile.issuerCountry === "US" ? "US" : profile.issuerCountry === "CA" ? "CA" : "";
    // A CINS (a letter first) or an issuer elsewhere: its ISIN is not the
    // CUSIP with a country code.
    if (!/^\d/.test(cusip) || !country || cusip[8] !== cusipCheck(cusip.slice(0, 8))) {
      counts.cins += 1;
      continue;
    }
    row.isin = isinFromCusip(country, cusip);
    counts.cusip += 1;
  }
  // Every line still without an ISIN (F-shares and their CINS above all):
  // the ISIN of its home listing, of the other catalogues or of its exact
  // name, when certain (otcIsinsFromHome in moomoous_otc.mjs).
  const left = open.filter((row) => !row.isin && !row.matches?.length);
  const homes = await otcHomes(left.map((row) => row.ticker));
  const home = otcIsinsFromHome(rows, left, (symbol) => otcStock.get(symbol), homes);
  counts.home = home.counts;
  counts.doubtful = home.doubtful;
  counts.renamed = home.renamed;
  return counts;
}

// CUSIP check digit (the ninth character), to test what OTC Markets prints.
function cusipCheck(eight) {
  let sum = 0;
  for (let i = 0; i < 8; i += 1) {
    const char = eight[i];
    let value = /\d/.test(char) ? Number(char) : char.charCodeAt(0) - 55;
    if (i % 2 === 1) value *= 2;
    sum += Math.floor(value / 10) + (value % 10);
  }
  return String((10 - (sum % 10)) % 10);
}

// A temporary Hong Kong counter of a parallel trading arrangement (see the
// header): no ISIN in the HKEX list and a counter name ending in -OLD or in
// a board lot. On 21 October 2026: 02915 YUNJI-OLD (Yunji 02670 share
// subdivision, closes 29 October), 02935 WENGE AI-200 (WengeAI 01956 board
// lot 200 to 50, closes 23 October), 02939 EASY SMART-2K (Easy Smart 02442
// board lot change, closes 27 October), 08572 GLORY FLAME-OLD (Glory Flame
// 08059 capital reorganisation), 08573 SINO ENGY C-OLD (08128, closes 3
// November), 08583 CB GLOBAL-OLD (08026 share consolidation, closes 6
// November); each from the company's HKEXnews announcement. moomoo names
// some of them without the suffix HKEX gives (GLORY FLAME, CB GLOBAL), so
// those codes are named here too.
const TEMPORARY_HK = new Set(["02915", "02935", "02939", "08572", "08573", "08583"]);
const COUNTER_SUFFIX = /^(.*\S)-(OLD|NEW|\d+K?)$/i;
// With an ISIN too: a counter named -OLD or after a board lot whose name
// stem another Hong Kong row carries with -NEW, with no suffix or with
// another board lot on a lower code (the original counter keeps its code;
// HKEX gives the temporary one a new code). On 22 October 2026: 02920
// BONJOUR H-OLD (00653 BONJOUR H-NEW), 02916 TECHTRONIC-500 (00669
// TECHTRONIC-100), 08582 QINGDA ORI-4000 (08115 QINGDA ORI-500), 08567 GF
// HEALTH-OLD (08143 GF HEALTH-NEW); 02920 and 08582 are no longer in the
// HKEX list of securities (as at 23/10/2026).
function temporaryCounters(rows) {
  const stems = new Map();
  for (const row of rows) {
    if (row.mic !== "XHKG") continue;
    const match = row.name.match(COUNTER_SUFFIX);
    const stem = (match ? match[1] : row.name).toUpperCase();
    (stems.get(stem) || stems.set(stem, []).get(stem)).push({ row, suffix: match ? match[2].toUpperCase() : "" });
  }
  const out = new Set();
  for (const group of stems.values()) {
    if (group.length < 2) continue;
    const lowest = group.map((item) => item.row.ticker).sort()[0];
    for (const { row, suffix } of group) {
      if (!suffix || suffix === "NEW") continue;
      if (suffix === "OLD" ? group.some((item) => item.row !== row && item.suffix !== "OLD") : row.ticker !== lowest) out.add(row.ticker);
    }
  }
  return out;
}
function temporaryCounter(row, byStem) {
  return row.mic === "XHKG" && ((!row.isin && (TEMPORARY_HK.has(row.ticker) || COUNTER_SUFFIX.test(row.name) && !/-NEW$/i.test(row.name))) || byStem.has(row.ticker));
}

// ---- Hong Kong long suspensions --------------------------------------------

const HK_SUSPENSION_REPORTS = [
  ["Main Board", "https://www2.hkexnews.hk/Exchange-Reports/Monthly-Prolonged-Suspension-Status-Report/Main-Board?sc_lang=en"],
  ["GEM", "https://www2.hkexnews.hk/Exchange-Reports/Monthly-Prolonged-Suspension-Status-Report/GEM?sc_lang=en"],
];
const HK_DAY_QUOTES = (yymmdd) => [
  `https://www.hkex.com.hk/eng/stat/smstat/dayquot/d${yymmdd}e.htm`,
  `https://www.hkex.com.hk/eng/stat/smstat/dayquot/GEM/e_G${yymmdd}.htm`,
];

function pdfText(bytes, label) {
  const file = path.join(os.tmpdir(), `moomoous-${label.replace(/\W+/g, "-")}.pdf`);
  fs.writeFileSync(file, bytes);
  const run = spawnSync("python3", ["-c", "import sys\nfrom pypdf import PdfReader\nprint('\\n'.join((p.extract_text() or '') for p in PdfReader(sys.argv[1]).pages))", file], { encoding: "utf8", maxBuffer: 64 << 20 });
  if (run.status !== 0) throw new Error(`the HKEX ${label} report could not be read: ${run.stderr.trim().slice(0, 200)}`);
  return run.stdout;
}

// code -> { board, since, deadline } of every company in the two reports.
// A line of the report: "21.  Skyfame Realty (Holdings) Limited (In
// Liquidation) (59) 1-Apr-2025 30-Sep-2026 ..." (GEM: "1  CBK Holdings
// Limited (8428) 2-Jul-2025 1-Jul-2026"); the count is checked against the
// report's own "As at the end of <month> <year> <n>".
async function hkLongSuspended() {
  const out = new Map();
  let asAt = "";
  for (const [board, url] of HK_SUSPENSION_REPORTS) {
    const bytes = await fetchBytes(url, "application/pdf");
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`the HKEX ${board} prolonged suspension report is not a PDF`);
    const text = pdfText(bytes, board);
    asAt ||= (text.match(/\(as at (\d{1,2} [A-Z][a-z]+ \d{4})\)/) || [])[1] || "";
    const announced = Number((text.match(/As at the end of [A-Z][a-z]+ \d{4}\s+(\d+)/) || [])[1]);
    let found = 0;
    for (const match of text.matchAll(/\((\d{1,5})\)[\s^*#]*(\d{1,2}-[A-Z][a-z]{2}-\d{4})\s+(\d{1,2}-[A-Z][a-z]{2}-\d{4}|N\/?A)/g)) {
      const code = match[1].padStart(5, "0");
      if (!out.has(code)) found += 1;
      out.set(code, { board, since: match[2], deadline: match[3] });
    }
    if (!announced || found !== announced) throw new Error(`the HKEX ${board} prolonged suspension report announces ${announced} companies, ${found} were read`);
  }
  return { codes: out, asAt };
}

// The codes the latest HKEX daily quotations (Main Board and GEM) mark
// "TRADING SUSPENDED", and those they quote: the last 7 days are tried, the
// newest first. The Main Board file (28 MB) is read up to its sales records.
async function hkDayQuotes() {
  for (let back = 0; back < 7; back += 1) {
    const day = new Date(Date.now() + 8 * 3600_000 - back * 86400_000).toISOString().slice(2, 10).replaceAll("-", "");
    const suspended = new Set();
    const quoted = new Set();
    let ok = true;
    for (const url of HK_DAY_QUOTES(day)) {
      let text = "";
      try {
        const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(180_000) });
        if (!response.ok) {
          ok = false;
          break;
        }
        const decoder = new TextDecoder("latin1");
        for await (const chunk of response.body) {
          text += decoder.decode(chunk, { stream: true });
          if (/CODE\s+NAME OF STOCK\s+SALES RECORD/.test(text.slice(-200_000))) break;
        }
      } catch {
        ok = false;
        break;
      }
      const section = text.split(/CODE\s+NAME OF STOCK\s+SALES RECORD/)[0];
      for (const match of section.matchAll(/^ *(\d{1,5}) +\S.*? +(?:HKD|USD|CNY|RMB|CNH|EUR|JPY|SGD|AUD|CAD|GBP) +(TRADING SUSPENDED|[\d.,-]+)/gm)) {
        const code = match[1].padStart(5, "0");
        quoted.add(code);
        if (match[2] === "TRADING SUSPENDED") suspended.add(code);
      }
    }
    if (ok && suspended.size > 100 && quoted.size > 2000) return { day, suspended, quoted };
  }
  console.error("HKEX daily quotations: none of the last 7 days could be read; every reported long suspension is left out");
  return null;
}

// ---- rows -----------------------------------------------------------------

const dropped = {};
const examples = {};
function drop(reason, example = "") {
  dropped[reason] = (dropped[reason] || 0) + 1;
  if (example && (examples[reason] ||= []).length < 6) examples[reason].push(example);
}

const [america, halts, cmic] = await Promise.all([usDirectory(), openHalts(), cmicBook()]);
const { lines: usLines, total: usTotal, at: usAt, source: usSource } = await usList();
if (usLines.length < 9000) throw new Error(`the moomoo US list holds ${usLines.length} codes`);

const rows = [];
for (const item of usLines) {
  const code = normalize(item.stockCode).toUpperCase();
  const name = normalize(item.name);
  if (![3, 4, 12].includes(item.instrumentType)) {
    drop("US other moomoo type", `${code} ${name}`);
    continue;
  }
  const place = usListing(america, code);
  if (!place) {
    drop("US not in the symbol directory (delisted)", `${code} ${name}`);
    continue;
  }
  const halt = halts.get(code) || halts.get(code.replaceAll(".", "-")) || halts.get(code.replaceAll(".", "/")) || halts.get(code.replaceAll(".", ""));
  if (halt) {
    drop("US halt still open from before today", `${code} ${halt}`);
    continue;
  }
  const etn = ETN_BY_NAME.test(place.title) || ETN_BY_NAME.test(name);
  const type = etn ? "ETN" : place.etf || ETF_BY_NAME.test(place.title) || ETF_BY_NAME.test(name) ? "ETF" : "STOCK";
  if (type === "STOCK" && isObligation(place.title, type)) {
    drop("US debt line (directory name)", `${code} ${place.title}`);
    continue;
  }
  rows.push({
    query: code,
    ticker: code,
    name: name || code,
    exchange: place.exchange,
    mic: place.mic,
    currency: "USD",
    type,
    isin: "",
    raw: [code, name, `US ${place.exchange}`, "USD", type].join(" | "),
  });
}
const usRows = rows.length;
if (usRows < 9000) throw new Error(`only ${usRows} US rows`);

// OTC Markets lines on the OTCQX, OTCQB, OTCID and Pink Limited tiers (see
// the header). The Grey (30) and Expert Market (40) tiers are not read.
const OTC_KEPT = ["1", "10", "20", "21"];
const OTC_TYPE = {
  "Common Stock": "STOCK",
  "Foreign Ordinary Shares": "STOCK",
  ADRs: "STOCK",
  "New York Registry Shs": "STOCK",
  "Preferred Stock": "STOCK",
  Fund: "STOCK",
  // Trust and partnership units (Canadian REITs and income funds), blank-
  // check units excepted below.
  Units: "STOCK",
  // CDIs, stapled securities, NVDRs, REITs, Deutsche Bank ETNs, Arrived
  // Homes series.
  "Other Security Type": "STOCK",
  // UCITS ETFs and iPath ETNs.
  "Structured Product": "ETF",
  ETFs: "ETF",
};
// "ETFs" lines that are company shares (see the header): by name, or these
// companies (OTC Markets' profile: LTR Pharma Limited and West Cobar Metals
// Limited, ASX companies; XXF Group Holdings Limited, an HKEX company).
const OTC_ETF_SHARE = /\b(ADRS?|S\/ADR|SP\/ADR|U\/ADR|NY REG|NEW YORK REGISTRY|REGISTRY|FIBR|FIBRA|REIT)\b/;
const OTC_ETF_SHARES = new Set(["LTPLF", "WCMTF", "XXFGF"]);
const SPAC_UNIT = /\b(ACQ|ACQUISITION|ACQSITIO|MERGER|SPAC)\b|\b(I|II|III|IV|V|IX)\s+UTS( A)?$/;
const OTC_ETN = /\bETNs?\b|\bIPATH\b|^(DB|DEUTSCHE BK|DEUT BK)\b.*\b(LONG|SHORT|LNG|SHRT)\b/;
const OTC_DEBT = /\b\d+(\.\d+)?%?\s+(SR|SUB|NTS?|NOTES?|DEB)\b/;
function otcType(stock, name) {
  const type = OTC_TYPE[stock.type];
  if (!type) return { drop: `OTC ${stock.type || "untyped"} (warrant, right)` };
  if (stock.type === "Units" && SPAC_UNIT.test(name)) return { drop: "OTC blank-check (SPAC) unit" };
  if (OTC_DEBT.test(name) && stock.type !== "Preferred Stock") return { drop: "OTC debt line (name)" };
  if (OTC_ETN.test(name) || ETN_BY_NAME.test(name)) return { type: "ETN" };
  if (type === "ETF" && (OTC_ETF_SHARE.test(name) || OTC_ETF_SHARES.has(stock.symbol))) return { type: "STOCK" };
  return { type };
}

// The OTC_KEEP best-known OTC lines (see the header), of the candidates
// left once never-traded, Caveat Emptor and non-US fund lines are out:
// market value first, then the 30-day dollar volume.
const OTC_KEEP = 3000;
async function otcBestKnown(candidates) {
  const sizes = await otcSizes(candidates.map(({ row }) => row.ticker));
  const unread = candidates.filter(({ row }) => !sizes.has(row.ticker));
  if (unread.length > candidates.length * 0.02) throw new Error(`OTC Markets inside quotes: ${unread.length} of ${candidates.length} lines unread`);
  const ranked = candidates.map((candidate) => {
    const size = sizes.get(candidate.row.ticker) || {};
    const price = size.lastSale || candidate.stock.price || 0;
    return { ...candidate, cap: size.marketCap > 0 ? size.marketCap : 0, dollars: (size.avgVolume || 0) * price };
  });
  ranked.sort((a, b) => b.cap - a.cap || b.dollars - a.dollars || a.row.ticker.localeCompare(b.row.ticker));
  return { kept: ranked.slice(0, OTC_KEEP), cut: ranked.slice(OTC_KEEP), noCap: ranked.filter((item) => !item.cap).length };
}
const otcScreen = await otcScreener(OTC_KEPT, { live: LIVE });
// OTC symbols are letters only; an exchange row is the same title when its
// code is the same.
const listedCodes = new Set(rows.map((row) => row.ticker));
const otcTier = {};
const otcStock = new Map();
const otcStart = rows.length;
const otcCandidates = [];
for (const market of OTC_KEPT) {
  for (const stock of otcScreen[market].stocks) {
    const code = normalize(stock.symbol).toUpperCase();
    const tier = OTC_TIERS[stock.marketId];
    if (!code || !tier) throw new Error(`OTC Markets line ${JSON.stringify(stock)}`);
    const name = normalize(stock.name) || code;
    const { type, drop: reason } = otcType(stock, name);
    if (reason) {
      drop(reason, `${code} ${name}`);
      continue;
    }
    if (listedCodes.has(code)) {
      drop("OTC symbol already an exchange-listed row", `${code} ${name}`);
      continue;
    }
    if (type === "STOCK" && isObligation(name, type)) {
      drop("OTC debt line (name)", `${code} ${name}`);
      continue;
    }
    if (!(stock.price > 0)) {
      drop("OTC no last sale on record (never traded)", `${code} ${name}`);
      continue;
    }
    if (stock.caveatEmptor) {
      drop("OTC Caveat Emptor", `${code} ${name}`);
      continue;
    }
    if (type === "ETF") {
      drop("OTC non-US fund (UCITS ETF, not SEC-registered)", `${code} ${name} (${stock.country || "no country"})`);
      continue;
    }
    otcStock.set(code, stock);
    const row = {
      query: code,
      ticker: code,
      name,
      exchange: "OTC Markets",
      mic: "OTCM",
      currency: "USD",
      type,
      isin: "",
      raw: [code, name, `OTC ${tier}`, stock.type, stock.country, "USD", type].join(" | "),
    };
    otcCandidates.push({ row, stock, tier });
  }
}
const otcRanking = await otcBestKnown(otcCandidates);
for (const { row, tier } of otcRanking.kept) {
  otcTier[tier] = (otcTier[tier] || 0) + 1;
  rows.push(row);
}
for (const { row, cap } of otcRanking.cut) drop(`OTC beyond the ${OTC_KEEP} best-known lines`, `${row.ticker} ${row.name} (${cap ? `${Math.round(cap / 1e6)}M` : "no market value"})`);
const otcRows = rows.length - otcStart;
if (otcRows < OTC_KEEP * 0.97) throw new Error(`only ${otcRows} OTC rows`);

const shared = await moomooRows(["HK", "CN"], { live: LIVE });
for (const [reason, count] of Object.entries(shared.dropped)) dropped[reason] = (dropped[reason] || 0) + count;
const longSuspended = await hkLongSuspended();
const dayQuotes = await hkDayQuotes();
const resumed = [];
for (const row of shared.rows) {
  if (row.exchange === "Hong Kong") row.exchange = "Hong Kong Stock Exchange";
  // ChiNext and STAR: institutional professional investors only (header).
  if ((row.mic === "XSHE" && /^30[0-2]/.test(row.ticker)) || (row.mic === "XSHG" && /^68[89]/.test(row.ticker))) {
    drop(`A-share ${row.mic === "XSHE" ? "ChiNext" : "STAR Market"} (institutional professional investors only)`, `${row.ticker} ${row.name}`);
    continue;
  }
  const suspension = row.mic === "XHKG" && longSuspended.codes.get(row.ticker);
  if (suspension) {
    if (dayQuotes && dayQuotes.quoted.has(row.ticker) && !dayQuotes.suspended.has(row.ticker)) {
      resumed.push(`${row.ticker} ${row.name}`);
    } else {
      const past = /\d{4}$/.test(suspension.deadline) && Date.parse(`${suspension.deadline} UTC`) < Date.now();
      drop(`HK suspended for 3 months or more (HKEX prolonged suspension report)${past ? ", past its remedial deadline" : ""}`, `${row.ticker} ${row.name} (${suspension.board}, since ${suspension.since}, deadline ${suspension.deadline})`);
      continue;
    }
  }
  rows.push(row);
}

requireListing(rows, [
  ["AAPL", "Nasdaq"],
  ["SPY", "NYSE Arca"],
  ["ARKK", "Cboe BZX"],
  ["JPM", "New York Stock Exchange"],
  ["00700", "Hong Kong Stock Exchange"],
  ["02800", "Hong Kong Stock Exchange"],
  ["600519", "Shanghai Stock Exchange"],
  ["000858", "Shenzhen Stock Exchange"],
  ["NSRGY", "OTC Markets"],
  ["RHHBY", "OTC Markets"],
]);

const stamped = stampRows(withoutObligations(rows));
const settled = settleMatches(stamped);
const filledIsins = fillIsins(stamped);
const otcIsins = await fillOtcIsins(stamped);
const byStem = temporaryCounters(stamped);
// An ISIN of a line OFAC's code matches is the same share on every place.
for (const row of stamped) if (row.isin && cmic.codes.has(cmicKey(row))) cmic.isins.add(row.isin);
const written = stamped.filter((row) => {
  if (temporaryCounter(row, byStem)) {
    drop("HK temporary parallel-trading counter (HKEX closes it)", `${row.ticker} ${row.name}`);
    return false;
  }
  if ((row.isin && cmic.isins.has(row.isin)) || cmic.codes.has(cmicKey(row))) {
    drop("NS-CMIC listed company (EO 14032, US persons)", `${row.ticker} ${row.exchange} ${row.name}`);
    return false;
  }
  return true;
});
for (const [ticker, mic] of [["00941", "XHKG"], ["00883", "XHKG"], ["00728", "XHKG"], ["600941", "XSHG"], ["601728", "XSHG"], ["600938", "XSHG"], ["600685", "XSHG"], ["688327", "XSHG"], ["00020", "XHKG"], ["80020", "XHKG"], ["SNTMF", "OTCM"]]) {
  if (written.some((row) => row.ticker === ticker && row.mic === mic)) throw new Error(`NS-CMIC ${ticker} (${mic}) was not left out`);
}
const floors = { "OTC Markets": 2900, "Hong Kong Stock Exchange": 2500, "Shanghai Stock Exchange": 1500, "Shenzhen Stock Exchange": 1500, Nasdaq: 3500, "New York Stock Exchange": 1800, "NYSE Arca": 1500, "Cboe BZX": 500 };
for (const [exchange, floor] of Object.entries(floors)) {
  const count = written.filter((row) => row.exchange === exchange).length;
  if (count < floor) throw new Error(`only ${count} rows on ${exchange}`);
}

written.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
fs.writeFileSync(new URL("moomoous-parsed.json", import.meta.url), JSON.stringify(written, null, 2));

console.log(`US list: ${usLines.length} codes of ${usTotal} announced, read ${usAt} (${usSource}); ${usRows} US rows`);
const otcWritten = written.filter((row) => row.mic === "OTCM");
console.log(`OTC Markets: ${otcRows} rows (${Object.entries(otcTier).map(([tier, count]) => `${tier} ${count}`).join(", ")}) of ${otcCandidates.length} ranked, screener read ${OTC_KEPT.map((market) => otcScreen[market].at.slice(0, 10)).join("/")}; the ${OTC_KEEP}th has a market value of ${Math.round((otcRanking.kept.at(-1)?.cap || 0) / 1e6)}M USD; ${otcRanking.noCap} ranked lines have no market value`);
console.log(`OTC ISINs: ${otcWritten.filter((row) => row.isin).length} of ${otcWritten.length}; ${otcIsins.brokers} from ibkrus/webullus, ${otcIsins.cusip} from OTC Markets CUSIPs; ${otcIsins.cins} CINS or foreign CUSIPs, ${otcIsins.noCusip} without a CUSIP, ${otcIsins.foreign} foreign lines left to their home listing; ${otcWritten.filter((row) => !row.isin).length} OTC rows without ISIN`);
console.log(`OTC home ISINs: ${otcIsins.home.home} from the home listing, ${otcIsins.home.homeAndCatalogues} from the home listing and other catalogues alike (${otcIsins.renamed.length} of them under another name), ${otcIsins.home.catalogues} from other catalogues, ${otcIsins.home.name} from the exact name; ${otcIsins.doubtful.filter((item) => !item.soft).length} left out on a conflict, ${otcIsins.doubtful.filter((item) => item.soft).length} with a lead not taken`);
for (const item of otcIsins.doubtful.filter((entry) => !entry.soft)) console.log(`  left out: ${item.ticker} ${item.name}: ${item.reason}`);
console.log(`NS-CMIC: ${cmic.entries} entries in force, ${cmic.isins.size} ISINs, ${cmic.codes.size} exchange codes (${cmic.added} from CMIC_LISTINGS)`);
console.log(`HK long suspensions: ${longSuspended.codes.size} companies in HKEX's reports as at ${longSuspended.asAt}; daily quotations of ${dayQuotes ? dayQuotes.day : "none"}; ${resumed.length} trading again and kept${resumed.length ? `: ${resumed.join(", ")}` : ""}`);
console.log(`${settled} US lines with several ISINs in the lists settled from ibkrus/webullus; ${filledIsins} filled from ISIN_FILLS; ${written.filter((row) => !row.isin).length} rows without ISIN (${written.filter((row) => !row.isin && row.matches?.length).length} of them with matches)`);
logCounts(written, dropped);
if (Object.keys(examples).length) console.log("examples", examples);
