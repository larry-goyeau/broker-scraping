// The SIX Swiss Exchange book, for the Swiss banks whose one place is
// "Switzerland" (Migros Bank, the cantonal and regional banks, the Clientis
// banks and the others in the single-place group). None of them prints a
// list of what it sells on the exchange, so the exchange's own list is
// read: SIX's public reference data (the feed behind the share, ETF and ETP
// explorers on six-group.com) for the three portal segments that hold
// shares and exchange-traded products:
//
//   EQ  shares: Swiss blue chips (BC), other Swiss shares (DS), foreign
//       shares with a primary or secondary listing (FS, Chinese GDRs
//       included) and the SIX Sponsored Segment of foreign shares (PS),
//       each line in CHF or USD;
//   FU  funds: exchange-traded funds (ET), listed investment funds, which
//       are the Swiss real estate funds (IF), and the Sponsored Funds
//       segment of open-ended funds a sponsor makes a market in (PF);
//   EP  exchange-traded products: crypto, commodity and other trackers.
//
// One row per line: a line is an ISIN in one trading currency, and SIX
// lists many ETFs and ETPs in CHF, USD, EUR and GBP at once. The currency
// is the line's trading currency. ISINs and symbols come from SIX.
//
// Left out:
// - the derivatives segment (warrants, structured products) and bonds,
//   which are other portal segments and are never read;
// - rights (SecType "Right") and second trading lines ("2. LINIE"), which
//   are buy-back lines where only the issuer buys;
// - delisted lines: SIX takes a line out of the reference data once it is
//   delisted (UBS Carbon Compensated Gold ETF USD, CH1233056329, last
//   traded 15 October 2026, was gone on 24 October), and a line whose
//   LastTradingDate is already past is dropped as well;
// - suspended lines. SIX keeps a suspended line in the reference data with
//   TradingState "T" (Leclanché, suspended since 1 June 2026, still reads
//   T), so suspension is read two ways:
//     1. SIX Exchange Regulation's official notices (manual notices of the
//        last 400 days): "Suspension: <name> / <symbol> / <ISIN>" from SIX
//        Swiss Exchange, "Suspendierung des Handels" from the sponsors of
//        the Sponsored Funds segment, "Sistierung des Handels" from the
//        sponsored foreign shares; "Resumption", "Auflösung der
//        Suspendierung" and "Wiederaufnahme des Handels" lift them. A line
//        still suspended by the last notice and with no trade after the
//        notice date stays out.
//     2. A Swiss share (BC, DS) or a Swiss real estate fund (IF, asset
//        class Real Estate) with no trade in 30 days stays out. These
//        lines trade every day (on 23 October 2026, 271 of 276 had traded
//        that week); a month with no trade is a suspension the notice
//        feed did not carry (Leclanché, LECN, suspended 1 June 2026, last
//        trade 29 May; EEII, reverse takeover pending, last trade 9 June).
// - never-traded and dormant lines: no trade ever on SIX, or a last trade
//   more than 180 days ago (the rule brokers/bancosantafe/bymaWhole.mjs
//   applies on BYMA: a quote on a dormant line is not a market). This
//   takes out most of the 2018-2019 Sponsored Segment lines and the
//   Chinese GDRs that have not traded since 2023.
//
// Types: EQ lines are STOCK; ET lines are ETF; IF and PF lines are FUND
// (listed and sponsored investment funds, not ETFs); EP lines are ETC when
// they track a commodity (SIX asset class "Commodities", or a metal or oil
// in the name) and ETN otherwise (crypto, bitcoin-and-gold baskets and
// other trackers), as brokers/idealing does.
//
// Each row also carries `segment` (BC, DS, FS, PS, ET, IF, PF, EP) so a
// broker can drop a segment its own pages exclude; writeSixCatalogue
// removes it before writing.
//
//   https://www.six-group.com/fqs/ref.csv?select=ISIN,ValorSymbol,TradingBaseCurrency,ShortName&where=PortalSegment=EQ&pagesize=50000
//   https://www.six-group.com/en/market-data/shares/share-explorer.html
//   https://www.ser-ag.com/en/resources/notifications-market-participants/official-notices.html
//   https://www.ser-ag.com/sheldon/official_notices/v2/find.json?firstDate=20260101&lastDate=20261024&pageNumber=0&pageSize=5000&sortAttribute=date&sortDirection=desc&showManual=true
//   https://www.ser-ag.com/sheldon/official_notices/v2/details/<noticeId>.json
//
// The read (three reference files, one notice list and a few notice
// details) is kept for 12 hours in the system temp folder, so the scrapers
// run back to back read SIX once.
//
//   node brokers/migros/sixBook.mjs      (prints the counts)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const EXCHANGE = "SIX Swiss Exchange";
export const MIC = "XSWX";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const REF = "https://www.six-group.com/fqs/ref.csv";
const FIELDS = [
  "ISIN", "ValorSymbol", "TradingBaseCurrency", "ShortName", "FundLongName", "IssuerNameFull",
  "PortalSegment", "ProductLine", "SecTypeCode", "SecTypeDesc", "InstrumentTypeCode", "TradingState",
  "AssetClassDesc", "ListingSegmentDesc", "FirstTradingDate", "LastTradingDate", "LatestTradeDate",
];
const SEGMENTS = [["EQ", 600], ["FU", 2500], ["EP", 150]];
const NOTICES = "https://www.ser-ag.com/sheldon/official_notices/v2";
const CACHE = path.join(os.tmpdir(), "six-book-cache.json");
const CACHE_HOURS = 12;
const DORMANT_DAYS = 180;
const DOMESTIC_DAYS = 30;
const NOTICE_DAYS = 400;

