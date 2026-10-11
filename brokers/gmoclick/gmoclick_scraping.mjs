// What GMO Click sells in Tokyo shares, funds and notes, with no login.
// The brand page names every ETF, ETN and REIT, and the infrastructure
// funds sit with the REITs. The foreign-share page names the five Tokyo
// listings they treat as foreign stocks. Two of those five are ETFs already
// on the brand page, so they stay one line.
//
// Ordinary shares are the Tokyo Stock Exchange names in the share list.
// The cash rules name what stays out: a listing only on Nagoya, Sapporo or
// Fukuoka (those are not in the Tokyo column), the Nikkei 300 fund (1319),
// a domestic foreign share whose ISIN is not Japanese except the five on
// the foreign page, and a code that is not four characters (a preferred
// series). TOKYO PRO Market, a country fund, a tracking stock and a name
// JASDEC does not handle are named too, and this list has no mark for
// them. GMO Click may still refuse another name. Venture funds are a
// category and are not on either page, so they stay out.
//
// A code is four characters, the Tokyo one, in yen. A heading of ETN types
// the following table ETN, including the leveraged table under it. The REIT
// and infrastructure tables are REITs. Every other table is an ETF. The
// page prints no ISIN. The code is filled when the share and ETF lists, or
// another catalogue, already agree on that Tokyo code.
//
//   https://www.click-sec.com/corp/guide/kabu/etf/brand.html
//   https://www.click-sec.com/corp/guide/kabu/foreign/
//   https://www.click-sec.com/corp/guide/kabu/gembutsu/rule/rule_gembutsu.html
//
//   node brokers/gmoclick/gmoclick_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { catalogueFiles } from "../../catalogues.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import path from "node:path";

const BRAND = "https://www.click-sec.com/corp/guide/kabu/etf/brand.html";
const FOREIGN = "https://www.click-sec.com/corp/guide/kabu/foreign/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const CODE = /^(\d{3}[0-9A-Z])(?:\s+東証)?$/;

async function textOf(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(40_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function decode(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&reg;/g, "®")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function modeOf(heading, current) {
  const text = heading.replace(/\s+/g, "");
  if (text === "ETF") return "ETF";
  if (text === "ETN") return "ETN";
  if (text === "REIT") return "REIT";
  if (text.includes("インフラ")) return "REIT";
  if (text.includes("レバレッジ")) return current;
  return "ETF";
}

function cellsOf(row) {
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((hit) => decode(hit[1]));
}

function lineOf(cells, mode) {
  for (let index = 0; index < cells.length; index += 1) {
    const match = cells[index].match(CODE);
    if (!match) continue;
    const marketNext = cells[index + 1] === "東証";
    if (!cells[index].includes("東証") && !marketNext) continue;
    const name = cells[marketNext ? index + 2 : index + 1] || "";
    if (!name || name === "東証") return null;
    const type = mode === "ETN" || /\bETN\b/.test(name) ? "ETN" : mode === "REIT" ? "REIT" : "ETF";
    return { ticker: match[1], name, type };
  }
  return null;
}

function brandRows(html) {
  const parts = html.split(/(?=<h[23][^>]*>)/);
  let mode = "ETF";
  const rows = [];
  for (const part of parts) {
    const heading = decode((part.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/) || [])[1] || "");
    if (heading) mode = modeOf(heading, mode);
    for (const hit of part.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = cellsOf(hit[1]);
      if (cells.length === 0) continue;
      const line = lineOf(cells, mode);
      if (!line) throw new Error(`unread brand row: ${cells.join(" | ")}`);
      rows.push(line);
    }
  }
  if (rows.length < 400) throw new Error(`the brand list was short: ${rows.length}`);
  return rows;
}

function foreignRows(html) {
  const rows = [];
  for (const hit of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...hit[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]);
    if (cells.length < 3) continue;
    const market = decode(cells[0]);
    const ticker = decode(cells[1]);
    const rawName = cells[2];
    if (market !== "東証" || !CODE.test(ticker)) continue;
    const foreignEtf = /<sup/i.test(rawName);
    rows.push({
      ticker,
      name: decode(rawName).replace(/※/g, "").trim(),
      type: foreignEtf ? "ETF" : "STOCK",
    });
  }
  if (rows.length !== 5) throw new Error(`the foreign list was ${rows.length} lines`);
  return rows;
}

function add(book, key, isin) {
  if (!book.has(key)) book.set(key, new Set());
  book.get(key).add(isin);
}

