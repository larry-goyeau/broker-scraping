// Alfa-Investments (Alfa-Bank) publishes a catalogue of the shares and the
// funds it sells, with no login. The pages show the first lines and load the
// rest from a GraphQL endpoint, which is read here page by page until the
// announced totals are reached:
//
//   https://alfabank.ru/make-money/investments/catalog/akcii/   (348 shares)
//   https://alfabank.ru/make-money/investments/catalog/fondy/   (249 funds)
//   POST https://alfabank.ru/api/v1/emitents-catalog/graphql    getAssets(filter, page)
//
// alfabank.ru presents a certificate chain that ends in the Russian
// national root CA, which Node does not trust: requests to alfabank.ru
// alone go through an https.Agent with rejectUnauthorized: false (the
// curl -k equivalent).
//
// The catalogue gives ISIN, ticker, name and currency but not the place.
// The broker trades on Moscow Exchange and SPB Exchange, so each catalogue
// ISIN is looked up in the two exchange directories, as served by the open
// ALOR market-data API (the same instrument directory the exchanges
// distribute; no token):
//
//   https://api.alor.ru/md/v2/Securities?exchange=MOEX&sector=FOND&cficode=E&limit=5000
//   https://api.alor.ru/md/v2/Securities?exchange=SPBX&limit=5000
//
// A row is written for each place where the ISIN has a book in a trading
// state (17 normal trading, 119 opening auction), with that book's ticker
// and currency ("@" after an SPB ticker is cut). The Alfa currency is kept
// in raw: two yuan funds (SBCN, SBBY) are quoted in roubles on MOEX. Lines
// left out: no exchange book at all (non-listed unit funds, the residual
// "AO" lines of foreign corporate actions), only the MOEX OTC board MTQR
// (not the exchange), or a frozen/delisted book (status 2 "break" and 18
// "no trading": the blocked foreign names, FinEx funds). Because the state
// is live, the scraper must run while MOEX trades (about 06:50-23:50
// Moscow time); outside those hours the floors below throw.
//
// A catalogue fund is an ETF when the exchange book is a BPIF (short name
// "ETF" on MOEX, CFI CE* on SPB) and FUND otherwise (OPIF, IPIF, ZPIF).
//
//   node brokers/alfainvest/alfainvest_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import https from "node:https";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = 100;
const CATALOGUE = [
  { asset: "STOCK", page: "https://alfabank.ru/make-money/investments/catalog/akcii/", floor: 300 },
  { asset: "FOND", page: "https://alfabank.ru/make-money/investments/catalog/fondy/", floor: 200 },
];
const QUERY = `query GetAssets($filter: AssetListFilter, $page: PageFilter) {
  getAssets(filter: $filter, page: $page) {
    pagination { totalCount limit offset }
    assets { id name ISIN ticker assetType { code } currencyObj { code } }
  }
}`;
const ALOR = "https://api.alor.ru/md/v2/Securities";
const LIVE = new Set([17, 119]);
const MOEX_BOARDS = new Set(["TQBR", "TQTF", "TQIF", "TQPI", "FQBR", "TQFD", "TQTD", "TQTE"]);
// Only for alfabank.ru: its chain ends in the Russian national root CA.
const alfaAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function postAlfa(body, referer) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        host: "alfabank.ru",
        path: "/api/v1/emitents-catalog/graphql",
        method: "POST",
        agent: alfaAgent,
        timeout: 120_000,
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          "Content-Type": "application/json",
          Origin: "https://alfabank.ru",
          Referer: referer,
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (response.statusCode !== 200) return reject(new Error(`${response.statusCode} graphql ${text.slice(0, 120)}`));
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error(`graphql answered ${text.slice(0, 200)}`));
          }
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("graphql timeout")));
    request.on("error", reject);
    request.end(data);
  });
}

async function retry(task) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

async function loadCatalogue({ asset, page }) {
  const found = [];
  let total = 0;
  for (let offset = 0; !total || found.length < total; offset += PAGE) {
    if (offset > 5000) throw new Error(`${asset} did not end`);
    const body = await retry(() =>
      postAlfa(
        {
          query: QUERY,
          variables: {
            filter: { isVisible: { eq: true }, assetType: { eq: asset }, currency: { isActive: { eq: true } } },
            page: { limit: PAGE, offset, sort: "shortName:asc" },
          },
        },
        page
      )
    );
    if (body.errors) throw new Error(`${asset}: ${JSON.stringify(body.errors).slice(0, 200)}`);
    const result = body.data?.getAssets;
    if (!result || !Array.isArray(result.assets)) throw new Error(`${asset} answered ${JSON.stringify(body).slice(0, 200)}`);
    if (!total) total = Number(result.pagination?.totalCount);
    if (Number(result.pagination?.totalCount) !== total) throw new Error(`${asset} changed from ${total} to ${result.pagination?.totalCount}`);
    found.push(...result.assets);
    if (!result.assets.length) break;
    await sleep(600);
  }
  const ids = new Set(found.map((item) => item.id));
  if (!total || found.length !== total || ids.size !== total) throw new Error(`${asset} announced ${total}, read ${found.length} (${ids.size} distinct)`);
  return found;
}

async function getAlor(url) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(120_000) });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
      if (response.status === 429) await sleep(5000 * (attempt + 1));
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

