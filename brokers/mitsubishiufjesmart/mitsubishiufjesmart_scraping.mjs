// What Mitsubishi UFJ eSmart Securities (formerly au Kabucom) sells.
//
// Abroad it sells only US shares and ETFs; the foreign-stock menu has no
// other market. The US book is the A-Z table on the 取扱銘柄 page, which the
// page writes from beikabu.js: ticker, English and kana names, sector and
// NISA flag, ADRs and ETFs included. The US ETF page reads etf-list.csv;
// a code there is an ETF, and the one code it has that the A-Z table lacks
// is kept too. Neither file prints a venue or an ISIN, so both come from
// ../../assets/stocks.csv and etfs.csv (see japan.mjs). A code those lists
// only know over the counter is stored as OTC, one they do not know as US.
//
// At home the product page says every exchange: Tokyo (foreign shares
// included), Nagoya with Next, Fukuoka with Q-Board, Sapporo with
// Ambitious; ETF, ETN, REIT, venture and infrastructure funds; JASDEC
// names only. Country funds, TOKYO PRO Market, tracking-dividend shares and
// bond-type class shares (社債型種類株式) are not sold. Tokyo is the JPX
// month-end file: Prime, Standard and Growth, domestic and foreign, and the
// ETF・ETN section (a name that says ETN is an ETN). The REIT/fund section
// is left out as in the other Japanese catalogues, and so is 出資証券, which
// the page does not name. Nagoya is the exchange's Premier, Main and Next
// search; Nagoya's ETFs are Tokyo funds and are not a second line here.
// Fukuoka and Sapporo are their sole listings, as in matsui.
//
//   https://kabu.com/item/foreign_stock/us_stock/meigara.html
//   https://kabu.com/process/beikabu.js
//   https://kabu.com/item/foreign_stock/us_stock/etf/meigara.html
//   https://kabu.com/2024renew_assets/imgs/item/foreign_stock/us_stock/etf/meigara/etf-list.csv
//   https://kabu.com/item/stock/detail.html
//   https://kabu.com/item/stock/rule.html
//
//   node brokers/mitsubishiufjesmart/mitsubishiufjesmart_scraping.mjs

import {
  attachJapanIsins,
  decodeEntities,
  fetchText,
  fold,
  fukuokaSole,
  jasdecRefused,
  jpRow,
  nagoyaListing,
  normalize,
  parseCsv,
  sapporoSole,
  tokyoListing,
  usRow,
  writeCatalogue,
} from "./japan.mjs";

const US_JS = "https://kabu.com/process/beikabu.js";
const ETF_CSV = "https://kabu.com/2024renew_assets/imgs/item/foreign_stock/us_stock/etf/meigara/etf-list.csv";
const RULE = "https://kabu.com/item/stock/rule.html";

const TOKYO_STOCK = new Set([
  "プライム（内国株式）",
  "スタンダード（内国株式）",
  "グロース（内国株式）",
  "プライム（外国株式）",
  "スタンダード（外国株式）",
  "グロース（外国株式）",
]);

function cell(html) {
  return normalize(decodeEntities(String(html).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")));
}

async function usBook() {
  const js = await fetchText(US_JS);
  const lines = [];
  for (const match of js.matchAll(/document\.write\('<tr>\\([\s\S]*?)<\/tr>'\);/g)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((part) => cell(part[1]));
    if (cells.length !== 5) throw new Error(`beikabu.js row has ${cells.length} cells: ${match[1].slice(0, 120)}`);
    lines.push(cells);
  }
  const announced = (js.match(/nCount = nCount \+1/g) || []).length;
  if (lines.length !== announced) throw new Error(`beikabu.js counts ${announced} rows, read ${lines.length}`);
  if (lines.length < 3500) throw new Error(`beikabu.js has only ${lines.length} rows`);

  const csv = parseCsv((await fetchText(ETF_CSV)).trim());
  if (!/ティッカー/.test(csv[0]?.[0] || "")) throw new Error(`ETF CSV header is ${csv[0]?.join(",")}`);
  const etfs = new Map();
  for (const line of csv.slice(1)) {
    const code = normalize(line[0]).toUpperCase();
    if (code) etfs.set(code, normalize(line[1]));
  }
  if (etfs.size < 300) throw new Error(`ETF CSV has only ${etfs.size} codes`);

  const rows = [];
  const seen = new Set();
  for (const [ticker, name, kana, sector] of lines) {
    const code = ticker.toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-/]*$/.test(code)) throw new Error(`beikabu.js ticker not read: ${ticker}`);
    seen.add(code);
    rows.push(usRow({ symbol: code, name, type: etfs.has(code) ? "ETF" : undefined, note: [kana, sector].join(" ") }));
  }
  const etfOnly = [];
  for (const [code, name] of etfs) {
    if (seen.has(code)) continue;
    etfOnly.push(code);
    rows.push(usRow({ symbol: code, name, type: "ETF", note: "ETF page" }));
  }
  return { rows, etfOnly, lines: lines.length, etfs: etfs.size };
}

async function checkRule() {
  const text = cell(await fetchText(RULE));
  for (const phrase of ["名古屋証券取引所上場株式（ネクスト市場含む）", "福岡証券取引所上場株式（Qボード含む）", "札幌証券取引所上場株式（アンビシャス含む）", "TOKYO PRO Market"]) {
    if (!fold(text).includes(fold(phrase))) throw new Error(`kabu.com rule page no longer says ${phrase}`);
  }
}

const [us, tokyo, nagoya, fukuoka, sapporo, refused] = await Promise.all([
  usBook(),
  tokyoListing(),
  nagoyaListing(),
  fukuokaSole(),
  sapporoSole(),
  jasdecRefused(),
  checkRule(),
]);

const rows = [...us.rows];
const dropped = {};
const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);
for (const line of tokyo) {
  if (refused.has(line.code)) {
    drop("JASDEC");
    continue;
  }
  if (line.name.includes("社債型")) {
    drop("bond-type class share");
    continue;
  }
  if (TOKYO_STOCK.has(line.section)) rows.push(jpRow({ ...line, exchange: "Tokyo", type: "STOCK" }));
  else if (line.section === "ETF・ETN") {
    rows.push(jpRow({ ...line, exchange: "Tokyo", type: fold(line.name).includes("ETN") ? "ETN" : "ETF" }));
  } else drop(line.section);
}
for (const [exchange, lines] of [["Nagoya", nagoya], ["Fukuoka", fukuoka], ["Sapporo", sapporo]]) {
  for (const line of lines) {
    if (refused.has(line.code)) drop("JASDEC");
    else rows.push(jpRow({ ...line, exchange, type: "STOCK" }));
  }
}

attachJapanIsins(rows);
writeCatalogue(import.meta.url, "mitsubishiufjesmart-parsed.json", rows, {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  Nagoya: 150,
  Fukuoka: 5,
  Sapporo: 5,
  XNAS: 1000,
  XNYS: 1000,
});
console.error(`US: ${us.lines} A-Z rows, ${us.etfs} ETF-page codes, ETF page only: ${us.etfOnly.join(", ") || "none"}`);
console.error(`Left out: ${Object.entries(dropped).map(([why, count]) => `${count} ${why}`).join(", ")}`);
