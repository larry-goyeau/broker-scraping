// What Abbasi and Company sells in shares and ETFs, with no login. Its
// "PSX Market Performers" page carries, in the page source, the broker's
// whole PSX symbol feed (866 symbols: symbol, rate, change). The feed is
// the broker's quote master: it still holds symbols the exchange no longer
// lists (Byco, FFBL, ICI, GSKCH, ...) and every right. The online account
// (without a trader) trades the PSX ready market; the Pakistan Stock
// Exchange is the only place.
//
//   https://abbasiandcompany.com/marketperformer
//   https://abbasiandcompany.com/commission-slab
//
// The feed prints symbols only. The names come from the exchange's own
// list of the regular deliverable market, one symbol per line, and a
// symbol that list no longer carries cannot be bought at any broker:
//
//   https://dps.psx.com.pk/eligible-scrips
//   https://dps.psx.com.pk/data/eligible-scrips/REG.xml
//
// Kept: a feed symbol that the exchange lists on its regular market,
// as a share (preference shares, modarabas and REITs too) or an ETF.
// Left out:
//   - a right (the exchange names it "Right"): an entitlement;
//   - a closed-end mutual fund: a fund, not an ETF;
//   - a feed symbol the regular market does not carry (a merged or
//     delisted company, a right that expired, another board);
//   - a company the exchange prints as delisted or suspended, or that has
//     not traded for six months, or that is on the fallback suspension
//     list (psxStatus.mjs, the same filter as akd, chase, ktrade and
//     standardcapital; sources there).
// A GEM Board line (GEMBCEM, GEMMEL, GEMNETS) stays with the
// accredited-investor remark of psxStatus.mjs (GEM_REMARK: "Only
// Accredited Investors can participate in the trading of a GEM board
// listed company", https://www.blue-ex.com/corporate/faqs-gemboard).
// Every line is in rupees. ISINs come from the shared lists (stampRows),
// and for the nine PSX ETFs and the few companies those lists lack from
// brokers/standardcapital/psxIsins.mjs (sources there).
//
// The exchange portal sometimes answers with a closed connection for
// hours. The last regular-market file read is kept next to this script
// (psx-regular.xml) and used, with a warning, when the portal does not
// answer; with no copy yet, the names come from the repo's shared stock
// list (assets/stocks.csv, PSX lines) that have a PSX close in the shared
// prices (assets/prices.json), and a symbol ending in "ETF" is an ETF.
// That fallback drops the few listed symbols the shared lists lack, which
// carry no ISIN or no price anyway.
//
//   node brokers/abbasi/abbasi_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { GEM_REMARK, psxGemBoard, withoutDelisted } from "../../psxStatus.mjs";
import { PSX_ISINS, fillPsxIsins } from "../standardcapital/psxIsins.mjs";
import fs from "node:fs";

const PAGE = "https://abbasiandcompany.com/marketperformer";
const REGULAR_PAGE = "https://dps.psx.com.pk/eligible-scrips";
const REGULAR = "https://dps.psx.com.pk/data/eligible-scrips/REG.xml";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const OUTPUT = new URL("abbasi-parsed.json", import.meta.url);
const REGULAR_CACHE = new URL("psx-regular.xml", import.meta.url);
const PLACE = "Pakistan Stock Exchange";

