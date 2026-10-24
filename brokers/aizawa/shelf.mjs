// The Japanese exchange shelf shared by the Aizawa, FFG, Hyakugo and
// Shikoku Alliance scrapers. Each of these brokers says it handles the
// listed names of a whole exchange, so the shelf is the exchange's own
// list, read by ../mitsubishiufjesmart/japan.mjs:
//
//   Tokyo     the JPX month-end file (data_j.xlsx). Prime, Standard and
//             Growth shares, domestic and foreign, are STOCK; the ETF・ETN
//             section is ETF, or ETN when the name says ETN. 出資証券 is
//             kept only when the broker names it (Hyakugo's 優先出資証券).
//             TOKYO PRO Market is for professional investors and stays out.
//             The REIT / venture / country / infrastructure fund section is
//             left out as in the other Japanese catalogues.
//   Nagoya    the exchange search: Premier, Main and Next shares, and the
//             ETF board.
//   Fukuoka   the monthly listed-securities PDF (sole and dual listings,
//             main board and Q-Board), with today's sole-listing page.
//   Sapporo   its listing page, sole and dual sections, main board and
//             Ambitious.
//
// Every exchange: a name on JASDEC's not-handled table (the Bank of Japan's
// 8301 is the one these brokers name) cannot be held in a securities account
// and stays out; a bond-type class share (社債型種類株式) is a bond and stays
// out. A name listed on several exchanges is one row per exchange. The ISIN
// is joined from ../../assets/stocks.csv and etfs.csv, the same code on all
// four exchanges.
//
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//   https://www.nse.or.jp/api/stock/search.json
//   https://www.fse.or.jp/investors/companies-and-brokers/
//   https://www.sse.or.jp/listing/list
//   https://www.jtg-sec.co.jp/meigara/no_handling.htm

import {
  attachJapanIsins,
  fold,
  fukuokaListing,
  jasdecRefused,
  jpRow,
  nagoyaEtfs,
  nagoyaListing,
  sapporoListing,
  tokyoListing,
} from "../mitsubishiufjesmart/japan.mjs";

const TOKYO_STOCK = new Set([
  "プライム（内国株式）",
  "スタンダード（内国株式）",
  "グロース（内国株式）",
  "プライム（外国株式）",
  "スタンダード（外国株式）",
  "グロース（外国株式）",
]);

// places: any of "Tokyo", "Nagoya", "Fukuoka", "Sapporo".
// contributions: keep the 出資証券 section of the Tokyo file.
// refusedToo: codes the broker itself excludes, on top of JASDEC's table.
export async function japanShelf({ places = ["Tokyo"], contributions = false, refusedToo = [] } = {}) {
  const want = new Set(places);
  const [tokyo, nagoya, nagoyaFunds, fukuoka, sapporo, jasdec] = await Promise.all([
    want.has("Tokyo") ? tokyoListing() : [],
    want.has("Nagoya") ? nagoyaListing() : [],
    want.has("Nagoya") ? nagoyaEtfs() : [],
    want.has("Fukuoka") ? fukuokaListing() : [],
    want.has("Sapporo") ? sapporoListing() : [],
    jasdecRefused(),
  ]);
  const refused = new Set([...jasdec, ...refusedToo]);
  const rows = [];
  const dropped = {};
  const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);
  const keep = (line, exchange, type) => {
    if (refused.has(line.code)) return drop("JASDEC / broker exclusion");
    if (line.name.includes("社債型")) return drop("bond-type class share");
    rows.push(jpRow({ ...line, exchange, type }));
  };
  for (const line of tokyo) {
    if (TOKYO_STOCK.has(line.section)) keep(line, "Tokyo", "STOCK");
    else if (line.section === "ETF・ETN") keep(line, "Tokyo", fold(line.name).includes("ETN") ? "ETN" : "ETF");
    else if (line.section === "出資証券" && contributions) keep(line, "Tokyo", "STOCK");
    else drop(`Tokyo ${line.section}`);
  }
  for (const [exchange, lines] of [["Nagoya", nagoya], ["Fukuoka", fukuoka], ["Sapporo", sapporo]]) {
    for (const line of lines) keep(line, exchange, "STOCK");
  }
  for (const line of nagoyaFunds) keep(line, "Nagoya", "ETF");
  attachJapanIsins(rows);
  return { rows, dropped };
}

export function droppedText(dropped) {
  return Object.entries(dropped)
    .map(([why, count]) => `${count} ${why}`)
    .join(", ");
}
