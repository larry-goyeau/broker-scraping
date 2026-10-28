// What one round trip costs at Başkent Menkul Değerler (Başkent Yatırım)
// through Başkent Trader or its e-Şube: buy n shares at price p on Borsa
// İstanbul, sell them back at once, in dollars. Shares only: the tariff
// prices no exchange-traded fund (see below), so a BYF line stays N/A.
//
// "Ücret ve Komisyonlar", read on 2026-10-26:
//
//   Commission     "ARACILIK İŞLEMLERİ KOMİSYONLARI ... Fiyat/Oran (BMV
//                  Hariç)": "Pay Piyasası'ndaki tüm pazarlarda (varant ve
//                  sertifika ve BYF işlemleri hariç) gerçekleştirilen
//                  işlemler, İşlem hacmi üzerinden: 0 - 5.000.000 TL arası
//                  işlem hacminde binde 1, 5.000.001 - 10.000.000 TL arası on
//                  binde 7,5, 10.000.001 TL üzeri on binde 5". The period of
//                  the volume is not printed; a trip of this size is in the
//                  first band either way: binde 1 each way, the lowest rate
//                  in the remark. No minimum is printed. BYF are left out of
//                  that line and given no rate: unknown, so not priced.
//   BSMV           "BMV Hariç": added at the statutory 5 %.
//   Takasbank      the same page's "TAKASBANK PAY PİYASASI İŞLEM ÜCRETLERİ":
//                  "Pay Piyasası Takas Komisyonu, İşlem Hacmi, Milyonda 4",
//                  each side, with BSMV. The page prints no BIST borsa payı
//                  line, so none is added.
//   MKK            "Borsa İstanbul'da gerçekleşen pay senedi ... alım satım
//                  işlemlerine ilişkin kayıtlar, Kayıt sayısı ₺0,1592": one
//                  record each leg, with BSMV, in the taxes part (as HSBC's
//                  MKK kayıt ücreti).
//   Not this trip  "Hesap işletim ücreti alınmamaktadır" (2026), MKK account
//                  opening and upkeep (₺0.0834 a day on custody of 1,000 TL
//                  or more), custody (on binde 0.8 a year), order
//                  cancellation (0.75 bp of the cancelled part), transfers.
//
// Formula: book + 2 × amount × 0.1 % × 1.05 + (2 × amount × 4 per million +
// 2 × 0.1592 TL) × 1.05, lira converted with fx.mjs. Cash is lira (one
// Takasbank TL IBAN); every line is lira: no conversion.
//
//   https://www.baskentmenkul.com.tr/tr/yardim-merkezi/ucret-ve-komisyonlar
//
//   node brokers/baskentmenkul/baskentmenkul_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/baskentmenkul/baskentmenkul_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "baskentmenkul",
  broker: "Başkent Menkul",
  entity: "Başkent Menkul Değerler A.Ş.",
  url: "https://www.baskentmenkul.com.tr/tr/yardim-merkezi/ucret-ve-komisyonlar",
  readOn: "2026-10-26",
  sources: { tariff: "https://www.baskentmenkul.com.tr/tr/yardim-merkezi/ucret-ve-komisyonlar" },
  bands: [
    { upTo: 5000000, rate: 0.001 },
    { upTo: 10000000, rate: 0.00075 },
    { upTo: Infinity, rate: 0.0005 },
  ],
  bandOn: "month",
  perTrade: 0.1592,
  levies: { borsaPayi: 0, takas: 0.000004 },
  lowest: 0.0005,
  types: ["STOCK"],
  cash: ["TRY"],
  basis:
    "barème Başkent relu le 2026-10-26 : 0,1 % par sens (première tranche, jusqu'à 5 000 000 TL de volume), " +
    "BSMV en sus (« BMV Hariç »), takas payı Takasbank 4 par million et kayıt MKK 0,1592 TL par opération imprimés sur la même page",
  notes: ["BSMV au taux légal de 5 %", "aucun borsa payı BIST imprimé : non ajouté", "BYF exclus du barème, sans taux : non chiffrés"],
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