function clean(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function text(url, headers = {}) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(45_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.cause?.message || error.message || error}`;
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error(last);
}

// The repo's shared stock list (assets/stocks.csv), PSX lines: the
// fallback names when the exchange portal does not answer and no copy of
// its file is kept yet. ETFs are not in it; an "...ETF" symbol is one.
function sharedList() {
  const file = new URL("../../assets/stocks.csv", import.meta.url);
  const names = new Map();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const [ticker, place, , ...name] = line.split(",");
    if (place !== "PSX") continue;
    names.set(String(ticker).split(":").pop().toUpperCase(), name.join(",").trim());
  }
  return names;
}

function psxCloses() {
  const file = new URL("../../assets/prices.json", import.meta.url);
  const symbols = new Set();
  const book = JSON.parse(fs.readFileSync(file, "utf8")).prices || {};
  for (const byCurrency of Object.values(book)) {
    for (const line of Object.values(byCurrency || {})) {
      for (const key of Object.keys(line?.from || {})) if (key.startsWith("XKAR:")) symbols.add(key.slice(5).toUpperCase());
    }
  }
  return symbols;
}

async function regularMarket(symbols) {
  let xml = "";
  try {
    xml = await text(REGULAR, { Accept: "application/xml, text/xml, */*", Referer: REGULAR_PAGE });
  } catch (error) {
    if (fs.existsSync(REGULAR_CACHE)) {
      console.error(`PSX portal did not answer (${error.message}); using ${REGULAR_CACHE.pathname}`);
      xml = fs.readFileSync(REGULAR_CACHE, "utf8");
    } else {
      console.error(`PSX portal did not answer (${error.message}); names from assets/stocks.csv instead`);
      // The feed keeps companies merged or delisted years ago, and so does
      // the shared list now and then: a symbol stays only when the shared
      // closing prices (assets/prices.json) carry a PSX close for it.
      const closes = psxCloses();
      const names = new Map([...sharedList()].filter(([symbol]) => closes.has(symbol)));
      for (const symbol of symbols) if (/ETF$/.test(symbol) && !names.has(symbol)) names.set(symbol, PSX_ISINS[symbol]?.name || `${symbol} ETF`);
      if (names.size < 400) throw new Error(`the shared list has ${names.size} PSX lines`);
      return { names, source: "assets/stocks.csv" };
    }
  }
  const pairs = [...xml.matchAll(/<symbol_code>([\s\S]*?)<\/symbol_code>\s*<symbol_name>([\s\S]*?)<\/symbol_name>/g)];
  if (pairs.length < 400) throw new Error(`PSX published ${pairs.length} regular symbols`);
  fs.writeFileSync(REGULAR_CACHE, xml);
  return { names: new Map(pairs.map(([, code, name]) => [clean(code).toUpperCase(), clean(name)])), source: "PSX regular market" };
}

function kindOf(name) {
  if (/\bETF\b|exchange traded fund/i.test(name)) return "ETF";
  if (/\bREIT\b/i.test(name)) return "STOCK";
  if (/\bfund\b/i.test(name)) return "FUND";
  return "STOCK";
}

const html = await text(PAGE);
const symbols = [
  ...new Set(
    [...html.matchAll(/<span class="symbolName">([^<]*)<\/span>/g)]
      .map((m) => clean(m[1]).toUpperCase())
      .filter((s) => /^[A-Z0-9]+$/.test(s)),
  ),
];
if (symbols.length < 450) throw new Error(`the market performers feed carries ${symbols.length} symbols`);

const { names: regular, source } = await regularMarket(symbols);
const rows = [];
const dropped = { right: [], fund: [], offBoard: [] };
for (const ticker of symbols) {
  const name = regular.get(ticker);
  if (!name) {
    dropped.offBoard.push(ticker);
    continue;
  }
  if (/\brights?\b/i.test(name)) {
    dropped.right.push(ticker);
    continue;
  }
  const type = kindOf(name);
  if (type === "FUND") {
    dropped.fund.push(ticker);
    continue;
  }
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: PLACE,
    mic: "XKAR",
    currency: "PKR",
    type,
    isin: "",
    raw: [ticker, name, "PSX", "PKR", type].join(" "),
    ...(psxGemBoard(ticker) ? { remark: GEM_REMARK } : {}),
  });
}
rows.sort((left, right) => left.ticker.localeCompare(right.ticker));

const must = (ticker, type) => {
  if (!rows.some((row) => row.ticker === ticker && row.type === type)) throw new Error(`${ticker} is not a ${type} line`);
};
must("OGDC", "STOCK");
must("MIIETF", "ETF");
if (rows.filter((row) => row.type === "ETF").length < 8) throw new Error("fewer than 8 PSX ETFs");
if (rows.length < 450) throw new Error(`only ${rows.length} rows kept`);

// Delisted and suspended companies stay in some lists but cannot be bought.
const stamped = stampRows(withoutDelisted(withoutObligations(rows)));
const mapped = fillPsxIsins(stamped);
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const etf = stamped.filter((row) => row.type === "ETF").length;
const withIsin = stamped.filter((row) => row.isin).length;
console.error(
  `${symbols.length} feed symbols, ${stamped.length} listings, ${withIsin} with an ISIN (${mapped} from psxIsins.mjs), ${etf} ETF;`,
  `left out: ${dropped.right.length} rights, ${dropped.fund.length} closed-end funds,`,
  `${dropped.offBoard.length} not in the ${source} list,`,
  `${rows.length - stamped.length} delisted, suspended or without a trade for six months at the PSX;`,
  `${stamped.filter((row) => row.remark === GEM_REMARK).length} GEM Board lines remarked`,
);
