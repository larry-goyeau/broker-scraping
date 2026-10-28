// The Mongolian Stock Exchange share book, for the Mongolian brokers whose
// only place is the MSE (InvesCore Capital, Bulgan Broker). A member
// broker's client orders on the exchange's one order book, so the book is
// every share and ETF the MSE lists today, in tugriks.
//
// The exchange site (a Next.js front on a Laravel API) reads its data
// through one server action: a POST to https://mse.mn/ with a Next-Action
// header and the name of the API call. The action id changes when the site
// is rebuilt; when the kept id stops answering, it is read again from the
// site's scripts. The calls used:
//   allCompanies        the listed companies, "Name | SYMBOL" with the code
//                       (the list behind https://mse.mn/trade-history)
//   allFunds            the listed funds
//   menuContentData     the suspended securities page
//                       (https://mse.mn/suspended-companies)
//   delistedCompanyList the delisted companies, as a check
//   tradeHistory / tradeHistoryFund   the trades, by window or by code
//
// ISINs: the MSE prints none. The Mongolian Central Securities Depository
// (MCSD) lists every public joint-stock company with its ISIN, its MSE
// code and "Нээлттэй" (open) as status, read from its GraphQL endpoint
// (category "Нээлттэй ХК", https://mcsd.mn/cat/4769f94b-5df3-4333-87bc-34b27d858b80/).
// Lines are matched on the code. The MCSD list does not carry the two ETFs
// nor the newest listings (in October 2026: LOT, MGLA, TGI); those rows keep
// an empty ISIN. A code that fails the ISIN check digit is not used.
//
// Kept: every listed company share (STOCK) and the two exchange-traded
// funds, Gold Trust ETF (ALTT) and Future Tech Innovation ETF (FTI), whose
// Mongolian names say "биржээр арилжаалагддаг хөрөнгө оруулалтын сан"
// (exchange-traded investment fund). Left out:
//   - suspended lines: the MSE page "Suspended securities" (one line,
//     BOR Bornuur, since 2009.06.06, in October 2026);
//   - delisted lines (a company also on the delisted list);
//   - never-traded lines: no trade in the exchange's history since 1990
//     (in October 2026: DUS Darkhan us suvag, EUD Erdenet us dulaan tugeekh
//     suljee, MTZ Mongolian railway, three state companies listed but
//     never traded);
//   - the closed-end funds Mandal Future Growth (MFG) and National
//     Privatization Fund (XOC): funds, not ETFs, as in the other scrapers;
//   - bonds, asset-backed securities and government securities, which are
//     other lists of the exchange.
// Lines idle for years but still listed and not suspended stay (some last
// traded before 2010); the row's raw text gives the last trade day.
//
// The exchange and depository reads (about 50 calls) are kept in
// mse-cache.json next to this file for 12 hours, so the two scrapers run
// back to back read the MSE once.
//
//   https://mse.mn/trade-history
//   https://mse.mn/suspended-companies
//   https://mcsd.mn/graphql   (get_contents, category bc2456d4-67ba-4255-9dd6-1c5a5ade0175)
//
//   node brokers/invescore/mseBook.mjs   (prints the counts)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

export const EXCHANGE = "Mongolian Stock Exchange";
const MIC = "XULA";
const CURRENCY = "MNT";
const MSE = "https://mse.mn";
const MCSD = "https://mcsd.mn/graphql";
const MCSD_PUBLIC = "bc2456d4-67ba-4255-9dd6-1c5a5ade0175";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CACHE = new URL("mse-cache.json", import.meta.url);
const CACHE_HOURS = 12;
const RECENT_DAYS = 120;
let actionId = "6d867ebd99fb6edef2f9537b22668cd0c00a71c2";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const day = (date) => date.toISOString().slice(0, 10);

async function fetchText(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "user-agent": UA, ...(options.headers || {}) }, signal: AbortSignal.timeout(60_000) });
  return { status: response.status, text: await response.text() };
}

// The server action answers in the React flight format: line "1:" holds
// the JSON the API returned.
function flightValue(text) {
  const line = text.split("\n").find((part) => part.startsWith("1:"));
  if (!line) return undefined;
  return JSON.parse(line.slice(2));
}

