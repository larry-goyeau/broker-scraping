// What Standard Chartered Taiwan sells on myStocks, with no login.
// The form also lists Japan, London and Europe. Those orders are by
// phone or at a branch, so they stay out. The kept shelves are the
// United States and Hong Kong. There is no Taiwan board. Every row
// on a kept shelf is sold: the page prints no buy flag and no date.
//
// The code is a Bloomberg symbol. "US" does not name the exchange
// inside the United States, so that row stays "US". UW is Nasdaq,
// UN is the NYSE and UP is NYSE Arca. "Pfd" is a preferred on the
// US shelf, not a venue. Hong Kong comes from the suffix. One Hong Kong code is printed
// without a space ("330HK"). A trailing *** is the page's footnote
// that the line takes orders only from 09:00 to 18:00, so it is not
// part of the name. The same Bloomberg code is sometimes printed
// twice, under two internal codes; one line is kept, and a line
// without that footnote wins over a line that has it. When the two
// names differ, the later internal code is kept. A "Pfd" line
// whose name does not say it is a preferred share is a note, and
// it stays out. The page
// prints no ISIN. One is filled from the shared lists when a single
// code on the allowed places matches. Several matches stay blank.
//
//   https://service.standardchartered.com.tw/investment/stock/index.aspx
//
//   node brokers/standardchartered/standardchartered_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const PAGE = "https://service.standardchartered.com.tw/investment/stock/index.aspx";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const SHELVES = [
  ["EQ", "US"],
  ["EQ", "HK"],
  ["ETF", "US"],
  ["ETF", "HK"],
];
const BOOK = {
  US: "US",
  UW: "NASDAQ",
  UN: "NYSE",
  UP: "ARCA",
  Pfd: "US",
  HK: "Hong Kong",
  JP: "Tokyo",
  JT: "Tokyo",
  LN: "London",
  GY: "Xetra",
  GR: "Frankfurt",
  FP: "Paris",
};
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];
const JP_PLACES = ["TSE", "NAG"];

const jar = new Map();

function storeCookies(response) {
  const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const line of lines) {
    const pair = line.split(";")[0];
    const cut = pair.indexOf("=");
    if (cut > 0) jar.set(pair.slice(0, cut).trim(), pair.slice(cut + 1).trim());
  }
}

function cookieHeader() {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function ask(url, init) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": UA,
          ...(jar.size ? { Cookie: cookieHeader() } : {}),
          ...(init?.headers || {}),
        },
        signal: AbortSignal.timeout(120_000),
      });
      storeCookies(response);
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function hidden(html, name) {
  const match =
    html.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`)) ||
    html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`));
  return match ? decode(match[1]) : "";
}

function fieldsOf(body) {
  if (body.includes('id="__VIEWSTATE"')) {
    return {
      __VIEWSTATE: hidden(body, "__VIEWSTATE"),
      __VIEWSTATEGENERATOR: hidden(body, "__VIEWSTATEGENERATOR"),
      __EVENTVALIDATION: hidden(body, "__EVENTVALIDATION"),
    };
  }
  const fields = {};
  for (const match of body.matchAll(/\|(\d+)\|hiddenField\|(__\w+)\|/g)) {
    const length = Number(match[1]);
    fields[match[2]] = body.slice(match.index + match[0].length, match.index + match[0].length + length);
  }
  if (!fields.__VIEWSTATE) throw new Error("the form returned no view state");
  return fields;
}

function decode(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, digits) => String.fromCharCode(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function post(state, target, product, exchange) {
  const body = new URLSearchParams({
    ScriptManager1: `UpdatePanel|${target}`,
    __EVENTTARGET: target,
    __EVENTARGUMENT: "",
    __VIEWSTATE: state.__VIEWSTATE,
    __VIEWSTATEGENERATOR: state.__VIEWSTATEGENERATOR,
    __EVENTVALIDATION: state.__EVENTVALIDATION,
    txtSearchStockNameOrCode: "",
    ddlProductType: product,
    ddlExchange: exchange,
    ddlCurrency: "",
    __ASYNCPOST: "true",
  });
  const html = await ask(PAGE, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "X-MicrosoftAjax": "Delta=true",
      Referer: PAGE,
    },
    body,
  });
  if (html.startsWith("0|error|")) throw new Error(`${product} ${exchange} ${target} failed`);
  return { html, state: fieldsOf(html) };
}

