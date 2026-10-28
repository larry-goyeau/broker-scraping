// What one round trip costs at Tacirler Yatırım: buy n shares at price p,
// sell them back at once, in dollars. Borsa İstanbul shares and
// exchange-traded funds (BYF) in lira from internet orders, and NYSE and
// Nasdaq shares in dollars through the Rally app (accounts at DriveWealth
// LLC). VİOP, forex, funds and bonds are not this trip.
//
// "Hesap Türleri ve Komisyonlar" (with the "Yurt Dışı Piyasa İşlemlerine
// İlişkin Komisyon, Masraf ve Giderler ile Tarifeler Formu"), read on
// 2026-10-26:
//
//   BIST commission  "İnternet Yoluyla İletilen Emirler", "Günlük İşlem Hacmi
//                    TL / Komisyon Oranı (BSMV Hariç)":
//                      0-500,000              0.001
//                      500,001-1,500,000      0.000750
//                      1,500,001-5,000,000    0.00050
//                      5,000,001-10,000,000   0.00025
//                      10,000,001+            0.00015
//                    A daily scale: the buy and the sale together set the
//                    band. "günlük toplam işlem hacmi üzerinden gün sonunda
//                    hesaplanan komisyon tutarı 5 TL'nin altında olması
//                    durumunda asgari 5 TL": a 5 TL floor on the day's
//                    commission (both legs). Orders not sent by internet pay
//                    the other table.
//   BSMV             "(BSMV Hariç)": 5 % on top.
//   BIST levies      "Borsa Payı ve Takas İşlem Masrafı komisyon oranına
//                    dahil değildir, ayrıca tahsil edilmektedir": BIST 0.25
//                    bp and Takasbank 4 per million on shares, 1 on BYF, each
//                    side, with BSMV (../halkyatrm/bistCost.mjs, "added").
//   US commission    "İnternetten Verilen Emirler için Skala Uygulaması", "ABD
//                    NYSE, NASDAQ": "0- 750 1.50 USD", "750 + 0.20%": 1.50
//                    USD an order up to 750 dollars, 0.20 % of the order
//                    above. Note 5, "Düşük Fiyatlı Menkul Kıymetler" (under
//                    1.00 USD): "300 adet üstü alım ve satım işlemlerinde ...
//                    pay adedi başına 0.005 USD ek komisyon".
//   US regulatory    "SEC Ücret: Satış İşlem Hacmi * 0,0000278" (note 2:
//                    "her zaman en az 0,01$"), "FINRA TAF: Satılan Pay Adedi
//                    *0,000166" (note 3: "maksimum ücret 8.30 ABD dolarıdır
//                    ... en az 0,01$"). CAT is not printed: 0.
//   BSMV (US)        "aşağıda verilen komisyon ve masraflara %5 oranında
//                    BSMV'nin ayrıca hesabına borç kaydedileceğini": on the
//                    commission and on the SEC and TAF fees.
//   Not this trip    "Saklama Ücreti: Ücretsiz" (on binde 3 a month only
//                    after leaving the FDIC cash and lending programmes),
//                    ADR fees, transfers, broker-assisted orders.
//
// FX: cash in lira, dollars, euros or pounds (deposits.mjs); the Rally
// account is dollars, a deposit currency: the remark "FX when cash ≠ USD."
// (no rate printed). Book: Borsa İstanbul through spreads/book.mjs (a name
// with no leaf is N/A); US lines are the 605 times DriveWealth LLC's 606 Q,
// the custodian named on the Rally pages ("SEC ve FINRA üyesi, kayıtlı bir
// aracı kurum olan DriveWealth LLC nezdinde saklanmaktadır").
//
//   https://tacirler.com.tr/hesap-turleri-ve-komisyonlar
//   https://tacirler.com.tr/rally-ile-abd-borsalari
//   https://tacirler.com.tr/rally-hakkinda-sikca-sorulan-sorular
//
//   node brokers/tacirleryatrm/tacirleryatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/tacirleryatrm/tacirleryatrm_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/tacirleryatrm/tacirleryatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { trUsCost, printCli, TAF_CAP } from "../aktifyatrm/trUsCost.mjs";

const US_TICKET = 1.5;
const US_TICKET_UP_TO = 750;
const US_RATE = 0.002;
const LOW_PRICE = 1;
const LOW_PRICE_SHARES = 300;
const LOW_PRICE_EXTRA = 0.005;

const SCHEDULE = {
  folder: "tacirleryatrm",
  broker: "Tacirler Yatırım",
  entity: "Tacirler Yatırım Menkul Değerler A.Ş.",
  url: "https://tacirler.com.tr/hesap-turleri-ve-komisyonlar",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://tacirler.com.tr/hesap-turleri-ve-komisyonlar",
    us: "https://tacirler.com.tr/rally-ile-abd-borsalari",
    faq: "https://tacirler.com.tr/rally-hakkinda-sikca-sorulan-sorular",
  },
  bist: {
    bands: [
      { upTo: 500_000, rate: 0.001 },
      { upTo: 1_500_000, rate: 0.00075 },
      { upTo: 5_000_000, rate: 0.0005 },
      { upTo: 10_000_000, rate: 0.00025 },
      { upTo: Infinity, rate: 0.00015 },
    ],
    bandOn: "day",
    minimum: { amount: 5, per: "day" },
    levies: "added",
    bsmvPrinted: true,
    remark: "",
    cash: ["TRY", "USD", "EUR", "GBP"],
    types: ["STOCK", "ETF"],
    basis:
      "Tacirler Yatırım, Hesap Türleri ve Komisyonlar relu le 2026-10-26 : ordres internet, barème au volume du jour 0,10 % jusqu'à " +
      "500 000 TL puis 0,075, 0,05, 0,025 et 0,015 %, minimum 5 TL par jour, BSMV en sus ; borsa payı et takas işlem masrafı « ayrıca tahsil »",
  },
  us: {
    dealer: "drivewealth",
    dealerName: "DriveWealth LLC",
    mics: ["XNAS", "XNYS"],
    types: ["STOCK"],
    commission: (n, p) =>
      (n * p <= US_TICKET_UP_TO ? US_TICKET : US_RATE * n * p) + (p < LOW_PRICE && n > LOW_PRICE_SHARES ? LOW_PRICE_EXTRA * n : 0),
    bsmv: true,
    regulatory: { sec: 0.0000278, secMin: 0.01, taf: 0.000166, tafMin: 0.01, tafCap: TAF_CAP },
    bsmvOnRegulatory: true,
    basis:
      "Tacirler Yatırım, formulaire des tarifs étrangers relu le 2026-10-26 : NYSE et NASDAQ, 1,50 $ par ordre jusqu'à 750 $, 0,20 % au-delà, " +
      "0,005 $ la part en sus sous 1 $ au-delà de 300 parts ; SEC 0,0000278 de la vente (min 0,01 $), TAF 0,000166 $ la part vendue " +
      "(min 0,01 $, max 8,30 $), BSMV 5 % sur la commission et ces frais ; CAT non imprimée : 0",
  },
};

export const roundTrip = (q) => trUsCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
