// What Hyakugo Securities (百五証券, Hyakugo Bank group) sells online.
//
// Tokyo. The product page says the firm handles the shares, ETFs and REITs
// listed on the TSE ("東京証券取引所に上場されている株式・ETF（上場投資信託）・
// REIT（不動産投資信託）を取り扱っております"), and under ETF names the ETNs and
// preferred equity contributions too ("ETF（上場投資信託）、REIT（不動産投資
// 信託）、ETN(上場投資証券)、優先出資証券などを取扱っております"). The online
// trade sells domestic shares, ETFs and listed REITs ("国内株式 （ETF・上場
// REITを含みます）"). So the Tokyo list is the JPX month-end file (see
// ../aizawa/shelf.mjs): Prime, Standard and Growth shares, domestic and
// foreign, the ETF・ETN section and the 出資証券 section, less the names
// JASDEC does not handle (the Bank of Japan's 8301). The REIT section is
// left out as in the other Japanese catalogues.
//
// United States. The online trade also takes US share orders, agency
// orders only ("外国株式（米国株式） 現物注文（買注文・売注文） ※委託注文に
// 限ります"). The product page says the handled names are limited ("取扱銘柄は、
// 一部に限定しています") and points to the foreign-stock page, whose table is
// that list: ticker and Japanese name. Two lines say they are agency-only
// (委託取引のみ), which is what the online trade does anyway. No line prints
// a venue or an ISIN; both come from ../../assets/stocks.csv and etfs.csv
// (usRow in ../mitsubishiufjesmart/japan.mjs). One row in dollars per name:
// the US book is one NBBO.
//
//   https://www.105sec.co.jp/product/
//   https://www.105sec.co.jp/product/fstock/
//   https://www.105sec.co.jp/service/services/
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//
//   node brokers/hyakugo/hyakugo_scraping.mjs

import { fetchText, textOf, usRow, writeCatalogue } from "../mitsubishiufjesmart/japan.mjs";
import { droppedText, japanShelf } from "../aizawa/shelf.mjs";

const PRODUCT = "https://www.105sec.co.jp/product/";
const FSTOCK = "https://www.105sec.co.jp/product/fstock/";
const SERVICES = "https://www.105sec.co.jp/service/services/";

async function checkPages() {
  const product = textOf(await fetchText(PRODUCT));
  for (const phrase of ["東京証券取引所に上場されている株式を取扱っております", "優先出資証券", "取扱銘柄は、一部に限定しています"]) {
    if (!product.includes(phrase)) throw new Error(`Hyakugo product page no longer says ${phrase}`);
  }
  const services = textOf(await fetchText(SERVICES));
  if (!/外国株式（米国株式） 現物注文（買注文・売注文） ※委託注文に限ります/.test(services)) {
    throw new Error("Hyakugo services page no longer sells US shares online");
  }
}

async function usBook() {
  const html = await fetchText(FSTOCK);
  const table = html.match(/<table[^>]*class="brand"[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw new Error("Hyakugo foreign-stock table not found");
  const rows = [];
  for (const match of table.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => textOf(cell[1]));
    if (!cells.length) continue;
    const [ticker, name] = cells;
    if (!/^[A-Z][A-Z.]*$/.test(ticker || "")) throw new Error(`Hyakugo ticker not read: ${cells.join(" | ")}`);
    const clean = name.replace(/（委託取引のみの取扱となります）/, "").trim();
    rows.push(usRow({ symbol: ticker, name: clean, note: name === clean ? "" : "agency only" }));
  }
  if (rows.length < 50) throw new Error(`Hyakugo foreign-stock table has only ${rows.length} rows`);
  return rows;
}

const [, shelf, us] = await Promise.all([checkPages(), japanShelf({ places: ["Tokyo"], contributions: true }), usBook()]);
const unresolved = us.filter((row) => !row.mic).map((row) => row.ticker);
writeCatalogue(import.meta.url, "hyakugo-parsed.json", [...shelf.rows, ...us], {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  XNAS: 20,
  XNYS: 15,
});
console.error(`US: ${us.length} names${unresolved.length ? `, no venue: ${unresolved.join(", ")}` : ""}`);
console.error(`Left out: ${droppedText(shelf.dropped)}`);
