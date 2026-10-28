// What one round trip costs at Trive Yatırım: buy n shares at price p on
// Borsa İstanbul, sell them back at once, through Trive's app or web
// platform, in dollars. Shares and the BIST exchange-traded funds (BYF) of
// the catalogue. VİOP, forex, foreign shares and bonds are not this trip.
//
// "Masraf ve Komisyonlar" and the "Sıfır Komisyon" page, read on 2026-10-26:
//
//   Commission     "Hisse Senedi İşlemleri Komisyon Oranları": 0.00 –
//                  5,000,000.00 TL → 0; above 5,000,000.01 TL "On binde 2"
//                  ("Aracılık komisyon oranı ... Aylık 5 milyon TL'yi aşan
//                  Hacimlerde onbinde iki oranında uygulanır"). A monthly
//                  scale: one trip sits in the first band, 0 %. No minimum.
//   Levies         "Viop ve Hisse için BİST Borsa Payı, Takasbank Ücreti ve
//                  BSMV ücretleri yatırımcılarımızdan tahsil edilecektir":
//                  BIST borsa payı 0.25 bps and Takasbank 4 per million on
//                  shares, 1 per million on BYF, each side, with 5 % BSMV
//                  (../halkyatrm/bistCost.mjs).
//   Not this trip  "T0 İşlem Ücretleri" (same-day withdrawal of sale
//                  proceeds, 13.50 TL + BSMV and up), virman out 25 TL + BSMV
//                  a share, EFT, lending fee, MKK custody.
//
// No remark: the only other rate (0.02 % above 5 million TL a month) is
// higher. Cash in TRY, USD or EUR (its bank-account page lists TRL, USD and
// EUR IBANs); every line is lira: no conversion. No stamp or transaction tax
// on a BIST share; the tax map is still read. Book: Borsa İstanbul through
// spreads/book.mjs; a name with no leaf stays N/A.
//
//   https://trive.com.tr/masraf-ve-komisyonlar
//   https://trive.com.tr/hisse-senetleri/sifir-komisyon
//   https://trive.com.tr/para-yatirma-cekme-islemleri
//
//   node brokers/triveyatrm/triveyatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/triveyatrm/triveyatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli, SOURCES } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "triveyatrm",
  broker: "Trive Yatırım",
  entity: "Trive Yatırım Menkul Değerler A.Ş.",
  url: "https://trive.com.tr/masraf-ve-komisyonlar",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://trive.com.tr/masraf-ve-komisyonlar",
    zeroCommission: "https://trive.com.tr/hisse-senetleri/sifir-komisyon",
    ...SOURCES,
  },
  bands: [
    { upTo: 5_000_000, rate: 0 },
    { upTo: Infinity, rate: 0.0002 },
  ],
  bandOn: "month",
  levies: "added",
  bsmvPrinted: true,
  remark: "",
  onlineBuy: true,
  cash: ["TRY", "USD", "EUR"],
  basis:
    "barème « Hisse Senedi İşlemleri Komisyon Oranları » de Trive (lu le 2026-10-26) : 0 % jusqu'à 5 millions TL de volume mensuel, onbinde 2 au-delà ; un aller-retour reste dans la première tranche ; borsa payı BIST, frais Takasbank et BSMV « yatırımcılarımızdan tahsil edilecektir »",
  notes: ["barème mensuel : un aller-retour prend la première tranche (0 %)"],
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