function listed(html) {
  const count = html.match(/id="lbTotalCount">([^<]*)</);
  const total = Number(decode(count?.[1] || ""));
  if (!Number.isInteger(total) || total < 1) throw new Error("the form printed no row count");
  const rows = [];
  for (const block of html.split('class="c-overview__row"').slice(1)) {
    const head = block.match(/c-overview__item--pressM[^>]*>([^<]*)</);
    const name = block.match(/c-overview__item--full[^>]*>([^<]*)</);
    const code = block.match(/data-tit="商品代碼">([^<]*)</);
    const coin = block.match(/data-tit="幣別">([^<]*)</);
    const bloomberg = decode(head?.[1] || "");
    if (!bloomberg) throw new Error("a row has no Bloomberg code");
    rows.push({
      bloomberg,
      name: decode(name?.[1] || ""),
      code: decode(code?.[1] || ""),
      currency: decode(coin?.[1] || "").toUpperCase(),
    });
  }
  const next = html.match(/id="lbtnNext"[^>]*>/);
  return { total, rows, more: Boolean(next) && !/o-icon--disable/.test(next[0]) };
}

function symbolOf(bloomberg) {
  let parts = bloomberg.split(" ");
  let suffix = parts.pop();
  if (!parts.length) {
    const glued = suffix.match(/^(\d+)(HK)$/i);
    if (glued) {
      parts = [glued[1]];
      suffix = glued[2].toUpperCase();
    }
  }
  const exchange = BOOK[suffix];
  if (!exchange) throw new Error(`${bloomberg} is on a market the form did not name`);
  let ticker = parts.join("");
  if (ticker.endsWith("/")) ticker = ticker.slice(0, -1);
  else ticker = ticker.replaceAll("/", ".");
  ticker = ticker.toUpperCase();
  if (!ticker) throw new Error(`${bloomberg} has no ticker`);
  return { ticker, exchange };
}

function listingType(name, fallback) {
  const text = String(name || "").normalize("NFKC");
  if (/(?<![A-Za-z])ETN(?![A-Za-z])/i.test(text)) return "ETN";
  if (/(?<![A-Za-z])ETC(?![A-Za-z])/i.test(text)) return "ETC";
  if (/(?<![A-Za-z])ETF(?![A-Za-z])/i.test(text)) return "ETF";
  return fallback;
}

function noteRatherThanShare(bloomberg, name) {
  if (!bloomberg.endsWith(" Pfd")) return false;
  return !/特別股|preferred|preference/i.test(name);
}

