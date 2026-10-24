// What J Trust Global Securities (JTG証券, Ｊトラストグローバル証券株式会社,
// Kanto Finance Bureau No. 35) sells on its internet channel
// ("ウェルスマネジメント&ネット" / "コール&ネット").
//
// The internet trading rules name the markets as whole exchanges:
//   "東京証券取引所、名古屋証券取引所、札幌証券取引所（単独上場銘柄のみ、
//   アンビシャス含む）、福岡証券取引所（単独上場銘柄のみ、Q-board含む）に
//   上場している国内株式、国内上場外国株式、ETF（株価指数連動型上場投資信託）、
//   REIT（不動産投資信託）、ベンチャーファンドをお取扱いしております。"
//   https://www.jtg-sec.co.jp/bluesky_net/rule/genbutu/market.htm
// and the non-handled table takes out 8301 (Bank of Japan, not held by
// JASDEC) and SoftBank's two bond-type class shares (94345, 94346):
//   https://www.jtg-sec.co.jp/meigara/no_handling.htm
//
// - Tokyo: every listing of JPX's month-end file, Prime / Standard / Growth
//   (domestic and foreign), 出資証券 and the ETF・ETN section (ETN when the
//   name says so). PRO Market is not a market the rule names. REITs and
//   venture funds are sold but are not STOCK/ETF/ETC/ETN, so they stay out.
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
// - Nagoya: Premier, Main and Next from the exchange search.
// - Fukuoka: only the names listed on Fukuoka alone, main market and
//   Q-Board, from the exchange's sole-listing page.
// - Sapporo is left out: the service-time page says "札証は電話注文になります"
//   (Sapporo orders are by phone), and the site shows only what can be
//   bought online.
//   https://www.jtg-sec.co.jp/bluesky_net/rule/all/service_time.htm
// - Foreign shares (US, ETFs, Europe, China, Singapore, Indonesia) are left
//   out: the internet page's product list (bluesky_net/index.htm) and the
//   internet trading rules (index4.htm) cover domestic products only, and the
//   US / ETF pages take orders "日本時間 9：00～17：00" at a single 2.20%
//   rate, the branch channel. product.htm puts its net icon next to 米国株,
//   but it does so next to 外貨建てMMF too, which the same row says is by
//   phone only.
//
// Shared fetchers: ./jp_listings.mjs (also used by iwaicosmo and webulljp).
// Deposit currency: yen (domestic shares settle in yen).
//
//   node brokers/jtrust/jtrust_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import { attachIsins, fukuokaSoleRows, jasdecTable, nagoyaRows, tally, tokyoRows } from "./jp_listings.mjs";

const OUTPUT = new URL("jtrust-parsed.json", import.meta.url);

const [jasdec, tokyo, nagoya, fukuoka] = await Promise.all([jasdecTable(), tokyoRows(), nagoyaRows(), fukuokaSoleRows()]);
const refused = new Set([...jasdec.notHeld, ...jasdec.other.keys()]);

const dropped = new Map(tokyo.skipped);
const rows = [];
for (const row of [...tokyo.rows, ...nagoya, ...fukuoka]) {
  if (refused.has(row.ticker)) {
    dropped.set(`${row.exchange} non-handled`, (dropped.get(`${row.exchange} non-handled`) || 0) + 1);
    continue;
  }
  rows.push(row);
}
for (const code of ["8301", "94345"]) {
  if (rows.some((row) => row.ticker === code)) throw new Error(`${code} is on the non-handled table and was kept`);
}

const isins = attachIsins(rows);

const unresolved = new Map();
for (const row of rows) {
  if (resolveVenue(row).venue) continue;
  const key = `${row.exchange}|${row.mic}|${row.currency}`;
  unresolved.set(key, (unresolved.get(key) || 0) + 1);
}
// Fukuoka has no public book (spreads/venues.mjs lists it as unsourced).
for (const key of unresolved.keys()) if (!key.startsWith("Fukuoka|")) throw new Error(`venue not resolved: ${key}`);

rows.sort((left, right) =>
  left.type.localeCompare(right.type) || left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));

const final = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(final, null, 2));

console.error(
  `${final.length} rows -> ${OUTPUT.pathname} (JPX file of ${tokyo.asOf})\n${tally(final)}\n` +
    `  ISIN: ${isins.one} one match, ${isins.several} several, ${isins.none} none\n` +
    `  unresolved (no public book): ${[...unresolved].map(([key, count]) => `${key} ${count}`).join(", ") || "none"}\n` +
    `  left out: ${[...dropped].map(([reason, count]) => `${count} ${reason}`).join(", ")}`
);
