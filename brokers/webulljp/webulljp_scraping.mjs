// What Webull Securities (Japan) Co. Ltd. (ウィブル証券, Kanto Finance
// Bureau No. 48, webull.co.jp) sells as shares and funds. Two markets:
//
// - Tokyo, as a whole exchange. The domestic share page:
//     "東京証券取引所の上場銘柄（ETF・ETN・REITを含む）
//     ※TOKYO PRO Market並びにTOKYO PRO-BOND Marketにつきましてはお取扱いして
//     おりません。※新株予約権や単元未満株もお取扱いしておりません。"
//     https://www.webull.co.jp/products/stocks
//   So the rows are JPX's month-end listed-issues file: Prime, Standard and
//   Growth (domestic and foreign) and 出資証券 are STOCK, the ETF・ETN section
//   is ETF (ETN when the name says so). PRO Market goes, as the page says.
//   REITs are sold but are not STOCK/ETF/ETC/ETN, so the REIT / venture /
//   infrastructure section stays out. Odd lots are an order size, not a
//   title, so they remove nothing. 8301 (Bank of Japan) goes: JASDEC does not
//   hold it, so no book-entry account can (JASDEC table on
//   https://www.jtg-sec.co.jp/meigara/no_handling.htm).
//     https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//   Orders go to the TSE itself: "お客様のご注文は東京証券取引所に取り次がれて
//   執行されます。なお、弊社は東京証券取引所の取引参加者です。"
//
// - US: Webull Japan's own shelf, the public table on
//   https://www.webull.co.jp/search ("取扱銘柄一覧"), which the US service page
//   describes as "NYSE・NYSE Arca・NYSE American・NASDAQ上場の当社選定銘柄
//   ETFを含め約6,265銘柄" (https://www.webull.co.jp/products/us-stocks/service).
//   The table is fed by
//     POST https://jptrade.wbjpsecurities.com/api/trading/v1/global/ticker/security/querySecurityByPage
//   which answers "Illegal Client" unless the page itself signs the call
//   (x-s, t_time, did), so the script opens the page in a headless Chrome
//   and pages through it with the page's own request function, 100 lines a
//   call, one pass per security type: common shares (4), preferred shares
//   (2) and ETFs (7), the types the page's "stocks" and "etf" tabs ask for.
//   Units (5, a share and a warrant together) stay out. The listing board
//   is the line's own (NASDAQ, NYSE, NYSEARCA, AMEX, BATS). ISIN: the asset
//   files' single match for that ticker on that place.
//
// Deposits: yen only; the fee page lists 円入金 / 円出金 and nothing in
// dollars, and US trades either convert at 15 sen a dollar or use dollars
// bought beforehand (https://www.webull.co.jp/pricing). A title is one row
// in its market's currency.
//
// Shared fetchers: ../jtrust/jp_listings.mjs.
//
//   node brokers/webulljp/webulljp_scraping.mjs
//   CHROME=/path/to/chrome node brokers/webulljp/webulljp_scraping.mjs

import fs from "node:fs";
import puppeteer from "puppeteer-core";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { US_PLACE, UA, attachIsins, clean, jasdecTable, tally, tokyoRows } from "../jtrust/jp_listings.mjs";

const OUTPUT = new URL("webulljp-parsed.json", import.meta.url);
const SEARCH = "https://www.webull.co.jp/search";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// securityTypes of the page (its enum: 2 PREFERRED_STOCK, 4 COMMON_STOCK,
// 5 UNITS, 7 ETF).
const TYPES = [
  { code: 4, label: "common share", type: "STOCK" },
  { code: 2, label: "preferred share", type: "STOCK" },
  { code: 7, label: "ETF", type: "ETF" },
];
const BOARD = { NASDAQ: "XNAS", NYSE: "XNYS", NYSEARCA: "ARCX", AMEX: "XASE", BATS: "BATS" };

