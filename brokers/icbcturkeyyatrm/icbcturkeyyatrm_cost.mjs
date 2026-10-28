// What one round trip costs at ICBC Turkey Yatırım: buy n shares at price p
// on Borsa İstanbul, sell them back at once, through its internet branch, in
// dollars. Shares and the BIST exchange-traded funds (BYF) of the catalogue.
// VİOP, bonds, money markets and warrants are not this trip.
//
// "EK-6 Masraf, Komisyon ve Ücret Listesi" (PDF), read on 2026-10-26:
//
//   Commission     "Borsa İstanbul Pay Piyasası, GİP ve PÖİP'te işlem gören
//                  paylar, yeni pay alma hakları, borsa yatırım fonları ...
//                  alım satım aracılık hizmet komisyonu: Her bir işlem
//                  bazında uygulanmak üzere müşteri özelinde komisyon oranı
//                  sözleşme ile belirlenmiş olup Aracı Kurum bu oranı ...
//                  azami 'yüzde 1'e kadar çıkarabilir": the rate is set per
//                  client, up to 1 % each way. A discretionary range takes
//                  its maximum (owner's rule): 1 % each way. No minimum.
//   BSMV           "tahsil edilen komisyon tutarları üzerinden BSMV
//                  hesaplanarak tahsil edilir": 5 %, the statutory rate.
//   Levies         "Borsa payı ve diğer ücretler: ... Borsa tarafından
//                  hesaplanan ve tahsil edilen ücretler müşteri tarafından
//                  ödenir" and "MKK, Borsa, Takasbank ... tarafından tahsil
//                  edilen komisyon ve diğer ücretler müşteri hesabına
//                  yansıtılır". Each side:
//                    BIST borsa payı   0.25 bps of the amount, shares and BYF
//                    Takasbank         4 per million on shares, 1 per
//                                      million on BYF
//                  with BSMV on them (bistCost.mjs, levies "added").
//   Not this trip  custody at MKK's tariff ("yüzbinde 8" a year on market
//                  value, up to twice that as a service fee: at most
//                  0.016 % a year), order cancellation (BIST tariff), postal
//                  statements (200 TL a month), dividend and capital-increase
//                  fees. "Hesap işletim ücreti alınmamaktadır."
//
// Formula: book + 2 × 1 % × amount × 1.05
//          + 2 × (0.25 bp + Takasbank) × amount × 1.05 + tax map (no TR rows).
// Cash is lira, every line is lira: no conversion. Book: Borsa İstanbul
// through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.icbcyatirim.com.tr/tr/images/pdf/Masraf-Komisyon-ve-Ucret-Listesi.pdf
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//   https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//
//   node brokers/icbcturkeyyatrm/icbcturkeyyatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/icbcturkeyyatrm/icbcturkeyyatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "icbcturkeyyatrm",
  broker: "ICBC Turkey Yatırım",
  entity: "ICBC Turkey Yatırım Menkul Değerler A.Ş.",
  url: "https://www.icbcyatirim.com.tr/tr/images/pdf/Masraf-Komisyon-ve-Ucret-Listesi.pdf",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://www.icbcyatirim.com.tr/tr/images/pdf/Masraf-Komisyon-ve-Ucret-Listesi.pdf",
    shares: "https://www.icbcyatirim.com.tr/tr/hizmetlerimiz/detay/Hisse-Senedi/14/12/0",
  },
  rate: 0.01,
  levies: "added",
  bsmvPrinted: true,
  remark: "",
  onlineBuy: true,
  cash: ["TRY"],
  types: ["STOCK", "ETF"],
  basis:
    "ICBC Turkey Yatırım, EK-6 Masraf, Komisyon ve Ücret Listesi : taux fixé par client, « azami 'yüzde 1'e kadar çıkarabilir » ; fourchette discrétionnaire, donc le maximum, 1 % par sens ; borsa payı et frais Takasbank « müşteri tarafından ödenir », BSMV en sus",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
