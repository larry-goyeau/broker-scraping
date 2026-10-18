// What Daiwa Connect Securities sells.
//
// Abroad it sells only US names, as ひな株USA: a fractional, dealer-priced
// (国内店頭取引) product on the names the firm has chosen, priced off the
// NYSE or Nasdaq close. The list page builds its table from
// script__hinakabuUsaList.js, which holds every chosen code with its
// Japanese name in two blocks, shares (ADRs flagged) and ETFs. The product
// page states the total (133, of which 32 ETFs and 3 ADRs) and the run
// checks the file against it. No venue or ISIN is printed, so the listing
// venue and ISIN come from ../../assets/stocks.csv and etfs.csv (see
// ../mitsubishiufjesmart/japan.mjs).
//
// At home the cash-trading page says the shares of companies listed on the
// Tokyo Stock Exchange, ETF and REIT included; no other exchange is named.
// Tokyo is the JPX month-end file: Prime, Standard and Growth, domestic and
// foreign companies, and the ETF・ETN section without the ETNs, which the
// page does not name. The REIT/fund section is left out as in the other
// Japanese catalogues, and so are PRO Market (professional investors only),
// 出資証券 (not a company share) and a code JASDEC does not handle.
// ひな株 (odd lots) is a subset of the same Tokyo names.
//
//   https://www.connect-sec.co.jp/service/hinakabu_usa/
//   https://www.connect-sec.co.jp/service/hinakabu_usa/list.html
//   https://www.connect-sec.co.jp/src/js/script__hinakabuUsaList.js
//   https://www.connect-sec.co.jp/service/stock/
//
//   node brokers/daiwaconnect/daiwaconnect_scraping.mjs

import {
  attachJapanIsins,
  fetchText,
  fold,
  jasdecRefused,
  jpRow,
  textOf,
  tokyoListing,
  usRow,
  writeCatalogue,
} from "../mitsubishiufjesmart/japan.mjs";

const SITE = "https://www.connect-sec.co.jp";
const US_PAGE = `${SITE}/service/hinakabu_usa/`;
const US_JS = `${SITE}/src/js/script__hinakabuUsaList.js`;
const STOCK_PAGE = `${SITE}/service/stock/`;

const TOKYO_STOCK = new Set([
  "プライム（内国株式）",
  "スタンダード（内国株式）",
  "グロース（内国株式）",
  "プライム（外国株式）",
  "スタンダード（外国株式）",
  "グロース（外国株式）",
]);

function block(js, name) {
  const match = js.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`));
  if (!match) throw new Error(`${name} not found in the list script`);
  return [...match[1].matchAll(/'([^']+)'\s*:\s*'([^']*)'/g)].map((entry) => [entry[1].trim().toUpperCase(), entry[2].trim()]);
}

function list(js, name) {
  const match = js.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!match) throw new Error(`${name} not found in the list script`);
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1].trim().toUpperCase()));
}

async function usBook() {
  const [js, page] = await Promise.all([fetchText(US_JS), fetchText(US_PAGE)]);
  const shares = block(js, "equityName");
  const etfs = block(js, "etfName");
  const adr = list(js, "adrList");
  const text = textOf(page);
  const total = Number(text.match(/(\d+)銘柄 ※ を厳選/)?.[1] || 0);
  const etfCount = Number(text.match(/うち、(\d+)銘柄はETF/)?.[1] || 0);
  const adrCount = Number(text.match(/(\d+)銘柄はADR/)?.[1] || 0);
  if (!total || shares.length + etfs.length !== total || etfs.length !== etfCount || adr.size !== adrCount) {
    throw new Error(
      `ひな株USA page states ${total} names (${etfCount} ETF, ${adrCount} ADR); script has ${shares.length} shares, ${etfs.length} ETFs, ${adr.size} ADRs`
    );
  }
  const rows = [];
  for (const [code, name] of shares) {
    rows.push(usRow({ symbol: code, name, type: "STOCK", note: adr.has(code) ? "ADR" : "株式" }));
  }
  for (const [code, name] of etfs) rows.push(usRow({ symbol: code, name, type: "ETF", note: "ETF" }));
  return { rows, total };
}

async function checkStockPage() {
  const text = textOf(await fetchText(STOCK_PAGE));
  if (!text.includes("東京証券取引所に上場している 企業の株式（ETF/REIT含む）を取引できます")) {
    throw new Error("cash-trading page no longer states the Tokyo scope");
  }
}

const [us, tokyo, refused] = await Promise.all([usBook(), tokyoListing(), jasdecRefused(), checkStockPage()]);

const rows = [...us.rows];
const dropped = {};
const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);
for (const line of tokyo) {
  if (refused.has(line.code)) drop("JASDEC");
  else if (TOKYO_STOCK.has(line.section)) rows.push(jpRow({ ...line, exchange: "Tokyo", type: "STOCK" }));
  else if (line.section === "ETF・ETN") {
    if (fold(line.name).includes("ETN")) drop("ETN");
    else rows.push(jpRow({ ...line, exchange: "Tokyo", type: "ETF" }));
  } else drop(line.section);
}

attachJapanIsins(rows);
writeCatalogue(import.meta.url, "daiwaconnect-parsed.json", rows, {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  "ETF": 330,
});
console.error(`ひな株USA ${us.total} names`);
console.error(`Left out: ${Object.entries(dropped).map(([why, count]) => `${count} ${why}`).join(", ")}`);
