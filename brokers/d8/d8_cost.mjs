// What one round trip costs at D8 (АО «Инвестиционная компания Д8»): buy
// n shares or fund units in the Moscow Exchange order book through QUIK,
// SMARTx or the D8 app and sell them back the same day, in dollars. The
// account buys and holds yuan, dollars and euros (currency market; their
// withdrawals are priced: "Евро 5% ... Доллар 1% ... Китайский юань 5 500
// руб."), so a yuan fund is bought with yuan.
//
// Tariff, «Тарифы на брокерские услуги АО «Инвестиционная компания Д8»»,
// in force from 27.10.2026 (order of 31.08.2026; the 22.07.2026 edition
// has the same trading rates), read on 2026-10-26:
//   https://d8.capital/upload/vote/79a/6wkehorosclf0s1b9fq13tmhpjar8yfw/Tarify-na-brokerskie-uslugi_s-27.10.26_itog.pdf
//   https://d8.capital/tariffs/ (summary page)
//   1.2.1 securities other than foreign-issuer bonds, "в безадресном
//     режиме 0,015 %" ("S * 0,00015", S the trade amount), each trade.
//     No floor, no monthly fee.
//   1.8.1 currency, order book, 0.01% (the FX remark).
// The summary page: "Биржевые комиссии взимаются согласно тарифам биржи":
// the Moscow Exchange fee is on top (moexCost.mjs).
//
// Custody (depository tariff, https://d8.capital/upload/vote/5f3/6wt5gilhttgodacojriu8jv46fvx9bq3/custody_03022026.pdf):
// securities held at NSD "0,2% годовых, но не более 500" RUB, charged
// monthly (in the remark, out of the trip).
//
// Accounts: "Открытие счёта доступно только квалифицированным инвесторам"
// (https://d8.capital/open/account/v2/), a client condition, not a fee.
//
// Not a row: the «Попробуй» promotion (no commission for the first 30
// days) is temporary. Negotiated trades (1.2.2, 0.2%) are another mode.
// Left out: Russian income tax.
//
//   node brokers/d8/d8_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { cli, flatFees, makeRoundTrip } from "../psb/moexCost.mjs";

const PAGE = "https://d8.capital/tariffs/";
const SHEET =
  "https://d8.capital/upload/vote/79a/6wkehorosclf0s1b9fq13tmhpjar8yfw/Tarify-na-brokerskie-uslugi_s-27.10.26_itog.pdf";

export const roundTrip = makeRoundTrip({
  folder: "d8",
  brand: "D8",
  catalogue: new URL("d8-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "USD", "EUR", "CNY"],
  defaultPlan: "standard",
  sources: {
    sheet: SHEET,
    custody: "https://d8.capital/upload/vote/5f3/6wt5gilhttgodacojriu8jv46fvx9bq3/custody_03022026.pdf",
  },
  plans: {
    standard: {
      id: "standard",
      name: "Тарифы на брокерские услуги",
      remark: "Custody is 0.2% a year, at most RUB 500 a month.",
      fx: 0.0001,
      sheet: SHEET,
      fees: flatFees({
        rate: 0.00015,
        levies: true,
        basis: "point 1.2.1 : 0,015 % de chaque opération en carnet (« в безадресном режиме »)",
      }),
    },
  },
});

cli(import.meta.url, roundTrip);
