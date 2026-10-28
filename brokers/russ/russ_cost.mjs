// What one round trip costs at Russ-Invest (ПАО «ИК РУСС-ИНВЕСТ»): buy n
// shares or fund units on the Moscow Exchange through QUIK and sell them
// back the same day, in dollars. The client account holds US dollars,
// euros and yuan next to rubles (cash in each is priced, as are external
// credits and withdrawals), so a yuan fund is bought with yuan.
//
// Tariffs, appendix 5 to the brokerage regulation, read on 2026-10-26:
//   https://www.russ-invest.com/investment/documents/tarifs/
//   Individuals, securities market, «Устойчивый»: "Тариф (вознаграждение
//     Брокера) в % от оборота за операции с ЦБ ... 0,1". No floor beyond
//     0.01 RUB, no monthly fee; the first QUIK access is free.
//   "Биржевые и клиринговые сборы. Помимо комиссионного вознаграждения
//     Брокера, Клиент оплачивает биржевой и клиринговый сборы": the Moscow
//     Exchange fee is on top (moexCost.mjs).
//   Currency market, «Спекулятивный» 0.1% of the trade (the FX remark).
//   "Тариф за хранение денежных средств в иностранной валюте на
//     Клиентском счете ... доллары США, Евро, китайский юань ... 3%" a
//     year (a remark on yuan lines).
//
// Depository tariff, https://www.russ-invest.com/investment/depositarium/tariffs/:
// 2.1 "Операции приема/снятия ценных бумаг ... по итогам торговой сессии
// ... 20 руб. за изменение нетто-позиции по каждому выпуску". A same-day
// round trip leaves the net position unchanged, so nothing in the trip; a
// buy and a sale on different days pay 20 RUB each (the remark). Custody
// 1.5 is 0.0085% a month of the holding under 1,000,000 RUB (small, left
// out).
//
// Not a row: «Голосовой» (0.2%) is for orders placed through the broker's
// trader by phone. Left out: iQUIK / QUIK Android (720 RUB a month,
// optional), Russian income tax.
//
//   node brokers/russ/russ_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { cli, flatFees, makeRoundTrip } from "../psb/moexCost.mjs";

const PAGE = "https://www.russ-invest.com/investment/documents/tarifs/";
const base = flatFees({
  rate: 0.001,
  minRub: 0.01,
  levies: true,
  basis: "plan «Устойчивый» : 0,1 % du chiffre de chaque opération sur titres",
});

export const roundTrip = makeRoundTrip({
  folder: "russ",
  brand: "Russ-Invest",
  catalogue: new URL("russ-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "USD", "EUR", "CNY"],
  defaultPlan: "ustoichivy",
  sources: { custody: "https://www.russ-invest.com/investment/depositarium/tariffs/" },
  plans: {
    ustoichivy: {
      id: "ustoichivy",
      name: "Устойчивый",
      remark: "Depository charges RUB 20 per settled buy or sell.",
      fx: 0.001,
      sheet: PAGE,
      fees(ctx) {
        const fee = base(ctx);
        return ctx.ccy === "CNY" ? { ...fee, remark: "Yuan cash costs 3% a year." } : fee;
      },
    },
  },
});

cli(import.meta.url, roundTrip);
