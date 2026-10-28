// The Banja Luka Stock Exchange share book, for the brokers whose only
// place is Banjalučka berza (first: Raiffeisen CAPITAL a.d. Banja Luka).
// It is the whole exchange, as the owner wants for a single-place broker:
// every listed share line on the official market ("Službeno berzansko
// tržište") and the free market ("Slobodno tržište"), ordinary (R) and
// preference (P) classes, minus the lines that cannot trade.
//
// Source, the exchange's own pages (Latin-script Serbian):
//
//   https://www.blberza.com/Pages/SecurityList.aspx?tier=Shares
//     the share list; it pages by 20, and the page-size box set to "Sve"
//     (all, 10000) returns every line in one table: code, name, last
//     trade date, prices, segment.
//   https://www.blberza.com/Pages/SecurityList.aspx?tier=Funds
//     the fund list. It is empty today: the closed-end investment funds
//     became joint-stock companies and are in the share list. The exchange
//     lists no ETF, ETN or ETC. Bonds and treasury bills (tier=Bonds,
//     tier=MM) are left out as elsewhere.
//   https://www.blberza.com/Pages/SuspendedSecurities.aspx
//     the suspension list, in four reason groups chosen by a radio box:
//     closed bankruptcy or liquidation, Securities Commission (KHOV RS)
//     decision, change of legal form (to a d.o.o.), other reasons.
//   https://www.blberza.com/Pages/SecurityTrading.aspx?code=<CODE>
//     one line's page: ISIN, CFI, status, market, delisting date.
//
// Left out:
//   - every code in any of the four suspension groups;
//   - lines whose issuer name ends "- u stečaju" (in bankruptcy),
//     "- u likvidaciji" (in liquidation) or "- prelazak u d.o.o." (being
//     turned into a limited company, which ends the listing), though the
//     exchange still shows some of them in the share list;
//   - lines that never traded (no last trade date in the list);
//   - lines whose own page shows a delisting date, a status other than
//     "Trading", or no ISIN.
// Delisted lines (https://www.blberza.com/Pages/DelistedSecurities.aspx)
// are not in the share list, so nothing more is needed for them.
//
// Lines that last traded years ago stay: they are listed, not suspended,
// and a client can still place an order on them.
//
// Ticker: the exchange code (AERD-R-A: issuer, R ordinary or P preference,
// class letter), which is what the exchange, the brokers and the price
// list use. Exchange "Banja Luka Stock Exchange", MIC XBLB, currency BAM
// (the pages print KM, the convertible mark). Type STOCK for every line
// (CFI E...). The ISIN comes from each line's page, never from the
// shared lists (assets/stocks.csv carries no BA ISIN).
//
// The line pages (about 290 calls, one second apart) are kept in
// blse-cache.json next to this file for 12 hours, so brokers run back to
// back read the exchange once. The lists themselves are read every time.
//
//   import { blseBook } from "../raiffeisenba/blseBook.mjs";
//   const rows = await blseBook();             // or blseBook({ refresh: true })
//
//   node brokers/raiffeisenba/blseBook.mjs     (prints counts)

import fs from "node:fs";

const BASE = "https://www.blberza.com/Pages/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
export const EXCHANGE = "Banja Luka Stock Exchange";
export const MIC = "XBLB";
export const CURRENCY = "BAM";
const CACHE = new URL("blse-cache.json", import.meta.url);
const CACHE_HOURS = 12;
const ISIN = /^BA[A-Z0-9]{9}\d$/;
const CODE = /^[A-Z0-9]{2,8}-[A-Z]-[A-Z]$/;
const GONE = /-\s*(u stečaju|u likvidaciji|prelazak u d\.o\.o\.?)\s*$/i;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const decode = (s) =>
  String(s ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

async function request(url, init = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "user-agent": UA, ...(init.headers || {}) },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(last);
}

