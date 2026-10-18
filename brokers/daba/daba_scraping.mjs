// Daba publishes a public page per market it trades (BRVM and the Nigerian
// Exchange). Each market page embeds its full stock directory in the Next.js
// page data, and each stock page carries a showTradeButton flag that drives
// the "Trade XXX from your phone" call to action. No login.
//
//   https://dabafinance.com/en/capitalmarkets/brvm
//   https://dabafinance.com/en/capitalmarkets/ngx
//   https://dabafinance.com/en/capitalmarkets/{market}/{symbol}
//
// A symbol is kept when its page says showTradeButton. Daba lists no ETFs.
// Listed infrastructure funds are FUND; REITs and companies are STOCK.
// The site does not show ISINs.
//
//   node brokers/daba/daba_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BASE = "https://dabafinance.com/en/capitalmarkets";
const MARKETS = [
  { slug: "brvm", exchange: "BRVM", mic: "XBRV", currency: "XOF" },
  { slug: "ngx", exchange: "NGX", mic: "XNSA", currency: "NGN" },
];
const WORKERS = 4;

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pageData(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) {
        const html = await response.text();
        const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
        if (!json) throw new Error(`no page data in ${url}`);
        return JSON.parse(json).props.pageProps;
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const rows = [];
const dropped = [];
for (const market of MARKETS) {
  const data = await pageData(`${BASE}/${market.slug}`);
  const directory = data.directory;
  if (!Array.isArray(directory) || directory.length < 30) throw new Error(`${market.slug}: directory has ${directory?.length}`);
  if (data.exchange?.currency && data.exchange.currency !== market.currency) throw new Error(`${market.slug}: currency ${data.exchange.currency}`);

  let cursor = 0;
  async function worker() {
    while (cursor < directory.length) {
      const item = directory[cursor++];
      const ticker = normalize(item.symbol).toUpperCase();
      const page = await pageData(`${BASE}/${market.slug}/${ticker.toLowerCase()}`);
      await sleep(150);
      if (page.showTradeButton !== true) {
        dropped.push(`${market.exchange}:${ticker}`);
        continue;
      }
      const name = normalize(page.companyMeta?.company?.name || item.name);
      const fund = /\bfund\b/i.test(name) && !/real estate|reit/i.test(name);
      rows.push({
        query: ticker,
        ticker,
        name,
        exchange: market.exchange,
        mic: market.mic,
        currency: market.currency,
        type: fund ? "FUND" : "STOCK",
        isin: "",
        raw: [ticker, name, market.exchange, item.sector].filter(Boolean).join(" | "),
      });
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
}

const unique = [...new Map(rows.map((row) => [`${row.exchange}|${row.ticker}`, row])).values()];
unique.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("daba-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(unique)), null, 2));
const counts = {};
for (const row of unique) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(counts);
if (dropped.length) console.error(`no trade button: ${dropped.join(", ")}`);
