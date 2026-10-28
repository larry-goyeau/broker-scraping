// What one round trip costs at PSB Investments (ПАО «Банк ПСБ»): buy n
// shares or fund units on the Moscow Exchange and sell them back the same
// day, in dollars. The brokerage account can be kept in rubles or yuan
// (and USD, EUR, BYN, KZT, TRY), so a yuan fund is bought with yuan.
//
// Tariffs, «Тарифы ПАО «Банк ПСБ» на брокерское обслуживание» edition
// 44.00 in force since 25.09.2026, read on 2026-10-26:
//   https://www.psbank.ru/qpstorage/psb/images/brokerage_service_rates.pdf
//   https://www.psbank.ru/personal/wealth/rates (summary page)
//   https://www.psbank.ru/qpstorage/psb/images/tarif_investor.pdf (sheet)
// Three self-service plans for individuals, each a row (`query.plan`),
// all usable in the «ПСБ Инвестиции» app:
//   2.1.1 «Инвестор»: "От суммы Сделки, вне зависимости от оборота 0,25 %"
//     (stock and currency markets).
//   2.1.2 «Профессионал», stock market, by the day's turnover on that
//     market: "до 1 000 000,00 0,3 %", 1,000,000.01–5,000,000 0.085%,
//     –10,000,000 0.075%, –20,000,000 0.065%, –100,000,000 0.06%, above
//     0.045%. Currency market: up to 1,000,000 0.3%.
//   2.1.3 «Трейдер», by the day's turnover on stock and currency markets
//     together: "до 5 000,00 0,3 %", "от 5 000,01 до 200 000,00 0,055 %",
//     –500,000 0.052%, –3,000,000 0.049%, –5,000,000 0.047%, –10,000,000
//     0.045%, –20,000,000 0.042%, –50,000,000 0.040%, –100,000,000 0.038%,
//     above 0.035%.
// The summary page and the «Инвестор» sheet: "Биржевая комиссия на
// фондовом и валютном рынках включена в комиссию брокера": no Moscow
// Exchange fee on top. No floor and no monthly fee on any of the three.
// A same-day round trip is a turnover of twice the amount; the band it
// reaches prices both legs.
//
// PSB's own funds (УК «ПРОМСВЯЗЬ»), same three plans: "Покупки паев паевых
// инвестиционных фондов под управлением ООО «УК ПРОМСВЯЗЬ»" and "Продажи
// инвестиционных паев ... «ПСБ – Денежный рынок»" — "Не взимается", and
// those trades do not count toward the day's turnover. In the catalogue:
// PSGM, PSMM, PSRB, PSRE; PSMM is free both ways, the others pay the sale
// only, at the band of the sale alone.
//
// FX remark: the plan's currency-market rate (0.25% / 0.3% / 0.055%).
//
// Left out: the 10–15% discounts for Orange Premium Club, Private Banking
// and payroll clients (client segments); «Зарплатный клиент ПСБ» and the
// staff plans (closed groups); archived plans; Russian income tax.
//
//   node brokers/psb/psb_cost.mjs SBER MISX RUB --shares=300 --price=286
//   node brokers/psb/psb_cost.mjs SBER MISX RUB --shares=300 --price=286 --plan=trader
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip, pctFr } from "./moexCost.mjs";

const PAGE = "https://www.psbank.ru/personal/wealth/rates";
const SHEET = "https://www.psbank.ru/qpstorage/psb/images/brokerage_service_rates.pdf";

// Exchange funds managed by ООО «УК ПРОМСВЯЗЬ»: buy free; PSMM sale free too.
const PSB_FUNDS = new Set(["RU000A10B5N4", "RU000A108G96", "RU000A10A0X5", "RU000A10C0W5"]);
const PSMM = "RU000A108G96";

const BANDS = {
  investor: [{ upTo: Infinity, rate: 0.0025 }],
  professional: [
    { upTo: 1000000, rate: 0.003 },
    { upTo: 5000000, rate: 0.00085 },
    { upTo: 10000000, rate: 0.00075 },
    { upTo: 20000000, rate: 0.00065 },
    { upTo: 100000000, rate: 0.0006 },
    { upTo: Infinity, rate: 0.00045 },
  ],
  trader: [
    { upTo: 5000, rate: 0.003 },
    { upTo: 200000, rate: 0.00055 },
    { upTo: 500000, rate: 0.00052 },
    { upTo: 3000000, rate: 0.00049 },
    { upTo: 5000000, rate: 0.00047 },
    { upTo: 10000000, rate: 0.00045 },
    { upTo: 20000000, rate: 0.00042 },
    { upTo: 50000000, rate: 0.0004 },
    { upTo: 100000000, rate: 0.00038 },
    { upTo: Infinity, rate: 0.00035 },
  ],
};

function fees(id, label) {
  return ({ listing, notionalRub }) => {
    const own = PSB_FUNDS.has(listing.isin);
    const buyFree = own;
    const sellFree = listing.isin === PSMM;
    // Free legs are left out of the day's turnover.
    const turnover = notionalRub * ((buyFree ? 0 : 1) + (sellFree ? 0 : 1));
    const rate = turnover > 0 ? bandRate(BANDS[id], turnover) : 0;
    const banded = BANDS[id].length > 1;
    return {
      rate,
      buyRub: buyFree ? 0 : notionalRub * rate,
      sellRub: sellFree ? 0 : notionalRub * rate,
      levyRub: 0,
      basis:
        `plan «${label}» : ${pctFr(rate)} de chaque opération` +
        (banded ? ", palier fixé par le chiffre du jour (les jambes gratuites n'y comptent pas)" : "") +
        ", frais de bourse compris (« Биржевая комиссия ... включена в комиссию брокера »)" +
        (own
          ? sellFree
            ? " ; fonds «ПСБ – Денежный рынок» : achat et vente sans commission."
            : " ; fonds de l'УК «ПРОМСВЯЗЬ» : achat sans commission, vente au tarif."
          : "."),
    };
  };
}

export const roundTrip = makeRoundTrip({
  folder: "psb",
  brand: "PSB Investments",
  catalogue: new URL("psb-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "USD", "EUR", "CNY", "BYN", "KZT", "TRY"],
  defaultPlan: "investor",
  sources: {
    sheet: "https://www.psbank.ru/qpstorage/psb/images/tarif_investor.pdf",
    faq: "https://www.psbank.ru/personal/wealth/markets/faq",
  },
  plans: {
    investor: {
      id: "investor",
      name: "Инвестор",
      remark: "",
      fx: 0.0025,
      sheet: SHEET,
      fees: fees("investor", "Инвестор"),
    },
    professional: {
      id: "professional",
      name: "Профессионал",
      remark: "",
      fx: 0.003,
      sheet: SHEET,
      fees: fees("professional", "Профессионал"),
    },
    trader: {
      id: "trader",
      name: "Трейдер",
      remark: "",
      fx: 0.00055,
      sheet: SHEET,
      fees: fees("trader", "Трейдер"),
    },
  },
});

cli(import.meta.url, roundTrip);
