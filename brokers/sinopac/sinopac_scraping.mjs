// Bank SinoPac publishes the foreign shelf without a login. US shares
// and US ETFs are the advanced filter, every category the form prints.
// Hong Kong ETFs are the Hong Kong quote page. A row is sold only when
// the buy link is live. A disabled button stays out. The page names the
// United States, not the venue inside it, so that row stays "US". A renminbi quote is
// stored as CNH. The quote itself is not stored. None of these pages
// prints an ISIN. One is filled from the shared lists when a single
// code on the allowed places matches. Several matches stay blank.
//
//   https://mma.sinopac.com/StockAndETF/AdvancedFilter
//   https://mma.sinopac.com/StockAndETF/IndexHK

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";

const ORIGIN = "https://mma.sinopac.com";
const FILTER = `${ORIGIN}/StockAndETF/AdvancedFilter`;
const RESULT = `${ORIGIN}/StockAndETF/AdvSearchResult`;
const HONG_KONG = `${ORIGIN}/StockAndETF/IndexHK`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "sinopac-parsed.json");
const PAGE = 50;
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];
const COIN = { "price-usd": "USD", "price-hkd": "HKD", "price-cny": "CNH" };

const jar = new Map();

function textOf(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function cookieHeader() {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

function storeCookies(response) {
  const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const line of lines) {
    const pair = line.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

async function request(url, body) {
  let current = url;
  let method = body ? "POST" : "GET";
  let payload = body ? body.toString() : undefined;
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      for (let hop = 0; hop < 5; hop += 1) {
        const response = await fetch(current, {
          method,
          redirect: "manual",
          headers: {
            "User-Agent": "Mozilla/5.0",
            Cookie: cookieHeader(),
            Referer: FILTER,
            ...(payload ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          },
          body: payload,
        });
        storeCookies(response);
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) throw new Error(`${current} redirected without a location`);
          current = new URL(location, current).href;
          method = "GET";
          payload = undefined;
          continue;
        }
        if (!response.ok) throw new Error(`${current} -> ${response.status}`);
        return await response.text();
      }
      throw new Error(`${url} redirected too many times`);
    } catch (error) {
      last = error.message || String(error);
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw new Error(last);
}

function tokenOf(html) {
  const token = html.match(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/)?.[1];
  if (!token) throw new Error("the page printed no verification token");
  return token;
}

function valuesOf(html, inputName) {
  const values = [];
  for (const tag of html.match(/<input\b[^>]*>/gi) || []) {
    const name = tag.match(/\bname="([^"]+)"/)?.[1];
    const value = tag.match(/\bvalue="([^"]+)"/)?.[1];
    if (name === inputName && value && value !== "all") values.push(value);
  }
  if (!values.length) throw new Error(`the filter printed no ${inputName}`);
  return values;
}

function totalOf(html) {
  const total = Number(html.match(/共(\d+)筆/)?.[1]);
  if (!Number.isInteger(total) || total < 1) throw new Error("the result page printed no row count");
  return total;
}

function listingType(name, fallback) {
  const label = String(name || "");
  if (/(?<![A-Za-z])ETN(?![A-Za-z])/i.test(label)) return "ETN";
  if (/(?<![A-Za-z])ETC(?![A-Za-z])/i.test(label)) return "ETC";
  if (/(?<![A-Za-z])ETF(?![A-Za-z])/i.test(label)) return "ETF";
  return fallback;
}

function shownName(name) {
  const professional = /限專投/.test(name);
  const clean = name.replace(/\s*[(（]\s*限專投\s*[)）]\s*/g, " ").replace(/限專投/g, " ").replace(/\s+/g, " ").trim();
  return { name: clean, professional };
}

function tickerOf(printed) {
  return String(printed || "").trim().toUpperCase().replaceAll("/", ".");
}

