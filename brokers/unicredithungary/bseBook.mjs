// The Budapest Stock Exchange (BÉT) book: every share, ETF and ETC the
// exchange lists today, with its ISIN and trading currency, for the brokers
// whose single place is the Budapest Stock Exchange (first: UniCredit Bank
// Hungary, brokers/unicredithungary). No shared module returned the whole
// place before this one: brokers/granit reads its own bank's table and only
// takes BÉT's MiFID II table for the ISINs.
//
// The lists are the exchange's own market tables, the ones its "Cash
// Market" and "BETa Market" pages draw (product groups as named on the
// exchange's product list page):
//   https://bet.hu/site/Angol/pages/cash-market      (Equities, Xtend, ETF)
//   https://bet.hu/site/Angol/pages/beta-market      (BETa Market)
//   https://bet.hu/site/Angol/pages/product-list     (group names)
// The pages load each table with a POST of the table's configuration to
// https://bet.hu/dataSourceRegistry, with the page's public anti-forgery
// token and session cookie (no login). Each row gives the BÉT code, ISIN,
// trading currency, listing date, last trade and delisting date.
//
// Segments (option `segments`, all kept by default):
//   prime     W_RESZVENYA  "Equities Prime"                      STOCK
//   standard  W_RESZVENYB  "Equities Standard"                   STOCK
//             W_RESZVENYT, W_RESZV_BA "Equities under classification",
//             W_ELKULONITE "Decategorised Equities" (empty today) STOCK
//   xtend     W_SME        "Xtend Market" (SME market)            STOCK
//   etf       W_ETF        "ETF" (OTP BUX, OTP CETOP)             ETF
//   beta      W_BETA       BETa Market "Foreign shares"           STOCK
//   betaEtf   W_BETF       BETa Market "Foreign ETFs"             ETF / ETC
// BETa is the exchange's MTF for foreign lines, traded in HUF on the same
// T7 system; its rows keep exchange "Budapest Stock Exchange" and MIC XBUD,
// as the other Budapest rows in this repo do (brokers/slsp), and say
// "BÉT BETa" in raw. A broker that names only some segments passes them.
//
// Left out:
//   - "Investment funds" (W_BEFJEGY): closed-end capital-protected fund
//     units, not ETFs (same rule as brokers/kumari/nepseShares.mjs);
//     `withFunds: true` returns them as FUND.
//   - bonds, certificates, turbos, warrants, compensation notes, T-bills:
//     other product groups, never read.
//   - a line whose delisting date has passed.
//   - a line never traded: no closing price on record and its last trade
//     is its listing price, listed more than 30 days ago (e.g. BGREIT,
//     ENEFI ELS, FINEXT B and several Xtend lines today).
//   - a dormant line: no trade for `dormantYears` (3) years (FINEXT, last
//     trade 2010).
//   - a suspended line. BÉT prints no live suspension list; it publishes
//     each suspension as a CEO resolution ("Suspension of trading in OPUS
//     shares"). The latest notices are read from the exchange's own news
//     search, and a line named in one that has not traded since the notice
//     is out.
//       https://bse.hu/search?category=NEWS_BET&q=suspension
//   - a line whose issuer name says it is in liquidation (f.a., v.a.,
//     "under liquidation", "felszámolás", "végelszámolás").
//
// Type: a BETa ETF row is an ETC when its name says ETC, ETP or Physical,
// or its ISIN is a GB or JE note (the WisdomTree metal and crypto lines:
// BTCW, ETHW, SOLW, WSLV, COPA, and the iShares Physical Gold ETC PPFB).
// Name: from ../../assets/stocks.csv or etfs.csv by ISIN (BET line first),
// else the issuer name from BÉT's company profile page
// (https://bet.hu/site/Angol/pages/company_profile/$security/<securityid>).
//
//   import { bseBook } from "../unicredithungary/bseBook.mjs";
//   const rows = await bseBook();                       // whole place
//   const rows = await bseBook({ segments: ["prime", "standard"] });
//   node brokers/unicredithungary/bseBook.mjs           // prints counts

