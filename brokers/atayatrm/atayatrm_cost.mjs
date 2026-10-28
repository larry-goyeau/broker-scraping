// What one round trip costs at Ata Yatırım: buy n shares at price p, sell
// them back at once, in dollars. Borsa İstanbul shares and exchange-traded
// funds (BYF) in lira, and US shares and ETFs in dollars, both ordered in
// AtaOnline. VİOP, warrants, bonds and portfolio management are not this
// trip.
//
// "Ürün, hizmet ücret, masraf ve komisyonları" (2026) and the "Yurt Dışı
// Borsalar" page, read on 2026-10-26:
//
//   BIST commission  "Pay Komisyonu Değişken Oran: İşlem Hacmi üzerinden
//                    hesaplanmaktadır, işlem yapıldıkça düşen komisyon oranı",
//                    internet column:
//                      0 – 50.000           0.0018
//                      50.000 – 100.000     0.0017
//                      100.000 – 250.000    0.0015
//                      250.000 – 500.000    0.0013
//                      500.000 – 2.000.000  0.001
//                      2.000.000 – 10.000.000 0.0009
//                      10.000.000+          0.0008
//                    (Yatırım Merkezi a point higher). Its worked example
//                    prices one 1,250,000 TL order at 0.001, so the volume of
//                    the day's trading sets the band: the buy and the sale
//                    together. "Pay Komisyonu Sabit Oran % 0.18" is the same
//                    rate as the scale's first band and never lower, so it
//                    gets no row of its own. No minimum.
//   BSMV             "(Vergi yükümlülükleri hariç)"; the examples multiply by
//                    "1.05(BSMV)".
//   BIST levies      "Pay ve Varant Borsa Payı ... PAY PİYASASI yüzbinde 2,5
//                    ... (+ Takas payı milyonda 4)", "1 TL' nin altında kalan
//                    tutarları 1 TL olarak tahsil edilir": 0.25 bp borsa payı
//                    with a 1 TL floor a leg, plus Takasbank 4 per million
//                    (1 on BYF, Takasbank's own BYF rate), with BSMV (the
//                    example: "Vergi Yükümlülükleri dahil toplam tutar").
//                    "MKK Hisse Senedi, Varant, Borsa Yatırım Fonu ... Alım
//                    Satım Ücreti ... Kayıt sayısı üzerinden ... 0,1103 TL":
//                    one record a leg, with BSMV.
//   US commission    "Alış veya satış yapılan pay senedinde adet başına 0,02
//                    USD işlem komisyonu", "Min.Tutar 1,00 USD": max(1,
//                    0.02 × n) each leg, plus BSMV (the example "100 ad*0,02
//                    USD* 1,05 (BSMV)"). The US page: "ABD borsalarında
//                    gerçekleştireceğiniz işlemlerde komisyon ödemezsiniz.
//                    Aylık 100 işlem veya 100 dolar komisyonu geçtiğiniz
//                    taktirde uygulanacak komisyon oranlarımızı" — a trip
//                    (two trades) pays commission only on what exceeds the
//                    100 dollars of the month; the full tariff stays in the
//                    remark.
//   US regulatory    SEC "Milyonda 8" of the sale amount, TAF "Milyonda 166"
//                    a share sold (FINRA's 8.30 USD cap), CAT "Milyonda 46" a
//                    share traded, both sides; each with BSMV, as the
//                    examples show ("* 1,05 (BSMV)").
//   Not this trip    US account opening 0.15 USD and upkeep 0.12 USD a month,
//                    the 70 TL "Aylık Hizmet Bedeli" (a monthly platform fee),
//                    statements, transfers, T+0 cash, order-cancellation
//                    fees, custody at MKK, data fees.
//
// FX: cash in lira, dollars or euros (deposits.mjs); US lines are dollars,
// a deposit currency: the remark "FX when cash ≠ USD." (no rate printed).
// Book: Borsa İstanbul through spreads/book.mjs (a name with no leaf is
// N/A). US lines: Ata names no US broker-dealer, so the quoted NBBO.
//
//   https://atayatirim.com.tr/sss/ucret-ve-tarifeler
//   https://atayatirim.com.tr/landingpages/yurt-disi-borsalar
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//   https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//
//   node brokers/atayatrm/atayatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/atayatrm/atayatrm_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/atayatrm/atayatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { trUsCost, printCli, BORSA_PAYI, BSMV, TAF_CAP } from "../aktifyatrm/trUsCost.mjs";

