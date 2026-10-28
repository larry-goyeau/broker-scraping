// What one round trip costs at Metallinvestbank (ПАО АКБ «Металлинвестбанк»):
// buy n shares or fund units on the Moscow Exchange through QUIK and sell
// them back the same day, in dollars. Every catalogue line is in rubles and
// the stock-market account is held in rubles, so nothing is converted.
//
// Tariff page, read on 2026-10-26:
//   https://www.metallinvestbank.ru/fonds/broker/tariff/tariff/
// "Для клиентов, присоединившихся к Регламенту ... в редакции, действующей
// с 01.07.2020 г, применяется тариф «Базовый»" (brokerage and IIS
// contracts alike). Item 1, exchange deals on the Moscow Exchange stock
// market: "При подаче заявки клиента физического лица через ИТС Quik:
// 0.025% от суммы сделки, по сделкам покупки-продажи ценных бумаг" (shares,
// receipts and fund units alike); 0.05% by phone or on paper, another
// channel. Item 5: "Биржевой сбор взимается отдельно от комиссионного
// вознаграждения": the Moscow Exchange fee is on top (../psb/moexCost.mjs).
// No floor is printed.
//
// Left out: the bank may charge 10,000 RUB for a month with neither a
// trade nor a position to clients running desktop QUIK (not on a trading
// account); the pre-01.07.2020 tariffs (exchange-fee multiples) apply only
// to older contracts; securities issued by the bank itself are free;
// Russian income tax.
//
//   node brokers/metallinvestbank/metallinvestbank_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { cli, flatFees, makeRoundTrip } from "../psb/moexCost.mjs";

const PAGE = "https://www.metallinvestbank.ru/fonds/broker/tariff/tariff/";

export const roundTrip = makeRoundTrip({
  folder: "metallinvestbank",
  brand: "Metallinvestbank",
  catalogue: new URL("metallinvestbank-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB"],
  defaultPlan: "base",
  plans: {
    base: {
      id: "base",
      name: "Базовый",
      remark: "",
      fx: null,
      sheet: PAGE,
      convert: null,
      fees: flatFees({
        rate: 0.00025,
        levies: true,
        basis:
          "tarif « Базовый », point 1 : ordre d'un particulier par QUIK, 0,025 % du montant de chaque opération d'achat ou de vente, " +
          "sans minimum ; « Биржевой сбор взимается отдельно » (point 5)",
      }),
    },
  },
});

cli(import.meta.url, roundTrip);
