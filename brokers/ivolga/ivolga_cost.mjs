// What one round trip costs at Ivolga Capital (ООО ИК «Иволга Капитал»,
// Moscow): buy n shares or fund units on the Moscow Exchange through QUIK
// and sell them back the same day, in dollars. Rubles, dollars and euros
// are deposit currencies; a yuan line is bought with rubles converted on
// the currency market at the broker's rate.
//
// Tariffs in force from 30.11.2023, read on 2026-10-26:
//   https://ivolgacap.ru/services/tarify/documents/
//   https://ivolgacap.ru/upload/iblock/d27/9h0kt7jzagr45em5szay09yi1jzkkxbk/Tarify_izm-SR-Rayf_chistyy.pdf
// One plan for every client, «Универсальный» ("применяется единый
// тарифный план «Универсальный»"):
//   1.1 stock market of the Moscow Exchange: "0,5 % годовых от суммарной
//     стоимости активов Клиента" in the stock section, accrued daily
//     "вне зависимости от оборотов" (1.3), nothing on a day the assets are
//     50,000 RUB or less. No fee per trade (the asset fee is in the remark,
//     out of the trip).
//   1.2 the client reimburses "биржевые и клиринговые сборы": the Moscow
//     Exchange fee is on top (../psb/moexCost.mjs). The upper broker
//     (Raiffeisenbank) is only used on the derivatives market.
//   3. currency market: "0,45% от суммы сделки", exchange fee on top. Cash
//     is withdrawn in rubles, dollars or euros (5.2), not in yuan, so a CNY
//     line converts rubles both ways at 0.45% plus the Moscow Exchange
//     currency-market fee.
//
// Left out: withdrawal fees (35 RUB, 2,100 RUB in USD or EUR), PocketQUIK at
// the vendor's price, depositary fees, Russian income tax.
//
//   node brokers/ivolga/ivolga_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { MOEX_BASIS, cli, makeRoundTrip, moexLeviesRub } from "../psb/moexCost.mjs";

const PAGE = "https://ivolgacap.ru/services/tarify/documents/";
const SHEET = "https://ivolgacap.ru/upload/iblock/d27/9h0kt7jzagr45em5szay09yi1jzkkxbk/Tarify_izm-SR-Rayf_chistyy.pdf";

export const roundTrip = makeRoundTrip({
  folder: "ivolga",
  brand: "Ivolga Capital",
  catalogue: new URL("ivolga-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "USD", "EUR"],
  defaultPlan: "universal",
  plans: {
    universal: {
      id: "universal",
      name: "Универсальный",
      remark: "Account fee is 0.5% a year of assets, none at RUB 50,000 or less.",
      fx: null,
      sheet: SHEET,
      convert: {
        rate: 0.0045,
        min: 0,
        basis: "tarifs, point 3 : 0,45 % du montant de l'opération sur le marché des changes",
      },
      fees({ notionalRub }) {
        return {
          rate: 0,
          buyRub: 0,
          sellRub: 0,
          levyRub: moexLeviesRub(notionalRub),
          basis:
            "plan « Универсальный », point 1.1 : aucune commission par opération (0,5 % par an des avoirs de la section titres, " +
            `hors aller-retour) ; point 1.2 : frais de bourse et de compensation remboursés en sus ; ${MOEX_BASIS}.`,
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
