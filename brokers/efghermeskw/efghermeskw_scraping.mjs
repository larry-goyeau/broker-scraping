// What EFG Hermes IFA Financial Brokerage (Kuwait) sells in shares, with no
// login. The Kuwait company of the EFG Hermes group deals on Boursa Kuwait
// alone. Its home page carries a stock picker ("Choose the stock") whose
// list is every security of its book, grouped by sector, each as the
// Boursa Kuwait code and the broker's symbol ("101 - NBK"). The page opens
// in Arabic; the English button is a postback that prints the same list
// with Latin symbols. That list is the book.
//
// The picker still holds codes that no longer trade (on 2026-10-21: ITHMR,
// MASSALEH, TAAMEER, REMAL, HCC, SALBOOKH, EDU, ALAFCO, SULTAN, CABLETV,
// JIYAD, DANAH, MASAKEN, DALQAN RE; none of them is in Boursa Kuwait's
// market-capitalisation list of listed companies of October 2026, the daily
// PDF that Al Sharq posts, see brokers/sharq), and it prints no name and no
// ISIN. A symbol is kept when the shared list (stocks.csv, KSE) names it with
// a single ISIN, which also gives the name and the ISIN, or when the page's
// price ticker quotes it today. ALIASES are the picker spellings that differ
// from Boursa's ticker (GBKK.KW is GBK, KFIN is KFH…), matched on the Boursa
// code in that market-capitalisation list. CROSS is a cross-listing that
// trades in Kuwait under its home ISIN, which stocks.csv files only under
// its home exchange (Bahrain Kuwait Insurance, BKIKWT, is BAHRAIN:BKIC).
// Anything else is reported and left out; more than MAX_DROPPED of them
// stops the run. Baitak REIT (code 3001, "MUTUAL FUNDS") is a real estate
// fund and is not written. Boursa Kuwait lists no ETF.
//
//   https://www.efghermesifa.com/Default.aspx
//     (postback ctl00$EnglishButton, then the ctl00$radcbStock list)
//
//   node brokers/efghermeskw/efghermeskw_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const PAGE = "https://www.efghermesifa.com/Default.aspx";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const EXCHANGE = "Boursa Kuwait";
const MIC = "XKUW";
const FLOOR = { picker: 140, book: 125 };
const MAX_DROPPED = 20;
const MUST = ["NBK", "KFH", "ZAIN", "MABANEE", "BOUBYAN"];
const FUNDS = new Set(["BAITAKREIT"]);
// Picker symbol → Boursa Kuwait ticker, matched on the Boursa code.
const ALIASES = {
  "GBKK.KW": "GBK", // 102 Gulf Bank
  KFIN: "KFH", // 108 Kuwait Finance House
  KPRO: "KPROJ", // 205 Kuwait Projects Co.
  "KREK.KW": "KRE", // 401 Kuwait Real Estate Co.
  UREK: "URC", // 402 United Real Estate Co.
  CABL: "CABLE", // 505 Gulf Cable & Electrical Industries
};
// Kuwait ticker → its stocks.csv line on the home exchange.
const CROSS = { BKIKWT: "BAHRAIN:BKIC" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cookies = new Map();

async function request(url, init = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        redirect: "follow",
        headers: {
          "User-Agent": UA,
          Referer: PAGE,
          ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") } : {}),
          ...(init.headers || {}),
        },
        signal: AbortSignal.timeout(60_000),
      });
      for (const line of response.headers.getSetCookie?.() || []) {
        const [pair] = line.split(";");
        const at = pair.indexOf("=");
        if (at > 0) cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
      }
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