function itemsOf(html, fallback) {
  const rows = [];
  for (const item of html.match(/<li class="resultlist__item"[\s\S]*?<\/li>/gi) || []) {
    const area = item.match(/\barea="([^"]+)"/)?.[1];
    const sid = tickerOf(item.match(/\bsId="([^"]+)"/)?.[1]);
    const coin = COIN[item.match(/\b(price-usd|price-hkd|price-cny)\b/)?.[1]];
    const shown = shownName(textOf(item.match(/stock-head__heading">([\s\S]*?)<\/h1>/)?.[1] || ""));
    if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(sid) || !shown.name || !coin) {
      throw new Error(`unreadable row ${sid || textOf(item).slice(0, 80)}`);
    }
    const exchange = area === "US" ? "US" : area === "HK" ? "Hong Kong" : "";
    if (!exchange) throw new Error(`${sid} names no market`);
    if (exchange === "US" && coin !== "USD") throw new Error(`${sid} is quoted ${coin} on US`);
    if (exchange === "Hong Kong" && coin === "USD") throw new Error(`${sid} is quoted USD on Hong Kong`);
    const href = item.match(/href="StockBuy\?area=([^"&]+)&amp;symbol=([^"]+)"/);
    if (href && (tickerOf(href[2]) !== sid || href[1].toUpperCase() !== area)) {
      throw new Error(`${sid} buy link does not match the row`);
    }
    const buy = Boolean(href);
    rows.push({
      ticker: sid,
      name: shown.name,
      exchange,
      currency: coin,
      type: listingType(shown.name, fallback),
      professional: shown.professional,
      buy,
    });
  }
  return rows;
}

async function collect(firstHtml, fallback) {
  const total = totalOf(firstHtml);
  const rows = [];
  let html = firstHtml;
  const pages = Math.ceil(total / PAGE);
  for (let page = 1; page <= pages; page += 1) {
    const token = tokenOf(html);
    html = await request(RESULT, new URLSearchParams({
      __RequestVerificationToken: token,
      rows: String(PAGE),
      currentPage: String(page),
      sortCol: "",
      sortDir: "",
    }));
    if (totalOf(html) !== total) throw new Error(`page ${page} says ${totalOf(html)} rows, the shelf says ${total}`);
    const batch = itemsOf(html, fallback);
    const expect = Math.min(PAGE, total - rows.length);
    if (batch.length !== expect) throw new Error(`page ${page} printed ${batch.length} of ${expect}`);
    rows.push(...batch);
  }
  if (rows.length !== total) throw new Error(`collected ${rows.length} of ${total}`);
  return rows;
}

async function search(kind, fields, fallback) {
  const filterHtml = await request(FILTER);
  const params = new URLSearchParams({ __RequestVerificationToken: tokenOf(filterHtml), kind });
  for (const [key, value] of Object.entries(fields)) params.set(key, value);
  const html = await request(FILTER, params);
  if (!/共\d+筆/.test(html)) throw new Error(`${kind} search did not open the result`);
  return collect(html, fallback);
}

function loadIsinIndex() {
  const index = new Map();
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  for (const file of ["stocks.csv", "etfs.csv"]) {
    const lines = readFileSync(join(root, "assets", file), "utf8").split(/\r?\n/).filter(Boolean);
    const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
    if (header[0] !== "ticker" || header[1] !== "exchange" || header[2] !== "isin") {
      throw new Error(`${file} header is ${header.join(",")}`);
    }
    for (const line of lines.slice(1)) {
      const cells = [];
      let field = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
          if (char === '"') {
            if (line[i + 1] === '"') {
              field += '"';
              i += 1;
            } else quoted = false;
          } else field += char;
        } else if (char === '"') quoted = true;
        else if (char === ",") {
          cells.push(field);
          field = "";
        } else field += char;
      }
      cells.push(field);
      const code = String(cells[0] || "").trim().toUpperCase().split(":").pop();
      const exchange = String(cells[1] || "").trim().toUpperCase();
      const isin = String(cells[2] || "").trim().toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(exchange)) book.set(exchange, new Set());
      book.get(exchange).add(isin);
    }
  }
  return index;
}

function codesOf(row) {
  if (row.exchange !== "Hong Kong") return [row.ticker];
  const digits = row.ticker.replace(/^0+/, "") || "0";
  return [...new Set([row.ticker, digits, digits.padStart(4, "0"), digits.padStart(5, "0")])];
}

function placesOf(row) {
  if (row.exchange === "US") return US_PLACES;
  if (row.exchange === "Hong Kong") return ["HKEX"];
  return [];
}

function attachIsins(rows, index) {
  let one = 0;
  let none = 0;
  let several = 0;
  for (const row of rows) {
    const groups = new Map();
    for (const code of codesOf(row)) {
      const book = index.get(code);
      for (const place of placesOf(row)) {
        const ids = book?.get(place);
        if (!ids?.size) continue;
        if (!groups.has(place)) groups.set(place, new Set());
        for (const isin of ids) groups.get(place).add(isin);
      }
    }
    const found = new Set();
    for (const ids of groups.values()) for (const isin of ids) found.add(isin);
    if (found.size === 1) {
      row.isin = [...found][0];
      one += 1;
    } else if (found.size === 0) none += 1;
    else {
      several += 1;
      stampIsinMatches(row, groups, row.ticker);
    }
  }
  return { one, none, several };
}

function pushRow(rows, seen, row) {
  const key = `${row.exchange}|${row.ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  rows.push({
    query: row.ticker,
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange,
    currency: row.currency,
    type: row.type,
    isin: "",
    raw: [row.ticker, row.name, row.exchange, row.currency, row.type, row.professional ? "professional" : ""]
      .filter(Boolean)
      .join(" "),
  });
}

function keepSold(batch, label) {
  const sold = batch.filter((row) => row.buy);
  const leftOut = batch.length - sold.length;
  const professional = sold.filter((row) => row.professional).length;
  if (!sold.length) throw new Error(`${label} published no buy row`);
  console.error(
    `${sold.length} ${label}${professional ? `, ${professional} professional` : ""}${leftOut ? `, ${leftOut} without a buy button` : ""}`,
  );
  return sold;
}

const filterHtml = await request(FILTER);
const stockCategories = valuesOf(filterHtml, "stock-pick").join(",");
const fundCategories = valuesOf(filterHtml, "etf-category-pick").join(",");

const rows = [];
const seen = new Set();

const shares = keepSold(await search("stock", { stockCategory: stockCategories }, "STOCK"), "shares on US");
for (const row of shares) {
  if (row.exchange !== "US") throw new Error(`${row.ticker} is not a US share`);
  pushRow(rows, seen, row);
}

const funds = keepSold(await search("etf", { etfCategory: fundCategories }, "ETF"), "funds on US");
for (const row of funds) {
  if (row.exchange !== "US") throw new Error(`${row.ticker} is on the US fund list`);
  pushRow(rows, seen, row);
}

const hongKong = itemsOf(await request(HONG_KONG), "ETF");
const hongKongSold = keepSold(hongKong, "funds on Hong Kong");
for (const row of hongKongSold) {
  if (row.exchange !== "Hong Kong") throw new Error(`${row.ticker} is on the Hong Kong fund list`);
  pushRow(rows, seen, row);
}

const tally = attachIsins(rows, loadIsinIndex());
const kept = stampRows(withoutObligations(rows));
kept.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});
writeFileSync(OUT, `${JSON.stringify(kept, null, 2)}\n`);
console.error(
  `${kept.length} listings, ${tally.one} with one ISIN, ${tally.several} with several, ${tally.none} with none`,
);
