// Taishin Bank publishes the shelf without a login. Shares are one
// JSON list. A row is sold only when V11 is Y, which is the live buy
// button on the result page. ETFs are the same search, one issuer at
// a time: the search with no issuer returns an error, and the issuer
// pages add up to the count. A row is sold only when the buy link is
// live. The amount-redemption twin of the same ETF has no button and
// stays out. 00416A.TW makes every page that lists it fail, so that
// code is left out. The quote itself is not stored. None of these pages
// prints an ISIN. One is filled from the shared lists when a single
// code on the allowed places matches. Several matches stay blank.
//
// The other-securities page prints a bank code and no exchange code.
// It stays out.
//
//   https://taishinbankrwd.moneydj.com/w/Json/StockListJsonTaishinBank.djjson?searchType=A
//   https://taishinbankrwd.moneydj.com/ETFWeb/HTML/ETFSearch.htm

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";

const HOST = "https://taishinbankrwd.moneydj.com";
const STOCKS = `${HOST}/w/Json/StockListJsonTaishinBank.djjson?searchType=A`;
const MENU = `${HOST}/etfdata/query/option/djjson/etflistJson.djjson?p1=taishinbank`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "taishin-parsed.json");
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];
const decoder = new TextDecoder("big5");

function textOf(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shownName(name) {
  const professional = /限專業投資人|限專投/.test(name);
  const clean = name
    .replace(/\s*[（(]\s*限專業投資人\s*[)）]\s*/g, " ")
    .replace(/\s*[（(]\s*限專投\s*[)）]\s*/g, " ")
    .replace(/限專業投資人|限專投/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { name: clean, professional };
}

function tickerOf(printed) {
  return String(printed || "").trim().toUpperCase().replaceAll("/", ".");
}

async function page(url) {
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Referer: `${HOST}/ETFWeb/HTML/ETFSearch.htm` },
      });
      if (!response.ok) throw new Error(`${url} -> ${response.status}`);
      return decoder.decode(await response.arrayBuffer());
    } catch (error) {
      last = error.message || String(error);
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw new Error(last);
}

