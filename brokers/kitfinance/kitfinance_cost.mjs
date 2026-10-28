// What one round trip costs at KIT Finance (КИТ Финанс (АО)): buy n shares
// or fund units on the Moscow Exchange through the KIT Investitsii app or
// QUIK and sell them back the same day, in dollars. The account buys and
// holds yuan (Moscow Exchange currency market), so a yuan fund is bought
// with yuan.
//
// Tariff, appendix 3 to the brokerage regulation, «Тарифы на брокерские и
// связанные с ними услуги», order No. 2 of 19.01.2026, read on 2026-10-26:
//   https://brokerkf.ru/doc/documents/Prilozhenie_3_Tarify_19012026.pdf
//   https://brokerkf.ru/tariffs/ (summary page)
// «КИТ-Универсал», the self-service plan ("Абонентская плата Отсутствует"):
//   1.1 Moscow Exchange stock market, electronic orders, by the day's
//   turnover on that market: "До 1 000 000 0,05", 1,000,001–3,000,000
//   0.04, 3,000,001–6,000,000 0.03, 6,000,001–12,000,000 0.025, "От
//   12 000 001 0,02" (% of each trade). A same-day round trip is a
//   turnover of twice the amount; the band it reaches prices both legs.
//   1.5 currency market up to 25,000,000 a day: 0.2% (the FX remark).
// General provisions: rates are "без учёта комиссионных вознаграждений
// сторонних организаций (торговой системы (... ПАО «Московской биржи
// ММВБ-РТС» ...)": the Moscow Exchange fee is on top (moexCost.mjs). The
// FAQ on /tariffs/ confirms a taker fee was charged on a SBER sale.
//
// Not rows: «КИТ-ВИП» (0.15% flat, only from 6,000,000 RUB of assets) and
// «КИТ-Советник» / «КИТ-Советник 2» (advisory contracts from 12,000,000
// RUB). Voice orders (1.7, 0.2%, at least 100 RUB) are another channel.
// Left out: Russian income tax.
//
//   node brokers/kitfinance/kitfinance_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { bandFees, cli, makeRoundTrip } from "../psb/moexCost.mjs";

const PAGE = "https://brokerkf.ru/tariffs/";
const SHEET = "https://brokerkf.ru/doc/documents/Prilozhenie_3_Tarify_19012026.pdf";
const BANDS = [
  { upTo: 1000000, rate: 0.0005 },
  { upTo: 3000000, rate: 0.0004 },
  { upTo: 6000000, rate: 0.0003 },
  { upTo: 12000000, rate: 0.00025 },
  { upTo: Infinity, rate: 0.0002 },
];

export const roundTrip = makeRoundTrip({
  folder: "kitfinance",
  brand: "KIT Finance",
  catalogue: new URL("kitfinance-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "CNY"],
  defaultPlan: "universal",
  sources: { sheet: SHEET },
  plans: {
    universal: {
      id: "universal",
      name: "КИТ-Универсал",
      remark: "",
      fx: 0.002,
      sheet: SHEET,
      fees: bandFees({
        bands: BANDS,
        levies: true,
        basis: "plan «КИТ-Универсал», point 1.1 : 0,05 % à 0,02 % de chaque opération selon le chiffre du jour sur le marché des actions",
      }),
    },
  },
});

cli(import.meta.url, roundTrip);
