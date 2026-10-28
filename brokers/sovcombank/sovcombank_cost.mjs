// What one round trip costs at Sovcombank Investments (ПАО «Совкомбанк»):
// buy n shares or fund units on the Moscow Exchange and sell them back the
// same day, in dollars. Rubles and yuan are deposit currencies
// (deposits.mjs), so nothing is converted.
//
// Two plans, each a row (`query.plan`), read on 2026-10-24:
//   «Халва» (the plan given when the contract is signed through the
//     Halva-Sovcombank app), sheet
//     https://prod-api.sovcombank.ru/documents/4330 : account 0 RUB;
//     shares, bonds, funds and currency 0.09% of each trade; securities in
//     the special offer 0 RUB. The broker's home page prints "Комиссия
//     0,09% — Брокерский тариф, включая комиссию биржи"
//     (https://invest.sovcombank.ru/), so no exchange fee is added.
//   «ХалваФ», sheet https://prod-api.sovcombank.ru/documents/14736 :
//     account 199 RUB a month "Если есть сделки. Если нет — 0 ₽" (in the
//     remark, out of the trip); shares, bonds, funds and currency 0.05%;
//     special offer 0 RUB. Its one-page sheet has the same layout as
//     «Халва» and prints no exchange fee; it is read the same way, all in.
// No floor is printed on either.
//
// Special offer: "Покупайте и продавайте фонды с полки «0% комиссия» в
// разделе «Что купить» без комиссии"
// (https://invest.sovcombank.ru/spec/investicii-bez-komissii). The shelf is
// inside the app and not published, so a fund line pays the plan rate and
// carries "Fees might be 100% lower." (both legs free).
//
//   node brokers/sovcombank/sovcombank_cost.mjs SBER MISX RUB --shares=10 --price=286
//   node brokers/sovcombank/sovcombank_cost.mjs SBER MISX RUB --shares=10 --price=286 --plan=halvaf
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip } from "../sber/moexCost.mjs";

const PAGE = "https://invest.sovcombank.ru/investor/broker";

function flat(rate, name) {
  return ({ etf, notionalRub }) => {
    const side = notionalRub * rate;
    return {
      rate,
      buyRub: side,
      sellRub: side,
      levyRub: 0,
      remark: etf ? "Fees might be 100% lower." : "",
      basis:
        `tarif «${name}» : ${String(rate * 100).replace(".", ",")} % de chaque opération, frais de bourse compris ` +
        `(« включая комиссию биржи ») ; les fonds de l'étagère « 0% комиссия » de l'application ne sont pas publiés.`,
      ...(name === "ХалваФ"
        ? { confidence: "la fiche «ХалваФ» ne dit pas si la bourse est comprise ; lue comme «Халва», dont la page d'accueil dit « включая комиссию биржи »" }
        : {}),
    };
  };
}

export const roundTrip = makeRoundTrip({
  folder: "sovcombank",
  brand: "Sovcombank Investments",
  catalogue: new URL("sovcombank-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-24",
  defaultPlan: "halva",
  sources: { home: "https://invest.sovcombank.ru/", offer: "https://invest.sovcombank.ru/spec/investicii-bez-komissii" },
  plans: {
    halva: {
      id: "halva",
      name: "Халва",
      remark: "",
      fx: 0.0009,
      sheet: "https://prod-api.sovcombank.ru/documents/4330",
      fees: flat(0.0009, "Халва"),
    },
    halvaf: {
      id: "halvaf",
      name: "ХалваФ",
      remark: "Account fee is RUB 199 a month with trades.",
      fx: 0.0005,
      sheet: "https://prod-api.sovcombank.ru/documents/14736",
      fees: flat(0.0005, "ХалваФ"),
    },
  },
});

cli(import.meta.url, roundTrip);
