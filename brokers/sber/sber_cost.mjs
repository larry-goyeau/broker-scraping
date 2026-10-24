// What one round trip costs at SberInvestor (ПАО Сбербанк): buy n shares or
// fund units on the Moscow Exchange and sell them back the same day, in
// dollars. The account is funded in rubles only (deposits.mjs), so a yuan
// line is bought by converting rubles and converting back.
//
// Tariff «Самостоятельный», in force from 14.07.2025, read on 2026-10-24:
//   https://www.sberbank.com/common/img/uploaded/broker/tariff_self.pdf
// "Стоимость услуги без учета комиссий бирж/Торговых систем": exchange
// fees are on top.
//   1.1 securities on the Moscow Exchange, orders sent through internet
//       trading, % of the day's total ruble turnover: up to 1 million RUB
//       0.060%, to 50 million 0.035%, above 0.018%. "Комиссия бирж по
//       сделкам с расчётами в китайских юанях ... не взимается."
//   1.4 exchange funds: those of AO UK «Первая» settled in rubles free
//       (their turnover is left out of the day's total); funds settled in
//       a foreign currency 0.03%.
//   2.1 currency instruments: 0.20% of the day's turnover up to 100
//       million RUB, 0.02% above (the forced conversion of a yuan line).
// The day's turnover prices all of it, so a same-day round trip is a
// turnover of twice the amount and the band it reaches prices both legs.
// No floor is printed. Phone orders (1.1, 8.1) and the OTC section 4
// (Sberbank Online purchases) are other tickets. The temporary «Трейдер»
// and «Активный» sheets (22.05–31.08.2026, offered to a random sample)
// have expired. The «Инвестиционный» sheet is on sberbank.ru, which
// blocks scripts; it was not read, so there is one row.
//
// Pervaya funds: the catalogue ETFs whose MOEX issue name is a «Первая»
// fund (SBBY's ISS ISSUENAME reads "Первая - Фонд Инструменты в юанях").
//
// Exchange fees: see moexCost.mjs (0.03% taker, at least 0.02 RUB, each
// way), except on yuan trades. Forced conversion: 0.20% each way plus the
// Moscow Exchange currency-market fee (moexCost.mjs).
//
// Left out: custody and the services in the extra-services table are free;
// the digital adviser is not this ticket.
//
//   node brokers/sber/sber_cost.mjs SBER MISX RUB --shares=10 --price=286
//   node brokers/sber/sber_cost.mjs SBCN MISX CNY --shares=100 --price=12
//
// `roundTrip(...)` reads files, not the network.

import { MOEX_BASIS, bandRate, cli, makeRoundTrip, moexLevyRub } from "./moexCost.mjs";

const PAGE = "https://www.sberbank.com/common/img/uploaded/broker/tariff_self.pdf";

const BANDS = [
  { upTo: 1000000, rate: 0.0006 },
  { upTo: 50000000, rate: 0.00035 },
  { upTo: Infinity, rate: 0.00018 },
];
const FOREIGN_FUND = 0.0003;

// AO UK «Первая» exchange funds in the catalogue.
const PERVAYA = new Set([
  "RU000A10FF36", // AIIQ
  "RU000A10BXL5", // FLOW
  "RU000A1035N9", // SAFE
  "RU000A10B7P5", // SBBC
  "RU000A106J53", // SBBY
  "RU000A1000Q6", // SBCB
  "RU000A105PU9", // SBCN
  "RU000A1035L3", // SBDS
  "RU000A107KW2", // SBFR
  "RU000A1000F9", // SBGB
  "RU000A105385", // SBGD
  "RU000A103ZQ1", // SBHI
  "RU000A108355", // SBLB
  "RU000A103RF1", // SBMM
  "RU000A0ZZH92", // SBMX
  "RU000A1035R0", // SBPS
  "RU000A100P44", // SBRB
  "RU000A1024P8", // SBRI
  "RU000A1035Q2", // SBRS
  "RU000A106XY3", // SBSC
  "RU000A108X20", // SIPO
  "RU000A10ECQ2", // SPRN
  "RU000A1035S8", // STME
]);

function fees({ etf, ccy, listing, notionalRub, turnoverRub }) {
  if (etf && ccy !== "RUB") {
    const side = notionalRub * FOREIGN_FUND;
    return {
      rate: FOREIGN_FUND,
      buyRub: side,
      sellRub: side,
      levyRub: 0,
      basis: `tarif «Самостоятельный» (14.07.2025), point 1.4 : fonds en devise 0,03 % de chaque opération ; pas de frais de bourse sur les opérations en yuans.`,
    };
  }
  if (etf && PERVAYA.has(listing.isin)) {
    return {
      rate: 0,
      buyRub: 0,
      sellRub: 0,
      levyRub: 2 * moexLevyRub(notionalRub),
      basis: `tarif «Самостоятельный» (14.07.2025), point 1.4 : fonds de l'UK «Первая» en roubles sans commission ; ${MOEX_BASIS}.`,
    };
  }
  const rate = bandRate(BANDS, turnoverRub);
  const side = notionalRub * rate;
  return {
    rate,
    buyRub: side,
    sellRub: side,
    levyRub: ccy === "RUB" ? 2 * moexLevyRub(notionalRub) : 0,
    basis:
      `tarif «Самостоятельный» (14.07.2025), point 1.1, ordres par internet : 0,06 % du chiffre du jour jusqu'à 1 million de RUB, ` +
      `0,035 % jusqu'à 50 millions, 0,018 % au-delà ; le chiffre d'un aller-retour du jour (deux fois le montant) fixe le palier ; ${MOEX_BASIS}.`,
  };
}

export const roundTrip = makeRoundTrip({
  folder: "sber",
  brand: "SberInvestor",
  catalogue: new URL("sber-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-24",
  defaultPlan: "self",
  plans: {
    self: {
      id: "self",
      name: "Самостоятельный",
      remark: "",
      fx: null,
      sheet: PAGE,
      convert: { rate: 0.002, min: 0, basis: "point 2.1, 0,20 % du chiffre du jour" },
      fees,
    },
  },
});

cli(import.meta.url, roundTrip);
