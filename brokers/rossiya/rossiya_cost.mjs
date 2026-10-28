// What one round trip costs at Bank Rossiya (АО «АБ «РОССИЯ», St
// Petersburg): buy n shares or fund units on the Moscow Exchange through
// QUIK and sell them back the same day, in dollars. Every catalogue line
// is in rubles and the regulation (4.5) bars securities settled in any
// currency other than the ruble, so nothing is converted.
//
// Tariffs (order of 28.08.2026 No 805-п), read on 2026-10-26:
//   https://abr.ru/upload/iblock/41a/Тарифы_комиссионного_вознаграждения_брокерские_услуги.pdf
//   I.1 "Заключение сделок на ПАО «Московская биржа» (фондовый рынок)",
//   "Комиссия рассчитывается от торгового оборота по всем сделкам,
//   совершенным в течение дня". Tariff plan «Профессиональный», whose
//   condition (general provision 8) is that the client places orders
//   himself in the remote access system: day's turnover up to 500,000 RUB
//   0.09%, at least 100 RUB; 500,001–1,000,000 0.08%; to 5 million 0.04%;
//   to 10 million 0.035%; to 50 million 0.03%; to 100 million 0.02%; to
//   500 million 0.015%; above 0.0065%. The floor is on the day's
//   commission, so on both legs together. A same-day round trip is a
//   turnover of twice the amount, and the band it reaches prices both legs.
//   V. Remote access systems: connection and monthly service free.
//   General provision 11: "Данные Тарифы представлены без учета тарифов
//   сторонних Депозитариев, Торговых систем и Бирж, которые удерживаются с
//   Клиента": the Moscow Exchange fee is on top (moexCost.mjs).
//   Regulation 4.5:
//   https://abr.ru/about/raskrytie-informatsii/disclosure-securities-market/broker-activity/
//
// Left out: plan «Основной» (0.3%) is for clients who do not use the
// remote access system (orders by other channels), not an online price.
// No commission is charged in a month without trades.
//
//   node brokers/rossiya/rossiya_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { MOEX_BASIS, bandRate, cli, makeRoundTrip, moexLeviesRub } from "../psb/moexCost.mjs";

const SHEET =
  "https://abr.ru/upload/iblock/41a/%D0%A2%D0%B0%D1%80%D0%B8%D1%84%D1%8B_%D0%BA%D0%BE%D0%BC%D0%B8%D1%81%D1%81%D0%B8%D0%BE%D0%BD%D0%BD%D0%BE%D0%B3%D0%BE_%D0%B2%D0%BE%D0%B7%D0%BD%D0%B0%D0%B3%D1%80%D0%B0%D0%B6%D0%B4%D0%B5%D0%BD%D0%B8%D1%8F_%D0%B1%D1%80%D0%BE%D0%BA%D0%B5%D1%80%D1%81%D0%BA%D0%B8%D0%B5_%D1%83%D1%81%D0%BB%D1%83%D0%B3%D0%B8.pdf";
const REGULATION = "https://abr.ru/about/raskrytie-informatsii/disclosure-securities-market/broker-activity/";
const BANDS = [
  { upTo: 500000, rate: 0.0009 },
  { upTo: 1000000, rate: 0.0008 },
  { upTo: 5000000, rate: 0.0004 },
  { upTo: 10000000, rate: 0.00035 },
  { upTo: 50000000, rate: 0.0003 },
  { upTo: 100000000, rate: 0.0002 },
  { upTo: 500000000, rate: 0.00015 },
  { upTo: Infinity, rate: 0.000065 },
];
const DAY_MIN_RUB = 100;

export const roundTrip = makeRoundTrip({
  folder: "rossiya",
  brand: "Bank Rossiya",
  catalogue: new URL("rossiya-parsed.json", import.meta.url),
  page: SHEET,
  readOn: "2026-10-26",
  deposits: ["RUB"],
  defaultPlan: "pro",
  sources: { regulation: REGULATION },
  plans: {
    pro: {
      id: "pro",
      name: "Профессиональный",
      remark: "",
      fx: null,
      sheet: SHEET,
      fees({ notionalRub, turnoverRub }) {
        const rate = bandRate(BANDS, turnoverRub);
        const day = turnoverRub <= 500000 ? Math.max(turnoverRub * rate, DAY_MIN_RUB) : turnoverRub * rate;
        return {
          rate,
          buyRub: day / 2,
          sellRub: day / 2,
          levyRub: moexLeviesRub(notionalRub),
          basis:
            "tarifs du 28.08.2026, I.1, plan «Профессиональный» (ordres passés soi-même dans le système d'accès à distance) : 0,09 % du chiffre du jour " +
            "jusqu'à 500 000 RUB (au moins 100 RUB), 0,08 % jusqu'à 1 million, 0,04 % jusqu'à 5, 0,035 % jusqu'à 10, 0,03 % jusqu'à 50, 0,02 % jusqu'à 100, " +
            "0,015 % jusqu'à 500, 0,0065 % au-delà ; le chiffre d'un aller-retour du jour (deux fois le montant) fixe le palier et le plancher ; " +
            `accès à distance gratuit ; ${MOEX_BASIS} (disposition 11 : tarifs des bourses en sus).`,
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
