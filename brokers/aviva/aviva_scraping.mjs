// What Aviva sells through its direct share dealing account, from the three
// public search tools of the Aviva investment platform (no login). Each tool
// is server-rendered, 10 cards a page, and announces its total:
//
//   https://www.direct.aviva.co.uk/wealth/InvestmentChoice/Shareandequitysearch     ("741 shares available")
//   https://www.direct.aviva.co.uk/wealth/InvestmentChoice/ExchangeTradedFundSearch ("976 exchange-traded funds available")
//   https://www.direct.aviva.co.uk/wealth/InvestmentChoice/InvestmentTrustSearch    ("132 investment trusts available")
//
// (counts of 2026-10-20). So Aviva sells more than the "over 700 UK shares" of
// the broker-list: ETFs and investment trusts too, all on the London Stock
// Exchange (AIM included). The ETF names end with the line currency ("GBP").
// Investment trusts are typed STOCK, as the rest of the repository does.
// Mutual funds (OEICs/unit trusts) are another tool and are not exchange
// traded, so they are not here.
//
// The cards give the Morningstar id, the name and the ISIN, never the ticker,
// and print every price with a "p", even for a dollar line (InterContinental
// Hotels). So each ISIN is looked up on the London Stock Exchange's own API:
// the LSE tickers of assets/stocks.csv / etfs.csv first, its ISIN search when
// those do not match. The sterling line (GBX or GBP, as the exchange gives
// it) is kept; a title with no sterling line keeps its only line and that
// line's currency. An ISIN with no line left on the LSE (Walker Crips on
// 2026-10-20) is no longer dealt and is left out, as is a card with no ISIN
// and no details page (Conygar).
//
// The default A-Z paging is not a stable order: some ETFs show on two pages
// and others on none. When the cards read do not add up to the announced
// total, the tool is read again under its other sort orders (form POST) until
// they do.
//
//   node brokers/aviva/aviva_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const ORIGIN = "https://www.direct.aviva.co.uk";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LSE_API = "https://api.londonstockexchange.com/api/gw/lse";
const PER_PAGE = 10;

const TOOLS = [
  { key: "share", path: "Shareandequitysearch", label: "shares", type: "STOCK" },
  { key: "etf", path: "ExchangeTradedFundSearch", label: "exchange-traded funds", type: "ETF" },
  { key: "trust", path: "InvestmentTrustSearch", label: "investment trusts", type: "STOCK" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const decode = (value) =>
  String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&percnt;/g, "%")
    .replace(/\s+/g, " ")
    .trim();

async function request(url, options = {}, accept = "text/html") {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, Accept: accept, ...(options.headers || {}) },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response;
      last = `${response.status} ${url}`;
      if (response.status === 404) return null;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

async function aviva(url, options = {}) {
  const response = await request(url, options);
  if (!response) throw new Error(`404 ${url}`);
  return response;
}

// One card per instrument: a checkbox whose name carries "secId#_name#_ISIN",
// then the Sell and Buy prices.
function cards(page) {
  const out = [];
  const body = page.slice(page.indexOf('id="paginatedResults"'));
  const chunks = body.split(/class="m-card m-card-select/).slice(1);
  for (const chunk of chunks) {
    const box = chunk.match(/id="([^"]+)" name="\w+CompareDictionary\[([^\]]*)\]"/);
    if (!box) continue;
    const [secId, rawName, isin] = box[2].split("#_");
    const end = chunk.indexOf("Add to compare");
    const text = `| ${chunk
      .slice(0, end > 0 ? end : undefined)
      .split(/<[^>]+>/)
      .map(decode)
      .filter(Boolean)
      .join(" | ")} |`;
    const sell = text.match(/\| Sell \| ([^|]*?) \|/)?.[1]?.trim() || "";
    const buy = text.match(/\| Buy \| ([^|]*?) \|/)?.[1]?.trim() || "";
    out.push({ secId: box[1] || secId, name: decode(rawName), isin: String(isin || "").trim().toUpperCase(), sell, buy });
  }
  return out;
}

