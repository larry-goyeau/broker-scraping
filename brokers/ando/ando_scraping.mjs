// What Ando Securities publishes as sold. Written at the user's request
// although the book is known to be incomplete (see the last paragraphs).
//
// The US book is the お取扱銘柄 table on the face-to-face US page: a
// Japanese name with the ticker in brackets, a sector and a link to the
// foreign-securities notice. The page says US shares are bought, in
// principle, face to face only (委託 or 店頭); the internet service sells no
// foreign share. No venue or ISIN is printed, so the listing venue and
// ISIN come from ../../assets/stocks.csv and etfs.csv (see
// ../mitsubishiufjesmart/japan.mjs).
//
// The domestic book is what the 美らネット24 internet page lists: Tokyo
// Prime, Standard and Growth and Nagoya Premier, Main and Next, with
// domestic shares, listed preferred equity (上場優先出資証券), tracking-
// dividend shares, ETF, ETN, REIT and the Nikkei 300 fund. Tokyo is the
// JPX month-end file: the three domestic-share sections, 出資証券, and the
// ETF・ETN section (a name that says ETN is an ETN). Tokyo-listed foreign
// shares stay out: the page says domestic shares. The REIT/fund section is
// left out as in the other Japanese catalogues, and so is a code JASDEC
// does not handle (8301). A name listed on Tokyo and Nagoya is written
// once per exchange: the page sells both. Nagoya is the exchange's
// Premier, Main and Next search and its ETF board (1319, the Nikkei 300
// fund the page names, also a Tokyo fund, and 1553, a Nagoya sole
// listing).
//
// Not in the file: the other foreign shares the face-to-face page says
// are handled on request (外国株式等, no list); Fukuoka and Sapporo, which
// only the face-to-face page names, with "一部お取扱できない銘柄があります"
// and no list; and the names behind the same unnamed caveat on the
// face-to-face page. The ETF page also says some ETFs are not handled,
// without naming them. Every Tokyo ETF and ETN is kept, because the
// internet page sells ETF and ETN on Tokyo without exception and the
// excluded funds cannot be told apart; a few rows may therefore be funds
// Ando does not take.
//
//   https://www.ando-sec.co.jp/spot-stock/trading-guide/us_stocks.html
//   https://www.ando-sec.co.jp/spot-stock/trading-guide/churanet24.html
//   https://www.ando-sec.co.jp/spot-stock/trading-guide/face-to-face.html
//   https://www.ando-sec.co.jp/spot-stock/product-overview/etf_etn.html
//
//   node brokers/ando/ando_scraping.mjs

import {
  attachJapanIsins,
  fetchText,
  fold,
  jasdecRefused,
  jpRow,
  nagoyaEtfs,
  nagoyaListing,
  textOf,
  tokyoListing,
  usRow,
  writeCatalogue,
} from "../mitsubishiufjesmart/japan.mjs";

const SITE = "https://www.ando-sec.co.jp";
const US_PAGE = `${SITE}/spot-stock/trading-guide/us_stocks.html`;
const NET_PAGE = `${SITE}/spot-stock/trading-guide/churanet24.html`;

const TOKYO_STOCK = new Set(["プライム（内国株式）", "スタンダード（内国株式）", "グロース（内国株式）", "出資証券"]);

async function usBook() {
  const html = await fetchText(US_PAGE);
  const start = html.indexOf("お取扱銘柄</h3>");
  const table = start >= 0 ? html.slice(start).match(/<table[\s\S]*?<\/table>/i) : null;
  if (!table) throw new Error("US page has no お取扱銘柄 table");
  const rows = [];
  for (const match of table[0].matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const cells = [...match[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textOf(cell[1]));
    if (!cells.length) continue;
    const name = fold(cells[0]);
    const ticker = name.match(/[（(]([A-Z][A-Z0-9.]*)[）)]\s*$/)?.[1];
    if (!ticker) throw new Error(`US row not read: ${cells.join(" | ")}`);
    rows.push(usRow({ symbol: ticker, name: name.replace(/\s*[（(][A-Z0-9.]+[）)]\s*$/, ""), note: cells[1] }));
  }
  if (rows.length < 20) throw new Error(`US table has only ${rows.length} rows`);
  return rows;
}

async function checkNetPage() {
  const text = textOf(await fetchText(NET_PAGE));
  const scope = "東京証券取引所 プライム市場 スタンダード市場 グロース市場 名古屋証券取引所 プレミア市場 メイン市場 ネクスト市場";
  if (!text.includes(scope) || !/上記市場に上場する国内株式・上場優先出資証券・子会社連動配当株・?ETF・ETN・REIT/.test(text)) {
    throw new Error("美らネット24 page no longer states the Tokyo and Nagoya scope as read");
  }
}

const [us, tokyo, nagoya, nagoyaFunds, refused] = await Promise.all([
  usBook(),
  tokyoListing(),
  nagoyaListing(),
  nagoyaEtfs(),
  jasdecRefused(),
  checkNetPage(),
]);

const rows = [...us];
const dropped = {};
const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);
for (const line of tokyo) {
  if (refused.has(line.code)) drop("JASDEC");
  else if (TOKYO_STOCK.has(line.section)) rows.push(jpRow({ ...line, exchange: "Tokyo", type: "STOCK" }));
  else if (line.section === "ETF・ETN") {
    rows.push(jpRow({ ...line, exchange: "Tokyo", type: fold(line.name).includes("ETN") ? "ETN" : "ETF" }));
  } else drop(line.section);
}
for (const line of nagoya) {
  if (refused.has(line.code)) drop("JASDEC");
  else rows.push(jpRow({ ...line, exchange: "Nagoya", type: "STOCK" }));
}
for (const line of nagoyaFunds) rows.push(jpRow({ ...line, exchange: "Nagoya", type: "ETF" }));

attachJapanIsins(rows);
writeCatalogue(import.meta.url, "ando-parsed.json", rows, {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  Nagoya: 150,
});
console.error(`US table ${us.length} names`);
console.error(`Left out: ${Object.entries(dropped).map(([why, count]) => `${count} ${why}`).join(", ")}`);
