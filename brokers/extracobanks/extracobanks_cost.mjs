// What one round trip costs in Extraco Banks' EasyInvest (the digital
// investing platform inside the Extraco eBank app and online banking): buy
// n shares at price p, sell them back at once, in regular hours, in
// dollars. US stocks and ETFs, fractional shares included, from $10.
// Cryptocurrency, also on the page, is another product and stays out.
//
// Read 2026-10-26:
//   https://www.extracobanks.com/digital-banking/online-banking/easyinvest-extraco
//   https://www.extracobanks.com/resources/faq/what-types-investments-can-i-make-easyinvest
//   https://eko.investments/news/9
//
//   commission      $0 each way: "get started investing in stocks, bonds,
//                   and ETFs free of charge with as little as $10". No
//                   other EasyInvest page (the five FAQ entries) names a
//                   trade, platform or account fee.
//   SEC / TAF / CAT not printed, so 0.
//
// Formula: book (605 × Q) + 0 + 0. Extraco's pages name no broker-dealer;
// EasyInvest is Eko Investments' platform, and Eko's announcement of the
// Extraco partnership (20 Nov 2024) says "Brokerage services are provided
// to clients by Alpaca Securities LLC" (CRD 288202) and "commission-free
// trading on self-directed accounts". So a US line takes Alpaca's Q
// (rule606 key "alpaca"), as at the other Eko banks.
//   https://eko.investments/news/9
//
// Cash is dollars (a US bank's platform funded from eBank) and every line
// is in dollars: no conversion.
//
//   node brokers/extracobanks/extracobanks_cost.mjs US0378331005 XNAS USD --shares=3.8 --price=262
//   node brokers/extracobanks/extracobanks_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Extraco Banks (EasyInvest)",
  folder: "extracobanks",
  catalogueUrl: new URL("extracobanks-parsed.json", import.meta.url),
  url: "https://www.extracobanks.com/digital-banking/online-banking/easyinvest-extraco",
  readOn: "2026-10-26",
  entity: "Extraco Banks (EasyInvest), Eko Investments, Inc. (platform), Alpaca Securities LLC (broker-dealer, CRD 288202)",
  routing: "https://eko.investments/news/9",
  rule606: "alpaca",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  basis:
    "page EasyInvest d'Extraco, relue le 2026-10-26 : « stocks, bonds, and ETFs free of charge with as little as $10 », 0 $ à l'achat et à la vente",
  notes: ["plateforme Eko Investments, courtage Alpaca Securities LLC (annonce Eko du partenariat Extraco) : Q d'Alpaca"],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
