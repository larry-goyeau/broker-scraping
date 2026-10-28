// What one round trip costs at ROQ Markets (the app of ROQ Capital OJSC,
// ex-Armbrok, licensed by the Central Bank of Armenia; US securities held
// through "a U.S.-registered broker-dealer that is a member of FINRA and
// SIPC"): buy n shares at price p, sell them straight back, in the app, in
// dollars. US-listed shares and ETFs, whole or fractional.
//
// Tariff PDF "Tariff of charges for services provided via ROQ Markets
// application" (September 2026) and the product page, read 2026-10-26:
//   https://roqcapital-media.s3.eu-north-1.amazonaws.com/Tariffs_2026_Sep_ROQ_Markets_en_90af615102.pdf
//   https://roqcapital.am/en/roqmarkets
//
//   "Transaction volume rate (TVR) 0.15%"
//   "Transaction quantity rate (TQR) USD 0.015 per security"
//   "Minimum commission fee USD 1"
//   "C = max(TV × TVR, TQ × TQR)", per executed order; below the minimum,
//   the minimum is charged
//   "Transaction fees include commission fees charged by banks, the
//   regulated market operator, and clearing and settlement system operators."
//   "The tariffs do not include regulatory fees." The page prints them:
//     SEC "Transaction value × $0.000008 - Minimum fee: $0.01"
//     TAF "Number of shares sold × $0.000166 - Minimum fee: $0.01 -
//         Maximum fee: $8.30"
//   Custody, account, deposits: "free of charge".
//   "All the fees are exclusive of the value added tax ... subject to VAT
//   unless they are VAT exempt": investment services (order reception and
//   execution) are VAT-exempt under Article 64 of the Armenian Tax Code, so
//   no VAT on the commission.
//
// SEC and TAF: the printed rates are older regulator rates, passed through,
// so the trip charges the current ones with the page's one-cent minimum
// (nearest cent, at least a cent): SEC 0.0000206 of the sale since
// 2026-04-04; the FINRA TAF is paused 2026-10-01 to 2026-12-31
// (SR-FINRA-2026-021), so $0 today, then $0.000195 a share, cap $9.79. CAT
// not printed: 0.
//
// Formula: book (quoted NBBO) + 2 × max(0.15 % × notional, $0.015 × n, $1)
// + SEC + TAF.
//
// Routing: the US broker-dealer is not named, so the folder is passed and
// the book is the quoted NBBO until an ALIASES entry is added.
//
// Cash: "You can deposit in AMD, USD, EUR, and RUB"; "ROQ Markets supports
// multi-currency balances"; conversions "at exchange rates offered by ROQ
// Capital OJSC, free of commission" (no rate printed: no FX remark). The
// line is in dollars and dollars are held: no conversion. Withdrawals of
// EUR/USD to a non-Armenian bank (AMD 50,000) stay out.
//
//   node brokers/roq/roq_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/roq/roq_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const FEE = { rate: 0.0015, perShare: 0.015, min: 1 };

/** ROQ's commission on one executed order, in dollars. */
export function ticket({ shares, notionalUsd }) {
  if (!(shares > 0) || !(notionalUsd > 0)) return null;
  return Math.max(notionalUsd * FEE.rate, shares * FEE.perShare, FEE.min);
}

const SCHEDULE = {
  broker: "ROQ Markets",
  folder: "roq",
  catalogueUrl: new URL("roq-parsed.json", import.meta.url),
  url: "https://roqcapital-media.s3.eu-north-1.amazonaws.com/Tariffs_2026_Sep_ROQ_Markets_en_90af615102.pdf",
  page: "https://roqcapital.am/en/roqmarkets",
  readOn: "2026-10-26",
  entity: "ROQ Capital OJSC (Central Bank of Armenia, licence 10)",
  rule606: null,
  cash: "USD",
  deposits: ["AMD", "USD", "EUR", "RUB"],
  feeCurrency: "USD",
  ticket: (ctx) => {
    const each = ticket(ctx);
    if (each == null) return null;
    const which = each === FEE.min ? "minimum 1 $" : ctx.shares * FEE.perShare > ctx.notionalUsd * FEE.rate ? "0,015 $ la part" : "0,15 % du montant";
    return { buy: each, sell: each, note: `max(0,15 %, 0,015 $ la part), minimum 1 $ : ${Number(each.toFixed(4))} $ par ordre (${which})` };
  },
  levies: { sec: "penny", taf: "penny", cat: false },
  basis:
    "tarif ROQ Markets (septembre 2026), relu le 2026-10-26 : commission max(0,15 % du montant, 0,015 $ la part), minimum 1 $ par ordre exécuté, " +
    "frais réglementaires en sus",
  notes: [
    "SEC et TAF imprimées à d'anciens taux (0,000008 ; 0,000166, plafond 8,30 $), minimum 0,01 $ : le trajet prend les taux en vigueur, au centime le plus proche, au moins un centime",
    "TVA arménienne : services d'investissement exonérés (art. 64 du code des impôts), rien sur la commission",
    "courtier américain non nommé : NBBO coté",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
