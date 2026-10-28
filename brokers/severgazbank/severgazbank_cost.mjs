// What one round trip costs at Severgazbank (АО «БАНК СГБ», Vologda): buy n
// shares or fund units on the Moscow Exchange through QUIK and sell them
// back the same day, in dollars. Rubles and yuan are deposit currencies
// (the account application lets stock-market deals settle in a foreign
// currency, "доллар США евро иная валюта"), so nothing is converted.
//
// Tariff "Тарифы комиссионного вознаграждения Банка по брокерскому
// обслуживанию с 17.12.2024" (the brokerage page's current sheet), read on
// 2026-10-26:
//   https://severgazbank.ru/upload/medialibrary/тарифы-29.11.pdf
//   1.1 "Торговый оборот по сделкам Клиента за день, руб.": up to
//   1,000,000.00 0.08%; 1,000,000.01–30,000,000.00 0.05%; from
//   30,000,000.01 0.03%; "Тариф распространяется на все режимы торгов
//   Фондового рынка ПАО Московская Биржа"; "рассчитывается ... от торгового
//   оборота по сделкам Клиента за день по регрессивной шкале". No floor.
//   A same-day round trip is a turnover of twice the amount and the band it
//   reaches prices both legs.
//   Note 1: "Тарифы не включают комиссионное вознаграждение Торговых систем
//   (организаторов торговли, клиринговых организаций и т.д.).
//   Вознаграждение Торговых систем взимается дополнительно": the Moscow
//   Exchange fee is on top (../psb/moexCost.mjs).
//
// Left out: the bank publishes no currency-market rate (no FX remark);
// keeping USD or EUR costs 0.5% a year (section 8), not a trade cost; the
// FINIS copy-trading tariffs (sections 1.2, 4) are another service; Russian
// income tax.
//   https://severgazbank.ru/invest/118/36307/
//
//   node brokers/severgazbank/severgazbank_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { bandFees, cli, makeRoundTrip } from "../psb/moexCost.mjs";

const PAGE = "https://severgazbank.ru/invest/118/36307/";
const SHEET = "https://severgazbank.ru/upload/medialibrary/тарифы-29.11.pdf";
const BANDS = [
  { upTo: 1000000, rate: 0.0008 },
  { upTo: 30000000, rate: 0.0005 },
  { upTo: Infinity, rate: 0.0003 },
];

export const roundTrip = makeRoundTrip({
  folder: "severgazbank",
  brand: "Severgazbank",
  catalogue: new URL("severgazbank-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "CNY"],
  defaultPlan: "quik",
  sources: { rules: "https://severgazbank.ru/upload/medialibrary/raskrytie/Pravila-brokerskogo-obsluzhivaniya-AO-BANK-SGB-s-21.10.2026.docx" },
  plans: {
    quik: {
      id: "quik",
      name: "QUIK",
      remark: "",
      fx: null,
      sheet: SHEET,
      fees: bandFees({
        bands: BANDS,
        levies: true,
        basis:
          "point 1.1 : 0,08 % du chiffre du jour jusqu'à 1 million de RUB, 0,05 % jusqu'à 30 millions, 0,03 % au-delà, sans minimum ; " +
          "note 1 : la rémunération des systèmes de négociation est prélevée en plus",
      }),
    },
  },
});

cli(import.meta.url, roundTrip);
