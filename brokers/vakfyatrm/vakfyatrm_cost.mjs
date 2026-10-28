// What one round trip costs at Vakıf Yatırım (VakıfBank's broker): buy n
// shares at price p on Borsa İstanbul, sell them back at once, through its
// internet branch or app, in dollars. Shares and the BIST exchange-traded
// funds (BYF) of the catalogue. VİOP, bonds, repo and Forex are not this
// trip.
//
// "Yatırım Ürünleri Bilgilendirme Formu / Tahsil Edilecek Ücret, Masraf ve
// Komisyon Tutarları" (Masraf-ucret-Komisyon-tarifeleri-180326.pdf), read on
// 2026-10-26:
//
//   Commission     "BİAŞ Pay Senedi, Borsa Yatırım Fonu ve Varant Alım Satım
//                  Komisyonu: Piyasa değeri üzerinden binde 2 + BSMV": 0.2 %
//                  each way, shares and BYF alike. No minimum, no volume
//                  scale and no separate internet rate are printed.
//   BSMV           "+ BSMV" printed: 5 %, the statutory rate.
//   Levies         the form ends: "üçüncü kişi ve kuruluşların uygulamakta
//                  olduğu komisyon, faiz, masraf ve ücretlerde meydana gelen
//                  değişiklikler, MÜŞTERİ'ye önceden bilgi verilmek zorunda
//                  olmaksızın MÜŞTERİ hesabına aynen yansıtılabilecektir":
//                  third parties' fees are passed on as they stand. Each side:
//                    BIST borsa payı   0.25 bps of the amount, shares and BYF
//                    Takasbank         4 per million on shares, 1 per
//                                      million on BYF
//                  with BSMV on them (bistCost.mjs, levies "added").
//   Not this trip  custody "Byf, Varant, Pay Senedi Saklama Ücreti ... yıllık
//                  %0,084 (on binde 0,84) + BSMV" (the percent and the words
//                  disagree by ten; at most 0.084 % a year), MKK account
//                  upkeep "Günlük 0,1155 + BSMV" on balances of 1,000 TL or
//                  more, order cancellation (BIST tariff), EFT, transfers,
//                  dividend and capital-increase fees.
//
// Formula: book + 2 × 0.2 % × amount × 1.05
//          + 2 × (0.25 bp + Takasbank) × amount × 1.05 + tax map (no TR rows).
// Cash is lira, every line is lira: no conversion. Book: Borsa İstanbul
// through spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://www.vakifyatirim.com.tr/assets/file/Masraf-ucret-Komisyon-tarifeleri-180326.pdf
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//   https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//
//   node brokers/vakfyatrm/vakfyatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/vakfyatrm/vakfyatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "vakfyatrm",
  broker: "Vakıf Yatırım",
  entity: "Vakıf Yatırım Menkul Değerler A.Ş.",
  url: "https://www.vakifyatirim.com.tr/assets/file/Masraf-ucret-Komisyon-tarifeleri-180326.pdf",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://www.vakifyatirim.com.tr/assets/file/Masraf-ucret-Komisyon-tarifeleri-180326.pdf",
    shares: "https://www.vakifyatirim.com.tr/hisse-senedi",
  },
  rate: 0.002,
  levies: "added",
  bsmvPrinted: true,
  remark: "",
  onlineBuy: true,
  cash: ["TRY"],
  types: ["STOCK", "ETF"],
  basis:
    "Vakıf Yatırım, formulaire de tarifs : « BİAŞ Pay Senedi, Borsa Yatırım Fonu ve Varant Alım Satım Komisyonu : Piyasa değeri üzerinden binde 2 + BSMV », 0,2 % par sens ; frais des tiers « MÜŞTERİ hesabına aynen yansıtılabilecektir », donc borsa payı et takas payı ajoutés",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
