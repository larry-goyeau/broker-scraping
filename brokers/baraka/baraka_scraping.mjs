// What Baraka sells in shares and exchange-traded funds, with no login.
// The public sitemap is one page per ticker, in English and again in
// Arabic. The English page is kept. A title is a name and a ticker.
// A slug ending in -DFM is Dubai and one ending in -ADX is Abu Dhabi.
// Anything else is an American line: the page names no board, so the
// place is US and the currency is dollars. OTC is not separated.
//
// A name that says ETF, ETN or ETC is that type. Anything else stays a
// share. Baraka prints no ISIN, so the code is the one the other
// catalogues already agree on for that ticker on the named tape.
//
//   https://getbaraka.com/sitemap-stocks.xml
//
//   node brokers/baraka/baraka_scraping.mjs
//
// The catalogue is rewritten every 50 new pages. A later run skips the
// slugs already in the file, so a dropped connection keeps what was saved.

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { catalogueFiles } from "../../catalogues.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dns.setDefaultResultOrder("ipv4first");

const SITEMAP = "https://getbaraka.com/sitemap-stocks.xml";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const US_MICS = ["XNAS", "ARCX", "XNYS", "XASE", "BATS"];
const GULF = { DFM: "XDFM", ADX: "XADS" };

// The price pages sit behind a Sucuri check. The check is a short script
// that sets one cookie and reloads. The cookie is read here and sent back.
let clearance = "";

function challengeCookie(html) {
  const packed = String(html || "").match(/S='([^']+)'/);
  if (!packed) return "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const table = {};
  for (let index = 0; index < 64; index += 1) table[alphabet.charAt(index)] = index;
  let buffer = 0;
  let bits = 0;
  let script = "";
  for (let index = 0; index < packed[1].length; index += 1) {
    const code = table[packed[1].charAt(index)];
    if (code == null) continue;
    buffer = (buffer << 6) + code;
    bits += 6;
    while (bits >= 8) {
      const byte = (buffer >>> (bits -= 8)) & 0xff;
      if (byte || index < packed[1].length - 2) script += String.fromCharCode(byte);
    }
  }
  const value = script.match(/\b[A-Za-z]=([\s\S]*?);document\.cookie=/);
  const chars = script.match(/document\.cookie=((?:'[^']*'\s*\+\s*)+'[^']*')/);
  if (!value || !chars) return "";
  const pieces = [...value[1].matchAll(/"([^"]*)"|'([^']*)'|String\.fromCharCode\((\d+)\)/g)];
  if (!pieces.length) return "";
  const cookieValue = pieces.map((piece) => piece[1] ?? piece[2] ?? String.fromCharCode(Number(piece[3]))).join("");
  const cookieName = [...chars[1].matchAll(/'([^']*)'/g)].map((piece) => piece[1]).join("").split("=")[0];
  if (!cookieName.startsWith("sucuri_")) return "";
  return `${cookieName}=${cookieValue}`;
}

async function fetchPage(url, accept) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept, ...(clearance ? { Cookie: clearance } : {}) },
        redirect: "manual",
        signal: controller.signal,
      });
      const html = await response.text();
      if (response.status === 307 || html.includes("sucuri_cloudproxy")) {
        const cookie = challengeCookie(html);
        if (!cookie) throw new Error(`307 ${url}`);
        clearance = cookie;
        throw new Error(`clearance ${url}`);
      }
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return html;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  throw new Error(last);
}

async function textOf(url, accept) {
  return fetchPage(url, accept);
}

async function titleOf(url) {
  const html = await fetchPage(url, "text/html");
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!match || /you are being redirected/i.test(match[1])) throw new Error(`no title on ${url}`);
  return decode(match[1]);
}

function decode(value) {
  return String(value || "")
    .replace(/&#38;|&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function forms(ticker) {
  const text = String(ticker || "").trim().toUpperCase();
  const out = new Set([text]);
  if (text.includes(".")) out.add(text.replace(/\./g, "-"));
  if (text.includes("-")) out.add(text.replace(/-/g, "."));
  return [...out];
}

function fundType(text) {
  if (/\bETNs?\b/i.test(text)) return "ETN";
  if (/\bETCs?\b/i.test(text)) return "ETC";
  if (/\bETFs?\b/i.test(text)) return "ETF";
  return "STOCK";
}

// The page writes "Chevron Stocks (CVX)" and "Buy Robinhood Stock on
// baraka". That last word is the template, not the company. "Common
// Stock" and "Preferred Stock" are the line itself and stay.
function cleanName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+Stocks$/i, "")
    .replace(/(?<!Common)(?<!Preferred)\s+Stock$/i, "")
    .trim();
}

