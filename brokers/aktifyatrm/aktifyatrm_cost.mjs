// What one round trip costs at Aktif Yatırım (Aktif Bank's broker): buy n
// shares at price p, sell them back at once, in dollars. Borsa İstanbul
// shares and exchange-traded funds (BYF) in lira through N Kolay Trader, N
// Kolay Mobil or the internet branch, and US shares, ETFs and OTC lines in
// dollars through the US account held at Alpaca Securities LLC. VİOP,
// options, bonds and funds are not this trip.
//
// "Komisyon ve Ücretler", read on 2026-10-26:
//
//   BIST commission  "N KOLAY TRADER/MOBİL YURTİÇİ HİSSE GÜNLÜK HACME GÖRE
//                    KOMİSYON SKALASI", "Dijital Kanallar ( N Kolay Trader/
//                    N Kolay Mobil/ İnternet Şube) - Pay Piyasası":
//                      – ₺500.000              0,00130
//                      ₺500.001 – ₺2.500.000   0,00100
//                      ₺2.500.001 – ₺5.000.000 0,00080
//                      5.000.001+              0,00050
//                    A daily scale: the day's volume (the buy and the sale
//                    together) sets the band. The table's general line
//                    "İşlem hacmi üzerinden binde 1.8 veya işlem hacmine göre
//                    değişen oranlar" is the other channels' rate. No minimum.
//   BIST levies      "Borsa Payı: Borsa İstanbul ücretlendirme tablosu" and
//                    "Takas Komisyonu: Pay Piyasası ücret tarifesi
//                    (takasbank.com.tr)": passed on at the exchange and
//                    Takasbank tariffs, BIST 0.25 bp and Takasbank 4 per
//                    million on shares, 1 on BYF, each side, with BSMV
//                    (../halkyatrm/bistCost.mjs, levies "added").
//   BSMV             not printed for BIST (the US rows say "BSMV Hariç");
//                    5 %, the statutory rate.
//   US commission    "İnternetten Verilen Emirler için Komisyon Skalası",
//                    "ABD AMEX, ARCA, BATS, NYSE, NASDAQ, NYSE ARCA, OTC":
//                    "0.01 USD" a share (BSMV hariç), "Minimum komisyon
//                    tutarı (BSMV Hariç) 1 USD'dir ... 1 USD + BSMV olarak
//                    tahsil edilecektir": max(1, 0.01 × n) + 5 % each leg.
//                    OTC lines take the same row.
//   US regulatory    "SEC Ücreti: Satış İşlem Hacmi × 0,00 USD" (0), "FINRA
//                    TAF: Satılan Pay Adedi × 0.000166 USD" (on the sale,
//                    capped at FINRA's 8.30 USD a trade), "FINRA CAT: Alınan
//                    ve Satılan Pay Adedi × 0.000003 USD" (both sides). No
//                    BSMV is printed on them.
//   Not this trip    US account opening 0.25 USD and upkeep 0.10 USD a month
//                    (negligible), ADR fees, MKK upkeep "Günlük 0,25", custody
//                    ("MKK tarafından belirlenen ... %25 fazlası+BSMV"),
//                    transfers, EFT, statement postage, order cancellation.
//
// FX: lira and dollars are both cash of the account (deposits.mjs), every
// US line is dollars: the conversion is the remark "FX when cash ≠ USD."
// (Aktif prints no rate for it; "Döviz Transferleri %0.1" is a transfer
// fee). BIST lines have no remark: the daily scale is already applied.
// Book: Borsa İstanbul through spreads/book.mjs; US exchange lines are the
// 605 times Alpaca Securities LLC's 606 Q, the US broker named on the fee
// page ("Alpaca Nezdindeki İç Hesaplar Arası Transfer"); OTC Markets lines
// take the OTC Markets leaf of spreadLeaf or stay N/A.
//
//   https://www.aktifyatirim.com.tr/komisyon-ucretler
//   https://www.aktifyatirim.com.tr/urunler-hizmetler/yurt-disi-islemler
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//   https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//
//   node brokers/aktifyatrm/aktifyatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/aktifyatrm/aktifyatrm_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/aktifyatrm/aktifyatrm_cost.mjs NSRGY OTCM USD --shares=20 --price=100
//   node brokers/aktifyatrm/aktifyatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { trUsCost, printCli, TAF_CAP } from "./trUsCost.mjs";

const SCHEDULE = {
  folder: "aktifyatrm",
  broker: "Aktif Yatırım",
  entity: "Aktif Yatırım Menkul Değerler A.Ş.",
  url: "https://www.aktifyatirim.com.tr/komisyon-ucretler",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://www.aktifyatirim.com.tr/komisyon-ucretler",
    us: "https://www.aktifyatirim.com.tr/urunler-hizmetler/yurt-disi-islemler",
  },
  bist: {
    bands: [
      { upTo: 500_000, rate: 0.0013 },
      { upTo: 2_500_000, rate: 0.001 },
      { upTo: 5_000_000, rate: 0.0008 },
      { upTo: Infinity, rate: 0.0005 },
    ],
    bandOn: "day",
    levies: "added",
    bsmvPrinted: false,
    remark: "",
    cash: ["TRY", "USD"],
    types: ["STOCK", "ETF"],
    basis:
      "Aktif Yatırım, Komisyon ve Ücretler relu le 2026-10-26 : canaux numériques (N Kolay Trader, N Kolay Mobil, İnternet Şube), " +
      "barème au volume du jour 0,13 % jusqu'à 500 000 TL, 0,10 % jusqu'à 2,5 M, 0,08 % jusqu'à 5 M, 0,05 % au-delà, BSMV en sus ; " +
      "borsa payı et takas komisyonu aux tarifs BIST et Takasbank",
  },
  us: {
    dealer: "alpaca",
    dealerName: "Alpaca Securities LLC",
    mics: ["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE", "OTCM"],
    types: ["STOCK", "ETF", "ETN"],
    commission: (n) => Math.max(1, 0.01 * n),
    bsmv: true,
    regulatory: { sec: 0, taf: 0.000166, tafCap: TAF_CAP, cat: 0.000003 },
    bsmvOnRegulatory: false,
    basis:
      "Aktif Yatırım, ordres internet aux États-Unis (AMEX, ARCA, BATS, NYSE, NASDAQ, NYSE ARCA, OTC) : 0,01 $ la part, " +
      "minimum 1 $ par ordre, BSMV 5 % en sus ; SEC « × 0,00 USD », TAF 0,000166 $ la part vendue (plafond FINRA 8,30 $), " +
      "CAT 0,000003 $ la part achetée et vendue",
    notes: ["plafond de la TAF : celui de la FINRA, Aktif ne l'imprime pas"],
  },
};

export const roundTrip = (q) => trUsCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