function loadIsinIndex() {
  const index = new Map();
  for (const file of [STOCKS, ETFS]) {
    const table = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    const header = table[0].split(",").map((cell) => cell.trim().toLowerCase());
    if (header[0] !== "ticker" || header[1] !== "exchange" || header[2] !== "isin") {
      throw new Error(`${file.pathname} header is ${header.join(",")}`);
    }
    for (const line of table.slice(1)) {
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
  const codes = [row.ticker];
  if (row.ticker.includes(".")) codes.push(row.ticker.replaceAll(".", "/"));
  if (row.exchange !== "Hong Kong" || !/^\d+$/.test(row.ticker)) return [...new Set(codes)];
  const digits = row.ticker.replace(/^0+/, "") || "0";
  return [...new Set([row.ticker, digits, digits.padStart(4, "0"), digits.padStart(5, "0")])];
}

function placesOf(row) {
  if (row.exchange === "US") return US_PLACES;
  if (row.exchange === "NASDAQ") return ["NASDAQ"];
  if (row.exchange === "NYSE") return ["NYSE"];
  if (row.exchange === "ARCA") return ["AMEX"];
  if (row.exchange === "Hong Kong") return ["HKEX"];
  if (row.exchange === "Tokyo") return JP_PLACES;
  if (row.exchange === "London") return ["LSE"];
  if (row.exchange === "Xetra") return ["XETR"];
  if (row.exchange === "Frankfurt") return ["FWB"];
  if (row.exchange === "Paris") return ["EURONEXT"];
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

function shownName(name, ticker) {
  const cleaned = String(name || "").replace(/\*+$/g, "").trim();
  return cleaned || ticker;
}

async function shelf(state, product, exchange) {
  const fallback = product === "ETF" ? "ETF" : "STOCK";
  let page = await post(state, "lbtnConfirm", product, exchange);
  const { total } = listed(page.html);
  const rows = [];
  const seen = new Map();
  const footnote = [];
  const codes = [];
  const folded = [];
  const notes = [];
  let source = 0;
  for (let guard = 0; guard < Math.ceil(total / 20) + 2; guard += 1) {
    const view = listed(page.html);
    if (!view.rows.length) throw new Error(`${product} ${exchange} printed a blank page`);
    for (const item of view.rows) {
      source += 1;
      const { ticker, exchange: book } = symbolOf(item.bloomberg);
      if (!/^[A-Z]{3}$/.test(item.currency)) throw new Error(`${item.bloomberg} is priced in ${item.currency || "nothing"}`);
      if (noteRatherThanShare(item.bloomberg, item.name)) {
        notes.push(item.bloomberg);
        continue;
      }
      const key = `${book}|${ticker}`;
      const marked = item.name.endsWith("***");
      const row = {
        query: ticker,
        ticker,
        name: shownName(item.name, ticker),
        exchange: book,
        currency: item.currency,
        type: listingType(item.name, fallback),
        isin: "",
        raw: [item.bloomberg, item.name, item.code, item.currency].filter(Boolean).join(" "),
      };
      if (seen.has(key)) {
        const at = seen.get(key);
        folded.push(item.bloomberg);
        const replaceMarked = !marked && footnote[at];
        const replaceOlder = !marked && !footnote[at] && row.name !== rows[at].name && item.code > codes[at];
        if (replaceMarked || replaceOlder) {
          rows[at] = row;
          footnote[at] = marked;
          codes[at] = item.code;
        }
        continue;
      }
      seen.set(key, rows.length);
      footnote.push(marked);
      codes.push(item.code);
      rows.push(row);
    }
    if (source >= total) {
      if (view.more) throw new Error(`${product} ${exchange} still has a next page after ${source}`);
      break;
    }
    if (!view.more) throw new Error(`${product} ${exchange} ended at ${source} of ${total}`);
    page = await post(page.state, "lbtnNext", product, exchange);
  }
  if (source !== total) throw new Error(`${product} ${exchange} says ${total} and printed ${source}`);
  return { rows, state: page.state, folded, notes };
}

let state = fieldsOf(await ask(PAGE));
const rows = [];
const seen = new Set();
for (const [product, exchange] of SHELVES) {
  const found = await shelf(state, product, exchange);
  state = found.state;
  for (const row of found.rows) {
    const key = `${row.exchange}|${row.ticker}`;
    if (seen.has(key)) throw new Error(`repeated ${key}`);
    seen.add(key);
    rows.push(row);
  }
  const folded = found.folded.length ? `, folded ${found.folded.join(", ")}` : "";
  const notes = found.notes.length ? `, left out ${found.notes.join(", ")}` : "";
  console.error(`${found.rows.length} ${product} on ${exchange}${folded}${notes}`);
}

const tally = attachIsins(rows, loadIsinIndex());
rows.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("standardchartered-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));
const byBook = new Map();
for (const row of kept) byBook.set(`${row.exchange} ${row.type}`, (byBook.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${kept.length} listings (${tally.one} with an ISIN, ${tally.none} unmatched, ${tally.several} ambiguous) ` +
    `(${[...byBook].map(([label, count]) => `${count} ${label}`).join(", ")})`
);
