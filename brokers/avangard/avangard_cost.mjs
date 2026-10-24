// What one round trip costs at Avangard Bank (ПАО АКБ «АВАНГАРД»): buy n
// shares or fund units on the Moscow Exchange through QUIK and sell them
// back the same day, in dollars. Every catalogue line is in rubles and the
// account is funded in rubles only, so nothing is converted.
//
// Tariff, appendix 10 to the brokerage contract, read on 2026-10-24:
//   https://www.avangard.ru/rus/private/securities/brokerage_service/tarify.pdf
// "Тарифы комиссионного вознаграждения ... на Фондовом рынке ПАО
// «Московская Биржа» (в % от суммарного объема сделок за день)":
//   day's volume up to 100,000 RUB 0.1%; 100,001–500,000 0.075%;
//   500,001–1,000,000 0.05%; 1,000,001–5,000,000 0.035%;
//   5,000,001–10,000,000 0.025%; from 10,000,001 0.015%.
// The rate is set by the day's total volume and prices all of it, so a
// same-day round trip is a volume of twice the amount and the band it
// reaches prices both legs. No floor is printed.
//
// Remote access to QUIK, the only online channel: 150 RUB a month (in the
// remark, out of the trip). The contract (dogovor_fiz_112023.pdf, 5.x) has
// the client reimburse "комиссионного вознаграждения ПАО Московская Биржа"
// on QUIK trades: the Moscow Exchange fee is on top (moexCost.mjs).
//
// Left out: phone orders beyond five a day (200 RUB) are another channel;
// a 20,000 RUB contract fee applies only without an Avangard bank account.
//   https://www.avangard.ru/rus/private/securities/brokerage_service/pdf/dogovor_fiz_112023.pdf
//
//   node brokers/avangard/avangard_cost.mjs SBER MISX RUB --shares=10 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { MOEX_BASIS, bandRate, cli, makeRoundTrip, moexLevyRub } from "../sber/moexCost.mjs";

const PAGE = "https://www.avangard.ru/rus/private/securities/brokerage_service/tarify.pdf";
const BANDS = [
  { upTo: 100000, rate: 0.001 },
  { upTo: 500000, rate: 0.00075 },
  { upTo: 1000000, rate: 0.0005 },
  { upTo: 5000000, rate: 0.00035 },
  { upTo: 10000000, rate: 0.00025 },
  { upTo: Infinity, rate: 0.00015 },
];

export const roundTrip = makeRoundTrip({
  folder: "avangard",
  brand: "Avangard",
  catalogue: new URL("avangard-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-24",
  defaultPlan: "quik",
  sources: { contract: "https://www.avangard.ru/rus/private/securities/brokerage_service/pdf/dogovor_fiz_112023.pdf" },
  plans: {
    quik: {
      id: "quik",
      name: "QUIK",
      remark: "QUIK access is RUB 150 a month.",
      fx: null,
      sheet: PAGE,
      fees({ notionalRub, turnoverRub }) {
        const rate = bandRate(BANDS, turnoverRub);
        const side = notionalRub * rate;
        return {
          rate,
          buyRub: side,
          sellRub: side,
          levyRub: 2 * moexLevyRub(notionalRub),
          basis:
            `annexe 10 : 0,1 % du volume du jour jusqu'à 100 000 RUB, 0,075 % jusqu'à 500 000, 0,05 % jusqu'à 1 million, 0,035 % jusqu'à 5, ` +
            `0,025 % jusqu'à 10, 0,015 % au-delà ; le volume d'un aller-retour du jour (deux fois le montant) fixe le palier ; ` +
            `QUIK 150 RUB par mois, hors aller-retour ; ${MOEX_BASIS} (contrat : remboursement de la commission de la Bourse).`,
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
