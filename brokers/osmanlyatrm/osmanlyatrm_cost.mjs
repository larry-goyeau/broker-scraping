// What one round trip costs at Osmanlı Yatırım: buy n shares at price p,
// sell them back at once, in dollars. Borsa İstanbul shares and
// exchange-traded funds (BYF) in lira through its online platforms
// (e-Şube, Osmanlı Mobil, Aktif Trader, TradingView), and US shares and ETFs
// on Nasdaq, the NYSE and NYSE American in dollars. VİOP, options, futures,
// warrants and bonds are not this trip.
//
// "Ücret ve Komisyonlar", read on 2026-10-26 (rates "07.07.2026 tarihinden
// itibaren geçerlidir"):
//
//   BIST commission  "Hisse (Pay) Senedi Hacim ve Komisyon Skalası", on binde:
//                      0 – 15.000.000            3,75
//                      15.000.001 – 40.000.000   2,75
//                      40.000.001 – 70.000.000   1,75
//                      70.000.001 – üstü         1,00
//                    "İşlem hacminize göre üst skalaya geçmeniz durumunda
//                    aradaki fark bir sonraki ayın ilk iş günü iade edilir":
//                    a monthly scale, one trip is the first band, 0.0375 %
//                    each way; the lowest band is the remark. "Hisse senedi
//                    işlemlerinde uygulanacak minimum ücret tutarı 65 kuruş +
//                    BSMV", "Minimum işlem komisyon tutarı gün sonu
//                    yansıtılmaktadır": 0.65 TL on the day's commission (the
//                    two legs together).
//   BSMV             "*Vergi Yükümlülükleri hariç tutarlardır", "+ BSMV": 5 %.
//   BIST levies      "Borsa ve Takas Payı", yüz binde, "Pay Senedi İşlemleri
//                    2,5 + 0,4": BIST 0.25 bp and Takasbank 4 per million each
//                    side (Takasbank's 1 per million on BYF), with BSMV
//                    ("Vergi yükümlülükleri hariç").
//   US commission    "Hisse 0,01 $ ABD hisse ve ETF işlemlerinde komisyon
//                    hisse başına alınır", "Hisse işlemlerinde minimum
//                    komisyon ücret tutarı 2 $'dır": max(2, 0.01 × n) each
//                    leg. BSMV is not printed on the US rows; 5 %, the
//                    statutory rate on a brokerage commission, is added.
//   US regulatory    the share rows print none ("işlem yaptığınız borsaya
//                    bağlı ek maliyetler oluşabilir"; the SEC 0.00 $ and TAF
//                    0.00279 $ rows belong to the options table): 0.
//   Not this trip    "Hesap İşletim Ücreti 200 TL" a month under 250,000 TL
//                    of assets (an account fee), custody ("Saklama Ücreti
//                    (Pay Senedi) On binde 2,40", "Yabancı Hisse On binde
//                    5,81" of market value), transfers, EFT, lending, order
//                    cancellation.
//
// FX: cash in lira, dollars or euros (deposits.mjs); US lines are dollars,
// a deposit currency: the remark "FX when cash ≠ USD." (no rate printed).
// Book: Borsa İstanbul through spreads/book.mjs (a name with no leaf is
// N/A). US lines are the 605 times Interactive Brokers LLC's 606 Q: Osmanlı
// routes foreign orders "Interactive Brokers LLC (IBKR) aracılığı ile"
// (its KAP disclosure of the SPK licence, 07.08.2025, as reported on
// 2025-09-09).
//
//   https://www.osmanlimenkul.com.tr/finansal-planlama/hesap-acilis-islemleri/ucret-ve-komisyonlar
//   https://www.osmanlimenkul.com.tr/hisse-ve-viop/hisse-ve-viop-urunlerimiz/hisse/yabanci-hisse-
//   https://paratic.com/spk-osmanli-yatirimin-yurtdisi-iznini-onayladi/
//
//   node brokers/osmanlyatrm/osmanlyatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/osmanlyatrm/osmanlyatrm_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/osmanlyatrm/osmanlyatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { trUsCost, printCli, bandRemark } from "../aktifyatrm/trUsCost.mjs";

const MINIMUM = { amount: 0.65, per: "day" };

const SCHEDULE = {
  folder: "osmanlyatrm",
  broker: "Osmanlı Yatırım",
  entity: "Osmanlı Yatırım Menkul Değerler A.Ş.",
  url: "https://www.osmanlimenkul.com.tr/finansal-planlama/hesap-acilis-islemleri/ucret-ve-komisyonlar",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://www.osmanlimenkul.com.tr/finansal-planlama/hesap-acilis-islemleri/ucret-ve-komisyonlar",
    us: "https://www.osmanlimenkul.com.tr/hisse-ve-viop/hisse-ve-viop-urunlerimiz/hisse/yabanci-hisse-",
    dealer: "https://paratic.com/spk-osmanli-yatirimin-yurtdisi-iznini-onayladi/",
  },
  bist: {
    bands: [
      { upTo: 15_000_000, rate: 0.000375 },
      { upTo: 40_000_000, rate: 0.000275 },
      { upTo: 70_000_000, rate: 0.000175 },
      { upTo: Infinity, rate: 0.0001 },
    ],
    bandOn: "month",
    minimum: MINIMUM,
    levies: "added",
    bsmvPrinted: true,
    cash: ["TRY", "USD", "EUR"],
    types: ["STOCK", "ETF"],
    basis:
      "Osmanlı Yatırım, Ücret ve Komisyonlar relu le 2026-10-26 (taux du 07.07.2026) : barème mensuel on binde 3,75 jusqu'à 15 M TL " +
      "(première tranche) jusqu'à on binde 1,00 au-delà de 70 M TL, minimum 65 kuruş + BSMV par jour ; " +
      "borsa ve takas payı « 2,5 + 0,4 » yüz binde, hors taxes",
  },
  bistRemark: bandRemark({ top: 0.000375, lowest: 0.0001, minimum: MINIMUM, label: "Over 70,000,000 TL traded a month" }),
  us: {
    dealer: "interactivebrokers",
    dealerName: "Interactive Brokers LLC",
    mics: ["XNAS", "XNYS", "XASE"],
    types: ["STOCK", "ETF", "ETN"],
    commission: (n) => Math.max(2, 0.01 * n),
    bsmv: true,
    regulatory: {},
    basis:
      "Osmanlı Yatırım, Ücret ve Komisyonlar relu le 2026-10-26 : « Hisse 0,01 $ » la part, minimum 2 $ par ordre ; " +
      "BSMV non imprimée sur les lignes américaines, 5 % (taux légal) en sus ; SEC, TAF et CAT des actions non imprimés : 0",
  },
};

export const roundTrip = (q) => trUsCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
