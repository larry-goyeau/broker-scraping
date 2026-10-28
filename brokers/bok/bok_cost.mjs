// What one round trip costs at BOK Financial (BOK Financial Securities,
// Inc., trading as BOK Financial Advisors, BOKFA; clearing and the
// NetXInvestor platform by Pershing LLC): buy n shares at price p, sell them
// back at once, entered online through NetXInvestor, in regular hours, in
// dollars. US-listed stocks and ETFs.
//
// Read 2026-10-26:
//   https://www.bokfinancial.com/personal/products-and-services/personal-banking/checking-accounts/premier-checking
//
//   commission      $14.95 each way: "$14.95 per equity trade when your BOK
//                   Financial Advisors (BOKFA) investment account is linked
//                   to your Premier, Diamond, Diamond Advantage or Private
//                   Label Checking account and the trade is entered on-line
//                   through NetXInvestor". "Unlimited $14.95 trades can be
//                   applied to commissions trading of stocks, excluding
//                   penny stocks." Without the link "the current applicable
//                   commission rate" applies, which is not published: the
//                   only published online rate is used.
//   SEC / TAF / CAT not printed, so 0.
//   linked checking Premier Checking has a "$25 monthly service fee", avoided
//                   with $25,000 or more in linked bank deposits (or $50,000
//                   across linked banking, brokerage and credit): remark,
//                   not the trip.
//
// Formula: book + $14.95 × 2. BOK Financial Securities (CRD 17530)
// files its own 606 (it "routes all of its SEC Rule 606 eligible orders to
// its clearing firm, Pershing LLC"): key `bokfs` in spreads/rule606.mjs, the
// book is the blended 605 × that 606's Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/bok/bok_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/bok/bok_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const ONLINE_TRADE = 14.95;

const SCHEDULE = {
  broker: "BOK Financial",
  folder: "bok",
  catalogueUrl: new URL("bok-parsed.json", import.meta.url),
  url: "https://www.bokfinancial.com/personal/products-and-services/personal-banking/checking-accounts/premier-checking",
  readOn: "2026-10-26",
  entity: "BOK Financial Securities, Inc. (BOK Financial Advisors; clearing: Pershing LLC)",
  rule606: "bokfs",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => ({ buy: ONLINE_TRADE, sell: ONLINE_TRADE, note: `${ONLINE_TRADE} $ par ordre en ligne (NetXInvestor) à l'achat et à la vente` }),
  levies: { sec: false, taf: false, cat: false },
  remark: "Needs a linked Premier Checking account: $25/month below $25,000 in deposits.",
  basis:
    "page Premier Checking de BOK Financial, relue le 2026-10-26 : « $14.95 per equity trade » " +
    "saisi en ligne via NetXInvestor, compte BOKFA lié au compte courant Premier",
  notes: [
    "tarif hors compte courant lié non publié (« current applicable commission rate ») : seul le tarif publié est retenu",
    "606 de BOK Financial Securities (CRD 17530), 2026 T2",
    "frais mensuels Premier Checking 25 $ (levés dès 25 000 $ de dépôts liés) hors trajet",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
