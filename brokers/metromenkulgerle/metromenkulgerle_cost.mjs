// What one round trip costs at Metro Menkul Değerler: buy n shares at price
// p on Borsa İstanbul, sell them back at once, on MetroTrade, in dollars.
// Shares and the BIST exchange-traded funds (BYF) of the catalogue. VİOP,
// bonds, repo and the money market are not this trip.
//
// "Metro Menkul Ücretlendirme Politikası (Ücret, Masraf ve Komisyon
// Tarifesi)", read on 2026-10-26:
//
//   Commission     "Pay Senedi/Borsa Yatırım Fonu/Varant - Alım Satım
//                  Komisyonu 0.002 (binde 2-Müşteri bazlı oran) ... İşlem
//                  anında alınmaktadır": 0.2 % each way, shares and BYF
//                  alike. "Tablodaki oranlar azamidir": the printed rate is
//                  the ceiling, and the owner's rule takes the maximum.
//                  No minimum is printed. The lower client-by-client rates
//                  are set in each contract, no figure printed: no remark.
//   BSMV           "Belli ücret veya komisyonlara ayrıca %5 BSMV
//                  eklenmektedir": 5 % on top.
//   Levies         no BIST borsa payı or Takasbank fee on a share trade is
//                  named (only the BIST order-cancellation fee and the MKK
//                  custody fees are passed on): none added (as Ziraat, HSBC).
//   Not this trip  BIST order-cancellation fee, MKK custody ("aylık olarak
//                  ... aynen tahsil edilmekte"), EFT ("Takasbank güncel EFT
//                  masrafı * 2"), statement postage.
//
// Formula: book + 2 × 0.2 % × amount × 1.05 + tax map (no TR rows).
// Cash is lira, every line is lira: no conversion. Book: Borsa İstanbul
// through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.metromenkul.com.tr/storage/app/uploads/public/685/51b/6d3/68551b6d3e691026056439.pdf
//
//   node brokers/metromenkulgerle/metromenkulgerle_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/metromenkulgerle/metromenkulgerle_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "metromenkulgerle",
  broker: "Metro Menkul",
  entity: "Metro Menkul Değerler A.Ş.",
  url: "https://www.metromenkul.com.tr/storage/app/uploads/public/685/51b/6d3/68551b6d3e691026056439.pdf",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://www.metromenkul.com.tr/storage/app/uploads/public/685/51b/6d3/68551b6d3e691026056439.pdf",
  },
  rate: 0.002,
  levies: "none",
  bsmvPrinted: true,
  remark: "",
  onlineBuy: true,
  cash: ["TRY"],
  types: ["STOCK", "ETF"],
  basis:
    "Metro Menkul, Ücret, Masraf ve Komisyon Tarifesi : « Pay Senedi/Borsa Yatırım Fonu/Varant - Alım Satım Komisyonu 0.002 (binde 2-Müşteri bazlı oran) », taux maximal (« Tablodaki oranlar azamidir »), 0,2 % par sens, « %5 BSMV » en sus",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
