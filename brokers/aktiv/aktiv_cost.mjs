// What one round trip costs at Aktiv (АО Актив, St Petersburg, DOKHOD
// group): buy n shares or fund units on the Moscow Exchange through QUIK or
// webQUIK and sell them back the same day, in dollars. The account is
// funded in rubles only ("Вы можете пополнить свой торговый счет в АО
// Актив, осуществив перевод в рублях"), so a yuan line is bought by
// converting rubles on the currency market and converting back.
//
// Tariffs in force from 16.06.2025 (the edition the tariff page gives as
// current), read on 2026-10-26 on https://aktiv.ru/services/tarifyi/:
//   https://aktiv.ru/assets/userfiles//fileattach/28/Полный текст тарифов на брокерское обслуживание клиентов АО Актив (редакция действующая с 16.06.2025 г.).pdf
// Stock market of the Moscow Exchange, each plan a row (`query.plan`):
//   «ДОХОДЪ-СтандартЪ»: % of the day's turnover, up to 100,000 RUB 0.07;
//     100,001–5,000,000 0.05; 5,000,001–10,000,000 0.03; above 0.02. A
//     same-day round trip is a turnover of twice the amount, and the band
//     it reaches prices both legs.
//   «ДОХОДЪ-365»: 0.25% of the deal.
//   «ДОХОДЪ-Портфель инвестора»: 0.4% of the day's turnover up to 500,000
//     RUB, 0.2% above.
//   All plans: "Заключение сделок с инвестиционными паями биржевых паевых
//   инвестиционных фондов под управлением ООО «УК «ДОХОДЪ»" free (rate 0,
//   the exchange fee still applies); the catalogue names those funds
//   «ДОХОДЪ» (BNDA, BNDB, BNDC, BOND, DIVD, GOOD, GROD, WILD).
//   "Услуги торговых, расчетных и депозитарных систем оплачиваются
//   отдельно", and the list of reimbursed expenses names "Биржевые
//   комиссии в соответствие с тарифами Фондового Рынка ПАО Московская
//   Биржа": the Moscow Exchange fee is on top (moexCost.mjs).
//     https://aktiv.ru/assets/userfiles/docs/informacziya-o-rasxodax.pdf
//   Currency market (the forced conversion of a yuan line): 0.05% of the
//   day's turnover up to 5,000,000 RUB, VAT included, plus the currency
//   market's exchange fee.
// QUIK and webQUIK are free.
//
// Left out: «ДОХОДЪ-Разовый» (1.5% of the deal, at least 1,500 RUB) is
// "для совершения разовой операции", a single operation, not a buy and a
// sell. «Фиксированный» (20,000 RUB a month whatever the turnover) is
// a monthly flat fee, not a per-trade price; «Детский портфель» (0.1%) is
// only for accounts in the name of a child under 18. Phone or office
// orders cost 200 RUB more each (another channel).
//
//   node brokers/aktiv/aktiv_cost.mjs SBER MISX RUB --shares=300 --price=286
//   node brokers/aktiv/aktiv_cost.mjs SBER MISX RUB --shares=300 --price=286 --plan=d365
//   node brokers/aktiv/aktiv_cost.mjs SBER MISX RUB --shares=300 --price=286 --plan=portfolio
//
// `roundTrip(...)` reads files, not the network.

import { MOEX_BASIS, bandRate, cli, makeRoundTrip, moexLeviesRub } from "../psb/moexCost.mjs";

const PAGE = "https://aktiv.ru/services/tarifyi/";
const SHEET =
  "https://aktiv.ru/assets/userfiles//fileattach/28/%D0%9F%D0%BE%D0%BB%D0%BD%D1%8B%D0%B9%20%D1%82%D0%B5%D0%BA%D1%81%D1%82%20%D1%82%D0%B0%D1%80%D0%B8%D1%84%D0%BE%D0%B2%20%D0%BD%D0%B0%20%D0%B1%D1%80%D0%BE%D0%BA%D0%B5%D1%80%D1%81%D0%BA%D0%BE%D0%B5%20%D0%BE%D0%B1%D1%81%D0%BB%D1%83%D0%B6%D0%B8%D0%B2%D0%B0%D0%BD%D0%B8%D0%B5%20%D0%BA%D0%BB%D0%B8%D0%B5%D0%BD%D1%82%D0%BE%D0%B2%20%D0%90%D0%9E%20%D0%90%D0%BA%D1%82%D0%B8%D0%B2%20(%D1%80%D0%B5%D0%B4%D0%B0%D0%BA%D1%86%D0%B8%D1%8F%20%D0%B4%D0%B5%D0%B9%D1%81%D1%82%D0%B2%D1%83%D1%8E%D1%89%D0%B0%D1%8F%20%D1%81%2016.06.2025%20%D0%B3.).pdf";
