// What one round trip costs at Gazprombank Investments (ООО «Ньютон
// Инвестиции»): buy n shares or fund units on the Moscow Exchange and sell
// them back the same day, in dollars. Rubles and yuan are deposit
// currencies (deposits.mjs), so nothing is converted.
//
// Tariff plans, read on 2026-10-24 on https://gazprombank.investments/tariffs/
// (the page names «Базовый» "Устанавливается при открытии счета"). Two
// self-service plans, each a row (`query.plan`):
//   Базовый, https://gazprombank.investments/files/tariffs/Tariff_base.pdf
//     1.1 no monthly fee. 2.1 securities on the Moscow Exchange 0.3% of
//     the deal. 3.3 CNY/RUB 1% (the remark for cash held in the other
//     deposit currency).
//   Инвестор, https://gazprombank.investments/files/tariffs/Tariff_investor.pdf
//     1.1 299 RUB a month while net deposits ("сальдо инвестиций") are
//     under 1 million RUB, free above; charged whether or not the account
//     trades, only skipped in a month with no assets (in the remark, out
//     of the trip). 2.1 0.06% of the deal, at least 10 RUB an executed
//     order (0.15 currency units on a foreign-currency deal). 3.3 0.8%.
// Both sheets' notes: "Вознаграждение включает в себя расходы на оплату
// комиссий, взимаемых третьими лицами (включая Организатором торговли,
// Клиринговой организацией)" (futures excepted): no exchange fee on top.
//
// Funds: item 2.11 prices units of funds on the broker's Lists 1–7 (0.3%
// to 3%); those lists were not found on the site, so an exchange fund
// pays the 2.1 rate like a share (confidence note on those lines).
//
// Not a row: «Личный брокер Комфорт» is a personal-broker service (1.5% a
// year of assets, at least 3,000 RUB a month). The «Тариф для старта»
// promotion is temporary.
//
//   node brokers/gazprombank/gazprombank_cost.mjs SBER MISX RUB --shares=10 --price=286
//   node brokers/gazprombank/gazprombank_cost.mjs SBER MISX RUB --shares=10 --price=286 --plan=investor
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip } from "../sber/moexCost.mjs";

const PAGE = "https://gazprombank.investments/tariffs/";
const FUND_NOTE =
  "le point 2.11 tarife les parts des fonds des listes 1 à 7 du courtier (0,3 % à 3 %) ; listes non trouvées, le fonds est pris au point 2.1";

export const roundTrip = makeRoundTrip({
  folder: "gazprombank",
  brand: "Gazprombank Investments",
  catalogue: new URL("gazprombank-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-24",
  defaultPlan: "base",
  plans: {
    base: {
      id: "base",
      name: "Базовый",
      remark: "",
      fx: 0.01,
      sheet: "https://gazprombank.investments/files/tariffs/Tariff_base.pdf",
      fees({ etf, notionalRub }) {
        const side = notionalRub * 0.003;
        return {
          rate: 0.003,
          buyRub: side,
          sellRub: side,
          levyRub: 0,
          basis: "plan «Базовый», point 2.1 : 0,3 % de chaque opération, frais de bourse et de compensation compris (notes du barème).",
          ...(etf ? { confidence: FUND_NOTE } : {}),
        };
      },
    },
    investor: {
      id: "investor",
      name: "Инвестор",
      remark: "Account fee is RUB 299 a month, free from RUB 1 million paid in.",
      fx: 0.008,
      sheet: "https://gazprombank.investments/files/tariffs/Tariff_investor.pdf",
      fees({ etf, ccy, notionalRub, rubPerUnit }) {
        const minRub = ccy === "RUB" ? 10 : 0.15 * rubPerUnit;
        const side = Math.max(notionalRub * 0.0006, minRub);
        return {
          rate: 0.0006,
          buyRub: side,
          sellRub: side,
          levyRub: 0,
          basis:
            "plan «Инвестор», point 2.1 : 0,06 % de chaque opération, au moins 10 RUB par ordre exécuté (0,15 unité de devise en devise), " +
            "frais de bourse et de compensation compris ; 299 RUB par mois sous 1 million de RUB versés, hors aller-retour.",
          ...(etf ? { confidence: FUND_NOTE } : {}),
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
