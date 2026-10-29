// What one round trip costs at Truist Trade (Truist Investment Services,
// Inc., the self-directed online brokerage of Truist): buy n shares at
// price p, sell them straight back, online, in dollars. US-listed common
// stock and ETFs in a self-directed account. Options stay out.
//
// Offer page read in full 2026-10-26 (fees in its disclosures 1 to 4):
//   https://www.truist.com/investing-retirement/self-directed-investing
//
//   common stock and ETFs   "$0 Commission fees for 1,000 or fewer shares per
//                           order of Common Stock and ETFs. $0.03 per share of
//                           Common Stock and ETFs if the lot size exceeds
//                           1,000 shares." Read as $0.03 on every share of an
//                           order over 1,000 shares (the wording does not say
//                           "each additional share"; the higher reading)
//   minimum equity buy      "$100": a smaller buy is refused
//   annual subscription     "$60 Annual subscription fee per client", waived
//                           at $250,000 household brokerage assets: remark
//   annual custody          "$60 Annual custody fee for non-IRAs", waived at
//                           $250,000 or for "clients who performed a trade in
//                           the previous calendar year": remark
//   IRA maintenance $60     not this account
//   SEC, TAF, CAT           SEC and TAF added at the regulators' rates on the
//                           sale, rounded up to the cent (none is printed;
//                           owner, 2026-10-28). CAT: no rate printed, 0.
//
// Formula: book + 2 × (n > 1,000 ? $0.03 × n : $0).
//
// Routing: Truist Investment Services, Inc. (CRD 17499) files its own 606
// (FINRA 606 bulk 2026 Q2, 17499_606_NMS_2026_Q2_V1: Virtu, Citadel, Jane
// Street, G1, Fidelity CrossStream, HRT). Key `truistinvestment` in
// spreads/rule606.mjs: the book is the blended 605 × that 606's Q.
//
// The account is for current Truist clients; cash is dollars and every line
// is in dollars: no conversion.
//
//   node brokers/truisttrade/truisttrade_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/truisttrade/truisttrade_cost.mjs US1912161007 XNYS USD --shares=10.851 --price=92.155
//   node brokers/truisttrade/truisttrade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const PER_SHARE_OVER = { threshold: 1000, perShare: 0.03 };
const MIN_BUY = 100;

const SCHEDULE = {
  broker: "Truist Trade",
  folder: "truisttrade",
  catalogueUrl: new URL("truisttrade-parsed.json", import.meta.url),
  url: "https://www.truist.com/investing-retirement/self-directed-investing",
  readOn: "2026-10-26",
  entity: "Truist Investment Services, Inc.",
  crd606: "17499",
  rule606: "truistinvestment",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: ({ shares }) => (shares > PER_SHARE_OVER.threshold ? Number((shares * PER_SHARE_OVER.perShare).toFixed(2)) : 0),
  tradable: ({ notional }) => (notional != null && notional < MIN_BUY ? `achat minimum ${MIN_BUY} $ chez Truist Trade` : null),
  levies: { sec: "up", taf: "up", cat: false },
  remark: "$60/year subscription and $60/year custody.",
  basis:
    "page Truist Trade (self-directed-investing), relue le 2026-10-26 : 0 $ de commission jusqu'à 1 000 parts par ordre, " +
    "0,03 $ la part au-delà (sur tout l'ordre), à l'achat comme à la vente",
  notes: ({ shares }) => [
    shares > PER_SHARE_OVER.threshold
      ? `ordre de plus de 1 000 parts : 0,03 $ × ${shares} parts à chaque sens`
      : "ordre de 1 000 parts ou moins : 0 $",
    "abonnement annuel 60 $ et garde annuelle 60 $ (hors IRA), levables : en remarque, hors total",
    "606 de Truist Investment Services (CRD 17499), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
