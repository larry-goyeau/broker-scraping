// What one round trip costs at Finam (АО «ФИНАМ»): buy n shares or fund
// units on the Moscow Exchange and sell them back the same day, in
// dollars. Rubles and yuan are deposit currencies (deposits.mjs), so
// nothing is converted.
//
// https://broker.finam.ru/landing/tariffs/ and the plan pages under it,
// read on 2026-10-24 (the brief's browser reading of 2026-10-24 matches;
// broker.finam.ru served these pages to a script that day). Four
// self-service plans, each a row (`query.plan`). On every plan the
// turnover is counted "за календарный день":
//   Долгосрочный портфель (tariffs-n1-dolgosrochniy): purchase 0%, sale
//     0.28%; "На Мосбирже комиссия за урегулирование сделок не взимается,
//     клиенту перевыставляется комиссия биржи": the Moscow Exchange fee is
//     on top (moexCost.mjs). 0 RUB a month.
//   Инвестор (tariffs-n3-investor): the day's turnover up to 1 million RUB
//     0.035%, 1–5 million 0.030%, above 0.025%; "Урегулирование сделок
//     МосБиржа кроме облигаций российских эмитентов 0,03%" each trade.
//     Account 200 RUB a month (in the remark, out of the trip).
//   Стратег (tariffs-n4-strateg): 0.05% at any turnover, at least 50 RUB
//     an executed order; settlement 0.03%. 0 RUB a month.
//   Единый дневной (tariffs-n2-day): up to 1 million 0.0354%, 1–5 million
//     0.0295%, 5–10 0.0236%, 10–20 0.0177%, 20–50 0.01534%, 50–100
//     0.0118%, above 0.00944%, at least 41.3 RUB an executed order;
//     settlement 0.03%. Account 177 RUB a month (remark).
// A turnover band prices all of the day's turnover; a same-day round trip
// is a turnover of twice the amount, and the band it reaches prices both
// legs. Currency market, all four plans: 0.03682% up to 1 million RUB a
// day, at least 41.3 RUB an order (the remark for cash held in the other
// deposit currency).
//
// Not rows: «Единый консультационный» is an advisory plan; «Единый
// Тест-Драйв» (0.0177%) lasts 30 days on the first account only.
//
//   node brokers/finam/finam_cost.mjs SBER MISX RUB --shares=10 --price=286
//   node brokers/finam/finam_cost.mjs SBER MISX RUB --shares=10 --price=286 --plan=investor
//
// `roundTrip(...)` reads files, not the network.

import { MOEX_BASIS, bandRate, cli, makeRoundTrip, moexLevyRub } from "../sber/moexCost.mjs";

const PAGE = "https://broker.finam.ru/landing/tariffs/";
const SETTLEMENT = 0.0003;
const FX = 0.0003682;
const FX_EXTRA = "(min RUB 41.30)";
const SETTLEMENT_BASIS = "urégulation des opérations à la Bourse de Moscou 0,03 % chaque sens";

const INVESTOR_BANDS = [
  { upTo: 1000000, rate: 0.00035 },
  { upTo: 5000000, rate: 0.0003 },
  { upTo: Infinity, rate: 0.00025 },
];
const DAY_BANDS = [
  { upTo: 1000000, rate: 0.000354 },
  { upTo: 5000000, rate: 0.000295 },
  { upTo: 10000000, rate: 0.000236 },
  { upTo: 20000000, rate: 0.000177 },
  { upTo: 50000000, rate: 0.0001534 },
  { upTo: 100000000, rate: 0.000118 },
  { upTo: Infinity, rate: 0.0000944 },
];

export const roundTrip = makeRoundTrip({
  folder: "finam",
  brand: "Finam",
  catalogue: new URL("finam-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-24",
  defaultPlan: "longterm",
  plans: {
    longterm: {
      id: "longterm",
      name: "Долгосрочный портфель",
      remark: "",
      fx: FX,
      fxExtra: FX_EXTRA,
      sheet: "https://broker.finam.ru/landing/tariffs-n1-dolgosrochniy",
      fees({ notionalRub }) {
        return {
          rate: { buy: 0, sell: 0.0028 },
          buyRub: 0,
          sellRub: notionalRub * 0.0028,
          levyRub: 2 * moexLevyRub(notionalRub),
          basis: `plan «Долгосрочный портфель» : 0 % à l'achat, 0,28 % à la vente, sans abonnement ; commission de la Bourse refacturée : ${MOEX_BASIS}.`,
        };
      },
    },
    investor: {
      id: "investor",
      name: "Инвестор",
      remark: "Account fee is RUB 200 a month.",
      fx: FX,
      fxExtra: FX_EXTRA,
      sheet: "https://broker.finam.ru/landing/tariffs-n3-investor",
      fees({ notionalRub, turnoverRub }) {
        const rate = bandRate(INVESTOR_BANDS, turnoverRub);
        const side = notionalRub * rate;
        return {
          rate,
          buyRub: side,
          sellRub: side,
          levyRub: 2 * notionalRub * SETTLEMENT,
          basis:
            `plan «Инвестор» : 0,035 % du chiffre du jour jusqu'à 1 million de RUB, 0,030 % jusqu'à 5, 0,025 % au-delà ; ` +
            `le chiffre d'un aller-retour du jour (deux fois le montant) fixe le palier ; ${SETTLEMENT_BASIS} ; 200 RUB par mois, hors aller-retour.`,
        };
      },
    },
    strateg: {
      id: "strateg",
      name: "Стратег",
      remark: "",
      fx: FX,
      fxExtra: FX_EXTRA,
      sheet: "https://broker.finam.ru/landing/tariffs-n4-strateg",
      fees({ notionalRub }) {
        const side = Math.max(notionalRub * 0.0005, 50);
        return {
          rate: 0.0005,
          buyRub: side,
          sellRub: side,
          levyRub: 2 * notionalRub * SETTLEMENT,
          basis: `plan «Стратег» : 0,05 % à tout chiffre, au moins 50 RUB par ordre exécuté ; ${SETTLEMENT_BASIS} ; sans abonnement.`,
        };
      },
    },
    day: {
      id: "day",
      name: "Единый дневной",
      remark: "Account fee is RUB 177 a month.",
      fx: FX,
      fxExtra: FX_EXTRA,
      sheet: "https://broker.finam.ru/landing/tariffs-n2-day",
      fees({ notionalRub, turnoverRub }) {
        const rate = bandRate(DAY_BANDS, turnoverRub);
        const side = Math.max(notionalRub * rate, 41.3);
        return {
          rate,
          buyRub: side,
          sellRub: side,
          levyRub: 2 * notionalRub * SETTLEMENT,
          basis:
            `plan «Единый дневной» : 0,0354 % du chiffre du jour jusqu'à 1 million de RUB, 0,0295 % jusqu'à 5, 0,0236 % jusqu'à 10, 0,0177 % jusqu'à 20, ` +
            `0,01534 % jusqu'à 50, 0,0118 % jusqu'à 100, 0,00944 % au-delà, au moins 41,3 RUB par ordre exécuté ; le chiffre d'un aller-retour du jour ` +
            `(deux fois le montant) fixe le palier ; ${SETTLEMENT_BASIS} ; 177 RUB par mois, hors aller-retour.`,
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
