// What one round trip costs at MTS Investments (the app of ПАО «МТС-Банк»):
// buy n shares or fund units on the Moscow Exchange and sell them back the
// same day, in dollars. The account holds rubles and the yuan it buys
// (CNY is traded over the counter at the exchange rate ± 0.3%), so a yuan
// fund is bought with yuan.
//
// Two plans, each a row (`query.plan`), read on 2026-10-26:
//   https://support.mts.ru/invetitsii/brokerskii-schyot/kakie-est-tarifi-v-mts-investitsiyah
//   Catalogue of tariffs, 1.1.1 / 1.1.2 / 1.8.1 (in force since
//   23.06.2026): https://www.mtsbank.ru/upload/static/documents/tarify-dlya-fiz-lic.pdf
//   «Базовый» (default): "Фондовый рынок. Комиссия от суммы дневного
//     оборота 0,3% (мин. 5 руб.)"; the FAQ: "0,3% на тарифе Базовый —
//     минимум 5 ₽ в день сделки". Note 5: when the settlement currency is
//     not the ruble, the floor is the equivalent of 50 RUB (yuan lines).
//     No monthly fee.
//   «Смарт Подписка» (app clients): "Фондовый рынок. Комиссия от суммы
//     дневного оборота 0,04%"; "Сделки с БПИФ ... «Ликвидный» под
//     управлением АО УК «Доверительная» 0 руб." (SCLI, RU000A108VV9, both
//     ways); 299 RUB a month after a free first month (in the remark, out
//     of the trip).
//   1.8.1 "для валюты Китайский юань (CNY) Спред +/- 0,3% от биржевого
//     курса" (the FX remark).
// Exchange fee: the catalogue says the Moscow Exchange fee is paid
// separately only for futures ("Комиссия Московской биржи на срочном
// рынке покрывается отдельно"); the key information document makes the
// client's reimbursement of trading-system fees depend on the tariff ("В
// зависимости от условий Тарифов Клиент возмещает Банку расходы ...
// (комиссии Торговых систем ...)",
// https://www.mtsbank.ru/upload/static/documents/kid-s-24-04-26.pdf).
// Nothing of the kind for the stock market, whose rates are read as
// all-in (confidence note), as for Sovcombank.
//
// Left out: «Стандартный» and «Premium» (closed since 13.10.2025);
// Russian income tax.
//
//   node brokers/mts/mts_cost.mjs SBER MISX RUB --shares=300 --price=286
//   node brokers/mts/mts_cost.mjs SBER MISX RUB --shares=300 --price=286 --plan=smart
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, pctFr } from "../psb/moexCost.mjs";

const PAGE = "https://support.mts.ru/invetitsii/brokerskii-schyot/kakie-est-tarifi-v-mts-investitsiyah";
const SHEET = "https://www.mtsbank.ru/upload/static/documents/tarify-dlya-fiz-lic.pdf";
const SCLI = "RU000A108VV9";
const ALL_IN =
  "le catalogue ne dit pas si la bourse est comprise sur le marché des actions ; seule la bourse du marché à terme y est « покрывается отдельно », lu tout compris";

function fees({ rate, minDayRub, name, freeIsin = null }) {
  return ({ listing, ccy, notionalRub, turnoverRub }) => {
    if (freeIsin && listing.isin === freeIsin) {
      return {
        rate: 0,
        buyRub: 0,
        sellRub: 0,
        levyRub: 0,
        basis: `plan «${name}» : BPIF «Ликвидный» (SCLI) à 0 RUB dans les deux sens.`,
        confidence: ALL_IN,
      };
    }
    // The floor is per day: the day's commission is split over both legs.
    // Note 5: 50 RUB equivalent when the settlement currency is not RUB.
    const floor = minDayRub && ccy !== "RUB" ? 50 : minDayRub;
    const day = Math.max(turnoverRub * rate, floor);
    return {
      rate,
      buyRub: day / 2,
      sellRub: day / 2,
      levyRub: 0,
      basis:
        `plan «${name}» : ${pctFr(rate)} du chiffre du jour` +
        (floor ? `, au moins ${floor} RUB${ccy !== "RUB" ? " (équivalent, règlement en devise)" : ""} par jour de transactions` : "") +
        ", frais de bourse lus compris.",
      confidence: ALL_IN,
    };
  };
}

export const roundTrip = makeRoundTrip({
  folder: "mts",
  brand: "MTS Investments",
  catalogue: new URL("mts-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "CNY"],
  defaultPlan: "base",
  sources: { sheet: SHEET },
  plans: {
    base: {
      id: "base",
      name: "Базовый",
      remark: "",
      fx: 0.003,
      sheet: SHEET,
      fees: fees({ rate: 0.003, minDayRub: 5, name: "Базовый" }),
    },
    smart: {
      id: "smart",
      name: "Смарт Подписка",
      remark: "Account fee is RUB 299 a month.",
      fx: 0.003,
      sheet: SHEET,
      fees: fees({ rate: 0.0004, minDayRub: 0, name: "Смарт Подписка", freeIsin: SCLI }),
    },
  },
});

cli(import.meta.url, roundTrip);