const announcedOf = (page, label) => {
  const hit = page.match(new RegExp(`<strong>([\\d,]+)</strong>\\s*${label} available`, "i"));
  return hit ? Number(hit[1].replace(/,/g, "")) : 0;
};

async function readTool(tool) {
  const url = `${ORIGIN}/wealth/InvestmentChoice/${tool.path}`;
  const first = await aviva(url);
  const cookie = first.headers.getSetCookie().map((line) => line.split(";")[0]).join("; ");
  const page1 = await first.text();
  const announced = announcedOf(page1, tool.label);
  if (!announced) throw new Error(`${tool.path}: no announced total`);
  const token = page1.match(/name="__RequestVerificationToken" type="hidden" value="([^"]+)"/)?.[1] || "";
  const sorts = [...page1.matchAll(/<option (?:selected="selected" )?value="(\([^"]+\))"/g)].map((match) => match[1]);
  const pages = Math.ceil(announced / PER_PAGE);
  const found = new Map();
  const keep = (list) => {
    for (const card of list) if (!found.has(card.secId)) found.set(card.secId, card);
  };

  keep(cards(page1));
  for (let page = 2; page <= pages; page += 1) {
    keep(cards(await (await aviva(`${url}?page=${page}`)).text()));
    await sleep(200);
  }
  let passes = 1;
  // The A-Z order skips some cards; other orders fill the gaps.
  for (const sort of sorts.slice(1)) {
    if (found.size >= announced) break;
    if (!token) throw new Error(`${tool.path}: no form token to change the sort order`);
    passes += 1;
    for (let page = 1; page <= pages; page += 1) {
      const body = new URLSearchParams({
        __RequestVerificationToken: token,
        SelectedSortOrder: sort,
        ShowCumulativePerformances: "False",
        page: String(page),
      });
      const response = await aviva(url, {
        method: "POST",
        headers: { cookie, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      keep(cards(await response.text()));
      if (found.size >= announced) break;
      await sleep(200);
    }
  }
  if (found.size !== announced) {
    throw new Error(`${tool.path}: announced ${announced}, read ${found.size} after ${passes} sort orders`);
  }
  console.error(`${tool.key}: ${found.size} of ${announced} announced (${passes} sort order${passes > 1 ? "s" : ""})`);
  return [...found.values()].map((card) => ({ ...card, tool }));
}

// ISIN -> LSE tickers from the repository's listing files.
function lseTickers() {
  const map = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    const text = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    for (const line of text.split("\n").slice(1)) {
      const [ticker, exchange, isin] = line.split(",");
      if (exchange !== "LSE" || !isin) continue;
      const symbol = ticker.replace(/^LSE:/, "");
      if (!map.has(isin)) map.set(isin, new Set());
      map.get(isin).add(symbol);
    }
  }
  return map;
}

async function lseJson(path) {
  const response = await request(`${LSE_API}${path}`, {
    headers: { Origin: "https://www.londonstockexchange.com", Referer: "https://www.londonstockexchange.com/" },
  }, "application/json");
  return response ? response.json() : null;
}

// The lines of an ISIN on the London Stock Exchange, with their currency.
async function lseLines(isin, known) {
  const fetchLines = async (tidms) => {
    const lines = [];
    for (const tidm of [...new Set(tidms)]) {
      // null (404) is a ticker the exchange no longer serves; any other
      // failure throws, so a busy API never passes for a delisting.
      const data = await lseJson(`/instruments/alldata/${encodeURIComponent(tidm)}`);
      if (data?.isin === isin) lines.push({ tidm: data.tidm || tidm, currency: String(data.currency || "").toUpperCase() });
      await sleep(150);
    }
    return lines;
  };
  let lines = await fetchLines([...(known || [])]);
  if (!lines.length) {
    const found = (await lseJson(`/search?worlds=quotes&q=${isin}`)) || {};
    const tidms = (found.instruments || [])
      .filter((item) => item.key === isin)
      .map((item) => item.url?.match(/\/stock\/([^/]+)\//)?.[1])
      .filter(Boolean);
    lines = await fetchLines(tidms);
  }
  return lines;
}

async function mapPool(items, lanes, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, worker));
  return out;
}

function listingType(tool, name) {
  if (tool.key !== "etf") return "STOCK";
  if (/\bETC\b/i.test(name)) return "ETC";
  if (/\bETN\b/i.test(name)) return "ETN";
  return "ETF";
}

const all = [];
for (const tool of TOOLS) all.push(...(await readTool(tool)));

const tickers = lseTickers();
const noIsin = [];
const notListed = [];
const notSterling = [];
const twoSterling = [];
let done = 0;
const rows = await mapPool(all, 3, async (card) => {
  // A card with no ISIN also has no details link (Conygar Investment Co on
  // 2026-10-20): a line that is no longer dealt, left out.
  if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(card.isin)) {
    noIsin.push(card.name);
    return null;
  }
  let lines;
  for (let attempt = 0; ; attempt += 1) {
    try {
      lines = await lseLines(card.isin, tickers.get(card.isin));
      break;
    } catch (error) {
      if (attempt >= 3) throw new Error(`LSE lookup of ${card.isin} failed: ${error.message}`);
      await sleep(20_000 * (attempt + 1));
    }
  }
  done += 1;
  if (done % 200 === 0) console.error(`${done}/${all.length} looked up on the LSE`);
  if (!lines.length) {
    notListed.push(`${card.name} ${card.isin}`);
    return null;
  }
  const sterling = lines.filter((line) => line.currency === "GBX" || line.currency === "GBP");
  let line = sterling[0];
  if (sterling.length > 1) twoSterling.push(`${card.name} ${sterling.map((item) => item.tidm).join("/")}`);
  if (!line) {
    line = lines[0];
    notSterling.push(`${card.name} ${lines.map((item) => `${item.tidm} ${item.currency}`).join("/")}`);
  }
  return {
    query: card.isin,
    ticker: line.tidm,
    name: card.name,
    exchange: "LSE",
    mic: "XLON",
    currency: line.currency,
    type: listingType(card.tool, card.name),
    isin: card.isin,
    raw: [card.tool.key, card.secId, card.name, card.isin, `sell ${card.sell}`, `buy ${card.buy}`].join(" | "),
  };
});