const decode = (text) =>
  String(text ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const clean = (value) => decode(String(value ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const key = (symbol) => String(symbol || "").toUpperCase().replace(/\.KW$/, "").replace(/[^A-Z0-9]/g, "");

function hiddenFields(html) {
  const fields = new URLSearchParams();
  for (const [, name, value] of html.matchAll(/<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"/g)) {
    fields.set(name, decode(value));
  }
  if (!fields.has("__VIEWSTATE")) throw new Error("the home page has no view state");
  return fields;
}

function picker(html) {
  const start = html.indexOf('id="ctl00_radcbStock_DropDown"');
  if (start < 0) throw new Error("the stock picker is gone");
  const list = html.slice(start, html.indexOf("</ul>", start));
  const lines = [];
  let sector = "";
  for (const [, inner] of list.matchAll(/<li class="[^"]*"[^>]*>([\s\S]*?)<\/li>/g)) {
    const text = clean(inner);
    if (!text) continue;
    const title = text.match(/^-+\s*(.*?)\s*-+$/);
    if (title) {
      sector = title[1];
      continue;
    }
    const item = text.match(/^(\d{3,5})\s*-\s*(.+)$/);
    if (!item) throw new Error(`unreadable picker item: ${text}`);
    lines.push({ code: item[1], symbol: item[2].trim(), sector });
  }
  return lines;
}

// "-- Banks -- NBK 824.0 ▲1.00 …": the marquee of the selected sector
// ("All Sectors" on load), one <span><span>ticker</span> <span>price</span>.
function quoted(html) {
  const start = html.indexOf('id="PriceTickerMarquee"');
  const body = html.slice(start, html.indexOf("</marquee>", start));
  return new Set([...body.matchAll(/<span><span>([^<]+)<\/span>&nbsp;<span>[\d.,]+<\/span>/g)].map(([, symbol]) => key(decode(symbol))));
}

function kseList() {
  const found = new Map();
  const cross = new Map(Object.entries(CROSS).map(([ticker, home]) => [home, ticker]));
  for (const line of fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z]+:[^,]+),[^,]+,([A-Z]{2}[A-Z0-9]{9}\d),(.*)$/);
    if (!match) continue;
    const ticker = match[1].startsWith("KSE:") ? match[1].slice(4).trim().toUpperCase() : cross.get(match[1]);
    if (!ticker) continue;
    if (!found.has(ticker)) found.set(ticker, []);
    found.get(ticker).push({ isin: match[2], name: match[3].replace(/^"|"$/g, "").trim() });
  }
  return found;
}

const arabic = await request(PAGE);
const form = hiddenFields(arabic);
form.set("__EVENTTARGET", "ctl00$EnglishButton");
form.set("__EVENTARGUMENT", "");
await sleep(600);
const english = await request(PAGE, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form.toString(),
});
if (!english.includes(">101 - NBK<")) throw new Error("the English postback did not switch the page");

const lines = picker(english);
if (lines.length < FLOOR.picker) throw new Error(`the stock picker lists only ${lines.length} securities`);
const today = quoted(english);
const kse = kseList();

const rows = [];
const dropped = [];
const leftOut = new Map();
const seen = new Set();
for (const line of lines) {
  const ticker = ALIASES[line.symbol] || key(line.symbol);
  if (FUNDS.has(ticker)) {
    leftOut.set("real estate fund", (leftOut.get("real estate fund") || 0) + 1);
    continue;
  }
  if (seen.has(ticker)) throw new Error(`${ticker} repeats in the picker`);
  seen.add(ticker);
  const known = kse.get(ticker);
  const hit = known?.length === 1 ? known[0] : null;
  if (!hit && !today.has(ticker)) {
    dropped.push(`${line.code} ${line.symbol}`);
    continue;
  }
  rows.push({
    query: hit?.isin || ticker,
    ticker,
    name: hit?.name || ticker,
    exchange: EXCHANGE,
    mic: MIC,
    currency: "KWD",
    type: "STOCK",
    ...(hit ? { isin: hit.isin } : {}),
    raw: [line.code, line.symbol, line.sector, EXCHANGE].join(" | "),
  });
}
if (dropped.length > MAX_DROPPED) throw new Error(`${dropped.length} picker symbols match nothing: ${dropped.join(", ")}`);
if (rows.length < FLOOR.book) throw new Error(`only ${rows.length} Boursa Kuwait shares`);
for (const ticker of MUST) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("efghermeskw-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));
const withIsin = stamped.filter((row) => row.isin).length;
const skipped = [...leftOut].map(([label, value]) => `${value} ${label}`).join(", ");
console.error(
  `${stamped.length} listings: ${EXCHANGE} STOCK ${stamped.length} (picker ${lines.length}, ${today.size} quoted in the ticker); ` +
    `${withIsin} ISINs. Left out: ${skipped || "none"}; not listed any more (${dropped.length}): ${dropped.join(", ") || "none"}.`
);