const SUSPEND = /^\s*suspension\s*:|suspendierung des handels|sistierung des handels|^\s*suspension of trading/i;
const LIFT = /^\s*resumption\b|auflösung der suspendierung|aufhebung der (suspendierung|sistierung)|wiederaufnahme des handels|lifting of (the )?suspension|lift of suspension/i;
const SECOND_LINE = /\b2\s*[.,]?\s*LINIE\b/i;
const COMMODITY = /\b(gold|silver|platinum|palladium|copper|brent|wti|crude|oil|metal|commodit)/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, as = "text") {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        if (as === "json") return await response.json();
        // The reference files are ISO-8859-1 (Leclanché, Zürich).
        return new TextDecoder("latin1").decode(await response.arrayBuffer());
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

const ymd = (date) => date.toISOString().slice(0, 10).replace(/-/g, "");
const toDate = (value) => new Date(`${String(value).slice(0, 4)}-${String(value).slice(4, 6)}-${String(value).slice(6, 8)}T00:00:00Z`);
const daysBetween = (from, to) => Math.round((toDate(to) - toDate(from)) / 86_400_000);

async function referenceLines() {
  const lines = [];
  for (const [segment, least] of SEGMENTS) {
    const url = `${REF}?select=${FIELDS.join(",")}&where=PortalSegment=${segment}&pagesize=50000`;
    const [head, ...body] = (await get(url)).trim().split(/\r?\n/);
    if (head !== FIELDS.join(";")) throw new Error(`SIX reference header changed: ${head}`);
    if (body.length < least) throw new Error(`SIX reference ${segment}: only ${body.length} lines`);
    for (const text of body) {
      const cells = text.split(";");
      if (cells.length !== FIELDS.length) throw new Error(`SIX reference line has ${cells.length} cells: ${text}`);
      lines.push(Object.fromEntries(FIELDS.map((field, at) => [field, cells[at].trim()])));
    }
    await sleep(1000);
  }
  return lines;
}

// Suspension and lifting notices of the last NOTICE_DAYS, oldest first,
// each with the ISINs it names.
async function suspensionNotices() {
  const last = new Date();
  const first = new Date(last.getTime() - NOTICE_DAYS * 86_400_000);
  const url =
    `${NOTICES}/find.json?firstDate=${ymd(first)}&lastDate=${ymd(last)}&pageNumber=0&pageSize=10000` +
    "&sortAttribute=date&sortDirection=asc&showManual=true&showAutomatic=false&showExDividend=false" +
    "&showProvisional=false&showFirstListing=false&showDelisting=false";
  const body = await get(url, "json");
  if (!Array.isArray(body?.itemList)) throw new Error("SER official notices answered no list");
  if (body.itemList.length < 1000) throw new Error(`SER official notices: only ${body.itemList.length} manual notices in ${NOTICE_DAYS} days`);
  if (body.itemList.length < body.totalCount) throw new Error(`SER official notices: ${body.itemList.length} of ${body.totalCount} read`);
  const notices = [];
  for (const item of body.itemList) {
    const title = String(item.title || "");
    const kind = LIFT.test(title) ? "lift" : SUSPEND.test(title) ? "suspend" : "";
    if (!kind) continue;
    let isins = String(item.isin || "").match(/[A-Z]{2}[A-Z0-9]{9}\d/g) || [];
    if (!isins.length) {
      // The list leaves the ISIN out of some notices; the notice text names it.
      const detail = await get(`${NOTICES}/details/${item.noticeId}.json`, "json");
      const text = `${detail?.itemList?.[0]?.isin || ""} ${detail?.itemList?.[0]?.text || ""}`;
      isins = text.match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/g) || [];
      await sleep(400);
    }
    notices.push({ id: item.noticeId, date: String(item.date), kind, title, isins: [...new Set(isins)] });
  }
  return notices.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

async function readSix() {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - cached.at < CACHE_HOURS * 3600_000 && cached.lines?.length && Array.isArray(cached.notices)) {
      return { ...cached, fromCache: true };
    }
  } catch {}
  const lines = await referenceLines();
  const notices = await suspensionNotices();
  const read = { at: Date.now(), lines, notices };
  fs.writeFileSync(CACHE, JSON.stringify(read));
  return { ...read, fromCache: false };
}

