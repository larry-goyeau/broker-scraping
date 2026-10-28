// What one round trip costs at Russian Standard Bank (АО «Банк Русский
// Стандарт»): buy n shares on the Moscow Exchange and sell them back the
// same day, in dollars. Every catalogue line is in rubles and the broker
// does no currency deals (Регламент 1.13), so nothing is converted.
//
// Tariff plan «Стандарт» (appendix 17, in force since 05.11.2025), read on
// 2026-10-26:
//   https://www.rsb.ru/upload/iblock/526/526e9ab52682ba2ec7f613638a0f7216.pdf
//   "на торгах ПАО "Московская Биржа" 0,15% от суммы сделки (части
//   сделки), но не менее 150 руб. за каждый день исполнения сделок
//   полностью или в части". Regulations 13.2: the day's fee is the excess
//   of the minimum over the sum of the deal fees, so a same-day round trip
//   pays max(0.15% x twice the amount, 150 RUB), half on each leg.
//   "Тарифы за ведение Брокерских счетов Клиента: 700 руб. за каждый полный
//   календарный месяц; 0 руб. – при отсутствии операций и остатков" (in the
//   remark, out of the trip).
// Regulations 13.8: the client reimburses "вознаграждения (комиссии),
// взимаемые ТС ... включая комиссионные вознаграждения, взимаемые
// организациями, выполняющими клиринг": the Moscow Exchange fee is on top
// (../psb/moexCost.mjs).
//   https://www.rsb.ru/upload/iblock/44d/44dbe5a5359ce48ee11549fdef54dc1c.pdf
//
// Channel: regulations 8.1.1, orders are taken "по местонахождению
// Брокера ... лично, через уполномоченных лиц, с использованием почтовой
// или курьерской доставки"; no online channel, so onlineBuy is false.
//
// Left out: Russian income tax.
//
//   node brokers/russianstandard/russianstandard_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { MOEX_BASIS, cli, makeRoundTrip, moexLeviesRub } from "../psb/moexCost.mjs";

const PAGE = "https://www.rsb.ru/securities-investments/brokerage-service/";
const SHEET = "https://www.rsb.ru/upload/iblock/526/526e9ab52682ba2ec7f613638a0f7216.pdf";
const RATE = 0.0015;
const DAY_MIN_RUB = 150;

export const roundTrip = makeRoundTrip({
  folder: "russianstandard",
  brand: "Russian Standard Bank",
  catalogue: new URL("russianstandard-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB"],
  onlineBuy: false,
  defaultPlan: "standard",
  sources: { regulations: "https://www.rsb.ru/upload/iblock/44d/44dbe5a5359ce48ee11549fdef54dc1c.pdf" },
  plans: {
    standard: {
      id: "standard",
      name: "Стандарт",
      remark: "Account fee is RUB 700 a month.",
      fx: null,
      sheet: SHEET,
      fees({ notionalRub, turnoverRub }) {
        const day = Math.max(turnoverRub * RATE, DAY_MIN_RUB);
        return {
          rate: RATE,
          buyRub: day / 2,
          sellRub: day / 2,
          levyRub: moexLeviesRub(notionalRub),
          basis:
            "plan « Стандарт » : 0,15 % de chaque opération, au moins 150 RUB par jour d'exécution ; l'aller-retour du jour fait deux fois le montant, " +
            `plancher compté une fois ; tenue de compte 700 RUB par mois, hors aller-retour ; ${MOEX_BASIS} (règlement 13.8 : remboursement des commissions de la bourse et du compensateur).`,
          detail: { dayMinRub: DAY_MIN_RUB, dayFeeRub: day },
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