const MKK_RECORD = 0.1103;
const BORSA_PAYI_FLOOR = 1;
const US_RATE = 0.02;
const US_MIN = 1;
const FREE_A_MONTH = 100;

const usLeg = (n) => Math.max(US_MIN, US_RATE * n);
// The month's first 100 dollars of commission are waived.
const usTrip = (leg) => Math.max(0, leg * 2 - FREE_A_MONTH);

const SCHEDULE = {
  folder: "atayatrm",
  broker: "Ata Yatırım",
  entity: "Ata Yatırım Menkul Kıymetler A.Ş.",
  url: "https://atayatirim.com.tr/sss/ucret-ve-tarifeler",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://atayatirim.com.tr/sss/ucret-ve-tarifeler",
    us: "https://atayatirim.com.tr/landingpages/yurt-disi-borsalar",
  },
  bist: {
    bands: [
      { upTo: 50_000, rate: 0.0018 },
      { upTo: 100_000, rate: 0.0017 },
      { upTo: 250_000, rate: 0.0015 },
      { upTo: 500_000, rate: 0.0013 },
      { upTo: 2_000_000, rate: 0.001 },
      { upTo: 10_000_000, rate: 0.0009 },
      { upTo: Infinity, rate: 0.0008 },
    ],
    bandOn: "day",
    levies: "added",
    bsmvPrinted: true,
    remark: "",
    cash: ["TRY", "USD", "EUR"],
    types: ["STOCK", "ETF"],
    basis:
      "Ata Yatırım, tarif 2026 relu le 2026-10-26 : « Pay Komisyonu Değişken Oran », colonne internet, 0,18 % jusqu'à 50 000 TL " +
      "puis 0,17, 0,15, 0,13, 0,10, 0,09 et 0,08 % au volume, l'exemple de 1 250 000 TL à 0,001 ; BSMV 5 % (« 1.05(BSMV) ») ; " +
      "borsa payı yüzbinde 2,5 (minimum 1 TL) + takas payı milyonda 4 ; MKK alım satım ücreti 0,1103 TL par enregistrement",
    notes: ["taux fixe 0,18 % (« Sabit Oran ») égal à la première tranche, jamais plus bas : pas de ligne à part"],
  },
  // Each leg: the MKK record and the top-up of the 1 TL borsa payı floor.
  bistPerTrade: (notional) => MKK_RECORD + Math.max(0, BORSA_PAYI_FLOOR - notional * BORSA_PAYI),
  us: {
    dealer: null,
    mics: ["XNAS", "XNYS", "ARCX", "XASE", "BATS", "TXSE"],
    types: ["STOCK", "ETF", "ETN"],
    commission: (n) => usLeg(n),
    tripCommission: (leg) => usTrip(leg),
    bsmv: true,
    regulatory: { sec: 0.000008, taf: 0.000166, tafCap: TAF_CAP, cat: 0.000046 },
    bsmvOnRegulatory: true,
    remark: (n, p) => {
      const leg = usLeg(n);
      const pct = Number((((leg * 2 - usTrip(leg)) * (1 + BSMV)) / (n * p) * 100).toFixed(2));
      return pct > 0 ? `Above 100 trades or $100 of commission a month: ${pct}% more.` : "";
    },
    basis:
      "Ata Yatırım, tarif 2026 et page « Yurt Dışı Borsalar » relues le 2026-10-26 : 0,02 $ la part, minimum 1 $ par ordre, BSMV 5 % en sus, " +
      "mais « sıfır komisyon » jusqu'à 100 ordres ou 100 $ de commission par mois : seule la part au-delà de 100 $ est payée ; " +
      "SEC milyonda 8 de la vente, TAF milyonda 166 la part vendue (plafond FINRA 8,30 $), CAT milyonda 46 la part à chaque sens, BSMV en sus",
    notes: ["plafond de la TAF : celui de la FINRA, Ata ne l'imprime pas"],
  },
};

export const roundTrip = (q) => trUsCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
