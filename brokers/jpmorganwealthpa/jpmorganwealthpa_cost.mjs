// What one round trip costs in J.P. Morgan Wealth Partners online trading
// (J.P. Morgan Securities LLC, an option of its full-service brokerage
// accounts): buy n shares at price p, sell them straight back, online, in
// dollars. US-listed stocks and ETFs. Mutual funds and money market funds
// stay out.
//
// "Trade online" page read 2026-10-26:
//   https://www.jpmorgan.com/wealth-management/wealth-partners/online-tools/how-to-pages/trade-online
//
//   commission          $0 each way: "Online trading offers unlimited
//                       commission-free online trades"; footnote 1
//                       "Commission-free online trades apply to trading in
//                       US-listed stocks, exchange-traded funds (ETFs)..."
//   regulatory fee      footnote 1: "Sales are subject to a regulatory
//                       transaction fee of between $0.01 and $0.03 per
//                       $1,000 of principal". A range: the max is taken
//                       (owner rule), $0.03 per $1,000 = 0.00003 of the
//                       sale. No rounding is printed: nearest cent, never
//                       under $0.01 (helper mode "penny"; the range starts
//                       at $0.01).
//                       It replaces the SEC line (the helper's SEC is off).
//   TAF, CAT            not printed, so 0
//   limits              "Online stock and ETF trades are limited to 100,000
//                       shares or $3 million notional per trade": a bigger
//                       order has no online price
//
// Formula: book (605 × Q of J.P. Morgan Securities LLC) + $0 + $0
//          + nearest-cent(0.00003 × sale), min $0.01.
//
// Routing: the orders are J.P. Morgan Securities LLC's (CRD 79), whose
// "JPMS.606" file is in the FINRA 606 bulk data (rule606.mjs key
// `jpmsecurities`).
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/jpmorganwealthpa/jpmorganwealthpa_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/jpmorganwealthpa/jpmorganwealthpa_cost.mjs US0605051046 XNYS USD --shares=19.31 --price=51.785
//   node brokers/jpmorganwealthpa/jpmorganwealthpa_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli, cents } from "../wellstrade/usCost.mjs";
import { finite, plus } from "../../na.mjs";

// "between $0.01 and $0.03 per $1,000 of principal": the max.
export const REG_FEE = { perThousand: 0.03, rate: 0.03 / 1000, rounding: "penny" };
const LIMIT = { shares: 100_000, notional: 3_000_000 };

/** The regulatory transaction fee on a sale of `notionalUsd`. */
export function regFee(notionalUsd) {
  return notionalUsd == null ? null : cents(notionalUsd * REG_FEE.rate, REG_FEE.rounding);
}

const SCHEDULE = {
  broker: "J.P. Morgan Wealth Partners",
  folder: "jpmorganwealthpa",
  catalogueUrl: new URL("jpmorganwealthpa-parsed.json", import.meta.url),
  url: "https://www.jpmorgan.com/wealth-management/wealth-partners/online-tools/how-to-pages/trade-online",
  readOn: "2026-10-26",
  entity: "J.P. Morgan Securities LLC",
  rule606: "jpmsecurities",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  regFee: REG_FEE,
  ticket: () => ({ buy: 0, sell: 0, note: "« unlimited commission-free online trades »" }),
  levies: { sec: false, taf: false, cat: false },
  tradable: (ctx) =>
    ctx.shares > LIMIT.shares || ctx.notionalUsd > LIMIT.notional
      ? "ordre en ligne limité à 100 000 parts ou 3 millions $ de nominal"
      : null,
  basis: "page Trade online de J.P. Morgan Wealth Partners, relue le 2026-10-26 : 0 $ de commission en ligne pour actions et ETF cotés aux États-Unis",
};

export function roundTrip(query) {
  const out = usRoundTrip(SCHEDULE, query);
  if (!out.trade) return out;
  const fee = regFee(out.trade.notionalUsd);
  const bourse = plus(out.parts?.bourse ?? 0, fee);
  const note =
    `frais réglementaires de « between $0.01 and $0.03 per $1,000 of principal » à la vente : le haut de la fourchette, ` +
    `${REG_FEE.perThousand} $ par 1 000 $ arrondi au centime le plus proche (minimum 0,01 $), ${fee ?? "N/A"} $ (remplace la ligne SEC)`;
  return {
    ...out,
    usd: finite(plus(out.usd, fee), 6),
    sell: { ...out.sell, sec: 0, regulatoryFee: fee },
    parts: { ...out.parts, bourse: finite(bourse, 6) },
    confidence: String(out.confidence || "").replace("SEC non imprimée par le courtier : 0", note),
  };
}

printCli(import.meta.url, roundTrip, SCHEDULE);
