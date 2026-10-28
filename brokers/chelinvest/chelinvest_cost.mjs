// What one round trip costs at Chelyabinvestbank (ПАО «ЧЕЛЯБИНВЕСТБАНК»,
// Chelinvest): buy n shares on the Moscow Exchange through QUIK and sell
// them back the same day, in dollars. Every catalogue line is in rubles
// and the account is in rubles, so nothing is converted.
//
// Tariffs for individuals in force from 21.10.2026, read on 2026-10-26 on
// https://chelinvest.ru/tarify/:
//   https://chelinvest.ru/upload/iblock/952/n7t1oqkyv20vt5ey8gs4fyidx2jg34dv.pdf
//   12.4 "Брокерское обслуживание по операциям на организованном рынке
//   ценных бумаг (ОРЦБ)", tariff «ИГРОК» ("с предоставлением доступа к ПАО
//   Московская Биржа через систему QUIK"): % of the day's turnover, up to
//   1,000 thousand RUB 0.075; to 5,000 thousand 0.060; above 0.045.
//   "Минимальная комиссия от дневного оборота 50 руб. в день" (on the
//   day's commission, so on both legs together); "Минимальная комиссия в
//   месяц 200 руб., если была хоть одна сделка" (in the remark, out of the
//   trip). A same-day round trip is a turnover of twice the amount, and
//   the band it reaches prices both legs. QUIK access is free.
//   "Комиссионное вознаграждение биржи взимается дополнительно по тарифам
//   биржи": the Moscow Exchange fee is on top (moexCost.mjs).
//
// Left out: tariff «ИНВЕСТОР» (0.10% to 0.08%) takes paper orders only,
// not an online channel. Depository fees are charged separately.
//
//   node brokers/chelinvest/chelinvest_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { MOEX_BASIS, bandRate, cli, makeRoundTrip, moexLeviesRub } from "../psb/moexCost.mjs";

const PAGE = "https://chelinvest.ru/tarify/";
const SHEET = "https://chelinvest.ru/upload/iblock/952/n7t1oqkyv20vt5ey8gs4fyidx2jg34dv.pdf";
const BANDS = [
  { upTo: 1000000, rate: 0.00075 },
  { upTo: 5000000, rate: 0.0006 },
  { upTo: Infinity, rate: 0.00045 },
];
const DAY_MIN_RUB = 50;

export const roundTrip = makeRoundTrip({
  folder: "chelinvest",
  brand: "Chelinvest",
  catalogue: new URL("chelinvest-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB"],
  defaultPlan: "player",
  sources: { brokerage: "https://chelinvest.ru/investment/brokerskie-uslugi/" },
  plans: {
    player: {
      id: "player",
      name: "ИГРОК",
      remark: "Minimum fee is RUB 200 a month with trades.",
      fx: null,
      sheet: SHEET,
      fees({ notionalRub, turnoverRub }) {
        const rate = bandRate(BANDS, turnoverRub);
        const day = Math.max(turnoverRub * rate, DAY_MIN_RUB);
        return {
          rate,
          buyRub: day / 2,
          sellRub: day / 2,
          levyRub: moexLeviesRub(notionalRub),
          basis:
            "tarifs du 21.10.2026, point 12.4, tarif «ИГРОК» (QUIK) : 0,075 % du chiffre du jour jusqu'à 1 million de RUB, 0,060 % jusqu'à 5, 0,045 % au-delà, " +
            "au moins 50 RUB par jour ; le chiffre d'un aller-retour du jour (deux fois le montant) fixe le palier et le plancher ; " +
            `minimum de 200 RUB par mois avec opérations, hors aller-retour ; QUIK gratuit ; ${MOEX_BASIS}.`,
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
