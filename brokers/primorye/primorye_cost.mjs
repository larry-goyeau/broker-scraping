// What one round trip costs at Bank Primorye (ПАО АКБ «Приморье»,
// Vladivostok): buy n shares or fund units on the Moscow Exchange through
// QUIK and sell them back the same day, in dollars. The account holds
// rubles and yuan (FAQ: "Банк предлагает доступ к RUB, CNY"), so nothing
// is converted.
//
// Tariffs in force from 15.06.2026, read on 2026-10-26:
//   https://www.primbank.ru/d/tariffs-depo
//   1.1 "Акции, облигации, РДР (с учетом биржевых сборов)": «Стандарт»
//   "0,1% от объема сделки". The exchange fees are included: no Moscow
//   Exchange fee on top. No floor is printed. 3.1–3.2 QUIK: free.
//   3.3 currency deals 0.075% of turnover: the FX remark.
// The two lower rates are statuses the bank assigns, not plans the client
// picks (as VTB's levels), so they are the remark "Fees might be x%
// lower if ...", x the cut of the 0.1% commission (50% and 65%), not rows:
//   «ВИП» 0.05% (note: "для Клиентов Банка Приморье, относящихся к
//   категории "ВИП""; FAQ: "ВИП (более 600 т.р.) - 0,05%", "мы имеем
//   право признать его ВИП Клиентом");
//   «Профессиональный инвестор» 0.035% ("При условии достижения оборота
//   не ниже 6 млн. рублей за предыдущий ... месяц или при объеме текущих
//   вложений в брокерские счета Банка, в размере не менее 6 млн. рублей";
//   otherwise «Стандарт»/«ВИП» applies).
// Funds: 1.1 names shares, bonds and depositary receipts; the client
// documents include BPIF units and the brokerage page "Фонды", so an
// exchange fund pays the 1.1 rate (confidence note on those lines).
//   https://www.primbank.ru/investitsii/brokerskoe-obsluzhivanie/
//   https://www.primbank.ru/investitsii/populyarnye-voprosy-brokerskoe-obsluzhivanie/
//
// Left out: withdrawals in foreign currency (0.7%) and depository fees.
//
//   node brokers/primorye/primorye_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, pctFr } from "../psb/moexCost.mjs";

const PAGE = "https://www.primbank.ru/investitsii/brokerskoe-obsluzhivanie/";
const SHEET = "https://www.primbank.ru/d/tariffs-depo";
const FUND_NOTE =
  "le point 1.1 nomme actions, obligations et certificats de dépôt ; les parts de fonds cotés (BPIF) sont prises au même taux";

const RATE = 0.001;
const LOWER =
  "Fees might be 50% lower if you hold over RUB 600,000, 65% lower with RUB 6 million traded last month or held.";

export const roundTrip = makeRoundTrip({
  folder: "primorye",
  brand: "Bank Primorye",
  catalogue: new URL("primorye-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "CNY"],
  defaultPlan: "standard",
  sources: { faq: "https://www.primbank.ru/investitsii/populyarnye-voprosy-brokerskoe-obsluzhivanie/" },
  plans: {
    standard: {
      id: "standard",
      name: "Стандарт",
      remark: LOWER,
      fx: null,
      sheet: SHEET,
      fees({ etf, ccy, notionalRub }) {
        const side = notionalRub * RATE;
        return {
          rate: RATE,
          buyRub: side,
          sellRub: side,
          levyRub: 0,
          basis:
            `tarifs du 15.06.2026, point 1.1, tarif «Стандарт» : ${pctFr(RATE)} de chaque opération, frais de bourse compris («с учетом биржевых сборов»), sans plancher ; QUIK gratuit ; ` +
            "taux «ВИП» (0,05 %) et «Профессиональный инвестор» (0,035 %) attribués par la banque selon les avoirs ou le volume, en remarque.",
          // fxRemark shows two decimals (0.075 would print as 0.08): the FX
          // remark is written here instead of through `fx`.
          remark: `FX 0.075% when cash ≠ ${ccy}.`,
          ...(etf ? { confidence: FUND_NOTE } : {}),
        };
      },
    },
  },
});

cli(import.meta.url, roundTrip);
