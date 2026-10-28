// What one round trip costs at Allbatross Yatırım: buy n shares at price p on
// Borsa İstanbul, sell them back at once, online (Matriks E-Broker), in
// dollars. Shares and the BIST exchange-traded funds (BYF) of the catalogue.
// VİOP, bonds, lending and repo are not this trip.
//
// "Komisyon ve Masraf Tarifesi" (PDF), read on 2026-10-26:
//
//   Commission     "Hisse Senedi/Borsa Yatırım Fonu/Varant/Açığa Satış: İşlem
//                  tutarı üzerinden %0.2 (binde iki) - BSMV dahil": 0.2 % each
//                  way, BSMV included, so no BSMV is added on top. No minimum
//                  printed, one rate for every channel.
//   Levies         none named for trades. "Emir iptali, emir miktarının
//                  azaltılması ve emirlerin fiyatlarının kötüleştirilmesi: BIST
//                  tarafından belirlenen oranlarda ücretlendirilir" is BIST's
//                  order-change fee, not the trade's borsa payı.
//   Not this trip  MKK account opening, custody ("Yetkili saklama kuruluşu
//                  tarafından tahsil edilen tutar"), EFT, credit interest.
//
// Cash in TRY, USD or EUR (its "Banka Hesap Bilgileri" page lists Vadesiz TL,
// USD and EURO accounts); every line is lira: no conversion. No stamp or
// transaction tax on a BIST share; the tax map is still read. Book: Borsa
// İstanbul through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://allbatrossyatirim.com/wp-content/uploads/2025/03/Komisyon_Masraf_Tarifesi-002.pdf
//   https://allbatrossyatirim.com/hakkimizda/banka-hesap-bilgileri/
//
//   node brokers/allbatrossyatrm/allbatrossyatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/allbatrossyatrm/allbatrossyatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "allbatrossyatrm",
  broker: "Allbatross Yatırım",
  entity: "Allbatross Yatırım Menkul Değerler A.Ş.",
  url: "https://allbatrossyatirim.com/wp-content/uploads/2025/03/Komisyon_Masraf_Tarifesi-002.pdf",
  readOn: "2026-10-26",
  sources: { tariff: "https://allbatrossyatirim.com/wp-content/uploads/2025/03/Komisyon_Masraf_Tarifesi-002.pdf" },
  rate: 0.002,
  // "BSMV dahil": the 0.2 % already holds the tax.
  bsmv: 0,
  levies: "none",
  remark: "",
  onlineBuy: true,
  cash: ["TRY", "USD", "EUR"],
  basis:
    "« Komisyon ve Masraf Tarifesi » d'Allbatross (lu le 2026-10-26) : « Hisse Senedi/Borsa Yatırım Fonu/Varant/Açığa Satış: İşlem tutarı üzerinden %0.2 (binde iki) - BSMV dahil », soit 0,2 % par sens BSMV comprise",
  notes: ["BSMV comprise dans les 0,2 % (« BSMV dahil ») : rien en sus"],
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
