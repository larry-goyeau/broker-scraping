// What one round trip costs at Bank Levoberezhny (ПАО Банк «Левобережный»,
// Novosibirsk): buy n shares or fund units on the Moscow Exchange through
// QUIK and sell them back the same day, in dollars. The brokerage accounts
// are opened in rubles and yuan by default (regulation, 14.07.2026: "По
// умолчанию Клиенту открываются Брокерские счета в рублях РФ и Китайских
// юанях"), so nothing is converted.
//
// Tariff «БАЗОВЫЙ», read on 2026-10-26 on https://www.nskbl.ru/private/tariffs/:
//   https://www.nskbl.ru/upload/iblock/13e/8vzcpozpywnwcy1en341663nsn9rztqv/Tarify_Banka_Fondovyy_i_Valyutnyy_rynok_Moskovskoy_birzhi_fiz._litsam.pdf
//   "Брокерское вознаграждение за исполнение Поручений по сделкам с Ценными
//   бумагами ... (от суммы дневного торгового оборота)": up to 1,000,000 RUB
//   0.04%; to 5 million 0.035%; to 10 million 0.03%; to 20 million 0.025%;
//   to 100 million 0.02%; above 0.01%. No floor is printed. The same bands
//   are in the extract for individuals (item 2.4.2.1.1) on
//   https://www.nskbl.ru/private/investitsii/brokerskoe_obsluzhivanie/.
//   A same-day round trip is a day's turnover of twice the amount, and the
//   band it reaches prices both legs.
//   Currency deals (only TS VRMB): 0.95% of the day's turnover up to
//   100,000 RUB, 0.05% to 1 million, down to 0.008% (the FX remark, at the
//   ~1,000 USD size).
//   QUIK: 500 RUB a month while assets are under 100,000 RUB, free above
//   (in the remark, out of the trip).
// Regulation 6.1.2: the client reimburses "вознаграждения (комиссии),
// взимаемые ТС ... включая комиссионные вознаграждения, взимаемые
// организациями, выполняющими клиринг": the Moscow Exchange fee is on top
// (moexCost.mjs).
//   https://www.nskbl.ru/upload/iblock/d2e/sg18mlkqmdtxhsn203640d547ghyvmoz/Reglament-predostavleniya-uslug-na-finansovykh-rynkakh-_206_2_1_140_2026-ot-14.07.2026-.pdf
//
// Left out: OTC deals (0.16%, at least 2,000 RUB) are another market;
// margin carry (special REPO) is not a round trip.
//
//   node brokers/levoberezhny/levoberezhny_cost.mjs SBER MISX RUB --shares=300 --price=286
//
// `roundTrip(...)` reads files, not the network.

import { bandFees, cli, makeRoundTrip } from "../psb/moexCost.mjs";

const PAGE = "https://www.nskbl.ru/private/tariffs/";
const SHEET =
  "https://www.nskbl.ru/upload/iblock/13e/8vzcpozpywnwcy1en341663nsn9rztqv/Tarify_Banka_Fondovyy_i_Valyutnyy_rynok_Moskovskoy_birzhi_fiz._litsam.pdf";
const REGULATION =
  "https://www.nskbl.ru/upload/iblock/d2e/sg18mlkqmdtxhsn203640d547ghyvmoz/Reglament-predostavleniya-uslug-na-finansovykh-rynkakh-_206_2_1_140_2026-ot-14.07.2026-.pdf";
const BANDS = [
  { upTo: 1000000, rate: 0.0004 },
  { upTo: 5000000, rate: 0.00035 },
  { upTo: 10000000, rate: 0.0003 },
  { upTo: 20000000, rate: 0.00025 },
  { upTo: 100000000, rate: 0.0002 },
  { upTo: Infinity, rate: 0.0001 },
];

export const roundTrip = makeRoundTrip({
  folder: "levoberezhny",
  brand: "Bank Levoberezhny",
  catalogue: new URL("levoberezhny-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["RUB", "CNY"],
  defaultPlan: "base",
  sources: { regulation: REGULATION },
  plans: {
    base: {
      id: "base",
      name: "Базовый",
      remark: "QUIK is RUB 500 a month under RUB 100,000 of assets.",
      fx: 0.0095,
      sheet: SHEET,
      fees: bandFees({
        bands: BANDS,
        basis:
          "tarif «БАЗОВЫЙ» : 0,04 % du chiffre du jour jusqu'à 1 million de RUB, 0,035 % jusqu'à 5, 0,03 % jusqu'à 10, 0,025 % jusqu'à 20, " +
          "0,02 % jusqu'à 100, 0,01 % au-delà, sans plancher ; QUIK 500 RUB par mois sous 100 000 RUB d'actifs, hors aller-retour ; " +
          "frais de bourse et de compensation remboursés par le client (règlement 6.1.2)",
      }),
    },
  },
});

cli(import.meta.url, roundTrip);