function isinBook() {
  const book = new Map();
  for (const file of [new URL("../../assets/etfs.csv", import.meta.url), new URL("../../assets/stocks.csv", import.meta.url)]) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || /^ticker\s*,/i.test(line)) continue;
      const [ticker, exchange, isin] = line.split(",");
      if (exchange !== "TSE") continue;
      const id = isinOf(isin);
      const symbol = String(ticker || "").split(":").pop().trim().toUpperCase();
      if (!id || !CODE.test(symbol)) continue;
      add(book, `XTKS|${symbol}`, id);
    }
  }
  for (const file of catalogueFiles()) {
    if (path.basename(path.dirname(file)) === "gmoclick") continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    for (const row of rows) {
      const isin = isinOf(row.isin);
      const ticker = String(row.ticker || "").trim().toUpperCase().split(":").pop();
      if (!isin || !CODE.test(ticker)) continue;
      const { venue } = resolveVenue(row);
      if (!venue || venue.mic !== "XTKS") continue;
      add(book, `XTKS|${ticker}`, isin);
    }
  }
  return book;
}

function csvFields(line) {
  const fields = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

// Cash rules: Tokyo shares, minus the Nikkei 300 fund and a domestic
// foreign share. A code that is not four characters is a preferred series.
function tokyoShares() {
  const found = [];
  const file = new URL("../../assets/stocks.csv", import.meta.url);
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line || /^ticker\s*,/i.test(line)) continue;
    const [ticker, exchange, isin, name] = csvFields(line);
    if (exchange !== "TSE") continue;
    const symbol = String(ticker || "").split(":").pop().trim().toUpperCase();
    if (!CODE.test(symbol) || symbol === "1319") continue;
    const id = isinOf(isin);
    if (!id?.startsWith("JP")) continue;
    found.push({ ticker: symbol, name: name || symbol, type: "STOCK", isin: id });
  }
  if (found.length < 3000) throw new Error(`the Tokyo share list was short: ${found.length}`);
  return found;
}

function joined(ticker, isins) {
  const ids = isins.get(`XTKS|${ticker}`);
  if (!ids || ids.size === 0) return { isin: "" };
  if (ids.size === 1) return { isin: [...ids][0] };
  const held = { ticker };
  stampIsinMatches(held, new Map([["XTKS", ids]]), ticker);
  return { isin: "", matches: held.matches };
}

const brand = brandRows(await textOf(BRAND));
const foreign = foreignRows(await textOf(FOREIGN));
const shares = tokyoShares();
console.error(`brand page: ${brand.length}`);
console.error(`foreign page: ${foreign.length}`);
console.error(`Tokyo shares: ${shares.length}`);

const seen = new Map();
const unique = [];
for (const row of [...brand, ...foreign, ...shares]) {
  const prior = seen.get(row.ticker);
  if (prior) {
    if (row.type !== "STOCK" && prior !== row.type) throw new Error(`${row.ticker} is ${prior} and ${row.type}`);
    continue;
  }
  seen.set(row.ticker, row.type);
  unique.push({
    query: row.ticker,
    ticker: row.ticker,
    name: row.name,
    exchange: "Tokyo",
    currency: "JPY",
    type: row.type,
    raw: [row.ticker, row.name, "Tokyo", "JPY", row.type].filter(Boolean).join(" "),
    ...(row.isin ? { isin: row.isin } : {}),
  });
}

unique.sort(
  (left, right) =>
    left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker)
);

function expect(ticker, type) {
  const found = unique.filter((row) => row.ticker === ticker);
  if (found.length !== 1) throw new Error(`${ticker} was ${found.length} lines`);
  if (found[0].type !== type) throw new Error(`${ticker} was ${found[0].type}`);
  if (found[0].currency !== "JPY" || found[0].exchange !== "Tokyo") {
    throw new Error(`${ticker} was ${found[0].exchange} ${found[0].currency}`);
  }
}

expect("1306", "ETF");
expect("1326", "ETF");
expect("1557", "ETF");
expect("2042", "ETN");
expect("2971", "REIT");
expect("9282", "REIT");
expect("4875", "STOCK");
expect("7203", "STOCK");
if (unique.filter((row) => row.type === "ETF").length < 400) throw new Error("the ETF list was short");
if (unique.filter((row) => row.type === "ETN").length < 20) throw new Error("the ETN list was short");
if (unique.filter((row) => row.type === "REIT").length < 60) throw new Error("the REIT list was short");
if (unique.filter((row) => row.type === "STOCK").length < 3000) throw new Error("the Tokyo share list was short");
if (unique.some((row) => row.ticker === "1319")) throw new Error("the Nikkei 300 fund was kept");

const isins = isinBook();
for (const row of unique) {
  if (row.isin) continue;
  Object.assign(row, joined(row.ticker, isins));
}
const topix = unique.find((row) => row.ticker === "1306");
if (topix.isin !== "JP3027630007") throw new Error(`TOPIX was ${topix.isin || "blank"}`);
const toyota = unique.find((row) => row.ticker === "7203");
if (toyota.isin !== "JP3633400001") throw new Error(`Toyota was ${toyota.isin || "blank"}`);

const kept = stampRows(withoutObligations(unique));
fs.writeFileSync(new URL("gmoclick-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}); ` +
    `${withIsin} with an ISIN`
);