// Two Morningstar ids can carry the same line (a trust in both the share and
// the trust tools); one row per ISIN.
const seen = new Set();
const results = rows.filter((row) => {
  if (!row) return false;
  const key = `${row.isin}|${row.exchange}|${row.currency}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
results.sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name));

const byType = new Map();
for (const row of results) byType.set(row.type, (byType.get(row.type) || 0) + 1);
console.error(
  `${results.length} rows on LSE (${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}), ` +
    `${rows.filter(Boolean).length - results.length} duplicate ids dropped`
);
if (noIsin.length) console.error(`left out, no ISIN or details page: ${noIsin.join("; ")}`);
if (notListed.length) console.error(`left out, no line on the LSE any more: ${notListed.join("; ")}`);
if (notSterling.length) console.error(`no sterling line, kept in the line's currency: ${notSterling.join("; ")}`);
if (twoSterling.length) console.error(`two sterling lines, first kept: ${twoSterling.join("; ")}`);


const want = [
  ["GB0007980591", "BP"],
  ["GB00BVZK7T90", "Unilever"],
  ["GB00B0P6J834", "Aberdeen Asian Income Fund"],
  ["IE00B53HP851", "iShares Core FTSE 100 ETF"],
];
for (const [isin, label] of want) {
  if (!results.some((row) => row.isin === isin)) throw new Error(`${label} (${isin}) missing`);
}
if (results.length < 1700) throw new Error(`only ${results.length} rows, expected about 1,850`);
if (noIsin.length > 5) throw new Error(`${noIsin.length} cards without an ISIN`);
if (notListed.length > 15) throw new Error(`${notListed.length} ISINs with no LSE line`);

fs.writeFileSync(new URL("aviva-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(results)), null, 2));