async function shelf() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(SEARCH, { waitUntil: "networkidle2", timeout: 120_000 });
    return await page.evaluate(async (types) => {
      let load;
      window.webpackChunkwebull_jp.push([[Symbol("shelf")], {}, (require) => { load = require; }]);
      const id = Object.keys(load.m).find((key) => load.m[key].toString().includes("querySecurityByPage"));
      if (!id) throw new Error("the page no longer carries querySecurityByPage");
      const query = Object.values(load(id)).find((value) => typeof value === "function");
      const out = {};
      for (const code of types) {
        const items = [];
        let last;
        for (let call = 0; call < 200; call += 1) {
          const answer = await query({ pageSize: 100, lastSecurityId: last, securityTypes: [code] });
          const data = answer?.items ? answer : answer?.data;
          if (!Array.isArray(data?.items)) throw new Error(`type ${code}: no items in ${JSON.stringify(answer).slice(0, 200)}`);
          items.push(...data.items);
          if (!data.hasNextPage) { out[code] = items; break; }
          last = data.nextPageSecurityId;
        }
        if (!out[code]) throw new Error(`type ${code} did not reach its last page`);
      }
      return out;
    }, TYPES.map((item) => item.code));
  } finally {
    await browser.close();
  }
}

function usRows(byType) {
  const rows = [];
  const seen = new Set();
  const boards = new Map();
  for (const { code, label, type: baseType } of TYPES) {
    for (const item of byType[code] || []) {
      const board = clean(item.secondaryBoardDisName).toUpperCase();
      const mic = BOARD[board];
      if (!mic) throw new Error(`US board not read: ${JSON.stringify(item).slice(0, 300)}`);
      boards.set(`${board} ${label}`, (boards.get(`${board} ${label}`) || 0) + 1);
      const ticker = clean(item.symbol).toUpperCase().replace(/[\s/]+/g, ".");
      if (!ticker || seen.has(item.securityId)) continue;
      seen.add(item.securityId);
      const name = clean(item.jpName) || clean(item.name) || ticker;
      let type = baseType;
      if (type === "ETF" && /\bETN\b/i.test(`${item.name} ${item.jpName}`)) type = "ETN";
      rows.push({
        query: ticker,
        ticker,
        name,
        exchange: US_PLACE[mic],
        mic,
        currency: "USD",
        type,
        raw: [clean(item.symbol), clean(item.name), clean(item.jpName), board, label].filter(Boolean).join(" "),
        isin: "",
      });
    }
  }
  if (rows.length < 5000) throw new Error(`the US shelf gave ${rows.length} lines`);
  return { rows, boards };
}

const [byType, jasdec, tokyo] = await Promise.all([shelf(), jasdecTable(), tokyoRows()]);
const us = usRows(byType);

const dropped = new Map(tokyo.skipped);
const japan = [];
for (const row of tokyo.rows) {
  if (jasdec.notHeld.has(row.ticker)) { dropped.set("Tokyo not held by JASDEC", (dropped.get("Tokyo not held by JASDEC") || 0) + 1); continue; }
  japan.push(row);
}

const rows = [...us.rows, ...japan];
const isins = attachIsins(rows);

const unresolved = new Set();
for (const row of rows) if (!resolveVenue(row).venue) unresolved.add(`${row.exchange}|${row.mic}|${row.currency}`);
if (unresolved.size) throw new Error(`venues not resolved: ${[...unresolved].join(", ")}`);

rows.sort((left, right) =>
  left.type.localeCompare(right.type) || left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));

const final = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(final, null, 2));

console.error(
  `${final.length} rows -> ${OUTPUT.pathname} (JPX file of ${tokyo.asOf})\n${tally(final)}\n` +
    `  US shelf by board: ${[...us.boards].sort().map(([key, count]) => `${count} ${key}`).join(", ")}\n` +
    `  ISIN: ${isins.one} one match, ${isins.several} several, ${isins.none} none\n` +
    `  left out: ${[...dropped].map(([reason, count]) => `${count} ${reason}`).join(", ")}`
);
