// What one round trip costs at Alternatif Menkul (Alternatif Bank's broker):
// buy n shares at price p on Borsa İstanbul, sell them back at once, through
// the internet branch or Alternatif Trader, in dollars. Shares and the BIST
// exchange-traded funds (BYF) of the catalogue. VİOP, bonds and the OTC
// derivatives desk are not this trip.
//
// "Masraf ve Komisyonlar", read on 2026-10-26:
//
//   Commission     "Pay Senetleri alım satım komisyonu: Internet binde 1,
//                  Yatırım danışmanı ve call center binde 2 — İşlem hacmi
//                  üzerinden alınır": 0.1 % each way online. The binde 2
//                  adviser / call-centre rate is not an online price. No
//                  minimum printed.
//   MKK fee        "MKK Pay Senedi Alım-Satım Ücreti 0,1592 TL — Her bir Emir
//                  için alınır": 0.1592 TL on each order, with BSMV, in the
//                  taxes part (as hsbctr_cost.mjs's MKK kayıt ücreti).
//   Levies         the fee page names none; Alternatif's own commission
//                  campaign prices shares as "on binde 7 (%0.07) + Borsa payı
//                  komisyon oranları": the BIST borsa payı (0.25 bps each
//                  side) comes on top of the rate. Takasbank's takas payı is
//                  named only for VİOP, so it is left out.
//   BSMV           not printed on the commission line (other lines say "BSMV
//                  Dahil" or "BSMV Hariçtir"). 5 % is the statutory rate.
//   Not this trip  custody ("Açık Pay Senetleri Saklama Ücreti Yüzbinde 8",
//                  monthly), MKK account upkeep (0.0834 TL a day above
//                  1,000 TL), virman, dividends, EFT, statements.
//   Left out       the new-client offer of onbinde 1 until 31.12.2026
//                  ("Yeni Müşterilere Özel ... Onbinde 1 Komisyon"): an
//                  opening campaign, not the tariff.
//
// No remark. Cash in TRY, USD, EUR or GBP (its contact page lists Alternatif
// Bank TRY, USD, EURO and GBP IBANs); every line is lira: no conversion. No
// stamp or transaction tax on a BIST share; the tax map is still read. Book:
// Borsa İstanbul through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.alternatifmenkul.com.tr/bize-ulasin/masraf-ve-komisyonlar
//   https://www.alternatifmenkul.com.tr/kampanyalar-info/hisse-senedi-ve-viop-komisyonu-kampanyasi
//   https://www.alternatifmenkul.com.tr/bize-ulasin/iletisim-bilgilerimiz
//
//   node brokers/alternatifmenkul/alternatifmenkul_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/alternatifmenkul/alternatifmenkul_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli, BORSA_PAYI, SOURCES } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "alternatifmenkul",
  broker: "Alternatif Menkul",
  entity: "Alternatif Menkul Değerler A.Ş.",
  url: "https://www.alternatifmenkul.com.tr/bize-ulasin/masraf-ve-komisyonlar",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://www.alternatifmenkul.com.tr/bize-ulasin/masraf-ve-komisyonlar",
    borsaPayiWording: "https://www.alternatifmenkul.com.tr/kampanyalar-info/hisse-senedi-ve-viop-komisyonu-kampanyasi",
    borsaPayi: SOURCES.borsaPayi,
  },
  rate: 0.001,
  perTrade: 0.1592,
  levies: { borsaPayi: BORSA_PAYI, takas: 0 },
  bsmvPrinted: false,
  remark: "",
  onlineBuy: true,
  cash: ["TRY", "USD", "EUR", "GBP"],
  basis:
    "« Masraf ve Komisyonlar » d'Alternatif Menkul (lu le 2026-10-26) : « Pay Senetleri alım satım komisyonu: Internet binde 1 », soit 0,1 % par sens en ligne ; « MKK Pay Senedi Alım-Satım Ücreti 0,1592 TL — Her bir Emir için alınır » ; borsa payı BIST en sus du taux (« + Borsa payı » sur la page de campagne de la maison)",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
