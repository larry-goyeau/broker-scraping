// What one round trip costs at Halk Yatırım: buy n shares at price p on
// Borsa İstanbul, sell them back at once, through its internet branch or
// mobile app, in dollars. Shares and the BIST exchange-traded funds (BYF) of
// the catalogue. VİOP, bonds, Forex/CFD and portfolio management are not
// this trip.
//
// "Komisyon ve Masraf Tarifesi" (PDF), read on 2026-10-26:
//
//   Commission     1.1 Pay Alım Satım İşlemleri: "İşlem hacmi üzerinden %0,3
//                  (binde 3) oranında standart komisyon tarifesi tutarı
//                  uygulanır": 0.3 % each way. 1.3 Borsa Yatırım Fonu: "pay
//                  alım satım işlemi komisyon oranı uygulanır", the same rate.
//                  No minimum and no volume scale are printed; the header
//                  says rates may be set per client or channel, so the
//                  standard rate is the published one.
//   BSMV           "Komisyon bedelleri üzerinden ayrıca BSMV tahsil
//                  edilecektir": 5 %, the statutory rate.
//   Levies         1.4 Pay Piyasası Borsa Payı "Gerçekleştirilen işlem hacmi
//                  ... üzerinden alınmaktadır ... İlgili tutar/tutarlar
//                  üzerinden ayrıca BSMV tahsil edilecektir" and 1.5 Pay
//                  Piyasası Takas Komisyonu "işlem hacmi üzerinden
//                  alınmaktadır ... ayrıca BSMV": passed on at the exchange
//                  and Takasbank tariffs. Each side:
//                    BIST borsa payı   0.25 bps of the amount, shares and BYF
//                    Takasbank         4 per million on shares, 1 per
//                                      million on BYF
//                  with BSMV on them (bistCost.mjs, levies "added").
//   Not this trip  account upkeep "295 TL (yıllık 590 TL)" a half-year, MKK
//                  and Takasbank custody pass-through, order cancellation
//                  fee (2 × the BIST fee), T+0 cash service, EFT, transfers,
//                  postal statements, short-selling and lending.
//
// Formula: book + 2 × 0.3 % × amount × 1.05
//          + 2 × (0.25 bp + Takasbank) × amount × 1.05 + tax map (no TR rows).
// Cash is lira, every line is lira: no conversion. Book: Borsa İstanbul
// through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://halkyatirim.com.tr/pdf/KomisyonveMasrafTarifesi.pdf
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//   https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//
//   node brokers/halkyatrm/halkyatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/halkyatrm/halkyatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "./bistCost.mjs";

const SCHEDULE = {
  folder: "halkyatrm",
  broker: "Halk Yatırım",
  entity: "Halk Yatırım Menkul Değerler A.Ş.",
  url: "https://halkyatirim.com.tr/pdf/KomisyonveMasrafTarifesi.pdf",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://halkyatirim.com.tr/pdf/KomisyonveMasrafTarifesi.pdf",
    channels: "https://www.halkyatirim.com.tr/content/tr/pay-piyasasi",
  },
  rate: 0.003,
  levies: "added",
  bsmvPrinted: true,
  remark: "",
  onlineBuy: true,
  cash: ["TRY"],
  types: ["STOCK", "ETF"],
  basis:
    "Halk Yatırım, Komisyon ve Masraf Tarifesi : « İşlem hacmi üzerinden %0,3 (binde 3) oranında standart komisyon tarifesi », 0,3 % par sens, BYF au même taux, « ayrıca BSMV » ; borsa payı et takas komisyonu refacturés avec BSMV (1.4, 1.5)",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
