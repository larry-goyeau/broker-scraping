// What one round trip costs at Destek Yatırım: buy n shares at price p on
// Borsa İstanbul, sell them back at once, through its internet branch or
// mobile app, in dollars. Shares and the BIST exchange-traded funds (BYF) of
// the catalogue. VİOP, bonds and TEFAS funds are not this trip.
//
// "Komisyon, Ücret ve Masraflar Tarifesi" (PDF), read on 2026-10-26:
//
//   Commission     "Pay Piyasası / Komisyon Oranları: İşlem hacmi üzerinden
//                  azami binde 2 veya işlem hacmine göre değişen oranlar":
//                  up to 0.2 % each way; the volume rates are not printed, so
//                  a trip pays the top rate, binde 2 (owner's max rule). No
//                  minimum is printed. The footnote sets each client's rate
//                  at opening "işlem hacmine göre".
//   BSMV           "Tüm ücretlere %5 BSMV eklenecektir."
//   Levies         the same table lists "Borsa Payı" (Borsa İstanbul
//                  ücretlendirme tablosu) and "Takas Komisyonu" (Takasbank
//                  ücret tarifeleri) under Pay Piyasası: passed on at those
//                  tariffs. Each side:
//                    BIST borsa payı   0.25 bps of the amount, shares and BYF
//                    Takasbank         4 per million on shares, 1 per
//                                      million on BYF
//                  with BSMV on them (bistCost.mjs, levies "added").
//   Not this trip  order cancellation (BIST tariff), share transfers
//                  ("azami 100 TL"), MKK account and custody fees at MKK's
//                  tariff, postal statements, dividend and capital fees,
//                  foreign-currency transfers (0.2 %). TL EFT is free.
//
// Formula: book + 2 × 0.2 % × amount × 1.05
//          + 2 × (0.25 bp + Takasbank) × amount × 1.05 + tax map (no TR rows).
// Cash is lira, US dollars and euros (TL, USD and EUR IBANs); every line is
// lira, a deposit currency: no conversion. Book: Borsa İstanbul through
// spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.destekyatirim.com/storage/01KGS2W2TSBXTNE5SDJ2ZPQRJS.pdf
//   https://www.destekyatirim.com/banka-hesap-bilgileri
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//   https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//
//   node brokers/destekyatrm/destekyatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/destekyatrm/destekyatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "destekyatrm",
  broker: "Destek Yatırım",
  entity: "Destek Yatırım Menkul Değerler A.Ş.",
  url: "https://www.destekyatirim.com/storage/01KGS2W2TSBXTNE5SDJ2ZPQRJS.pdf",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://www.destekyatirim.com/storage/01KGS2W2TSBXTNE5SDJ2ZPQRJS.pdf",
    funding: "https://www.destekyatirim.com/banka-hesap-bilgileri",
  },
  rate: 0.002,
  levies: "added",
  bsmvPrinted: true,
  remark: "",
  onlineBuy: true,
  cash: ["TRY", "USD", "EUR"],
  types: ["STOCK", "ETF"],
  basis:
    "Destek Yatırım, Komisyon, Ücret ve Masraflar Tarifesi : « İşlem hacmi üzerinden azami binde 2 veya işlem hacmine göre değişen oranlar », paliers non imprimés, donc le maximum, 0,2 % par sens ; borsa payı et takas komisyonu aux tarifs BIST et Takasbank, « Tüm ücretlere %5 BSMV eklenecektir »",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
