// What one round trip costs at Strateji Menkul Değerler: buy n shares at
// price p on Borsa İstanbul, sell them back at once, online (Strateji
// Trader, Matriks IQ, Web Trader), in dollars. Shares and the BIST
// exchange-traded funds (BYF) of the catalogue. VİOP, warrants, options and
// repo are not this trip.
//
// "Ücret, Masraf ve Komisyon Bilgilendirmesi" of 04 Aralık 2025 (PDF), read
// on 2026-10-26:
//
//   Commission     "1. Pay Piyasası İşlem Komisyonları ... Pay Komisyonu
//                  Sabit Oran* (Binde): 2 - İnternet Oranı (Binde): 0.5",
//                  with "*Sabit Oran: Müşteri temsilcisi aracılığıyla
//                  yapılan işlemlerdir". Online is 0.05 % each way; the
//                  0.2 % representative rate is not an online price. No
//                  minimum printed.
//   Levies         "(Ayrıca borsa payı ilave edilecektir ...)" and "6. Borsa
//                  Payı: Borsa İstanbul tarifesi uygulanmakta olup ayrıca bir
//                  komisyon tahsil edilmeyecektir": the BIST borsa payı,
//                  0.25 bps each side, is added at cost. Takasbank's takas
//                  payı is not named for trades (the notice cites Takasbank
//                  only for EFT and custody), so it is left out.
//   BSMV           not printed. 5 % is the statutory rate on a brokerage
//                  commission and on the fees passed on.
//   Not this trip  EFT and custody (Takasbank tariff), BPP, repo.
//
// No remark: the online rate is the lowest printed. Cash is lira only (no
// foreign-currency account printed); every line is lira: no conversion. No
// stamp or transaction tax on a BIST share; the tax map is still read.
// Book: Borsa İstanbul through spreads/book.mjs; a name with no leaf stays
// N/A.
//
//   https://strateji.com.tr/wp-content/uploads/2025/12/Ucret-Masraf-ve-Komisyon-Bilgilendirilmesi-2025-12-04.pdf
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//
//   node brokers/stratejimenkulge/stratejimenkulge_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/stratejimenkulge/stratejimenkulge_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli, BORSA_PAYI, SOURCES } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "stratejimenkulge",
  broker: "Strateji Menkul Değerler",
  entity: "Strateji Menkul Değerler A.Ş.",
  url: "https://strateji.com.tr/wp-content/uploads/2025/12/Ucret-Masraf-ve-Komisyon-Bilgilendirilmesi-2025-12-04.pdf",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://strateji.com.tr/wp-content/uploads/2025/12/Ucret-Masraf-ve-Komisyon-Bilgilendirilmesi-2025-12-04.pdf",
    borsaPayi: SOURCES.borsaPayi,
  },
  rate: 0.0005,
  levies: { borsaPayi: BORSA_PAYI, takas: 0 },
  bsmvPrinted: false,
  remark: "",
  onlineBuy: true,
  cash: ["TRY"],
  basis:
    "« Ücret, Masraf ve Komisyon Bilgilendirmesi » de Strateji du 04.12.2025 : « İnternet Oranı (Binde): 0.5 » sur le pay piyasası, soit 0,05 % par sens en ligne (le « Sabit Oran » de binde 2 passe par un représentant) ; « Ayrıca borsa payı ilave edilecektir » : borsa payı BIST ajouté au tarif de la bourse, takas payı Takasbank non nommé pour les ordres",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