function parseTitle(raw, slug) {
  const title = decode(raw);
  const named = title.match(/^Buy\s+(.+?)\s+Stocks?\s+\(([A-Z0-9.]+)\)\s+on baraka\b/i);
  if (named) {
    const name = cleanName(named[1]);
    return { ticker: named[2].toUpperCase(), name, type: fundType(name) };
  }
  const buy = title.match(/^Buy\s+([A-Z0-9.]+)\s+Stocks?\s+\|\s+(.+?)(?:\s+Share Price\b|\s+\|\s+baraka\b)/i);
  if (buy) {
    const name = cleanName(buy[2]);
    return { ticker: buy[1].toUpperCase(), name, type: fundType(name) };
  }
  const onBaraka = title.match(/^Buy\s+(.+?)\s+on baraka\s+\|\s+([A-Z0-9.]+)\s+Price\b/i);
  if (onBaraka) {
    const name = cleanName(onBaraka[1]);
    return { ticker: onBaraka[2].toUpperCase(), name, type: fundType(name) };
  }
  const tickerFirst = title.match(/^Buy\s+([A-Z0-9.]+)\s+on baraka\s+\|\s+(.+)$/i);
  if (tickerFirst) {
    const name = cleanName(tickerFirst[2]);
    return { ticker: tickerFirst[1].toUpperCase(), name, type: fundType(name) };
  }
  const head = title.split("|")[0].trim();
  const paren = head.match(/^(.*)\(([A-Z0-9.]+)\)\s*(ETF|ETN|ETC)?\s*$/i);
  if (paren) {
    const name = cleanName(paren[1]);
    const type = paren[3] ? paren[3].toUpperCase() : fundType(`${name} ${head}`);
    return { ticker: paren[2].toUpperCase(), name: name || paren[2].toUpperCase(), type };
  }
  if (head.toUpperCase() === slug.toUpperCase()) {
    return { ticker: slug.toUpperCase(), name: slug.toUpperCase(), type: fundType(title) };
  }
  const trade = title.match(/^(.+?)\s+Stocks?\s+\|\s+Trade\s+([A-Z0-9.]+)\b/i);
  if (trade) {
    const name = cleanName(trade[1]);
    return { ticker: trade[2].toUpperCase(), name: name || trade[2].toUpperCase(), type: fundType(title) };
  }
  const priced = title.match(/^Buy\s+(.+?)\s+\(([A-Z0-9.]+)\)\s+Stock Price\b/i);
  if (priced) {
    const name = cleanName(priced[1]);
    return { ticker: priced[2].toUpperCase(), name, type: fundType(`${name} ${title}`) };
  }
  const labelled = title.match(/^([A-Z0-9.]+)\s+(ETF|ETN|ETC)\s+\|\s+(.+?)\s+on baraka\s*$/i);
  if (labelled) {
    const name = cleanName(labelled[3]);
    return { ticker: labelled[1].toUpperCase(), name, type: labelled[2].toUpperCase() };
  }
  const stockOn = title.match(/^(.+?)\s+\(([A-Z0-9.]+)\)\s+Stocks?\s+on baraka\b/i);
  if (stockOn) {
    const name = cleanName(stockOn[1]);
    return { ticker: stockOn[2].toUpperCase(), name, type: fundType(title) };
  }
  const codeFirst = title.match(/^([A-Z0-9.]+)\s+\((.+?)\)\s+Stocks?\s+on baraka\b/i);
  if (codeFirst) {
    const name = cleanName(codeFirst[2]);
    return { ticker: codeFirst[1].toUpperCase(), name, type: fundType(title) };
  }
  throw new Error(`unread Baraka title: ${title}`);
}

function placeOf(slug) {
  const text = slug.toUpperCase();
  if (text.endsWith("-DFM")) return { exchange: "DFM", currency: "AED" };
  if (text.endsWith("-ADX")) return { exchange: "ADX", currency: "AED" };
  return { exchange: "US", currency: "USD" };
}

function isinBook() {
  const book = new Map();
  const mics = new Set([...US_MICS, ...Object.values(GULF)]);
  for (const file of catalogueFiles()) {
    if (path.basename(path.dirname(file)) === "baraka") continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    for (const row of rows) {
      const isin = isinOf(row.isin);
      const ticker = String(row.ticker || "").trim().toUpperCase();
      if (!isin || !ticker) continue;
      const { venue } = resolveVenue(row);
      if (!venue || !mics.has(venue.mic)) continue;
      for (const key of forms(ticker)) {
        const id = `${venue.mic}|${key}`;
        if (!book.has(id)) book.set(id, new Set());
        book.get(id).add(isin);
      }
    }
  }
  return book;
}

const isins = isinBook();

