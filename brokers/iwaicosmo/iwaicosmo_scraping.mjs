// What IwaiCosmo Securities (岩井コスモ証券, Kinki Finance Bureau No. 15)
// sells online through Cosmo Netre (コスモ・ネットレ).
//
// - Japan, as whole markets. The domestic cash page:
//     "取扱市場 東証（プライム／スタンダード／グロース） 名証（プレミア／メイン／
//     ネクスト） 福証（本則市場／Q-Board） ※札幌単独上場銘柄やほふり対象外
//     銘柄は、売付注文のみ電話注文にて承ります"
//     https://www.iwaicosmo.net/products/stock/stock/index.html
//   Tokyo is JPX's month-end file: Prime / Standard / Growth (domestic and
//   foreign), 出資証券 and the ETF・ETN section (ETN when the name says so;
//   the ETF page links the TSE ETF list). PRO Market is not named. REITs are
//   sold (products/stock/reit) but are not STOCK/ETF/ETC/ETN, so they stay
//   out. Nagoya is Premier, Main and Next from the exchange search; Fukuoka
//   is every main-market and Q-Board listing from the exchange's company
//   search. Sapporo-only names and the name JASDEC does not hold (8301, from
//   the JASDEC table) are sell-by-phone only, so they stay out.
//     https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//     https://www.nse.or.jp/listing/search/   https://www.fse.or.jp/listed/
//
// - US, the broker's own files behind the "個別株&ETF 取扱銘柄" page
//   (https://www.iwaicosmo.net/products/foreign/us/stocklist.html), Shift_JIS:
//     shares: https://www.iwaicosmo.net/file_deliverly/info_display/usfileall.csv
//     ETFs:   https://www.iwaicosmo.net/file_deliverly/info_display/us_etf_all.csv
//   The rules page: "取扱銘柄 NYSE・NYSE Arca・NYSE American・NASDAQ上場の
//   ETF、ADRを含む当社選定銘柄"; orders go through Interactive Brokers' SOR.
//     https://www.iwaicosmo.net/products/foreign/us/rule.html
//   Neither file prints a place or an ISIN: the place and the ISIN are the
//   ones ../../assets/stocks.csv / etfs.csv file the ticker under (AMEX is
//   NYSE Arca for an ETF and NYSE American for a share). A ticker they do not
//   know keeps NYSE as a stand-in US venue (one NBBO book) and its raw says so.
//   A share-file ticker that the asset files only know as a fund is an ETF.
//
// - China and Vietnam are phone orders only ("中国株式 ※電話注文のみ",
//   "ベトナム株式 ※電話注文のみ", https://www.iwaicosmo.net/products/foreign/index.html)
//   and are not online places, so they have no rows.
//
// Deposits: yen only. "米ドルでの入金は承っておりません。米ドル残高を追加する
// 場合は、為替振替にて円から米ドルに振替を行ってください。" (rule.html above).
// A US title is one USD row.
//
// Shared fetchers: ../jtrust/jp_listings.mjs.
//
//   node brokers/iwaicosmo/iwaicosmo_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import {
  US_PLACE, attachIsins, clean, fukuokaAllRows, jasdecTable, nagoyaRows, parseCsv, request, tally, tokyoRows, usPlaceOf,
} from "../jtrust/jp_listings.mjs";

const OUTPUT = new URL("iwaicosmo-parsed.json", import.meta.url);
const US_SHARES = "https://www.iwaicosmo.net/file_deliverly/info_display/usfileall.csv";
const US_ETFS = "https://www.iwaicosmo.net/file_deliverly/info_display/us_etf_all.csv";

const usTicker = (value) => clean(value).toUpperCase().replace(/[/ ]+/g, ".");

async function usRows() {
  const [sharesText, etfText] = await Promise.all([request(US_SHARES, {}, "shift_jis"), request(US_ETFS, {}, "shift_jis")]);
  const shares = parseCsv(sharesText);
  const etfs = parseCsv(etfText);
  const sharesAsOf = clean(shares[0]?.[0]).match(/更新日,?(\S+)/)?.[1] || clean(shares[0]?.[1]);
  const etfAsOf = clean(etfs[0]?.[1]);
  if (!/★銘柄/.test(shares[1]?.[0] || "")) throw new Error(`US share file layout moved: ${shares.slice(0, 2)}`);
  const header = etfs.findIndex((line) => line[0] === "ティッカー");
  if (header < 0 || etfs[header][1] !== "銘柄名（英語）" || etfs[header][2] !== "銘柄名（日本語）") {
    throw new Error(`US ETF file header moved: ${etfs.slice(0, 3)}`);
  }
  const lines = [
    ...shares.slice(2).map((line) => ({ ticker: usTicker(line[0]), name: clean(line[1]), jp: clean(line[2]), file: "share" })),
    ...etfs.slice(header + 1).map((line) => ({ ticker: usTicker(line[0]), name: clean(line[1]), jp: clean(line[2]), file: "ETF" })),
  ];
  const rows = [];
  const seen = new Set();
  let standIn = 0;
  for (const line of lines) {
    if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(line.ticker)) throw new Error(`US ticker not read: ${JSON.stringify(line)}`);
    if (seen.has(line.ticker)) continue;
    seen.add(line.ticker);
    const place = usPlaceOf(line.ticker);
    const fund = line.file === "ETF" || place?.fund === true;
    let mic = place?.mic;
    if (!mic) { mic = "XNYS"; standIn += 1; }
    if (fund && mic === "XASE") mic = "ARCX";
    const label = (line.jp || line.name || line.ticker).normalize("NFKC");
    let type = fund ? "ETF" : "STOCK";
    if (fund && /\bETN\b|ＥＴＮ/i.test(`${line.name} ${line.jp}`)) type = "ETN";
    rows.push({
      query: line.ticker,
      ticker: line.ticker,
      name: label,
      exchange: US_PLACE[mic],
      mic,
      currency: "USD",
      type,
      raw: [line.ticker, line.name, line.jp, `${line.file} file`, place ? US_PLACE[mic] : "place unknown"].filter(Boolean).join(" "),
      isin: "",
    });
  }
  if (rows.length < 800) throw new Error(`US files gave ${rows.length} lines`);
  return { rows, standIn, sharesAsOf, etfAsOf };
}

const [jasdec, tokyo, nagoya, fukuoka, us] = await Promise.all([
  jasdecTable(), tokyoRows(), nagoyaRows(), fukuokaAllRows(), usRows(),
]);

const dropped = new Map(tokyo.skipped);
const rows = [];
for (const row of [...tokyo.rows, ...nagoya, ...fukuoka, ...us.rows]) {
  if (row.currency === "JPY" && jasdec.notHeld.has(row.ticker)) {
    dropped.set(`${row.exchange} not held by JASDEC`, (dropped.get(`${row.exchange} not held by JASDEC`) || 0) + 1);
    continue;
  }
  rows.push(row);
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
  `${final.length} rows -> ${OUTPUT.pathname}\n${tally(final)}\n` +
    `  JPX file of ${tokyo.asOf}; US share file of ${us.sharesAsOf}, ETF file of ${us.etfAsOf}\n` +
    `  ISIN: ${isins.one} one match, ${isins.several} several, ${isins.none} none\n` +
    `  US tickers with no place in the asset files (NYSE stand-in): ${us.standIn}\n` +
    `  unresolved (no public book): ${[...unresolved].map(([key, count]) => `${key} ${count}`).join(", ") || "none"}\n` +
    `  left out: ${[...dropped].map(([reason, count]) => `${count} ${reason}`).join(", ")}`
);
