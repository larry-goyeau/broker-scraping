// What one round trip costs at İntegral Yatırım: buy n shares at price p on
// Borsa İstanbul, sell them back at once, through its internet branch, web
// trader or mobile app, in dollars. Shares and the BIST exchange-traded
// funds (BYF) of the catalogue. VİOP and Forex are not this trip.
//
// "Ücret, Masraf ve Komisyonlara İlişkin Tarife Tablosu" (02/2026 web PDF),
// read on 2026-10-26:
//
//   Commission     "Hisse Senedi (İnternet): 0 ( İnternet kanalı aracılığı
//                  ile verilen hisse senedi alım – satım emirlerinden
//                  komisyon alınmamaktadır. )": no commission online. The
//                  table has one equity-market line, so BYF, which trade on
//                  the same Pay Piyasası, take it too. The phone/desk rate
//                  ("Hisse Senedi: Binde 1+BSMV") is not an online price.
//   Levies         the table prints them: "BORSA PAYI ... PAY PİYASA / PAY
//                  SENEDİ İşlem Hacmi Yüzbinde iki Buçuk 0,000025" and "TAKAS
//                  PAYI ... PAY SENEDİ İşlem Hacmi Milyonda Dört 0,000004",
//                  with "* Masraflar üzerinden BSMV alınmaktadır". Each side:
//                    BIST borsa payı   0.25 bps of the amount
//                    Takasbank         4 per million on shares; BYF at
//                                      Takasbank's own 1 per million (the
//                                      table prints the share line only)
//                  with 5 % BSMV on them.
//   Not this trip  data-screen licences (Matriks, Meta 5: optional), the
//                  inactive-account fee ("6 ay boyunca pasif Hisse ve VİOP
//                  hesaplarından 500.-TL"), order cancellation (BIST rates),
//                  share transfers, dividend and rights fees, EFT.
//
// Formula: book + 0 commission
//          + 2 × (0.25 bp + Takasbank) × amount × 1.05 + tax map (no TR rows).
// Cash is lira (one Takasbank TL IBAN), every line is lira: no conversion.
// Book: Borsa İstanbul through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://integralyatirim.com.tr/uploads/05_ucret_komisyon_masraf_tablosu_web_022026.pdf
//   https://integralyatirim.com.tr/borsa/hesap-iban-bilgileri
//
//   node brokers/integralyatrm/integralyatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/integralyatrm/integralyatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "integralyatrm",
  broker: "İntegral Yatırım",
  entity: "İntegral Yatırım Menkul Değerler A.Ş.",
  url: "https://integralyatirim.com.tr/uploads/05_ucret_komisyon_masraf_tablosu_web_022026.pdf",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://integralyatirim.com.tr/uploads/05_ucret_komisyon_masraf_tablosu_web_022026.pdf",
    online: "https://integralyatirim.com.tr/borsa",
  },
  rate: 0,
  levies: { borsaPayi: 0.000025, takas: { STOCK: 0.000004, ETF: 0.000001 } },
  bsmvPrinted: true,
  remark: "",
  onlineBuy: true,
  cash: ["TRY"],
  types: ["STOCK", "ETF"],
  basis:
    "İntegral Yatırım, tarife tablosu : « Hisse Senedi (İnternet) : 0 (İnternet kanalı aracılığı ile verilen hisse senedi alım – satım emirlerinden komisyon alınmamaktadır.) » ; borsa payı 0,000025 et takas payı 0,000004 imprimés, « Masraflar üzerinden BSMV alınmaktadır »",
  notes: ["BYF : takas payı Takasbank 1 par million (le tableau n'imprime que la ligne pay senedi)"],
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
