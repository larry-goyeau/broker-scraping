// What one round trip costs at Bank Saint Petersburg (ПАО «Банк
// «Санкт-Петербург», BSPB): buy n shares or fund units on the Moscow
// Exchange and sell them back the same day, in dollars. The brokerage
// account is kept "в валюте Российской Федерации или иностранной валюте",
// so rubles and yuan are held and nothing is converted.
//
// Tariff "Тарифы по брокерскому обслуживанию" (in force since 24.06.2021,
// the sheet the brokerage page links), read on 2026-10-26:
//   https://s3.ru-msk.k2.cloud/bucket-cms-prod/BSPB_broker_tariff_2021_06_24_5a7c1a96b1.pdf
//   Section 1 (individuals outside Private Banking), items 1 and 3: "1,5% от
//   суммарного объема сделок за день, но не менее 5000 рублей", for
//   securities in rubles and in foreign currency alike. The rate and the
//   floor apply to the day's total, so a same-day round trip pays
//   max(1.5% x twice the amount, 5,000 RUB), half on each leg.
//   "Тарифы представлены без учета комиссионных вознаграждений третьих лиц
//   (торговой системы (ПАО Московская биржа и пр.)": the Moscow Exchange
//   fee is on top (../psb/moexCost.mjs).
//
// Channel: the Условия (8.3) take orders "лично (через контактных лиц
// Банка) на бумажных носителях", by telephone only for qualified investors;
// no online channel, so onlineBuy is false.
//   https://s3.ru-msk.k2.cloud/bucket-cms-prod/Usloviya_brokerskogo_obsluzhivaniya_v_PAO_Bank_Sankt_Peterburg_data_publikaczii_22_10_2025_f27df01a1a.pdf
//
// Left out: Private Banking (section 3, 0.5% down to 0.2%) is a wealth
// segment, not a plan; the bank prices no currency deals (no FX remark); a
// 2% fee on transfers to another bank is a withdrawal cost; Russian income
// tax.
//
//   node brokers/saintpetersburg/saintpetersburg_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { MOEX_BASIS, cli, makeRoundTrip, moexLeviesRub } from "../psb/moexCost.mjs";

const PAGE = "https://www.bspb.ru/disclosure/traders/broker";
const SHEET = "https://s3.ru-msk.k2.cloud/bucket-cms-prod/BSPB_broker_tariff_2021_06_24_5a7c1a96b1.pdf";
const RATE = 0.015;
const DAY_MIN_RUB = 5000;

export const roundTrip = makeRoundTrip({
  folder: "saintpetersburg",
  brand: "Bank Saint Petersburg",
  catalogue: new URL("saintpetersburg-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "CNY"],
  onlineBuy: false,
  defaultPlan: "standard",
  sources: {
    conditions:
      "https://s3.ru-msk.k2.cloud/bucket-cms-prod/Usloviya_brokerskogo_obsluzhivaniya_v_PAO_Bank_Sankt_Peterburg_data_publikaczii_22_10_2025_f27df01a1a.pdf",
  },
  plans: {
    standard: {
      id: "standard",
      name: "Тарифы по брокерскому обслуживанию",
      remark: "Minimum fee is RUB 5,000 a day.",
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
            "section 1, points 1 et 3 : 1,5 % du volume total des opérations du jour, au moins 5 000 RUB par jour ; " +
            `l'aller-retour du jour fait deux fois le montant, plancher compté une fois ; ${MOEX_BASIS} (tarifs hors commissions de tiers).`,
          detail: { dayMinRub: DAY_MIN_RUB, dayFeeRub: day },
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
