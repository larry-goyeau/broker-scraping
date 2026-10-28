// What one round trip costs at DOM.Invest, the broker app of Bank DOM.RF
// (АО «Банк ДОМ.РФ»): buy n shares or fund units on the Moscow Exchange and
// sell them back the same day, in dollars. Rubles and yuan are deposit
// currencies (the account opens "в Рублях РФ, а так же: Китайский Юань
// Доллар США Евро"), so nothing is converted.
//
// Tariff, appendix 2 to the brokerage regulations (file of 16.01.2026, same
// figures as the edition approved on 15.07.2025), read on 2026-10-26:
//   https://domrfbank.ru/upload/docs/medialibrary/prilozhenie2-k-reglamentu-brokerskogo-obsluzhivaniya.pdf
//   1.1 "Биржевой рынок 0,03" (% of the deal), footnote 2 "Минимум 0,02
//   единицы валюты расчетов" (the "2" after 0,03 is that footnote mark,
//   not a third decimal).
// Exchange fee included: "Плоская шкала тарифов включает биржевую
// комиссию" (https://domrfbank.ru/stock-market/).
//
// Left out: the bank's brokerage tariff prices no currency deals (no FX
// remark); separate collateral accounting (10,000 RUB a month) is an
// opt-in service; Russian income tax.
//
//   node brokers/dominvest/dominvest_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip } from "../psb/moexCost.mjs";

const PAGE = "https://domrfbank.ru/stock-market/";
const SHEET = "https://domrfbank.ru/upload/docs/medialibrary/prilozhenie2-k-reglamentu-brokerskogo-obsluzhivaniya.pdf";
const RATE = 0.0003;

export const roundTrip = makeRoundTrip({
  folder: "dominvest",
  brand: "DOM.Invest",
  catalogue: new URL("dominvest-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "CNY"],
  defaultPlan: "app",
  plans: {
    app: {
      id: "app",
      name: "DOM.Invest",
      remark: "",
      fx: null,
      sheet: SHEET,
      fees({ notionalRub, rubPerUnit }) {
        const side = Math.max(notionalRub * RATE, 0.02 * rubPerUnit);
        return {
          rate: RATE,
          buyRub: side,
          sellRub: side,
          levyRub: 0,
          basis:
            "annexe 2, point 1.1 : 0,03 % de chaque opération en bourse, au moins 0,02 unité de la devise de règlement ; " +
            "frais de bourse compris (« Плоская шкала тарифов включает биржевую комиссию »).",
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