function joined(ticker, exchange) {
  const mics = GULF[exchange] ? [GULF[exchange]] : US_MICS;
  const groups = new Map();
  const all = new Set();
  const keys = forms(ticker);
  for (const mic of mics) {
    const ids = new Set();
    for (const key of keys) {
      for (const isin of isins.get(`${mic}|${key}`) || []) ids.add(isin);
    }
    if (!ids.size) continue;
    groups.set(mic, ids);
    for (const isin of ids) all.add(isin);
  }
  if (all.size === 1) return { isin: [...all][0] };
  if (all.size < 2) return { isin: "" };
  const held = { ticker };
  stampIsinMatches(held, groups, ticker);
  return { isin: "", matches: held.matches };
}

function slugsOf(xml) {
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((hit) => hit[1]);
  const english = locs.filter((url) => /\/stock\/[^/]+$/.test(url) && !url.includes("/ar/"));
  if (!english.length) throw new Error("Baraka sitemap had no stock pages");
  return english.map((url) => {
    const slug = decodeURIComponent(url.split("/").pop()).toUpperCase();
    if (!slug) throw new Error(`unread Baraka url: ${url}`);
    return { slug, url };
  });
}

async function mapPool(items, limit, task) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
}

const OUT = fileURLToPath(new URL("baraka-parsed.json", import.meta.url));
const FLUSH_EVERY = 50;

function readSaved() {
  if (!fs.existsSync(OUT)) return [];
  const parsed = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
  return rows.filter((row) => row && row.query);
}

function listingOf(row) {
  return {
    query: row.slug,
    ticker: row.ticker,
    name: row.name || row.ticker,
    exchange: row.exchange,
    currency: row.currency,
    type: row.type,
    raw: [row.ticker, row.name, row.exchange, row.currency, row.type].filter(Boolean).join(" "),
    ...joined(row.ticker, row.exchange),
  };
}

function writeRows(rows) {
  const kept = withoutObligations(rows.slice()).map((row) => ({ ...row }));
  kept.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker) || left.type.localeCompare(right.type));
  const tmp = `${OUT}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(stampRows(kept), null, 2));
  fs.renameSync(tmp, OUT);
}

const xml = await textOf(SITEMAP, "application/xml");
const listed = slugsOf(xml);
const rows = readSaved();
const seenQuery = new Set(rows.map((row) => String(row.query).toUpperCase()));
const seen = new Set(rows.map((row) => `${row.exchange}|${row.ticker}`));
const pending = listed.filter((row) => !seenQuery.has(row.slug));
let dupes = 0;
let done = 0;
let sinceFlush = 0;
console.error(`${listed.length} English pages on the Baraka sitemap, ${rows.length} already saved, ${pending.length} left`);

try {
  await mapPool(pending, 8, async (row) => {
    const title = await titleOf(row.url);
    let parsedTitle;
    try {
      parsedTitle = parseTitle(title, row.slug);
    } catch (error) {
      console.error(error.message);
      return;
    }
    const parsed = { ...row, ...parsedTitle, ...placeOf(row.slug) };
    const id = `${parsed.exchange}|${parsed.ticker}`;
    if (seen.has(id)) dupes += 1;
    else {
      seen.add(id);
      rows.push(listingOf(parsed));
    }
    seenQuery.add(row.slug);
    done += 1;
    sinceFlush += 1;
    if (done % 1000 === 0) console.error(`${done} titles, ${rows.length} listings`);
    if (sinceFlush >= FLUSH_EVERY) {
      writeRows(rows);
      sinceFlush = 0;
      console.error(`${rows.length} listings written`);
    }
  });
} catch (error) {
  if (rows.length) writeRows(rows);
  throw error;
}

writeRows(rows);

const dewa = rows.find((row) => row.ticker === "DEWA" && row.exchange === "DFM");
const adnoc = rows.find((row) => row.ticker === "ADNOCGAS" && row.exchange === "ADX");
const apple = rows.find((row) => row.ticker === "AAPL" && row.exchange === "US");
const spy = rows.find((row) => row.ticker === "SPY" && row.exchange === "US");
if (!dewa) throw new Error("DEWA was not on DFM");
if (!adnoc) throw new Error("ADNOCGAS was not on ADX");
if (!apple || apple.type !== "STOCK") throw new Error("AAPL was not a US share");
if (!spy || spy.type !== "ETF") throw new Error("SPY was not a US ETF");

const byType = new Map();
const byPlace = new Map();
for (const row of rows) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  byPlace.set(row.exchange, (byPlace.get(row.exchange) || 0) + 1);
}
const withIsin = rows.filter((row) => row.isin).length;
console.error(
  `${rows.length} listings (${[...byPlace].map(([place, count]) => `${count} ${place}`).join(", ")}; ` +
    `${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}), ${withIsin} with an ISIN` +
    (dupes ? `; left out ${dupes} duplicate pages` : "")
);