async function loadDirectory(query) {
  const found = [];
  for (let offset = 0; ; offset += 5000) {
    if (offset > 50_000) throw new Error(`${query} did not end`);
    const page = await getAlor(`${ALOR}?${query}&limit=5000&offset=${offset}`);
    if (!Array.isArray(page)) throw new Error(`${query} answered ${JSON.stringify(page).slice(0, 200)}`);
    found.push(...page);
    if (page.length < 5000) break;
    await sleep(3000);
  }
  return found;
}

const catalogue = [];
for (const list of CATALOGUE) {
  const items = await loadCatalogue(list);
  if (items.length < list.floor) throw new Error(`only ${items.length} ${list.asset} lines`);
  catalogue.push(...items.map((item) => ({ item, list })));
  await sleep(1000);
}
alfaAgent.destroy();

const moex = await loadDirectory("exchange=MOEX&sector=FOND&cficode=E");
await sleep(3000);
const spbx = await loadDirectory("exchange=SPBX");

// ISIN -> live books on each place
const books = new Map();
const dead = new Set();
const otc = new Set();
function addBook(isin, book) {
  if (!books.has(isin)) books.set(isin, []);
  books.get(isin).push(book);
}
for (const line of moex) {
  const isin = normalize(line.ISIN).toUpperCase();
  if (!isin) continue;
  if (line.board === "MTQR") {
    otc.add(isin);
    continue;
  }
  if (!MOEX_BOARDS.has(line.board)) continue;
  if (!LIVE.has(line.tradingStatus)) {
    dead.add(isin);
    continue;
  }
  const kind = line.type === "MF" || line.type === "COFP" ? (/\bETF\b/i.test(line.shortname) ? "ETF" : "FUND") : "STOCK";
  addBook(isin, { exchange: "Moscow Exchange", mic: "MISX", line, ticker: normalize(line.symbol), currency: normalize(line.currency), kind });
}
for (const line of spbx) {
  const isin = normalize(line.ISIN).toUpperCase();
  if (!isin) continue;
  const cfi = normalize(line.cfiCode);
  const kind = /^E/.test(cfi) ? "STOCK" : /^CE/.test(cfi) ? "ETF" : /^CI/.test(cfi) ? "FUND" : "";
  if (!kind || !/^[A-Z]{3}$/.test(normalize(line.currency)) || /PERP/.test(line.symbol)) continue;
  if (!LIVE.has(line.tradingStatus)) {
    dead.add(isin);
    continue;
  }
  addBook(isin, { exchange: "SPB Exchange", mic: "XPET", line, ticker: normalize(line.symbol).replace(/@$/, ""), currency: normalize(line.currency), kind });
}

const rows = [];
const left = new Map();
function leave(reason) {
  left.set(reason, (left.get(reason) || 0) + 1);
}

for (const { item, list } of catalogue) {
  const isin = normalize(item.ISIN).toUpperCase();
  const found = books.get(isin) || [];
  if (!found.length) {
    leave(`${list.asset} ${dead.has(isin) ? "frozen or delisted book" : otc.has(isin) ? "MOEX OTC only" : "no exchange book"}`);
    continue;
  }
  for (const book of found) {
    if (!/^[A-Z]{3}$/.test(book.currency)) throw new Error(`${book.ticker} is quoted ${book.currency}`);
    const type = list.asset === "STOCK" ? "STOCK" : book.kind === "STOCK" ? "FUND" : book.kind;
    rows.push({
      query: book.ticker,
      ticker: book.ticker,
      name: normalize(item.name),
      exchange: book.exchange,
      mic: book.mic,
      currency: book.currency,
      type,
      isin,
      raw: [item.ticker, item.name, item.ISIN, item.assetType?.code, item.currencyObj?.code, `${book.mic} ${book.line.board} ${book.line.symbol} ${book.currency} status ${book.line.tradingStatus}`]
        .map(normalize)
        .join(" | "),
    });
  }
}

const seen = new Set();
for (const row of rows) {
  const key = `${row.isin}|${row.mic}|${row.currency}`;
  if (seen.has(key)) throw new Error(`${key} twice`);
  seen.add(key);
}

const count = (mic, type) => rows.filter((row) => row.mic === mic && row.type === type).length;
if (count("MISX", "STOCK") < 200) throw new Error(`only ${count("MISX", "STOCK")} MOEX shares: run while MOEX trades`);
if (count("MISX", "ETF") < 80) throw new Error(`only ${count("MISX", "ETF")} MOEX ETFs`);
if (count("XPET", "STOCK") < 80) throw new Error(`only ${count("XPET", "STOCK")} SPB shares: run while SPB trades`);
for (const [mic, isin, label] of [
  ["MISX", "RU0009029540", "Sberbank on MOEX"],
  ["MISX", "RU0007661625", "Gazprom on MOEX"],
  ["MISX", "RU000A104X08", "AKMM ETF on MOEX"],
  ["XPET", "RU0009024277", "Lukoil on SPB"],
]) {
  if (!rows.some((row) => row.mic === mic && row.isin === isin)) throw new Error(`${label} is missing`);
}

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("alfainvest-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = {};
for (const row of kept) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`catalogue ${catalogue.length} lines`, counts);
console.error("left out:", Object.fromEntries(left));