// The id of the fetch action, read from the scripts of the home page.
async function readActionId() {
  const home = await fetchText(`${MSE}/`);
  const scripts = [...new Set(home.text.match(/\/_next\/static\/chunks\/[^"']+\.js/g) || [])];
  for (const path of scripts) {
    await pause(200);
    const { text } = await fetchText(MSE + path);
    const hit = text.match(/\{lO:function\(\)\{return (\w+)\}\}[\s\S]{0,1500}?var \1=\(0,\w+\.\$\)\("([0-9a-f]{40})"\)/);
    if (hit) return hit[2];
  }
  throw new Error("the MSE fetch action was not found in the site's scripts");
}

async function call(url, parameter, retried = false) {
  await pause(500);
  const { status, text } = await fetchText(`${MSE}/`, {
    method: "POST",
    headers: { "next-action": actionId, accept: "text/x-component", "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify([{ url, parameter, config: { hasToken: false } }]),
  });
  let value;
  try {
    value = status === 200 ? flightValue(text) : undefined;
  } catch {
    value = undefined;
  }
  if (value === undefined) {
    if (retried) throw new Error(`MSE ${url}${parameter} answered ${status}`);
    actionId = await readActionId();
    return call(url, parameter, true);
  }
  return value;
}

const list = (value) => (Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : []);

// "Achit alkaby | NOG" -> { code, name, symbol }
function splitName(item) {
  const text = clean(item?.name);
  const at = text.lastIndexOf("|");
  return { code: Number(item?.id), name: clean(text.slice(0, at)), symbol: clean(text.slice(at + 1)).toUpperCase() };
}

// The symbols on the suspended securities page (English and Mongolian).
async function suspendedSymbols() {
  const symbols = new Set();
  for (const lang of ["en", "mn"]) {
    const menus = await call("menuData", `?lang=${lang}`);
    const flat = [];
    const walk = (items) => {
      for (const item of items || []) {
        flat.push(item);
        walk(item.children || item.child || item.sub || item.items);
      }
    };
    walk(Array.isArray(menus) ? menus : Object.values(menus || {}).flat());
    let menu = flat.find((item) => item?.url === "suspended-companies");
    if (!menu) {
      const raw = JSON.stringify(menus).match(/\{"id":(\d+),"parent_id":\d+,"lang":"\w+","name":"[^"]*","menu_type":\d,"url":"suspended-companies"/);
      if (raw) menu = { id: Number(raw[1]) };
    }
    if (!menu) throw new Error(`the MSE menu (${lang}) has no suspended-companies page`);
    const page = await call("menuContentData", `?lang=${lang}&menu_id=${menu.id}&url=suspended-companies`);
    const html = String(page?.content || "");
    if (!/<table/i.test(html)) throw new Error(`the MSE suspended page (${lang}) has no table`);
    for (const row of html.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
      const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map((cell) => clean(cell.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")));
      // №, symbol, name, date
      if (cells.length >= 3 && /^\d+$/.test(cells[0]) && /^[A-Z0-9]{2,6}$/.test(cells[1])) symbols.add(cells[1]);
    }
  }
  return symbols;
}

function isinValid(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) return false;
  const digits = [...isin.slice(0, 11)].map((ch) => parseInt(ch, 36)).join("");
  let sum = 0;
  [...digits].reverse().forEach((ch, i) => {
    let d = Number(ch);
    if (i % 2 === 0) d *= 2;
    sum += Math.floor(d / 10) + (d % 10);
  });
  return (10 - (sum % 10)) % 10 === Number(isin[11]);
}

// MSE code -> { isin, status } from the depository's list of public
// joint-stock companies (ISIN, ҮЦ код, name, issued, status).
async function depositoryIsins() {
  const query = `query { get_contents(category_id: "${MCSD_PUBLIC}", page: 1, limit: 2000) { count contents { title body } } }`;
  await pause(500);
  const { status, text } = await fetchText(MCSD, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) });
  if (status !== 200) throw new Error(`MCSD answered ${status}`);
  const result = JSON.parse(text)?.data?.get_contents;
  const contents = result?.contents || [];
  if (contents.length < 250 || contents.length < result.count) throw new Error(`MCSD listed ${contents.length} of ${result?.count} public companies`);
  const byCode = new Map();
  for (const item of contents) {
    const cells = (String(item.body || "").match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map((cell) => clean(cell.replace(/<[^>]+>/g, " ")));
    for (let i = 0; i + 4 < cells.length; i += 5) {
      const [isin, code, , , state] = cells.slice(i, i + 5);
      if (!/^\d+$/.test(code) || !isinValid(isin)) continue;
      byCode.set(Number(code), { isin, status: state, name: clean(item.title) });
    }
  }
  return byCode;
}

// Code -> last trade day (YYYY-MM-DD) or "" for a line with no trade.
async function lastTrades(kind, codes) {
  const today = new Date();
  const since = new Date(today.getTime() - RECENT_DAYS * 86400_000);
  const last = new Map(codes.map((code) => [code, ""]));
  const keep = (trades) => {
    for (const trade of list(trades)) {
      const code = Number(trade.code);
      if (last.has(code) && String(trade.dates) > last.get(code)) last.set(code, String(trade.dates));
    }
  };
  keep(await call(kind, `?id=&sdate=${day(since)}&edate=${day(today)}&lang=en`));
  for (const code of codes.filter((code) => !last.get(code))) {
    keep(await call(kind, `?id=${code}&sdate=1990-01-01&edate=${day(today)}&lang=en`));
  }
  return last;
}

function cached() {
  try {
    const kept = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - Date.parse(kept.fetchedAt) < CACHE_HOURS * 3600_000 && Array.isArray(kept.rows)) return kept;
  } catch {
    // no cache, or an unreadable one: read the exchange again
  }
  return null;
}

// Every MSE share and ETF open to trade, sorted by ticker.
// Returns { rows, left: { reason: [tickers] }, fetchedAt, fromCache }.
export async function mseBook({ fresh = false } = {}) {
  const kept = fresh ? null : cached();
  if (kept) return { rows: kept.rows, left: kept.left, fetchedAt: kept.fetchedAt, fromCache: true };

  const companies = list(await call("allCompanies", "?lang=en")).map(splitName);
  const native = new Map(list(await call("allCompanies", "?lang=mn")).map(splitName).map((line) => [line.code, line.name]));
  const funds = list(await call("allFunds", "?lang=en")).map(splitName);
  const delisted = new Set(list(await call("delistedCompanyList", "?lang=en")).map(splitName).map((line) => line.code));
  if (companies.length < 120) throw new Error(`the MSE listed ${companies.length} companies`);
  const suspended = await suspendedSymbols();
  const isins = await depositoryIsins();
  const etfs = funds.filter((fund) => /\bETF\b/i.test(fund.name));
  const shareTrades = await lastTrades("tradeHistory", companies.map((line) => line.code));
  const fundTrades = await lastTrades("tradeHistoryFund", etfs.map((line) => line.code));

  const left = { suspended: [], delisted: [], "never traded": [], "closed-end funds": funds.filter((fund) => !etfs.includes(fund)).map((fund) => fund.symbol) };
  const rows = [];
  const add = (line, type, lastTrade) => {
    if (suspended.has(line.symbol)) return left.suspended.push(line.symbol);
    if (delisted.has(line.code) && type === "STOCK") return left.delisted.push(line.symbol);
    if (!lastTrade) return left["never traded"].push(line.symbol);
    const isin = type === "STOCK" ? isins.get(line.code)?.isin || "" : "";
    rows.push({
      query: line.symbol,
      ticker: line.symbol,
      name: line.name,
      exchange: EXCHANGE,
      currency: CURRENCY,
      type,
      isin,
      mic: MIC,
      raw: [line.symbol, line.name, native.get(line.code), EXCHANGE, isin, `code ${line.code}`, `last trade ${lastTrade}`].filter(Boolean).join(" "),
    });
  };
  for (const line of companies) add(line, "STOCK", shareTrades.get(line.code));
  for (const line of etfs) add(line, "ETF", fundTrades.get(line.code));
  rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
  const fetchedAt = new Date().toISOString();
  fs.writeFileSync(CACHE, JSON.stringify({ fetchedAt, rows, left }));
  return { rows, left, fetchedAt, fromCache: false };
}

// Writes <folder>-parsed.json for one broker: the whole MSE book.
export async function writeMseCatalogue({ broker, out }) {
  const { rows, left, fromCache } = await mseBook();
  const stamped = stampRows(withoutObligations(rows.map((row) => ({ ...row }))));
  fs.writeFileSync(out, JSON.stringify(stamped, null, 2));
  const count = (type) => stamped.filter((row) => row.type === type).length;
  const leftOut = Object.entries(left).map(([reason, tickers]) => `${tickers.length} ${reason}${tickers.length ? ` (${tickers.join(" ")})` : ""}`).join(", ");
  const noIsin = stamped.filter((row) => !row.isin).map((row) => row.ticker);
  console.error(
    `${broker}: ${stamped.length} listings (${count("STOCK")} STOCK, ${count("ETF")} ETF) on ${EXCHANGE}` +
      `${fromCache ? " (MSE read from mse-cache.json)" : ""}; left out ${leftOut}; ${noIsin.length} without ISIN${noIsin.length ? ` (${noIsin.join(" ")})` : ""}`,
  );
  return stamped;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, left, fromCache } = await mseBook({ fresh: process.argv.includes("--fresh") });
  const byType = rows.reduce((acc, row) => ({ ...acc, [row.type]: (acc[row.type] || 0) + 1 }), {});
  console.log(JSON.stringify({ rows: rows.length, byType, withIsin: rows.filter((row) => row.isin).length, left, fromCache }, null, 2));
}
