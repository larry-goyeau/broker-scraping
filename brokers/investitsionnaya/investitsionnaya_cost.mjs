// What one round trip costs at Investitsionnaya Palata (ООО «Инвестиционная
// палата», Voronezh): buy n shares or fund units on the Moscow Exchange
// through QUIK and sell them back the same day, in dollars. Rubles and yuan
// are deposit currencies, so nothing is converted.
//
// Fees are section 22 of the client regulations in force from 01.09.2026,
// read on 2026-10-26:
//   https://investpalata.ru/%d1%81%d1%82%d0%be%d0%b8%d0%bc%d0%be%d1%81%d1%82%d1%8c-%d0%be%d0%b1%d1%81%d0%bb%d1%83%d0%b6%d0%b8%d0%b2%d0%b0%d0%bd%d0%b8%d1%8f/
//   ("Вознаграждение ... указаны в разделе 22 Регламента")
//   https://investpalata.ru/wp-content/uploads/2026/08/Регламент-обслуживания-клиентов-ред.-01.09.2026v6.pdf
// 13-1.2: "Если иное не оговорено Дополнительным соглашением ... Брокер
// взимает с Клиента вознаграждение в соответствии с тарифным планом
// «Премиальный»", and a current plan "может быть изменен только на
// тарифный план «Премиальный»". So the one plan a new client gets is
// 22.19 «Премиальный»:
//   "Вознаграждение Брокера за заключение сделок купли-продажи с ценными
//   бумагами на фондовом рынке ПАО Московская Биржа 0,005%", per deal,
//   "не может составлять менее 0,01 ₽ или 0,01 у.е. за сделку", "указано
//   без учета соответствующего Торгового сбора". The «Торговый сбор» on
//   the stock market is "в размере комиссии ПАО Московская Биржа, НКО НКЦ
//   (АО)": the Moscow Exchange fee is on top (../psb/moexCost.mjs). Iceberg
//   and auction orders add 0.0025% (not a plain order, left out).
//   Currency market (the remark for cash held in another deposit
//   currency): conversion 0.025% plus a trade fee of 0.0015%, at least 1 RUB.
// The accounting fee (22.11) and the 147.50 RUB monthly minimum (22.12)
// expressly do not apply to «Премиальный».
//
// Not rows: «Миллионер. Дешевле других», «Первый», «Личный брокер» and
// «Базовый» (22.1–22.4) stay only for clients already on them. Left out:
// withdrawal fees (100 RUB a ruble transfer), Russian income tax.
//
//   node brokers/investitsionnaya/investitsionnaya_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { cli, flatFees, makeRoundTrip } from "../psb/moexCost.mjs";

const PAGE =
  "https://investpalata.ru/%d1%81%d1%82%d0%be%d0%b8%d0%bc%d0%be%d1%81%d1%82%d1%8c-%d0%be%d0%b1%d1%81%d0%bb%d1%83%d0%b6%d0%b8%d0%b2%d0%b0%d0%bd%d0%b8%d1%8f/";
const SHEET = "https://investpalata.ru/wp-content/uploads/2026/08/Регламент-обслуживания-клиентов-ред.-01.09.2026v6.pdf";

export const roundTrip = makeRoundTrip({
  folder: "investitsionnaya",
  brand: "Investpalata",
  catalogue: new URL("investitsionnaya-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "CNY", "USD"],
  defaultPlan: "premium",
  plans: {
    premium: {
      id: "premium",
      name: "Премиальный",
      remark: "",
      fx: 0.000265,
      sheet: SHEET,
      convert: null,
      fees: flatFees({
        rate: 0.00005,
        minRub: 0.01,
        levies: true,
        basis:
          "règlement, point 22.19, plan « Премиальный » (le seul ouvert aux nouveaux clients, point 13-1.2) : 0,005 % de chaque opération " +
          "sur titres à la Bourse de Moscou, au moins 0,01 RUB par opération, hors « Торговый сбор » (la commission de la Bourse et de la NCC)",
      }),
    },
  },
});

cli(import.meta.url, roundTrip);
