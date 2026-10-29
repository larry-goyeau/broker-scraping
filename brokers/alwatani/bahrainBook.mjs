// The Bahrain Bourse book, for a broker that deals in the whole exchange
// (../alwatani). Every listed share open to trade, from the bourse's own
// public site (bahrainbourse.com), with plain requests and no login.
//
// Three reads:
//
//   The Quotes page carries, in its own HTML, the list it draws
//   (`companyDetails`): every listed company by sector, with its symbol and
//   English name. A suspended company keeps its line, with "(Suspended)" in
//   its name (Bahrain Middle East Bank, BMB, on 2026-10-28); it is left out.
//   The "Closed Companies" sector holds closed (c) companies the bourse
//   matches outside the listed market (SICO-C); it is left out. "Non
//   Bahraini Companies" are the cross-listed foreign shares (Bank Muscat,
//   Kuwait Finance House) and stay.
//
//   The market-data API behind the same page (webapi.bahrainbourse.com,
//   GetTabularData Quotes, with the key the home page prints in its HTML)
//   gives each quoted symbol its trading currency: dinars, or dollars for
//   ABC, ARIG, GFH, INOVEST, ITHMR and KFH. Each title trades in one
//   currency, so the row keeps it.
//
//   Bahrain Clear's ISIN page prints, by section, the ISIN of every
//   security. Its "Bahrain Investment Market (BIM)" section is the bourse's
//   market for small and growing companies (HOPE Ventures), which the
//   Quotes page does not carry; those shares are added in dinars (their FISN
//   says BHD) unless `bim: false`. Bonds and sukuk are another section and
//   are not read.
//
// Eskan Bank Realty Income Trust (EBRIT) is a listed REIT unit (Bahrain
// Clear types it "Mutual Fund") and is written as a share, as REITs are
// elsewhere in this project. The bourse lists no ETF, so every row is a
// STOCK. Bank Muscat's line may have no ISIN on the Bahrain Clear page and
// then stays without one.
//
//   https://bahrainbourse.com/en
//   https://bahrainbourse.com/en/Quotes%20and%20Market/Stocks/Pages/Quotes.aspx
//   https://webapi.bahrainbourse.com/api/data/GetTabularData?storedProcdure=Quotes
//   https://bahrainbourse.com/en/Bahrain%20Clear/ISINCodes
//
// Row: { query, ticker, name, exchange "Bahrain Bourse", mic "XBAH",
// currency BHD|USD, type STOCK, isin, raw }, as ../khaleeji writes them.
//
//   import { bahrainBook } from "../alwatani/bahrainBook.mjs";
//   const { rows, leftOut } = await bahrainBook();
//
//   node brokers/alwatani/bahrainBook.mjs      (prints the counts)

import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const EXCHANGE = "Bahrain Bourse";
export const MIC = "XBAH";
const SITE = "https://bahrainbourse.com";
const HOME = `${SITE}/en`;
const QUOTES = `${SITE}/en/Quotes%20and%20Market/Stocks/Pages/Quotes.aspx`;
const ISINS = `${SITE}/en/Bahrain%20Clear/ISINCodes`;
const API = "https://webapi.bahrainbourse.com/api/data/GetTabularData?storedProcdure=Quotes";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
// 40 listed shares on the Quotes page on 2026-10-28, BMB suspended and
// SICO-C closed among them.
const FLOOR = 32;
const MUST = ["NBB", "BBK", "ALBH", "BEYON", "GFH", "SALAM"];

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const isIsin = (value) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decode = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"');

