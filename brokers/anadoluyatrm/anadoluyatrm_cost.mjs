// What one round trip costs at Anadolu Yatırım (Anadolubank's broker) through
// Webborsam, its web and mobile platform: buy n shares at price p on Borsa
// İstanbul, sell them back at once, in dollars. Shares and the BIST
// exchange-traded funds (BYF) of the catalogue. VİOP and Paritem (forex) are
// not this trip.
//
// Webborsam "Komisyon Oranları", read on 2026-10-26:
//
//   Commission     "Webborsam'da hisse işlemleriniz için komisyon oranları,
//                  aylık işlem hacimlerine bağlı olarak ... kademeli":
//                    0 – 750.000 TL/ay            binde 2
//                    750.001 – 1.500.000          binde 1,5
//                    ... down to
//                    25.000.001 – ------          binde 0,5
//                  A monthly scale: one trip is the first band, binde 2
//                  each way; the lowest band stays in the remark. No
//                  minimum is printed.
//   Levies         the company's "Ürün ve Hizmet Tarifesi" (PDF): "PAY - VIOP
//                  Borsa Payı Ücreti: Borsa İstanbul A.Ş. ücret tarifesi
//                  geçerlidir" and "Pay - VIOP Takas Komisyonu: Takasbank
//                  ücret ve komisyon tarifesi geçerlidir": the exchange and
//                  clearing fees are charged at their tariffs (BIST 0.25 bp,
//                  Takasbank 4 per million on shares, 1 on BYF, each side),
//                  with BSMV.
//                  The same PDF's "Pay (Hisse) azami oran 0.3 %, günlük işlem
//                  hacmi üzerinden" is the ceiling for every channel; the
//                  online Webborsam price is the one used.
//   BSMV           not printed; 5 % is the statutory rate.
//   Not this trip  MKK custody, account and transfer fees at MKK's tariff
//                  ("Hesap İşletim Ücreti: Alınmamaktadır"), statement
//                  postage, order-cancellation fees, securities lending.
//
// Formula: book + 2 × amount × 0.2 % × 1.05 + 2 × amount × (0.25 bp + 4 per
// million, 1 for BYF) × 1.05, lira converted with fx.mjs. Cash is lira; every
// line is lira: no conversion.
//
//   https://webborsam.com/webborsam/komisyon-oranlari
//   https://anadoluyatirim.com.tr/dokumanlar/sozlesmeler/urun-ve-hizmet-tarifesi.pdf
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//   https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//
//   node brokers/anadoluyatrm/anadoluyatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/anadoluyatrm/anadoluyatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "anadoluyatrm",
  broker: "Anadolu Yatırım",
  entity: "Anadolu Yatırım Menkul Kıymetler A.Ş.",
  url: "https://webborsam.com/webborsam/komisyon-oranlari",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://webborsam.com/webborsam/komisyon-oranlari",
    services: "https://anadoluyatirim.com.tr/dokumanlar/sozlesmeler/urun-ve-hizmet-tarifesi.pdf",
  },
  bands: [
    { upTo: 750000, rate: 0.002 },
    { upTo: 1500000, rate: 0.0015 },
    { upTo: 2500000, rate: 0.0014 },
    { upTo: 5000000, rate: 0.0013 },
    { upTo: 7500000, rate: 0.0012 },
    { upTo: 10000000, rate: 0.0011 },
    { upTo: 12500000, rate: 0.001 },
    { upTo: 15000000, rate: 0.0008 },
    { upTo: 20000000, rate: 0.0007 },
    { upTo: 25000000, rate: 0.0006 },
    { upTo: Infinity, rate: 0.0005 },
  ],
  bandOn: "month",
  levies: "added",
  bsmvPrinted: false,
  lowest: 0.0005,
  cash: ["TRY"],
  basis:
    "barème Webborsam relu le 2026-10-26 : 0,2 % par sens (première tranche du barème mensuel, jusqu'à 750 000 TL), " +
    "BSMV 5 % en sus, borsa payı BIST et takas payı Takasbank refacturés à leur tarif (tarif produits et services)",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
