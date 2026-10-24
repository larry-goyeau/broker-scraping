// What one round trip costs at BCS World of Investments (ООО «Компания
// БКС»): buy n shares or fund units on the Moscow Exchange and sell them
// back the same day, in dollars. Rubles and yuan are deposit currencies
// (deposits.mjs), so nothing is converted.
//
// https://bcs.ru/tariffs, read in a browser on 2026-10-24 (bcs.ru answers
// scripts with a bot check), and the two plan sheets, read by script:
//   Инвестор, https://shared.storage.bcs.ru/static/bcs/files/tariffs/tariff-investor.pdf
//     stock, currency and precious-metals markets of the Moscow Exchange
//     and SPB: 0% on a purchase, 0.3% on a sale ("ЕТF в валюте 0% / 0,3%"
//     too); no fixed fee. The sheet adds the exchange fee only for
//     futures and prints no settlement fee for securities, so the rate is
//     taken as all in.
//   Трейдер, https://shared.storage.bcs.ru/static/bcs/files/tariffs/tariff-traider.pdf
//     % of turnover, by "Суммарный дневной оборот по всем площадкам /
//     суммарная стоимость активов": up to 2 million RUB 0.04%, 2–6
//     million 0.02%, 6–30 million 0.015%, 30–80 million 0.0125%, 80–300
//     million 0.01%, above 0.008%; plus "Фондовый рынок Мосбиржи —
//     урегулирование сделок 0,02%" on each trade (in place of the
//     exchange fee); fixed fee 299 RUB a month "при совершении сделок",
//     none without (note 1: once a month with at least one trade; in the
//     remark, out of the trip). "ETF в валюте — по тарифу".
// The Трейдер band here is the day's turnover: a same-day round trip is a
// turnover of twice the amount (more than the assets it needs), and the
// band it reaches prices both legs. No floor is printed.
//
// Left out: phone orders past five a day (59 RUB), a second QUIK
// terminal, OTC deals (0.5%) and BCS exchange notes are other tickets.
// Foreign-currency holdings in USD, EUR, CHF, GBP and HKD above 10,000
// pay 1% a month, but yuan is not among them.
//
//   node brokers/bcs/bcs_cost.mjs SBER MISX RUB --shares=10 --price=286
//   node brokers/bcs/bcs_cost.mjs SBER MISX RUB --shares=10 --price=286 --plan=trader
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip } from "../sber/moexCost.mjs";

const PAGE = "https://bcs.ru/tariffs";
const SETTLEMENT = 0.0002;
const TRADER_BANDS = [
  { upTo: 2000000, rate: 0.0004 },
  { upTo: 6000000, rate: 0.0002 },
  { upTo: 30000000, rate: 0.00015 },
  { upTo: 80000000, rate: 0.000125 },
  { upTo: 300000000, rate: 0.0001 },
  { upTo: Infinity, rate: 0.00008 },
];

export const roundTrip = makeRoundTrip({
  folder: "bcs",
  brand: "BCS World of Investments",
  catalogue: new URL("bcs-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-24",
  defaultPlan: "investor",
  plans: {
    investor: {
      id: "investor",
      name: "Инвестор",
      remark: "",
      fx: 0.003,
      fxExtra: "on a sale",
      sheet: "https://shared.storage.bcs.ru/static/bcs/files/tariffs/tariff-investor.pdf",
      fees({ notionalRub }) {
        return {
          rate: { buy: 0, sell: 0.003 },
          buyRub: 0,
          sellRub: notionalRub * 0.003,
          levyRub: 0,
          basis: "plan «Инвестор» : 0 % à l'achat, 0,3 % à la vente, sans frais fixes ; la fiche n'ajoute de frais de bourse qu'aux contrats à terme.",
          confidence: "aucun frais de bourse ni de règlement imprimé pour les titres sur «Инвестор» : taux pris tout compris",
        };
      },
    },
    trader: {
      id: "trader",
      name: "Трейдер",
      remark: "Account fee is RUB 299 a month with trades.",
      fx: TRADER_BANDS[0].rate,
      sheet: "https://shared.storage.bcs.ru/static/bcs/files/tariffs/tariff-traider.pdf",
      fees({ notionalRub, turnoverRub }) {
        const rate = bandRate(TRADER_BANDS, turnoverRub);
        const side = notionalRub * rate;
        return {
          rate,
          buyRub: side,
          sellRub: side,
          levyRub: 2 * notionalRub * SETTLEMENT,
          basis:
            `plan «Трейдер» : 0,04 % du chiffre du jour jusqu'à 2 millions de RUB, 0,02 % jusqu'à 6, 0,015 % jusqu'à 30, 0,0125 % jusqu'à 80, ` +
            `0,01 % jusqu'à 300, 0,008 % au-delà ; le chiffre d'un aller-retour du jour (deux fois le montant) fixe le palier ; ` +
            `règlement des opérations à la Bourse de Moscou 0,02 % chaque sens ; 299 RUB par mois avec opérations, hors aller-retour.`,
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