function typeOf(line) {
  const segment = line.ProductLine;
  if (line.PortalSegment === "EQ") return "STOCK";
  if (segment === "ET") return "ETF";
  if (segment === "IF" || segment === "PF") return "FUND";
  if (segment === "EP") {
    if (/crypto/i.test(line.AssetClassDesc) || /bitcoin|crypto/i.test(line.ShortName)) return "ETN";
    return /commodit/i.test(line.AssetClassDesc) || COMMODITY.test(line.ShortName) ? "ETC" : "ETN";
  }
  return "";
}

function nameOf(line) {
  if (line.PortalSegment === "FU") return line.FundLongName || line.ShortName;
  if (line.PortalSegment === "EQ" && line.IssuerNameFull && !/^Sponsor\b/i.test(line.IssuerNameFull)) return line.IssuerNameFull;
  return line.ShortName;
}

// { rows, dropped, counts, marketDay, fromCache }. Rows are in the house
// shape plus `segment`; dropped is one "<symbol> <currency> <ISIN>: reason"
// per line left out.
export async function sixBook() {
  const { lines, notices, at, fromCache } = await readSix();
  const marketDay = lines.reduce((max, line) => (line.LatestTradeDate > max ? line.LatestTradeDate : max), "");
  if (!/^\d{8}$/.test(marketDay) || daysBetween(marketDay, ymd(new Date(at))) > 7) throw new Error(`SIX reference data: last trade day ${marketDay}`);

  // ISIN -> date of the suspension still in force.
  const suspended = new Map();
  for (const notice of notices) {
    for (const isin of notice.isins) {
      if (notice.kind === "suspend") suspended.set(isin, notice.date);
      else suspended.delete(isin);
    }
  }

  const rows = [];
  const dropped = [];
  const counts = {};
  const seen = new Set();
  const drop = (line, reason) => {
    dropped.push(`${line.ValorSymbol} ${line.TradingBaseCurrency} ${line.ISIN}: ${reason}`);
    const key = reason.replace(/[ :(].*$/, "");
    counts[key] = (counts[key] || 0) + 1;
  };
  for (const line of lines) {
    const { ISIN: isin, ValorSymbol: ticker, TradingBaseCurrency: currency, LatestTradeDate: lastTrade } = line;
    const segment = line.ProductLine;
    const key = `${isin}|${currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) || !ticker || !/^[A-Z]{3}$/.test(currency)) throw new Error(`SIX line without ISIN, symbol or currency: ${JSON.stringify(line)}`);
    const type = typeOf(line);
    if (!type) { drop(line, `segment ${line.PortalSegment}/${segment}`); continue; }
    if (line.InstrumentTypeCode !== "SH" || /right/i.test(line.SecTypeDesc)) { drop(line, `right (${line.SecTypeDesc})`); continue; }
    if (SECOND_LINE.test(line.ShortName)) { drop(line, "second-line (issuer buy-back line)"); continue; }
    if (line.TradingState !== "T") { drop(line, `state ${line.TradingState}`); continue; }
    if (line.LastTradingDate && line.LastTradingDate < marketDay) { drop(line, `delisted (last trading day ${line.LastTradingDate})`); continue; }
    if (suspended.has(isin) && (!lastTrade || lastTrade <= suspended.get(isin))) { drop(line, `suspended (SER notice of ${suspended.get(isin)})`); continue; }
    if (!lastTrade) { drop(line, "never-traded"); continue; }
    const idle = daysBetween(lastTrade, marketDay);
    const daily = segment === "BC" || segment === "DS" || (segment === "IF" && /real estate/i.test(line.AssetClassDesc));
    if (daily && idle > DOMESTIC_DAYS) { drop(line, `suspended-in-practice (Swiss line with no trade in ${DOMESTIC_DAYS} days, last trade ${lastTrade})`); continue; }
    if (idle > DORMANT_DAYS) { drop(line, `dormant (last trade ${lastTrade})`); continue; }
    const name = nameOf(line);
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: EXCHANGE,
      mic: MIC,
      currency,
      type,
      isin,
      raw: ["SIX", ticker, line.ShortName, currency, isin, line.SecTypeDesc, line.ListingSegmentDesc, line.AssetClassDesc, `last trade ${lastTrade}`].filter(Boolean).join(" | "),
      segment,
    });
  }
  rows.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));

  // The book must keep the big names in the right shape; a broken read fails here.
  const expect = [
    ["NESN", "CHF", "STOCK", "CH0038863350"],
    ["ABBN", "CHF", "STOCK", "CH0012221716"],
    ["UBSG", "CHF", "STOCK", "CH0244767585"],
    ["CSSPX", "USD", "ETF", "IE00B5BMR087"],
    ["ABTC", "USD", "ETN", "CH0454664001"],
    ["SIMA", "CHF", "FUND", "CH0014420878"],
  ];
  for (const [ticker, currency, type, isin] of expect) {
    if (!rows.some((row) => row.ticker === ticker && row.currency === currency && row.type === type && row.isin === isin)) {
      throw new Error(`${ticker} ${currency} ${type} ${isin} is missing from the SIX book`);
    }
  }
  for (const ticker of ["LECN", "NOVNEE", "UBSGE"]) {
    if (rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} was kept in the SIX book`);
  }
  const byType = (type) => rows.filter((row) => row.type === type).length;
  if (byType("STOCK") < 400 || byType("ETF") < 1800 || byType("ETN") + byType("ETC") < 150) {
    throw new Error(`SIX book is short: ${byType("STOCK")} STOCK, ${byType("ETF")} ETF, ${byType("ETN")} ETN, ${byType("ETC")} ETC`);
  }
  return { rows, dropped, counts, marketDay, fromCache };
}