import fs from "node:fs";

export const EXCHANGE = "Budapest Stock Exchange";
export const MIC = "XBUD";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BET = "https://bet.hu";
const PAGE = `${BET}/site/Angol/pages/cash-market`;
const REGISTRY = `${BET}/dataSourceRegistry`;
const BSE = "https://bse.hu";
const SEARCH_PAGE = `${BSE}/search?category=NEWS_BET&q=suspension`;
const SEARCH = `${BSE}/search/$rspid0x114670x12/$risearch`;
const PROFILE = `${BET}/site/Angol/pages/company_profile/$security/`;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const DAY = 86_400_000;

// segment -> [table config, type, label]
const TABLES = {
  prime: ["PromptTablesDataSource;instrgrpid=W_RESZVENYA;filterEmpty=false", "STOCK", "BÉT Equities Prime"],
  standard: ["PromptTablesDataSource;instrgrpid=W_RESZVENYB;filterEmpty=false", "STOCK", "BÉT Equities Standard"],
  classification: ["PromptTablesDataSource;instrgrpid=W_RESZVENYT,W_RESZV_BA;filterEmpty=false", "STOCK", "BÉT Equities under classification"],
  decategorised: ["PromptTablesDataSource;instrgrpid=W_ELKULONITE;filterEmpty=false", "STOCK", "BÉT Decategorised Equities"],
  xtend: ["PromptTablesDataSource;instrgrpid=W_SME;filterEmpty=false", "STOCK", "BÉT Xtend"],
  etf: ["PromptTablesDataSource;instrgrpid=W_ETF;filterEmpty=false", "ETF", "BÉT ETF"],
  beta: ["PromptTablesDataSource;instrgrpid=W_BETA;filterEmpty=false", "STOCK", "BÉT BETa foreign share"],
  betaEtf: ["PromptTablesDataSource;instrgrpid=W_BETF;filterEmpty=false", "ETF", "BÉT BETa foreign ETF"],
  funds: ["PromptTablesDataSource;instrgrpid=W_BEFJEGY;filterEmpty=false", "FUND", "BÉT Investment fund"],
};
export const SEGMENTS = ["prime", "standard", "classification", "decategorised", "xtend", "etf", "beta", "betaEtf"];

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) =>
  String(value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const fold = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "never");

// A small cookie-carrying session: the registry and the search check the
// page's token against its session cookie.
function session() {
  const jar = new Map();
  const cookie = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const keep = (response) => {
    for (const line of response.headers.getSetCookie?.() || []) {
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
    }
  };
  return async function call(url, { method = "GET", body, headers = {}, json = false } = {}) {
    let last = "";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await fetch(url, {
          method,
          body,
          headers: { "User-Agent": UA, Accept: json ? "application/json" : "text/html,*/*", Cookie: cookie(), ...headers },
          signal: AbortSignal.timeout(30_000),
        });
        keep(response);
        if (response.ok) return json ? await response.json() : await response.text();
        last = `${response.status} ${url}`;
        if (response.status === 404) break;
      } catch (error) {
        last = `${error.message || error} ${url}`;
      }
      await pause(2000 * (attempt + 1));
    }
    throw new Error(last);
  };
}

const tokenOf = (html) => {
  const token = html.match(/<meta name="_csrf" content="([^"]+)"/)?.[1];
  if (!token) throw new Error("no anti-forgery token on the page");
  return token;
};

// ISIN -> name from the shared lists, the BET line first.
function assetNames() {
  const names = new Map();
  for (const file of ["stocks.csv", "etfs.csv"]) {
    const text = fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const [ticker, , isin, ...rest] = line.split(",");
      const name = rest.join(",").replace(/^"|"$/g, "").trim();
      if (!ISIN.test(isin || "") || !name) continue;
      const bet = ticker.startsWith("BET:");
      const known = names.get(isin);
      if (!known || (bet && !known.bet)) names.set(isin, { name, bet });
    }
  }
  return names;
}

