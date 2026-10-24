// What one round trip costs at TRINFICO (АО «ТРИНФИКО»): buy n shares or
// fund units on the Moscow Exchange through its mobile app and sell them
// back the same day, in dollars. The account is funded in rubles only
// (deposits.mjs), so a yuan line is bought by converting rubles and
// converting back.
//
// «Порядок расчета Вознаграждения», in force from 02.07.2026, read on
// 2026-10-24 (https://trinfico.ru/tariffs/ and the full sheet):
//   https://trinfico.ru/upload/iblock/ae5/mwesn260osnu56gz07x5dvr0zdsu82ke/%D0%A2%D0%B0%D1%80%D0%B8%D1%84%D1%8B%20%D0%A2%D0%A0%D0%A4%2002%2007%202026.pdf
//   1. deals on organised trading through the mobile app 0.01% of the
//      deal. Note 2: at least 0.01 RUB a deal. Note 1: a foreign-currency
//      deal is taken in rubles at the Bank of Russia rate.
//   6. currency deals on the Moscow Exchange currency market 0.15% (the
//      forced conversion of a yuan line).
//   "Стоимость услуги без учета комиссий бирж/Торговых систем", and note
//   7 has the client pay the trading organiser and clearing house: the
//   Moscow Exchange fee is on top (moexCost.mjs), and the currency-market
//   fee on a conversion.
// QUIK (item 2) is another channel at 0.09% down to 0.01% by accumulated
// turnover; the app is the online ticket and the one priced here. Paper
// orders and the personal-cabinet route (item 16, 0.15%) are other
// channels. No subscription fee is printed.
//
//   node brokers/trinfico/trinfico_cost.mjs SBER MISX RUB --shares=10 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { MOEX_BASIS, cli, makeRoundTrip, moexLevyRub } from "../sber/moexCost.mjs";

const PAGE = "https://trinfico.ru/tariffs/";
const SHEET =
  "https://trinfico.ru/upload/iblock/ae5/mwesn260osnu56gz07x5dvr0zdsu82ke/%D0%A2%D0%B0%D1%80%D0%B8%D1%84%D1%8B%20%D0%A2%D0%A0%D0%A4%2002%2007%202026.pdf";
const RATE = 0.0001;
const MIN_RUB = 0.01;

export const roundTrip = makeRoundTrip({
  folder: "trinfico",
  brand: "TRINFICO",
  catalogue: new URL("trinfico-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-24",
  defaultPlan: "app",
  plans: {
    app: {
      id: "app",
      name: "Мобильное приложение",
      remark: "",
      fx: null,
      sheet: SHEET,
      convert: { rate: 0.0015, min: MIN_RUB, basis: "point 6, 0,15 % de l'opération de change" },
      fees({ notionalRub }) {
        const side = Math.max(notionalRub * RATE, MIN_RUB);
        return {
          rate: RATE,
          buyRub: side,
          sellRub: side,
          levyRub: 2 * moexLevyRub(notionalRub),
          basis: `tarifs du 02.07.2026, point 1 : 0,01 % de chaque opération passée par l'application, au moins 0,01 RUB (note 2) ; ${MOEX_BASIS} (note 7).`,
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
