// What one round trip costs at Enpara.com (QNB's online bank) in its Cep
// Şubesi: buy n shares at price p on Borsa İstanbul, sell them back at once,
// in dollars. Shares only (Enpara sells no exchange-traded fund). Orders go
// to the exchange through QNB Invest.
//
// "Ücretler" (Yatırım section) and the shares page, read on 2026-10-26:
//
//   Commission     "BİST alış/satış işlem komisyonu %0 (Komisyonsuz)"; the
//                  shares page: "herhangi bir komisyon ödemeden, masrafsız".
//   Levies         "BİST alış/satış borsa payı (Pay piyasası borsa payı)
//                  0,00 TL (Ücretsiz)", "BİST alış/satış Takasbank takas
//                  komisyonu 0,00 TL (Ücretsiz)", "emir iptal/değişiklik
//                  ücreti 0,00 TL": nothing passed on.
//   Custody        MKK account opening, upkeep, custody, dividend and virman
//                  fees all "0,00 TL (Ücretsiz)"; cash in and out of the
//                  investment account free.
//   So the trip costs the book only. BSMV on a zero commission is zero.
//
// Cash is lira or dollars from the client's Enpara TL and USD accounts; every
// line is lira, a deposit currency: no conversion.
//
//   https://www.enpara.com/ucretler
//   https://www.enpara.com/yatirim-hesabi/hisse-senedi
//
//   node brokers/enpara/enpara_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/enpara/enpara_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "enpara",
  broker: "Enpara",
  entity: "QNB Bank A.Ş. (Enpara.com), through QNB Invest",
  url: "https://www.enpara.com/ucretler",
  readOn: "2026-10-26",
  sources: {
    tariff: "https://www.enpara.com/ucretler",
    shares: "https://www.enpara.com/yatirim-hesabi/hisse-senedi",
  },
  rate: 0,
  levies: "none",
  remark: "",
  types: ["STOCK"],
  cash: ["TRY", "USD"],
  basis:
    "tarif Enpara relu le 2026-10-26 : commission BIST « %0 (Komisyonsuz) », borsa payı et takas Takasbank « 0,00 TL (Ücretsiz) »",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
