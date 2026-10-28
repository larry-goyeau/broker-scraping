// What one round trip costs at Piapiri, the app of ÜNLÜ Menkul Değerler
// A.Ş. (ÜNLÜ & Co): buy n shares at price p, sell them back at once, in
// dollars. Borsa İstanbul shares and exchange-traded funds (BYF) in lira,
// and US shares and ETFs in dollars, both ordered in the app. VİOP,
// warrants and funds are not this trip.
//
// Read on 2026-10-26:
//
//   BIST commission  "Borsa İstanbul Komisyon Oranlarımız" (the page the FAQ
//                    "Piapiri Komisyon Oranlarını Nereden Öğrenirim?" links):
//                      Aylık Hacim                  Komisyon Oranı
//                      150.000 - 500.000 TL arası   On binde 5
//                      500.000 - 2.000.000 TL arası On binde 4
//                      2.000.000 - 5.000.000 TL     On binde 3
//                      5.000.000 TL'den fazla       On binde 2
//                    A monthly scale: one trip is the first band, 0.05 %
//                    each way. No rate is printed under 150,000 TL a month
//                    (the FAQ sends "Diğer komisyon oranlarımız" to the call
//                    centre), so the first printed band stands for it. The
//                    lowest band is the remark. No minimum.
//   BSMV             not printed; 5 %, the statutory rate.
//   BIST levies      no BIST borsa payı or Takasbank fee is printed as passed
//                    on (levies "none").
//   US commission    "ABD Borsaları Komisyon Oranlarımız": "1 – 260 Sabit 1,3
//                    USD", "261 ve üzeri Lot x 0.005 USD", "260'ı geçen tüm
//                    lot için 0.005 USD"; the FAQ: "260 lota kadar her
//                    işlemde yalnızca 1,3 USD işlem ücreti ödersin. 261 lot ve
//                    üzeri işlemlerde ise 260 lot sonrası her ek lot için
//                    0,005 USD eklenir": 1.30 USD plus 0.005 USD for each
//                    share above 260, each leg ("satışta da işlem başına
//                    sabit komisyon uygulanır"). Fractions of a share pay
//                    the 1.30. BSMV not printed: 5 % added.
//   US regulatory    "varsa düzenleyici kurum ücretleri", no amount: 0.
//   Not this trip    ADR fees, T+0 cash ("Hemen Nakit"), transfers.
//
// FX: cash in lira, dollars, euros and the other currencies of ÜNLÜ's IBAN
// list (deposits.mjs); US lines are dollars, a deposit currency: the remark
// "FX when cash ≠ USD." (no rate printed). Book: Borsa İstanbul through
// spreads/book.mjs (a name with no leaf is N/A). US lines: Piapiri names no
// US broker-dealer, so the quoted NBBO.
//
//   https://www.piapiri.com/urunlerhizmetler/borsa-istanbul/
//   https://www.piapiri.com/urunlerhizmetler/abd-borsalari/
//   https://www.piapiri.com/bize-sor/hesap-acilisi/
//
//   node brokers/piapiri/piapiri_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/piapiri/piapiri_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/piapiri/piapiri_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { trUsCost, printCli, bandRemark } from "../aktifyatrm/trUsCost.mjs";

const US_FLAT = 1.3;
const US_FLAT_UP_TO = 260;
const US_EXTRA = 0.005;

const SCHEDULE = {
  folder: "piapiri",
  broker: "Piapiri",
  entity: "ÜNLÜ Menkul Değerler A.Ş.",
  url: "https://www.piapiri.com/urunlerhizmetler/borsa-istanbul/",
  readOn: "2026-10-26",
  sources: {
    bist: "https://www.piapiri.com/urunlerhizmetler/borsa-istanbul/",
    us: "https://www.piapiri.com/urunlerhizmetler/abd-borsalari/",
    faq: "https://www.piapiri.com/bize-sor/hesap-acilisi/",
  },
  bist: {
    bands: [
      { upTo: 500_000, rate: 0.0005 },
      { upTo: 2_000_000, rate: 0.0004 },
      { upTo: 5_000_000, rate: 0.0003 },
      { upTo: Infinity, rate: 0.0002 },
    ],
    bandOn: "month",
    levies: "none",
    bsmvPrinted: false,
    cash: ["TRY", "USD", "EUR", "AUD", "CAD", "CHF", "GBP"],
    types: ["STOCK", "ETF"],
    basis:
      "Piapiri, « Borsa İstanbul Komisyon Oranlarımız » relu le 2026-10-26 : barème mensuel on binde 5 de 150 000 à 500 000 TL " +
      "(première tranche imprimée) jusqu'à on binde 2 au-delà de 5 M TL",
    notes: ["aucun taux imprimé sous 150 000 TL par mois : la première tranche imprimée en tient lieu"],
  },
  bistRemark: bandRemark({ top: 0.0005, lowest: 0.0002, label: "Over 5,000,000 TL traded a month" }),
  us: {
    dealer: null,
    mics: ["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE"],
    types: ["STOCK", "ETF", "ETN"],
    commission: (n) => US_FLAT + US_EXTRA * Math.max(0, n - US_FLAT_UP_TO),
    bsmv: true,
    regulatory: {},
    basis:
      "Piapiri, « ABD Borsaları Komisyon Oranlarımız » relu le 2026-10-26 : 1,3 $ par ordre jusqu'à 260 parts, " +
      "0,005 $ par part au-delà de 260 en sus ; BSMV non imprimée, 5 % (taux légal) en sus ; SEC, TAF et CAT non chiffrés : 0",
    notes: ["« Lot x 0.005 USD » lu avec la FAQ (« 260 lot sonrası her ek lot için 0,005 USD eklenir ») : 1,3 $ + 0,005 $ par part au-delà de 260"],
  },
};

export const roundTrip = (q) => trUsCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