// Latest suspension resolutions: [{ title, issuer, at }]. Pages until the
// notices are older than `days` or `pages` pages were read.
async function suspensionNotices(call, { days = 400, pages = 12 } = {}) {
  const token = tokenOf(await call(SEARCH_PAGE));
  const notices = [];
  const oldest = Date.now() - days * DAY;
  for (let page = 0; page < pages; page += 1) {
    await pause(1200);
    const body = JSON.stringify({
      query: "suspension",
      facets: ["bet_date", "bet_type", "bet_issuer_f", "bet_tag", "newkib_subjectGroup", "newkib_newssubject"],
      ddParams: [],
      pageIndex: page,
      orderMode: "DATE_DESC",
    });
    const result = await call(`${SEARCH}?_csrf=${token}`, {
      method: "POST",
      body,
      json: true,
      headers: { "Content-Type": "application/json; charset=utf-8", "X-SECURITY": token },
    });
    const items = result.items || [];
    if (!items.length) break;
    let older = 0;
    for (const item of items) {
      const html = String(item.data || "");
      const title = clean(html.match(/<div class="title">([\s\S]*?)<\/div>/)?.[1]);
      const issuer = clean(html.match(/<h2 class="issuer">([\s\S]*?)<\/h2>/)?.[1]);
      const when = clean(html.match(/list-date[^>]*>([\s\S]*?)<\/span>/)?.[1]).replace(/\.(?=\s)/, "");
      const at = Date.parse(`${when} GMT+0100`);
      if (!title || Number.isNaN(at)) continue;
      if (at < oldest) older += 1;
      else notices.push({ title, issuer, at });
    }
    if (older === items.length) break;
  }
  return notices;
}

// The words a notice names: "Suspension of trading in CIG Pannónia shares"
// -> "CIGPANNONIA"; the Hungarian "<X> részvények kereskedésének
// felfüggesztése" too.
function suspendedNames(notice) {
  const english = notice.title.match(/suspension of (?:exchange )?trading in (?:the )?(.+?) (?:ordinary )?shares/i)?.[1];
  const hungarian = notice.title.match(/^(.+?) (?:törzs)?részvények kereskedésének felfüggesztése/i)?.[1];
  return [english, hungarian].filter(Boolean).map(fold).filter(Boolean);
}

const LIQUIDATION = /\b(?:f\.\s?a\.|v\.\s?a\.|"?f\.a\."?|"?v\.a\."?)|under liquidation|in liquidation|felszámolás|végelszámolás/i;

