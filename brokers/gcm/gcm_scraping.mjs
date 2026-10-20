// What GCM Yatırım sells on Borsa Istanbul, with no login. Its share pages
// (/borsa/hisse) carry one selector of every instrument it has a page for,
// and the same pages are listed in its share sitemap; the two must agree.
// Each entry is a page URL and the code GCM's board uses for it. Shares
// (pay senedi, GYO and venture-capital trusts included) are kept as STOCK.
// Exchange-traded funds (borsa yatırım fonu) are printed with the board's
// fund suffix F (ZGOLDF) and are kept as ETF under their BIST code (ZGOLD).
// Certificates (the Darphane gold certificate ALTINS1, the DMLKTG real
// estate certificate) are not shares or funds and are left out. Foreign shares are sold only as CFDs, so none are here.
//
// The page names no ISIN; ../../accepted.mjs fills it from the BIST lines
// of the stock and ETF lists. The name is the list's when it has the code,
// else the page slug.
//
//   https://www.gcmyatirim.com.tr/borsa/hisse
//   https://www.gcmyatirim.com.tr/sitemap/hissesenetleri.xml
//
//   node brokers/gcm/gcm_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const PAGE = "https://www.gcmyatirim.com.tr/borsa/hisse";
const SITEMAP = "https://www.gcmyatirim.com.tr/sitemap/hissesenetleri.xml";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

const FLOOR = { STOCK: 550, ETF: 15 };
// Not a share or a fund: gold certificates.
const LEAVE_OUT = /sertifika/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      // The page mixes UTF-8 with a stray Latin-1 byte or two; names come
      // from the lists, so a replaced byte does no harm.
      return new TextDecoder("utf-8").decode(await response.arrayBuffer());
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * 2 ** attempt);
  }
  throw new Error(last);
}

function bistNames() {
  const names = new Map();
  for (const file of [STOCKS, ETFS]) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    if (!/^ticker,exchange,isin,name/i.test(lines[0])) throw new Error(`${file.pathname} header is ${lines[0]}`);
    for (const line of lines.slice(1)) {
      const [symbol, place, , ...rest] = line.split(",");
      if (place !== "BIST") continue;
      const code = String(symbol).split(":").pop().toUpperCase();
      const name = rest.join(",").trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"');
      if (name && !names.has(code)) names.set(code, name);
    }
  }
  return names;
}

function slugName(slug, code) {
  const words = slug.split("-");
  // "thyao-hisse-turk-hava-yollari-a-o": the code and "hisse" lead.
  if (words[1] === "hisse") words.splice(0, 2);
  else if (words[0] === code.toLowerCase()) words.shift();
  return words.map((word) => word.toUpperCase()).join(" ");
}

const [html, sitemap] = await Promise.all([getText(PAGE), getText(SITEMAP)]);
const options = [
  ...html.matchAll(/<option value="https:\/\/www\.gcmyatirim\.com\.tr\/borsa\/hisse\/([^"]+)">\s*([^<]+?)\s*<\/option>/g),
].map((match) => ({ slug: match[1], code: match[2].toUpperCase() }));
const mapped = new Set(
  [...sitemap.matchAll(/<loc>https:\/\/www\.gcmyatirim\.com\.tr\/borsa\/hisse\/([^<]+)<\/loc>/g)].map((match) => match[1])
);
if (options.length < FLOOR.STOCK + FLOOR.ETF) throw new Error(`selector lists ${options.length} instruments`);
const offMap = options.filter((option) => !mapped.has(option.slug));
const offPage = [...mapped].filter((slug) => !options.some((option) => option.slug === slug));
if (offMap.length + offPage.length > 10) {
  throw new Error(`selector and sitemap disagree: ${offMap.length} not mapped, ${offPage.length} not in the selector`);
}

const names = bistNames();
const rows = [];
const leftOut = [];
for (const { slug, code } of options) {
  if (LEAVE_OUT.test(slug)) {
    leftOut.push(code);
    continue;
  }
  if (!/^[A-Z0-9]{3,7}$/.test(code)) throw new Error(`unreadable code ${code} (${slug})`);
  const fund = /borsa-yatirim-fonu$/.test(slug);
  if (fund && !code.endsWith("F")) throw new Error(`fund ${code} without the F suffix (${slug})`);
  const ticker = fund ? code.slice(0, -1) : code;
  rows.push({
    query: ticker,
    ticker,
    name: names.get(ticker) || slugName(slug, ticker),
    exchange: "BIST",
    mic: "XIST",
    currency: "TRY",
    type: fund ? "ETF" : "STOCK",
    raw: [code, slug].join(" "),
  });
}

const unique = new Map();
for (const row of rows) {
  if (unique.has(row.ticker)) throw new Error(`${row.ticker} listed twice`);
  unique.set(row.ticker, row);
}
const sorted = [...unique.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
const count = { STOCK: 0, ETF: 0 };
for (const row of sorted) count[row.type] += 1;
if (count.STOCK < FLOOR.STOCK) throw new Error(`only ${count.STOCK} shares`);
if (count.ETF < FLOOR.ETF) throw new Error(`only ${count.ETF} funds`);

const stamped = stampRows(withoutObligations(sorted));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("gcm-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));

const withIsin = stamped.filter((row) => row.isin).length;
console.error(
  `gcm: ${stamped.length} rows, BIST ${count.STOCK} STOCK, ${count.ETF} ETF; ISIN ${withIsin}; ` +
    `left out ${leftOut.join(", ") || "none"}; selector/sitemap mismatch ${offMap.length}/${offPage.length}`
);