// An ASP.NET page: read it, then post it back with one control changed
// (the same as picking a value in the page's own box).
async function postBack(path, target, field, value) {
  const url = BASE + path;
  const first = await request(url);
  const cookie = (first.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  const html = await first.text();
  const form = new URLSearchParams();
  for (const [input] of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = input.match(/name="([^"]*)"/)?.[1];
    if (name) form.set(name, decode(input.match(/value="([^"]*)"/)?.[1] ?? ""));
  }
  form.set("__EVENTTARGET", target);
  form.set("__EVENTARGUMENT", "");
  form.set(field, value);
  await pause(1000);
  const response = await request(url, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  return { first: html, html: await response.text() };
}

const cells = (row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => decode(cell[1]));

function grid(html, id) {
  const start = html.indexOf(id);
  if (start < 0) return [];
  const end = html.indexOf("</table>", start);
  return [...html.slice(start, end).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) => cells(tr[1]));
}

// Every share line: { code, name, lastTrade, segment }.
export async function shareList() {
  const { html } = await postBack(
    "SecurityList.aspx?tier=Shares",
    "ctl00$ctl00$Content$MainContent$ddlSegmentPageSize",
    "ctl00$ctl00$Content$MainContent$ddlSegmentPageSize",
    "10000",
  );
  const lines = grid(html, "GridView1")
    .filter((row) => row.length >= 9 && CODE.test(row[0]))
    .map((row) => ({ code: row[0], name: row[1], lastTrade: row[2].replace(/\.$/, ""), segment: row[8] }));
  if (lines.length < 250) throw new Error(`BLSE share list gave ${lines.length} lines`);
  return lines;
}

// Every suspended code, across the four reason groups.
export async function suspendedCodes() {
  const field = "ctl00$ctl00$Content$MainContent$rblRazlozi";
  const page = await (await request(BASE + "SuspendedSecurities.aspx")).text();
  const groups = [...page.matchAll(/id="ctl00_ctl00_Content_MainContent_rblRazlozi_(\d+)"[^>]*value="([^"]*)"/g)];
  if (groups.length < 4) throw new Error(`BLSE suspension page shows ${groups.length} reason groups`);
  const codes = new Map();
  const read = (html, reason) => {
    for (const row of grid(html, "gvSuspendedSecurities")) {
      if (row.length >= 4 && CODE.test(row[0])) codes.set(row[0], `${row[2]} ${row[3]}`.trim() || reason);
    }
  };
  read(page, "group 0");
  for (const [, index, value] of groups.slice(1)) {
    await pause(1000);
    const { html } = await postBack("SuspendedSecurities.aspx", `${field}$${index}`, field, value);
    if (!html.includes(`value="${value}" checked`)) throw new Error(`BLSE suspension group ${index} did not open`);
    read(html, `group ${index}`);
  }
  return codes;
}

// One line's own page.
export async function linePage(code) {
  const html = await (await request(`${BASE}SecurityTrading.aspx?code=${encodeURIComponent(code)}`)).text();
  const text = decode(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<\/(td|div|span|p|li|dd|dt|th)>/g, " | "));
  const field = (label) => text.match(new RegExp(`${label}:?\\s*\\|\\s*([^|]*)\\|`))?.[1]?.trim() ?? "";
  return {
    isin: field("ISIN"),
    cfi: field("CFI"),
    status: field("Status"),
    market: field("Tržište"),
    delisted: field("Datum delistiranja"),
  };
}

function readCache() {
  try {
    const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - Date.parse(cache.at) < CACHE_HOURS * 3600_000) return cache.lines || {};
  } catch {}
  return {};
}

export async function blseBook({ refresh = false, log = () => {} } = {}) {
  const list = await shareList();
  await pause(1000);
  const suspended = await suspendedCodes();
  const dropped = { suspended: 0, bankruptOrLiquidation: 0, neverTraded: 0, page: [] };
  const candidates = list.filter((line) => {
    if (suspended.has(line.code)) return (dropped.suspended += 1), false;
    if (GONE.test(line.name)) return (dropped.bankruptOrLiquidation += 1), false;
    if (!/\d{1,2}\.\d{1,2}\.\d{4}/.test(line.lastTrade)) return (dropped.neverTraded += 1), false;
    return true;
  });

  const cache = refresh ? {} : readCache();
  const pages = {};
  let fetched = 0;
  for (const line of candidates) {
    if (cache[line.code]?.isin) {
      pages[line.code] = cache[line.code];
      continue;
    }
    if (fetched) await pause(1000);
    pages[line.code] = await linePage(line.code);
    fetched += 1;
    if (fetched % 50 === 0) log(`BLSE line pages: ${fetched}`);
  }
  if (fetched) fs.writeFileSync(CACHE, JSON.stringify({ at: new Date().toISOString(), lines: { ...cache, ...pages } }, null, 1));

  const rows = [];
  for (const line of candidates) {
    const page = pages[line.code];
    if (page.delisted || !/^trading$/i.test(page.status) || !ISIN.test(page.isin)) {
      dropped.page.push(`${line.code} (${page.status || "no status"}${page.delisted ? `, delisted ${page.delisted}` : ""}${ISIN.test(page.isin) ? "" : ", no ISIN"})`);
      continue;
    }
    rows.push({
      query: line.code,
      ticker: line.code,
      name: line.name,
      exchange: EXCHANGE,
      mic: MIC,
      currency: CURRENCY,
      type: "STOCK",
      isin: page.isin,
      raw: [line.code, line.name, page.isin, page.cfi, line.segment, `last trade ${line.lastTrade}`].join(" | "),
    });
  }
  log(`BLSE: ${list.length} share lines, ${dropped.suspended} suspended, ${dropped.bankruptOrLiquidation} in bankruptcy/liquidation/to d.o.o., ${dropped.neverTraded} never traded, ${dropped.page.length} dropped on their page${dropped.page.length ? `: ${dropped.page.join(", ")}` : ""}; ${rows.length} kept`);
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await blseBook({ refresh: process.argv.includes("--refresh"), log: console.log });
  const bySegment = {};
  for (const row of rows) {
    const segment = row.raw.split(" | ")[4];
    bySegment[segment] = (bySegment[segment] || 0) + 1;
  }
  console.log(rows.length, "rows", bySegment);
  console.log(rows.slice(0, 3));
}