// Writes <folder>-parsed.json for one broker: the SIX book, minus what
// `keep` refuses (a row with its `segment`), stamped like every other
// catalogue. Returns the rows written.
export async function writeSixCatalogue({ broker, out, keep = () => true }) {
  const { rows, counts, marketDay, fromCache } = await sixBook();
  const kept = rows.filter((row) => keep(row));
  const stamped = stampRows(withoutObligations(kept.map(({ segment, ...row }) => ({ ...row }))));
  fs.writeFileSync(out, JSON.stringify(stamped, null, 2));
  const types = {};
  for (const row of stamped) types[row.type] = (types[row.type] || 0) + 1;
  console.error(
    `${broker}: ${stamped.length} lines on ${EXCHANGE} (${Object.entries(types).map(([type, count]) => `${count} ${type}`).join(", ")}), ` +
      `${rows.length - kept.length} left out by the broker's own exceptions; ` +
      `SIX left out ${Object.entries(counts).map(([reason, count]) => `${count} ${reason}`).join(", ")}; ` +
      `last SIX trade day ${marketDay}${fromCache ? `, SIX read from ${CACHE}` : ""}`,
  );
  return stamped;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, dropped, counts, marketDay, fromCache } = await sixBook();
  const tally = {};
  for (const row of rows) {
    const key = `${row.segment} ${row.type}`;
    tally[key] = (tally[key] || 0) + 1;
  }
  console.log(`${rows.length} lines on ${EXCHANGE}, last trade day ${marketDay}${fromCache ? " (cache)" : ""}`);
  console.log("by segment and type:", tally);
  console.log("left out:", counts);
  for (const line of dropped.filter((text) => /suspended/.test(text))) console.log("  ", line);
}
