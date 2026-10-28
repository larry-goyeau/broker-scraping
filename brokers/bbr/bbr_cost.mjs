// What one round trip costs at BBR Broker (ООО «ББР БРОКЕР», St Petersburg):
// buy n shares or fund units on the Moscow Exchange through QUIK or the BBR
// Broker app and sell them back the same day, in dollars. Rubles and yuan
// are deposit currencies, so nothing is converted.
//
// Tariffs in force from 01.10.2026, read on 2026-10-26:
//   https://bbrbroker.ru/rates/
//   https://bbrbroker.ru/upload/iblock/911/4yrntyuw46ysu8b828rpy2w268tac7w0.pdf
// Two plans for individuals, each a row (`query.plan`):
//   «Успешный инвестор», 2.1.1 "Фондовый рынок ПАО Московская Биржа ...
//     0,15 % от оборота за день. Но не менее 0,1 ₽" (the rates page: "0,15%
//     от суммы сделки, но не менее 0,1 ₽ за сделку").
//   «Профессиональный трейдер», 2.2.1, by the day's turnover: up to
//     500,000 RUB 0.17%; to 1,000,000 0.15%; to 5,000,000 0.10%; to
//     10,000,000 0.09%; above 0.07%; "Но не менее 0,10 ₽". A same-day round
//     trip is a turnover of twice the amount and the band it reaches prices
//     both legs.
// Exchange fee included: "Тариф Брокера в части «Комиссия по сделкам на
// Фондовом ... рынке» включает «Тариф по сделкам на рынках» Торговых
// систем", except when third-party fees exceed the broker's (not at these
// rates) and order-count or error fines. Currency market (the remark for
// cash held in the other deposit currency): 2.1.3 / 2.2.3 "0,30 % от
// оборота за день но не менее 70,00 ₽".
//
// Left out: the account fee (4.1) is free up to 10,000,000 RUB of each
// holding a month; QUIK's first licence is free; a deposit in yuan costs
// 0.25%, at least 299 CNY (4.3), a funding cost, not a trade cost; Russian
// income tax.
//
//   node brokers/bbr/bbr_cost.mjs SBER MISX RUB --shares=300 --price=286
//   node brokers/bbr/bbr_cost.mjs SBER MISX RUB --shares=300 --price=286 --plan=pro
//
// `roundTrip(...)` reads files, not the network.

import { bandFees, cli, flatFees, makeRoundTrip } from "../psb/moexCost.mjs";

const PAGE = "https://bbrbroker.ru/rates/";
const SHEET = "https://bbrbroker.ru/upload/iblock/911/4yrntyuw46ysu8b828rpy2w268tac7w0.pdf";
const INCLUDED = "frais de bourse et de compensation compris (note du barème : le tarif inclut le « Тариф по сделкам на рынках » des systèmes de négociation)";
const BANDS = [
  { upTo: 500000, rate: 0.0017 },
  { upTo: 1000000, rate: 0.0015 },
  { upTo: 5000000, rate: 0.001 },
  { upTo: 10000000, rate: 0.0009 },
  { upTo: Infinity, rate: 0.0007 },
];

export const roundTrip = makeRoundTrip({
  folder: "bbr",
  brand: "BBR Broker",
  catalogue: new URL("bbr-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "CNY"],
  defaultPlan: "investor",
  plans: {
    investor: {
      id: "investor",
      name: "Успешный инвестор",
      remark: "",
      fx: 0.003,
      fxExtra: "(min RUB 70)",
      sheet: SHEET,
      fees: flatFees({
        rate: 0.0015,
        minRub: 0.1,
        levies: false,
        basis: `plan « Успешный инвестор », point 2.1.1 : 0,15 % du chiffre du jour, au moins 0,1 RUB par opération, ${INCLUDED}.`,
      }),
    },
    pro: {
      id: "pro",
      name: "Профессиональный трейдер",
      remark: "",
      fx: 0.003,
      fxExtra: "(min RUB 70)",
      sheet: SHEET,
      fees: bandFees({
        bands: BANDS,
        minRub: 0.1,
        levies: false,
        basis:
          "plan « Профессиональный трейдер », point 2.2.1 : 0,17 % du chiffre du jour jusqu'à 500 000 RUB, 0,15 % jusqu'à 1 million, " +
          `0,10 % jusqu'à 5, 0,09 % jusqu'à 10, 0,07 % au-delà, au moins 0,1 RUB par opération, ${INCLUDED}`,
      }),
    },
  },
});

cli(import.meta.url, roundTrip);