// Every listed BÉT share / ETF / ETC line, as catalogue rows (exchange,
// MIC XBUD, trading currency), sorted by type then ticker.
// Options: segments (default SEGMENTS), withFunds (adds W_BEFJEGY as FUND),
// dormantYears (3), quiet (no stderr report).
export async function bseBook({ segments = SEGMENTS, withFunds = false, dormantYears = 3, quiet = false } = {}) {
  const wanted = [...segments, ...(withFunds ? ["funds"] : [])];
  for (const segment of wanted) if (!TABLES[segment]) throw new Error(`unknown BÉT segment ${segment}`);
  const call = session();
  const token = tokenOf(await call(PAGE));
  const lines = [];
  for (const segment of wanted) {
    await pause(1200);
    const [config, type, label] = TABLES[segment];
    const data = await call(`${REGISTRY}?_csrf=${token}`, {
      method: "POST",
      body: config,
      json: true,
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest", Referer: PAGE },
    });
    for (const row of data.rows || []) lines.push({ ...row, segment, type, label });
  }

  const notices = await suspensionNotices(call);
  const names = assetNames();
  const now = Date.now();
  const leftOut = [];
  const suspended = [];
  const kept = [];
  const seen = new Set();
  for (const line of lines) {
    const code = clean(line.seccode);
    const isin = clean(line.isin).toUpperCase();
    const currency = clean(line.currencyid).toUpperCase();
    if (!code || !ISIN.test(isin)) {
      leftOut.push(`${code || "?"} no ISIN`);
      continue;
    }
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${code} has currency ${line.currencyid}`);
    if (seen.has(`${code}|${isin}`)) continue;
    seen.add(`${code}|${isin}`);
    if (line.delistingdate && line.delistingdate <= now) {
      leftOut.push(`${code} delisted ${day(line.delistingdate)}`);
      continue;
    }
    const lastTrade = line.lasttradedatetime || 0;
    const listed = line.listingdate || line.introdate || 0;
    const neverTraded = !line.lastclosedate && (!lastTrade || lastTrade <= listed + DAY);
    if (neverTraded && listed && now - listed > 30 * DAY) {
      leftOut.push(`${code} never traded (listed ${day(listed)})`);
      continue;
    }
    if (lastTrade && now - lastTrade > dormantYears * 365 * DAY) {
      leftOut.push(`${code} no trade since ${day(lastTrade)}`);
      continue;
    }
    kept.push({ line, code, isin, currency, lastTrade });
  }

  // Names: the shared lists first, then BÉT's company profile.
  const rows = [];
  for (const { line, code, isin, currency, lastTrade } of kept) {
    let name = names.get(isin)?.name || "";
    if (!name) {
      await pause(1000);
      try {
        const html = await call(`${PROFILE}${line.securityid || encodeURIComponent(code)}`);
        name = clean(html.match(/id="cpH1"[^>]*>([\s\S]*?)<\/h1>/)?.[1]);
      } catch {}
    }
    // Suspended: named in a suspension notice (by BÉT code, or by the start
    // of its name: "Magyar Telekom shares") and not traded since.
    const notice = notices.find(
      (item) =>
        item.at > lastTrade &&
        suspendedNames(item).some((word) => word === fold(code) || (word.length >= 4 && fold(name).startsWith(word)))
    );
    if (notice) {
      suspended.push(`${code} (${notice.title}, ${day(notice.at)})`);
      continue;
    }
    if (LIQUIDATION.test(name)) {
      leftOut.push(`${code} in liquidation (${name})`);
      continue;
    }
    let type = line.type;
    if (line.segment === "betaEtf" && (/\b(ETC|ETP|Physical)\b/i.test(name) || /^(GB|JE)/.test(isin))) type = "ETC";
    rows.push({
      query: code,
      ticker: code,
      name: name || code,
      exchange: EXCHANGE,
      mic: MIC,
      currency,
      type,
      isin,
      raw: [code, isin, currency, line.label].join(" | "),
    });
  }

  rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));

  // Sanity: the market has not changed shape.
  const count = (segment) => kept.filter((item) => item.line.segment === segment).length;
  if (wanted.includes("prime") && count("prime") < 15) throw new Error(`only ${count("prime")} Prime shares`);
  if (wanted.includes("standard") && count("standard") < 15) throw new Error(`only ${count("standard")} Standard shares`);
  if (wanted.includes("betaEtf") && count("betaEtf") < 20) throw new Error(`only ${count("betaEtf")} BETa ETFs`);
  for (const [ticker, isin, currency] of [
    ["OTP", "HU0000061726", "HUF"],
    ["MOL", "HU0000153937", "HUF"],
    ["GSPARK", "HU0000083696", "EUR"],
  ]) {
    if (!wanted.includes("prime")) break;
    const found = rows.find((row) => row.ticker === ticker);
    if (!found || found.isin !== isin || found.currency !== currency) throw new Error(`${ticker} was ${JSON.stringify(found)}`);
  }

  if (!quiet) {
    const tally = {};
    for (const row of rows) tally[`${row.type} ${row.currency}`] = (tally[`${row.type} ${row.currency}`] || 0) + 1;
    console.error(`BÉT book: ${rows.length} lines`, tally);
    console.error(`suspended: ${suspended.join("; ") || "none"} (${notices.length} suspension notices read)`);
    console.error(`left out: ${leftOut.join("; ") || "none"}`);
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await bseBook();
  const bySegment = {};
  for (const row of rows) {
    const label = row.raw.split(" | ").pop();
    bySegment[`${label} ${row.type}`] = (bySegment[`${label} ${row.type}`] || 0) + 1;
  }
  console.log(bySegment);
}
