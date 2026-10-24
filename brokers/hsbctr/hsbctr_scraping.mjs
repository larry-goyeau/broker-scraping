// What HSBC Yatırım sells, with no login. HSBC Yatırım Menkul Değerler
// A.Ş. is the Istanbul broker of HSBC Bank A.Ş.; an HSBC Bank account is
// needed to open one. It trades Borsa Istanbul only: its licence page
// grants trade execution "Yurt İçinde" for shares and other securities and
// nothing "Yurt Dışında", and no page offers foreign shares.
//
// The book is the symbol list behind the "Hisse Arama" search of its
// public equity-market page (getStocks, one {Symbol} per line, about
// 11,000 lines). It carries every line of the exchange's equity market:
// - a plain code (THYAO) is a share;
// - "-F" (GLDTR-F) is an exchange-traded fund on the fund board;
// - "-TE" and "-TF" repeat every share and fund under a second data code;
// - "-F1" and "-F2" are real estate and venture capital funds, "-V"
//   warrants, "-C" certificates, "-R" rights, "-S1" the Darphane gold
//   certificate, "-G" the real estate certificate.
// Kept: the shares and the exchange-traded funds. The funds trade on the
// same equity market, through the same order channels; the licence covers
// "Diğer Menkul Kıymetler" as well as "Paylar". The rest stays out.
//
// Names, ISINs and the share-or-fund check come from the exchange's own
// list (../ziraat/bist.mjs: KAP's BIST companies and BYF funds, with
// TradingView's ISINs). A code HSBC lists that the exchange's list does
// not have as the same kind is reported and left out; a code the
// exchange has that HSBC does not list is reported. A fund keeps its BIST
// code (GLDTR, not GLDTR-F), as in ../gcm and ../ahlatci.
//
// Everything is in lira. broker-list.json carries no restriction for
// HSBC Yatırım.
//
// Fees: 0.20% per share buy or sell (internet and phone banking), BSMV
// on top ("Hisse Senedi Alım / Satım Komisyonu ... % 0.20"; "azami %0.2
// (binde 2)" on the equity-market page).
//
//   https://www.hsbcyatirim.com.tr/hizmetlerimiz/pay-senetleri-piyasasi/hsbc-pay-senetleri-piyasasi
//   https://www.hsbc.com.tr/hsbc/urun-ve-hizmet-ucretleri
//   https://www.hsbcyatirim.com.tr/hsbc-yatirim-hakkinda/hsbc-yatirim/hsbc-yatirim-yetki-belgesi
//   https://www.hsbcyatirim.com.tr/hizmetlerimiz/hsbc-yatirim-menkul-degerler-as-hesap-acilisi/hsbc-yatirim-menkul-degerler-as-hesap-acilisi
//   https://www.hsbcyatirim.com.tr/piyasa-verileri/hisse-senedi-piyasalari/hsbc-hisse-senedi-piyasalari
//   https://www.hsbcyatirim.com.tr/api/hsbcdata/getStocks
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//
//   node brokers/hsbctr/hsbctr_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { bistListings } from "../ziraat/bist.mjs";
import fs from "node:fs";

const SOURCE = "https://www.hsbcyatirim.com.tr/api/hsbcdata/getStocks";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function hsbcSymbols() {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(SOURCE, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`${response.status} ${SOURCE}`);
      const lines = await response.json();
      if (!Array.isArray(lines)) throw new Error("getStocks is not a list");
      return lines.map((line) => {
        if (typeof line?.Symbol !== "string") throw new Error(`getStocks line ${JSON.stringify(line)}`);
        return line.Symbol.trim().toUpperCase();
      });
    } catch (error) {
      last = String(error.message || error);
      if (/not a list|getStocks line/.test(last)) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt));
  }
  throw new Error(last);
}

const symbols = await hsbcSymbols();
const shares = new Set();
const funds = new Set();
for (const symbol of symbols) {
  const match = symbol.match(/^([A-Z0-9]+)(?:-([A-Z0-9]+))?$/);
  if (!match) throw new Error(`getStocks symbol ${symbol}`);
  if (!match[2]) shares.add(match[1]);
  else if (match[2] === "F") funds.add(match[1]);
}
if (symbols.length < 5000 || shares.size < 550 || funds.size < 25) {
  throw new Error(`getStocks lists only ${symbols.length} lines, ${shares.size} shares, ${funds.size} funds`);
}

const { rows: bist, notShares, missing } = await bistListings();
const byCode = new Map(bist.map((row) => [row.ticker, row]));
const rows = [];
const unknown = [];
for (const [codes, type, suffix] of [[shares, "STOCK", ""], [funds, "ETF", "-F"]]) {
  for (const code of codes) {
    const row = byCode.get(code);
    if (!row || row.type !== type) {
      unknown.push(code + suffix);
      continue;
    }
    rows.push({ ...row, query: row.isin || code, raw: `${code}${suffix} ${row.raw}` });
  }
}
const listed = new Set(rows.map((row) => row.ticker));
const notAtHsbc = bist.filter((row) => !listed.has(row.ticker)).map((row) => row.ticker).sort();
// A handful of codes can differ for a day around a listing or delisting.
if (unknown.length > 10 || notAtHsbc.length > 10) {
  throw new Error(`HSBC and the exchange disagree: HSBC only ${unknown.join(" ")}; exchange only ${notAtHsbc.join(" ")}`);
}

const kept = stampRows(withoutObligations(rows));
kept.sort((a, b) => a.type.localeCompare(b.type) || a.ticker.localeCompare(b.ticker));
fs.writeFileSync(new URL("hsbctr-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = {};
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `hsbctr: ${kept.length} rows, BIST ${count.STOCK || 0} STOCK, ${count.ETF || 0} ETF; ISIN ${kept.filter((row) => row.isin).length}; ` +
    `getStocks ${symbols.length} lines, ${shares.size} shares, ${funds.size} funds; ` +
    `not on the exchange's list ${unknown.join(" ") || "none"}; exchange only ${notAtHsbc.join(" ") || "none"}; ` +
    `KAP codes not a share ${notShares.length}, not on TradingView ${missing.length}`
);
