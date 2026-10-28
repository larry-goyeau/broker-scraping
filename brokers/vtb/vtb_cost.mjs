// What one round trip costs at VTB My Investments (Банк ВТБ (ПАО)): buy n
// shares or fund units on the Moscow Exchange and sell them back the same
// day, in dollars. Rubles and yuan are deposit currencies (deposits.mjs),
// so nothing is converted.
//
// Tariffs read on 2026-10-24 on https://www.vtb.ru/personal/investicii/tarify/
// and the plan sheets under it. Two plans open to any client, each a row
// (`query.plan`):
//   Мой онлайн (the default), sheet moy_online.pdf:
//     securities and currency 0.25% of the day's turnover at level
//     «Базовый»; 0.20% «Серебряный», 0.15% «Золотой». The level comes
//     from the client's activity under the bank's «Мультикарта» package
//     (note *); without it the client is «Базовый». The row takes
//     «Базовый»; the Gold rate is the remark "Fees might be 40% lower."
//     (0.15% for 0.25% on each leg).
//   Профессиональный, sheet prof.pdf: the day's turnover on the venue up to
//     1 million RUB 0.045%, to 10 million 0.035%, to 50 million 0.025%,
//     above 0.018%. The day's turnover prices all of it; a same-day round
//     trip is a turnover of twice the amount, and the band it reaches
//     prices both legs. Settlement service 390 RUB a month (100 RUB with
//     300 to 9,000 VTB shares held, free above), charged once in a month on
//     its first trade (note ***); in the remark, out of the trip.
// On both: exchange funds (БПИФ) carry no broker commission until
// 31.12.2026 ("Полный перечень БПИФ ... www.moex.com/msn/etf"; every
// catalogue ETF is a BPIF on that list), and the exchange fee is billed on
// top: "Комиссия биржи за сделки с ценными бумагами ... 0,03% от суммы
// сделки, Заявка — Тейкер ... минимум 2 коп." (the Moscow Exchange
// tariff, moexCost.mjs). No broker floor is printed.
//
// Not rows: «Мой онлайн привилегия» (0.08–0.1%) and «Мой онлайн прайм»
// (0.06%) need the bank's Privilege or Prime package, whose price was not
// read; «Специальный 1/2» are only for accounts moved from Otkritie Broker.
// Office and phone orders (150 RUB) are other channels.
//
//   node brokers/vtb/vtb_cost.mjs SBER MISX RUB --shares=10 --price=286
//   node brokers/vtb/vtb_cost.mjs SBER MISX RUB --shares=10 --price=286 --plan=professional
//
// `roundTrip(...)` reads files, not the network.

import { MOEX_BASIS, bandRate, cli, makeRoundTrip, moexLevyRub } from "../sber/moexCost.mjs";

const PAGE = "https://www.vtb.ru/personal/investicii/tarify/";
const SHEET_ONLINE = "https://www.vtb.ru/media-files/vtb.ru/sitepages/personal/investicii/tarify/moy_online.pdf";
const SHEET_PROF = "https://www.vtb.ru/media-files/vtb.ru/sitepages/personal/investicii/tarify/prof.pdf";

const ONLINE_RATE = 0.0025;
const ONLINE_GOLD = 0.0015;
const PROF_BANDS = [
  { upTo: 1000000, rate: 0.00045 },
  { upTo: 10000000, rate: 0.00035 },
  { upTo: 50000000, rate: 0.00025 },
  { upTo: Infinity, rate: 0.00018 },
];

const fundBasis = (sheet) =>
  `${sheet} : БПИФ sans commission de courtage jusqu'au 31.12.2026 ; ${MOEX_BASIS}.`;

export const roundTrip = makeRoundTrip({
  folder: "vtb",
  brand: "VTB My Investments",
  catalogue: new URL("vtb-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-24",
  defaultPlan: "online",
  plans: {
    online: {
      id: "online",
      name: "Мой онлайн",
      remark: "",
      fx: ONLINE_RATE,
      sheet: SHEET_ONLINE,
      fees({ etf, notionalRub }) {
        const levyRub = 2 * moexLevyRub(notionalRub);
        if (etf) return { rate: 0, buyRub: 0, sellRub: 0, levyRub, basis: fundBasis("tarif «Мой онлайн»") };
        const side = notionalRub * ONLINE_RATE;
        return {
          rate: ONLINE_RATE,
          buyRub: side,
          sellRub: side,
          levyRub,
          remark: `Fees might be ${Math.round((100 * (ONLINE_RATE - ONLINE_GOLD)) / ONLINE_RATE)}% lower.`,
          basis: `tarif «Мой онлайн», niveau «Базовый» : 0,25 % du chiffre du jour (0,20 % «Серебряный», 0,15 % «Золотой» avec le paquet Мультикарта) ; ${MOEX_BASIS}.`,
        };
      },
    },
    professional: {
      id: "professional",
      name: "Профессиональный",
      remark: "Account fee is RUB 390 a month with trades.",
      fx: PROF_BANDS[0].rate,
      sheet: SHEET_PROF,
      fees({ etf, notionalRub, turnoverRub }) {
        const levyRub = 2 * moexLevyRub(notionalRub);
        if (etf) return { rate: 0, buyRub: 0, sellRub: 0, levyRub, basis: fundBasis("tarif «Профессиональный»") };
        const rate = bandRate(PROF_BANDS, turnoverRub);
        const side = notionalRub * rate;
        return {
          rate,
          buyRub: side,
          sellRub: side,
          levyRub,
          basis:
            `tarif «Профессиональный» : 0,045 % du chiffre du jour jusqu'à 1 million de RUB, 0,035 % jusqu'à 10 millions, 0,025 % jusqu'à 50, ` +
            `0,018 % au-delà ; le chiffre d'un aller-retour du jour (deux fois le montant) fixe le palier ; 390 RUB par mois avec opérations, hors aller-retour ; ${MOEX_BASIS}.`,
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
