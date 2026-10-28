// What one round trip costs at Dünya Katılım Bankası: buy n shares at price
// p on Borsa İstanbul, sell them back at once, in its mobile app, in
// dollars. Shares of the BIST Katılım index only (the catalogue). The bank
// intermediates through Ahlatcı Yatırım ("Ahlatcı Yatırım Menkul Değerler
// aracılığıyla hisse senedi işlemlerine aracılık etmekteyiz"); trades on
// Ahlatcı's own channels are Ahlatcı's tariff (../ahlatci), not this file.
//
// Hisse Senedi page, FAQ "Komisyon Oranınız Nedir?", read on 2026-10-26:
//
//   Commission     "Hisse senedi alım satımlarında gerçekleşen işlem
//                  hacminin binde ikisi (BSMV hariç) oranında komisyon
//                  alınır": 0.2 % each way. No minimum is printed.
//   BSMV           "BSMV hariç": 5 % on top, the statutory rate.
//   Levies         no BIST borsa payı or Takasbank fee passed on is named on
//                  the page or in the bank's "Bireysel Ürün ve Hizmet
//                  Ücretleri" table, which has no share-trade line: none
//                  added (as Ziraat, HSBC).
//   Not this trip  the BIST order-cancellation fee ("Borsa İstanbul'un
//                  belirlediği iptal komisyonu tarifesine göre"), MKK custody.
//
// Formula: book + 2 × 0.2 % × amount × 1.05 + tax map (no TR rows).
// Cash is lira (moved from the current account to the investment account),
// every line is lira: no conversion. Book: Borsa İstanbul through
// spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://dunyakatilim.com.tr/kendim-icin/yatirim-urunleri/sermaye-piyasasi-urunleri/hisse-senedi
//   https://dunyakatilim.com.tr/content/files/uploads/2516/dk-bireysel-ucrt11-180526.pdf
//
//   node brokers/dunyakatlmbankas/dunyakatlmbankas_cost.mjs TKFEN BIST TRY --shares=10 --price=4840
//   node brokers/dunyakatlmbankas/dunyakatlmbankas_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "dunyakatlmbankas",
  broker: "Dünya Katılım",
  entity: "Dünya Katılım Bankası A.Ş. (via Ahlatcı Yatırım Menkul Değerler A.Ş.)",
  url: "https://dunyakatilim.com.tr/kendim-icin/yatirim-urunleri/sermaye-piyasasi-urunleri/hisse-senedi",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://dunyakatilim.com.tr/kendim-icin/yatirim-urunleri/sermaye-piyasasi-urunleri/hisse-senedi",
    fees: "https://dunyakatilim.com.tr/content/files/uploads/2516/dk-bireysel-ucrt11-180526.pdf",
  },
  rate: 0.002,
  levies: "none",
  bsmvPrinted: true,
  remark: "",
  onlineBuy: true,
  cash: ["TRY"],
  types: ["STOCK"],
  basis:
    "Dünya Katılım, page Hisse Senedi : « işlem hacminin binde ikisi (BSMV hariç) oranında komisyon alınır », 0,2 % par sens plus BSMV, sans minimum imprimé",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
