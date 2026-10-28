// What one round trip costs at IKON Menkul: buy n shares at price p on Borsa
// İstanbul, sell them back at once, online (Hissedar app, IKON Online Şube,
// Matriks, iDeal, Forinvest), in dollars. Shares and the BIST
// exchange-traded funds (BYF) of the catalogue. VİOP, bonds, repo and the
// forex/CFD desk are not this trip.
//
// "BIST | İşlem Koşulları ve Komisyon" ("İşlem Ücretleri ve Komisyonlar",
// "Azami Komisyon Oranı/Tutarı (BSMV hariçtir)"), read on 2026-10-26:
//
//   Commission     "Hisse Senedi, Borsa Yatırım Fonu, Varant Komisyonu: İşlem
//                  tutarı üzerinden azami binde 2": a ceiling, so one trip
//                  pays the top, 0.2 % each way (owner's max rule). No lower
//                  rate and no minimum printed.
//   BSMV           "(BSMV hariçtir)": 5 % on top.
//   Levies         none named for trades. The "Diğer (Emir iptali/Fiyat
//                  Kötüleştirme/Miktar azaltımı, ...)" line charges BIST's
//                  order-change fees, not the trade's borsa payı; the MKK
//                  line passes on MKK's custody fees ("MKK Masrafı").
//   Yearly fee     "Yıllık Hesap İşletim ve Platform Ücreti: Azami 50 USD
//                  Karşılığı Türk Lirası bedeli tahsil edilir": not a trip
//                  cost, but a real one: the remark, at the ceiling (owner's
//                  max rule).
//   Not this trip  MKK custody ("MKK tarafından tahsil edilen tutar"), early
//                  (T/T+1) withdrawal of sale proceeds (250 TL and up), EFT,
//                  data packages.
//
// Cash in TRY, USD or EUR (its bank-information page lists TL, USD and EUR
// IBANs); every line is lira: no conversion. No stamp or transaction tax on a
// BIST share; the tax map is still read. Book: Borsa İstanbul through
// spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.ikonmenkul.com.tr/hisse-senedi/islem-kosullari-ve-komisyon
//   https://www.ikonmenkul.com.tr/forex/para-yatirma-para-cekme
//
//   node brokers/ikonmenkul/ikonmenkul_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/ikonmenkul/ikonmenkul_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "ikonmenkul",
  broker: "IKON Menkul",
  entity: "IKON Menkul Değerler A.Ş.",
  url: "https://www.ikonmenkul.com.tr/hisse-senedi/islem-kosullari-ve-komisyon",
  readOn: "2026-10-26",
  sources: { tariff: "https://www.ikonmenkul.com.tr/hisse-senedi/islem-kosullari-ve-komisyon" },
  rate: 0.002,
  levies: "none",
  bsmvPrinted: true,
  remark: "Account and platform fee is $50 a year.",
  onlineBuy: true,
  cash: ["TRY", "USD", "EUR"],
  basis:
    "« İşlem Ücretleri ve Komisyonlar » d'IKON (lu le 2026-10-26) : « Hisse Senedi, Borsa Yatırım Fonu, Varant Komisyonu: İşlem tutarı üzerinden azami binde 2 », BSMV hors taux (« BSMV hariçtir ») ; plafond seul imprimé : on prend le maximum, 0,2 % par sens",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
