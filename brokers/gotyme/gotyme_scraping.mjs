// GoTyme Bank (Philippines) sells PH Stocks inside its banking app. The
// broker is DragonFi: "DragonFi Securities Inc. (DSI) is the only available
// broker." The help centre says PH Stocks "lets you invest by buying shares
// of Philippine companies listed on the Philippine Stock Exchange (PSE)".
// GoTyme prints no list of its own, and never says "all", so the list is
// the broker's: the one DragonFi's market page reads (../dragonfi). That
// file also keeps suspended and stale lines (RRHI, the example GoTyme
// gives, is suspended), so a line is kept only when the PSE shows it open.
// In practice DragonFi carries every open PSE line, ETFs included, and the
// dollar lines are kept as at DragonFi.
//
//   https://www.gotyme.com.ph/ph-stocks
//   https://www.gotyme.com.ph/help/ph-stocks/getting-started-with-ph-stocks
//   https://www.gotyme.com.ph/api/1/services/help-center.json (what the help page reads)
//   https://api.dragonfi.ph/api/v2/Securities/GetFilteredSecuritiesList
//
// The PSE crawl is shared: ../col/pseBook.mjs reads the PSE Edge company
// directory and each company's stock page, keeps the open lines and drops
// suspended lines, warrants, rights, pre-IPO lines and bonds. TradingView
// supplies the description, the currency and the ETF mark.
//
//   https://edge.pse.com.ph/companyDirectory/search.ax
//   https://edge.pse.com.ph/companyPage/stockData.do
//
//   node brokers/gotyme/gotyme_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { pseBook } from "../col/pseBook.mjs";
import fs from "node:fs";

const SITE = "https://www.gotyme.com.ph";
const DRAGONFI = "https://api.dragonfi.ph/api/v2/Securities/GetFilteredSecuritiesList";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function plain(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;|—/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

async function fetchOk(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response;
}

async function checkPages() {
  const page = plain(await (await fetchOk(`${SITE}/ph-stocks`)).text());
  if (!/DragonFi Securities Inc\. \(DSI\) is the only available broker/i.test(page)) {
    throw new Error("GoTyme no longer names DragonFi as its only broker");
  }
  const help = await (
    await fetchOk(`${SITE}/api/1/services/help-center.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicUrl: "/help/ph-stocks/getting-started-with-ph-stocks", size: 20 }),
    })
  ).text();
  const text = plain(JSON.stringify(JSON.parse(help).data));
  if (!/buying shares of Philippine companies listed on the Philippine Stock Exchange/i.test(text)) {
    throw new Error("GoTyme's help centre no longer says PH Stocks are PSE-listed shares");
  }
}

async function dragonfiTickers() {
  const tickers = new Set();
  let total = null;
  for (let page = 1; page < 20; page += 1) {
    const url = `${DRAGONFI}?pageNum=${page}&pageSize=500&sortBy=StockCode&asc=true`;
    const body = await (await fetchOk(url, { headers: { Accept: "application/json" } })).json();
    const rows = body?.stockProfileList;
    if (!Array.isArray(rows) || !Number.isInteger(body.totalCount)) throw new Error("DragonFi published no list");
    total ??= body.totalCount;
    for (const row of rows) {
      const ticker = String(row.stockCode ?? "").trim().toUpperCase();
      if (ticker && !row.isDelisted) tickers.add(ticker);
    }
    if (!rows.length || page * 500 >= total) break;
  }
  if (tickers.size < 250) throw new Error(`DragonFi lists only ${tickers.size} names`);
  return tickers;
}

await checkPages();
const carried = await dragonfiTickers();
const { listed, suspended } = await pseBook();

const missing = listed.filter((row) => !carried.has(row.ticker)).map((row) => row.ticker);
const rows = listed
  .filter((row) => carried.has(row.ticker))
  .map(({ query, ticker, name, exchange, ...rest }) => ({ query, ticker, name, exchange, mic: "XPHS", ...rest }));
if (missing.length) console.error(`${missing.length} open PSE lines DragonFi does not carry: ${missing.join(", ")}`);
if (missing.length > 15) throw new Error(`${missing.length} open PSE lines are missing from DragonFi`);

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("gotyme-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));
const count = (type) => kept.filter((row) => row.type === type).length;
console.error(
  `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
    `(${count("STOCK")} STOCK, ${count("ETF")} ETF)`
);
console.error(`${suspended.length} suspended left out`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
