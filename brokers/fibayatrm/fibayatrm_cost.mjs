// What one round trip costs at Fiba Yatırım (Fibabanka's broker): buy n
// shares at price p, sell them back at once, in dollars. Borsa İstanbul
// shares and exchange-traded funds (BYF) in lira through its digital
// channels (Fibabanka Mobil's Borsa Market, Fibayatırım Mobil, the internet
// branch), and US shares and ETFs in dollars through the "Yurt Dışı
// Piyasalar" account held at Alpaca Securities LLC. VİOP, warrants and
// bonds are not this trip.
//
// "Ücret ve Komisyonlar" (with its "Diğer Komisyon ve Ücretler" tab) and the
// "Yurt Dışı Piyasalar" page, read on 2026-10-26:
//
//   BIST commission  "Dijital Kanallar Üzerinden Yapılan İşlemlerde Aylık
//                    Kademeli Komisyon Uygulanır", binde:
//                      0 – 500.000              2
//                      500.001 – 1.000.000      1,9
//                      1.000.001 – 2.500.000    1,85
//                      2.500.001 – 5.000.000    1,8
//                      5.000.001 – 7.500.000    1,7
//                      7.500.001 – 10.000.000   1,6
//                      10.000.001 – 15.000.000  1,4
//                      15.000.001 – 20.000.000  1,2
//                      20.000.000+              1
//                    A monthly scale: one trip is the first band, binde 2
//                    each way; the lowest band is the remark. No minimum.
//                    ("Yatırım Danışması Müşteri Temsilcisi ... binde 2" is the
//                    adviser channel.)
//   BSMV             "Alınan komisyon üzerinden %5 BSMV uygulanır".
//   BIST levies      the tariff passes on no BIST borsa payı or Takasbank
//                    fee: "Diğer Ücret ve Komisyonlar" lists only MKK and
//                    custody items (levies "none", as Ziraat and HSBC).
//   US commission    "Tüm Hacimler için Komisyon Ücreti 1 USD" an order
//                    ("işlem hacminden bağımsız işlem başına sabit 1 USD (BSMV
//                    hariç)"), "Alınan komisyon üzerinden %5 BSMV
//                    uygulanır": 1.05 USD each leg.
//   US regulatory    SEC, TAF and CAT not printed: 0, as in the other files.
//   Not this trip    "Müşteri İsmine Saklama Sistemi Komisyonu" (BSMV dahil
//                    %0,021 a month of the nominal value held), MKK account
//                    and custody pass-through, ADR fees, ACATS 25 USD, DTC
//                    5 USD.
//
// FX: cash in lira or dollars (deposits.mjs); US lines are dollars, a
// deposit currency: the remark "FX when cash ≠ USD." (no rate printed).
// Book: Borsa İstanbul through spreads/book.mjs (a name with no leaf is
// N/A); US lines are the 605 times Alpaca Securities LLC's 606 Q, the US
// broker named on the page ("Alpaca Securities LLC nezdinde saklanan
// müşteri hesapları").
//
//   https://www.fibayatirim.com.tr/urun-ve-hizmetler/ucret-ve-komisyonlar
//   https://www.fibayatirim.com.tr/urun-ve-hizmetler/ucret-ve-komisyonlar/diger-komisyon-ve-ucretler
//   https://www.fibayatirim.com.tr/urun-ve-hizmetler/yurt-disi-piyasalar
//
//   node brokers/fibayatrm/fibayatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/fibayatrm/fibayatrm_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/fibayatrm/fibayatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { trUsCost, printCli, bandRemark } from "../aktifyatrm/trUsCost.mjs";

const BANDS = [
  { upTo: 500_000, rate: 0.002 },
  { upTo: 1_000_000, rate: 0.0019 },
  { upTo: 2_500_000, rate: 0.00185 },
  { upTo: 5_000_000, rate: 0.0018 },
  { upTo: 7_500_000, rate: 0.0017 },
  { upTo: 10_000_000, rate: 0.0016 },
  { upTo: 15_000_000, rate: 0.0014 },
  { upTo: 20_000_000, rate: 0.0012 },
  { upTo: Infinity, rate: 0.001 },
];

// FX: Fiba prints no conversion rate; the US account is funded with dollars
// moved from Fibabanka Mobil, so the group bank's board stands in (owner,
// 2026-10-26): Fibabanka "FX Market" USD/TRY bid 49.46376, ask 50.07117
// (2026-10-26 13:54), (ask - mid) / mid = 0.61 %.
//   https://www.fibabanka.com.tr/piyasa-verileri/doviz
const SCHEDULE = {
  fxPct: "0.61",
  folder: "fibayatrm",
  broker: "Fiba Yatırım",
  entity: "Fiba Yatırım Menkul Değerler A.Ş.",
  url: "https://www.fibayatirim.com.tr/urun-ve-hizmetler/ucret-ve-komisyonlar",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://www.fibayatirim.com.tr/urun-ve-hizmetler/ucret-ve-komisyonlar",
    other: "https://www.fibayatirim.com.tr/urun-ve-hizmetler/ucret-ve-komisyonlar/diger-komisyon-ve-ucretler",
    us: "https://www.fibayatirim.com.tr/urun-ve-hizmetler/yurt-disi-piyasalar",
  },
  bist: {
    bands: BANDS,
    bandOn: "month",
    levies: "none",
    bsmvPrinted: true,
    cash: ["TRY", "USD"],
    types: ["STOCK", "ETF"],
    basis:
      "Fiba Yatırım, Ücret ve Komisyonlar relu le 2026-10-26 : canaux numériques, barème mensuel binde 2 jusqu'à 500 000 TL " +
      "(première tranche) jusqu'à binde 1 au-delà de 20 M TL, « Alınan komisyon üzerinden %5 BSMV »",
  },
  bistRemark: bandRemark({ top: 0.002, lowest: 0.001, label: "Over 20,000,000 TL traded a month" }),
  us: {
    dealer: "alpaca",
    dealerName: "Alpaca Securities LLC",
    mics: ["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE"],
    types: ["STOCK", "ETF", "ETN"],
    commission: () => 1,
    bsmv: true,
    regulatory: {},
    basis:
      "Fiba Yatırım, Yurt Dışı Piyasalar relu le 2026-10-26 : « işlem başına sabit 1 USD (BSMV hariç) », BSMV 5 % en sus, " +
      "soit 1,05 $ chaque sens ; SEC, TAF et CAT non imprimés : 0",
  },
};

export const roundTrip = (q) => trUsCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
