// What one round trip costs at Galata Menkul Değerler through its online
// order channels: buy n shares at price p on Borsa İstanbul, sell them back
// at once, in dollars. Shares and the BIST exchange-traded funds (BYF) of the
// catalogue. Phone orders, VİOP and bonds are not this trip.
//
// "Nasıl Hesap Açarım? – Komisyon ve Masraflar", read on 2026-10-26:
//
//   Commission     "Pay Piyasası Komisyon Oranları ... Online İşlemler
//                  0.0005 (Onbinde 5)" against "Telefon ile İşlemler 0.002
//                  (Binde 2)", "Komisyon Oranı (BSMV hariç)": 0.05 % each
//                  way online. No minimum and no volume scale printed.
//   BSMV           added: the table is "BSMV hariç" and the same section
//                  prints its rate on the other lines, "+ BSMV (0,05)".
//   Levies         the section closes with "Borsa İstanbul A.Ş. tüm masraf
//                  tarifelerine ulaşmak için tıklayınız" and the same for MKK
//                  and Takasbank: the account's charges include the
//                  exchange's and Takasbank's tariffs, so BIST 0.25 bp and
//                  Takasbank 4 per million on shares (1 on BYF) are added
//                  each side, with BSMV.
//   Not this trip  hesap bakım ücreti (0.070 TL a day on custody of 1,000 TL
//                  or more), saklama ücreti (yüzbinde 10.4 a year), hesap
//                  işletim ücreti 50 TL, EFT, virman, data screens, margin
//                  interest, order cancellation at BIST's rates.
//
// Formula: book + 2 × amount × 0.05 % × 1.05 + 2 × amount × (0.25 bp + 4 per
// million, 1 for BYF) × 1.05, lira converted with fx.mjs. Every line is lira,
// a deposit currency (TL, USD and EUR accounts): no conversion.
//
//   https://galatamenkul.com/nasil-hesap-acarim/#komisyon-ve-masraflar
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//   https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//
//   node brokers/galatamenkul/galatamenkul_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/galatamenkul/galatamenkul_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "galatamenkul",
  broker: "Galata Menkul",
  entity: "Galata Menkul Değerler A.Ş.",
  url: "https://galatamenkul.com/nasil-hesap-acarim/#komisyon-ve-masraflar",
  readOn: "2026-10-26",
  sources: { tariff: "https://galatamenkul.com/nasil-hesap-acarim/#komisyon-ve-masraflar" },
  rate: 0.0005,
  levies: "added",
  remark: "",
  cash: ["TRY", "USD", "EUR"],
  basis:
    "barème Galata relu le 2026-10-26 : ordres en ligne 0,05 % par sens (BSMV hors taxe, « + BSMV (0,05) »), " +
    "tarifs BIST et Takasbank renvoyés par la page des frais",
  notes: ["le tarif téléphone (0,2 %) n'est pas retenu"],
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
