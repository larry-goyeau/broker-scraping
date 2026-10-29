// What one round trip costs at Citi Self Invest (Citi Personal Wealth
// Management, Citigroup Global Markets Inc.): buy n shares at price p, sell
// them straight back, online or in the Citi Mobile App, in dollars.
// US-listed stocks, ETFs and ETNs. Options, bonds and funds stay out.
//
// Fee schedule "CPWM Pricing, Commissions, and Fees" (1591255 09/26) read in
// full 2026-10-26:
//   https://www.citi.com/investorinfo/assets/docs/CPWM-Annual-Account-Fees.pdf
//
//   Citi Self Invest column   "ETFs — Online/Mobile¹ $0", "Equities — Online/Mobile $0"
//   footnote 1                "Commission-free trading of ETFs excludes leveraged and
//                             inverse ETFs". No price is printed for them in the Self
//                             Invest column, so a leveraged or inverse ETF/ETN line
//                             has an unknown ticket: total N/A (owner rule)
//   SEC, TAF, CAT             SEC and TAF added at the regulators' rates on
//                             the sale, rounded up to the cent (none is
//                             printed; owner, 2026-10-28). CAT: no rate
//                             printed, 0.
//   FX "up to 1.00%"          the account and every line are in dollars: not used
//   transfer $95, wires $25   not on an order
//
// Leveraged / inverse is read from the fund's name (ProShares Ultra/UltraPro/
// UltraShort/Short, "2X", "-3x", "Bull"/"Bear" with a multiplier or "Daily",
// "Inverse", "Leveraged"). Bond funds called "Ultra Short" or "Short Term"
// are not caught.
//
// Formula: book (605 × Q of Citigroup Global Markets) + $0 + SEC and TAF on the sale.
//
// Routing: Citi Self Invest orders are Citigroup Global Markets Inc. (CRD
// 7059) orders; its CPWM report is the CNTXT-CGWM file of the FINRA 606
// bulk (rule606.mjs `citigroup`, Q 1.02).
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/citiself/citiself_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/citiself/citiself_cost.mjs US74347X8314 XNAS USD --shares=13.6 --price=73.465
//   node brokers/citiself/citiself_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const MULTIPLIER =
  /(^|[\s(])(-|−)?(1\.25|1\.5|1\.75|2|3|4|5)x\b|(^|[\s(])(-|−)[1-5]x?\b(?=.*\b(inverse|short|leveraged)\b)|(^|\s)(-|−)1x\b/i;
const WORD = /\b(inverse|leveraged|levered)\b(?! loan)/i;
const FAMILY = /^(ProShares )?(UltraPro|UltraShort|Ultra|Short)\b(?![- ](term|duration|maturity|bond|income|muni))/i;
const DAILY = /\bdaily\b.*\b(bull|bear|long|short)\b|\b(bull|bear)\b.*\b[1-5](\.\d+)?x\b/i;

/** A leveraged or inverse exchange-traded product, from its name. */
export function isLeveragedOrInverse(row) {
  if (!row || String(row.type || "").toUpperCase() === "STOCK") return false;
  const name = String(row.name || "");
  return MULTIPLIER.test(name) || WORD.test(name) || FAMILY.test(name) || DAILY.test(name);
}

const SCHEDULE = {
  broker: "Citi Self Invest",
  folder: "citiself",
  catalogueUrl: new URL("citiself-parsed.json", import.meta.url),
  url: "https://www.citi.com/investorinfo/assets/docs/CPWM-Annual-Account-Fees.pdf",
  readOn: "2026-10-26",
  entity: "Citigroup Global Markets Inc.",
  rule606: "citigroup",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: (ctx) =>
    isLeveragedOrInverse(ctx.row)
      ? null
      : { buy: 0, sell: 0, note: "colonne Citi Self Invest : 0 $ en ligne et sur l'application" },
  levies: { sec: "up", taf: "up", cat: false },
  basis:
    "barème CPWM Pricing, Commissions, and Fees (1591255 09/26), relu le 2026-10-26 : " +
    "Citi Self Invest 0 $ par ordre d'actions ou d'ETF en ligne",
  notes: (ctx) =>
    isLeveragedOrInverse(ctx.row)
      ? ["ETF à effet de levier ou inverse : exclu de la gratuité (note 1), prix non imprimé pour Self Invest"]
      : [],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