function jsonOf(text, url) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${url} is not JSON (${error.message})`);
  }
}

function shareOf(row) {
  const printed = String(row.V2 || "");
  const cut = printed.lastIndexOf("-");
  const code = tickerOf(printed.slice(0, cut));
  const market = printed.slice(cut + 1);
  const shown = shownName(textOf(row.V4));
  const flag = String(row.V11 || "");
  if (flag !== "Y" && flag !== "N") throw new Error(`${printed} has no buy flag`);
  let ticker = "";
  let exchange = "";
  let currency = "";
  if (market === "us") {
    ticker = code;
    exchange = "US";
    if (row.V6 !== "USD") throw new Error(`${printed} is quoted ${row.V6 || "nothing"} on US`);
    currency = "USD";
  } else if (market === "hk") {
    if (!code.endsWith(".HK")) throw new Error(`${printed} is not a Hong Kong code`);
    ticker = code.slice(0, -3);
    exchange = "Hong Kong";
    if (row.V6 !== "HK") throw new Error(`${printed} is quoted ${row.V6 || "nothing"} on Hong Kong`);
    currency = "HKD";
  } else if (market === "sh" || market === "sz") {
    const prefix = market === "sh" ? "SH" : "SZ";
    if (!new RegExp(`^${prefix}\\d{6}$`).test(code)) throw new Error(`${printed} is not a ${market} code`);
    ticker = code.slice(2);
    exchange = market === "sh" ? "Shanghai" : "Shenzhen";
    // The result page prints RMB. The JSON leaves the cell blank.
    if (row.V6) throw new Error(`${printed} is quoted ${row.V6}`);
    currency = "CNY";
  } else {
    throw new Error(`${printed} names no market`);
  }
  if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(ticker) || !shown.name) throw new Error(`unreadable share ${printed}`);
  return {
    ticker,
    name: shown.name,
    exchange,
    currency,
    type: listingType(shown.name, "STOCK"),
    professional: shown.professional,
    buy: flag === "Y",
  };
}

function listingType(name, fallback) {
  const label = String(name || "");
  if (/(?<![A-Za-z])ETN(?![A-Za-z])/i.test(label)) return "ETN";
  if (/(?<![A-Za-z])ETC(?![A-Za-z])/i.test(label)) return "ETC";
  if (/(?<![A-Za-z])ETF(?![A-Za-z])/i.test(label)) return "ETF";
  return fallback;
}

function coinOf(printed, exchange) {
  const label = textOf(printed);
  if (label === "USD" || label === "美元") return "USD";
  if (label === "HK" || label === "港幣") return "HKD";
  if (label === "台幣") return "TWD";
  if (label === "RMB" || label === "人民幣") {
    if (exchange === "Hong Kong") return "CNH";
    if (exchange === "Shanghai" || exchange === "Shenzhen") return "CNY";
  }
  throw new Error(`${exchange} prints ${label || "no currency"}`);
}

function placeOf(code, currency) {
  const printed = tickerOf(code);
  if (printed.endsWith(".HK")) return { ticker: printed.slice(0, -3), exchange: "Hong Kong" };
  if (printed.endsWith(".TWO")) return { ticker: printed.slice(0, -4), exchange: "TPEX" };
  if (printed.endsWith(".TW")) return { ticker: printed.slice(0, -3), exchange: "TWSE" };
  if (/^SH\d{6}$/.test(printed)) return { ticker: printed.slice(2), exchange: "Shanghai" };
  if (/^SZ\d{6}$/.test(printed)) return { ticker: printed.slice(2), exchange: "Shenzhen" };
  if (/^[A-Z0-9][A-Z0-9.-]*$/.test(printed) && (currency === "美元" || currency === "USD")) {
    return { ticker: printed, exchange: "US" };
  }
  throw new Error(`${code} ${currency} names no market`);
}

function fundsOf(html) {
  const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || "";
  const rows = [];
  for (const tr of body.match(/<tr>[\s\S]*?<\/tr>/gi) || []) {
    const link = tr.match(/ChangeBaseETFURL\('([^']+)'\);?">([^<]*)/);
    const cells = tr.split(/<td\b[^>]*>/i).slice(1).map((part) => textOf(part.split(/<\/td>/i)[0]));
    if (!link && cells.every((cell) => !cell)) continue;
    if (!link || cells.length < 5) throw new Error(`unreadable fund row ${textOf(tr).slice(0, 80)}`);
    const [linked, bank] = link[1].split("~");
    if (tickerOf(cells[3]) !== tickerOf(linked) || cells[2] !== bank) {
      throw new Error(`${cells[3]} does not match ${link[1]}`);
    }
    const place = placeOf(cells[3], cells[4]);
    const shown = shownName(textOf(link[2]));
    if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(place.ticker) || !shown.name) {
      throw new Error(`unreadable fund ${cells[3]}`);
    }
    rows.push({
      ticker: place.ticker,
      name: shown.name,
      exchange: place.exchange,
      currency: coinOf(cells[4], place.exchange),
      type: listingType(shown.name, "ETF"),
      professional: shown.professional,
      buy: /Gen_ProductBuy\(/.test(tr),
      bid: cells[2],
    });
  }
  return rows;
}

async function fundUnread(child) {
  const text = await page(`${HOST}/ETFData/djjson/et011001json.djjson?a=${encodeURIComponent(child.sid)}`);
  const record = jsonOf(text, child.sid)?.ResultSet?.Result;
  const row = Array.isArray(record) ? record[0] : record;
  const label = textOf(row?.V14);
  const place = placeOf(child.sid, label);
  const shown = shownName(textOf(child.name || row?.V2));
  if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(place.ticker) || !shown.name) {
    throw new Error(`unreadable fund ${child.sid}`);
  }
  return {
    ticker: place.ticker,
    name: shown.name,
    exchange: place.exchange,
    currency: coinOf(label, place.exchange),
    type: listingType(shown.name, "ETF"),
    professional: shown.professional,
    buy: false,
    bid: String(child.bid || ""),
  };
}

async function fundsFromPages(issuer, sid = "") {
  const rows = [];
  const query = sid ? `&sstr=${encodeURIComponent(sid)}` : "";
  for (let number = 1; number <= 40; number += 1) {
    const html = await page(
      `${HOST}/ETFWeb/html/ETFSearch.djhtm?B=${issuer}&C=0&E=0&interestEtf=false${query}&Page=${number}`,
    );
    const batch = fundsOf(html);
    if (!batch.length) break;
    rows.push(...batch);
  }
  return rows;
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
  if (row.exchange === "TWSE" || row.exchange === "TPEX") return ["TWSE", "TPEX"];
  if (row.exchange === "Shanghai") return ["XSHG"];
  if (row.exchange === "Shenzhen") return ["XSHE"];
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

const stockText = await page(STOCKS);
const stockJson = jsonOf(stockText, STOCKS);
const stockRows = stockJson?.ResultSet?.Result;
const stockCount = Number(stockJson?.ResultSet?.DataLength);
if (!Array.isArray(stockRows) || stockRows.length !== stockCount) {
  throw new Error(`the share list printed ${stockRows?.length} of ${stockCount}`);
}
const shares = stockRows.map(shareOf);

const menuText = await page(MENU);
const menu = jsonOf(menuText, MENU);
const groups = menu?.ResultSet?.Result || [];
const menuCount = groups.reduce((sum, group) => sum + (group.child?.length || 0), 0);
if (!groups.length || menuCount !== Number(menu?.ResultSet?.DataLength)) {
  throw new Error(`the ETF menu printed ${menuCount} of ${menu?.ResultSet?.DataLength}`);
}
const funds = [];
for (const group of groups) {
  const children = group.child || [];
  if (!children.length) throw new Error(`${group.name} printed no fund`);
  let pages;
  try {
    pages = await fundsFromPages(group.cid);
  } catch (error) {
    if (!String(error.message).includes("-> 500")) throw error;
    // The whole issuer page fails. One code at a time still prints the row.
    pages = [];
    for (const child of children) {
      try {
        const found = (await fundsFromPages(group.cid, child.sid)).filter((row) => row.bid === String(child.bid));
        if (found.length !== 1) throw new Error(`${group.name} ${child.sid} printed ${found.length} rows`);
        pages.push(found[0]);
      } catch (inner) {
        if (!String(inner.message).includes("-> 500")) throw inner;
        // A page that contains this code fails, so no buy link can be read.
        console.error(`${child.sid} list page failed, left out`);
        pages.push(await fundUnread(child));
      }
    }
  }
  if (pages.length !== children.length) {
    throw new Error(`${group.name} printed ${pages.length} of ${children.length}`);
  }
  const byBid = new Map(pages.map((row) => [row.bid, row]));
  for (const child of children) {
    const bid = String(child.bid || "");
    const row = byBid.get(bid);
    if (!row) throw new Error(`${group.name} is missing ${bid}`);
    const place = placeOf(child.sid, row.currency === "USD" ? "美元" : row.currency);
    if (place.ticker !== row.ticker || place.exchange !== row.exchange) {
      throw new Error(`${bid} is ${row.ticker} on the page and ${child.sid} on the menu`);
    }
    funds.push(row);
  }
}

const rows = [];
const seen = new Set();
const shareLabel = { US: "shares on US", "Hong Kong": "shares on Hong Kong", Shanghai: "shares on Shanghai", Shenzhen: "shares on Shenzhen" };
for (const exchange of ["US", "Hong Kong", "Shanghai", "Shenzhen"]) {
  const batch = keepSold(shares.filter((row) => row.exchange === exchange), shareLabel[exchange]);
  for (const row of batch) pushRow(rows, seen, row);
}
for (const exchange of ["US", "Hong Kong", "TWSE", "TPEX", "Shanghai", "Shenzhen"]) {
  const batch = funds.filter((row) => row.exchange === exchange);
  if (!batch.length) continue;
  const sold = keepSold(batch, `funds on ${exchange === "US" ? "US" : exchange}`);
  for (const row of sold) pushRow(rows, seen, row);
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