async function get(url, headers = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/json,*/*", "Accept-Language": "en-US,en;q=0.9", ...headers },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

// The array literal assigned to `name` in the page's inline script.
function inlineArray(html, name, url) {
  const at = html.search(new RegExp(`var\\s+${name}\\s*=\\s*\\[`));
  if (at < 0) throw new Error(`${url} no longer prints ${name}`);
  const start = html.indexOf("[", at);
  try {
    return JSON.parse(html.slice(start, closingBracket(html, start) + 1));
  } catch (error) {
    throw new Error(`${url}: ${name} does not parse (${error.message})`);
  }
}

function closingBracket(text, start) {
  let depth = 0;
  let quoted = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === "\\") index += 1;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("unbalanced array");
}

// Symbol -> { isin, issuer, section } from Bahrain Clear's table.
async function bahrainClear() {
  const html = await get(ISINS);
  const bySymbol = new Map();
  let section = "";
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => clean(decode(cell[1])));
    if (cells.length === 1) {
      section = cells[0];
      continue;
    }
    const [symbol, isin, issuer, description] = cells;
    if (!symbol || !/Equities|Investment Market/i.test(section) || !/Share|Fund/i.test(description || "")) continue;
    bySymbol.set(symbol.toUpperCase(), { isin: isIsin(isin) ? isin : "", issuer, section });
  }
  if (bySymbol.size < FLOOR) throw new Error(`${ISINS} prints only ${bySymbol.size} equity ISINs`);
  return bySymbol;
}

export async function bahrainBook({ bim = true } = {}) {
  const home = await get(HOME);
  const key = home.match(/APIKey\s*=\s*'([0-9a-f]{32,})'/)?.[1];
  if (!key) throw new Error(`${HOME} no longer prints its market-data key`);
  await sleep(500);
  const quotes = JSON.parse(await get(API, { Authorization: `Bearer ${key}`, Origin: SITE, Referer: `${SITE}/` }))?.data;
  if (!Array.isArray(quotes) || quotes.length < FLOOR) throw new Error(`the Bahrain Bourse quotes API gives ${quotes?.length ?? "no"} lines`);
  const currencyOf = new Map(quotes.map((line) => [clean(line.symbol).toUpperCase(), clean(line.currency).toUpperCase()]));
  await sleep(500);
  const sectors = inlineArray(await get(QUOTES), "companyDetails", QUOTES);
  await sleep(500);
  const clear = await bahrainClear();

  const rows = [];
  const leftOut = [];
  const seen = new Set();
  for (const { sector, lstBank } of sectors) {
    for (const company of lstBank || []) {
      const ticker = clean(company.Symbol).toUpperCase();
      const name = clean(company.CompanyName);
      if (!ticker || !name) throw new Error(`unreadable Bahrain Bourse line ${JSON.stringify(company)}`);
      if (/closed compan/i.test(sector)) {
        leftOut.push(`${ticker} (closed company)`);
        continue;
      }
      if (/\(suspended\)/i.test(name)) {
        leftOut.push(`${ticker} (suspended)`);
        continue;
      }
      if (seen.has(ticker)) continue;
      seen.add(ticker);
      const currency = currencyOf.get(ticker);
      if (!/^(BHD|USD)$/.test(currency || "")) throw new Error(`${ticker} has no BHD or USD quote (${currency || "none"})`);
      const isin = clear.get(ticker)?.isin || "";
      const shortName = name.replace(/\s*\(suspended\)\s*/i, "");
      rows.push({
        query: isin || ticker,
        ticker,
        name: shortName,
        exchange: EXCHANGE,
        mic: MIC,
        currency,
        type: "STOCK",
        isin,
        raw: [ticker, shortName, currency, clean(sector)].join(" | "),
      });
    }
  }
  if (bim) {
    for (const [ticker, { isin, issuer, section }] of clear) {
      if (!/Investment Market/i.test(section) || seen.has(ticker)) continue;
      seen.add(ticker);
      rows.push({
        query: isin || ticker,
        ticker,
        name: issuer,
        exchange: EXCHANGE,
        mic: MIC,
        currency: "BHD",
        type: "STOCK",
        isin,
        raw: [ticker, issuer, "BHD", "Bahrain Investment Market (BIM)"].join(" | "),
      });
    }
  }
  for (const ticker of MUST) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Bahrain Bourse book`);
  if (rows.length < FLOOR) throw new Error(`only ${rows.length} Bahrain Bourse shares`);
  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
  return { rows, leftOut };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const { rows, leftOut } = await bahrainBook();
  const count = {};
  for (const row of rows) count[row.currency] = (count[row.currency] || 0) + 1;
  console.log(`${rows.length} Bahrain Bourse rows`, count, `${rows.filter((row) => row.isin).length} with an ISIN`);
  console.log(`left out: ${leftOut.join(", ") || "none"}`);
}