const EXPENSES = "https://aktiv.ru/assets/userfiles/docs/informacziya-o-rasxodax.pdf";
const CONVERT = {
  rate: 0.0005,
  min: 0,
  basis: "tarif d'Aktiv sur le marché des changes, 0,05 % du chiffre du jour jusqu'à 5 millions de RUB, TVA comprise",
};
const DOKHOD = /ДОХОДЪ/i;
const DOKHOD_BASIS = "parts des fonds cotés de la société de gestion «ДОХОДЪ» sans courtage (tous les plans)";

/** Plan fees: `price(notionalRub, turnoverRub)` gives { rate, side, basis } for one leg. */
function planFees(price) {
  return ({ row, etf, notionalRub, turnoverRub }) => {
    const free = etf && DOKHOD.test(String(row.name || ""));
    const { rate, side, basis } = free ? { rate: 0, side: 0, basis: DOKHOD_BASIS } : price(notionalRub, turnoverRub);
    return {
      rate,
      buyRub: side,
      sellRub: side,
      levyRub: moexLeviesRub(notionalRub),
      basis: `tarifs du 16.06.2025, ${basis} ; QUIK gratuit ; ${MOEX_BASIS} (services des systèmes de négociation payés à part).`,
    };
  };
}

const STANDARD = [
  { upTo: 100000, rate: 0.0007 },
  { upTo: 5000000, rate: 0.0005 },
  { upTo: 10000000, rate: 0.0003 },
  { upTo: Infinity, rate: 0.0002 },
];
const PORTFOLIO = [
  { upTo: 500000, rate: 0.004 },
  { upTo: Infinity, rate: 0.002 },
];

const plan = (id, name, remark, fees) => ({ id, name, remark, fx: null, sheet: SHEET, convert: CONVERT, fees });

export const roundTrip = makeRoundTrip({
  folder: "aktiv",
  brand: "Aktiv",
  catalogue: new URL("aktiv-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB"],
  defaultPlan: "standard",
  sources: { expenses: EXPENSES, deposits: "https://aktiv.ru/services/valyutniy-rinok-moskovskoy-birzhi" },
  plans: {
    standard: plan(
      "standard",
      "ДОХОДЪ-СтандартЪ",
      "",
      planFees((notionalRub, turnoverRub) => {
        const rate = bandRate(STANDARD, turnoverRub);
        return {
          rate,
          side: notionalRub * rate,
          basis:
            "plan «ДОХОДЪ-СтандартЪ» : 0,07 % du chiffre du jour jusqu'à 100 000 RUB, 0,05 % jusqu'à 5 millions, 0,03 % jusqu'à 10, 0,02 % au-delà ; " +
            "le chiffre d'un aller-retour du jour (deux fois le montant) fixe le palier",
        };
      })
    ),
    d365: plan(
      "d365",
      "ДОХОДЪ-365",
      "",
      planFees((notionalRub) => ({ rate: 0.0025, side: notionalRub * 0.0025, basis: "plan «ДОХОДЪ-365» : 0,25 % de chaque opération" }))
    ),
    portfolio: plan(
      "portfolio",
      "ДОХОДЪ-Портфель инвестора",
      "",
      planFees((notionalRub, turnoverRub) => {
        const rate = bandRate(PORTFOLIO, turnoverRub);
        return {
          rate,
          side: notionalRub * rate,
          basis:
            "plan «ДОХОДЪ-Портфель инвестора» : 0,4 % du chiffre du jour jusqu'à 500 000 RUB, 0,2 % au-delà ; " +
            "le chiffre d'un aller-retour du jour (deux fois le montant) fixe le palier",
        };
      })
    ),
  },
});

cli(import.meta.url, roundTrip);
