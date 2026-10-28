// What one round trip costs at Nemo (nemo.money, Exinity ME Limited, ADGM /
// FSRA licence 200015): buy n shares at price p, sell them back at once, in
// the app, in regular hours, in dollars. The 8,000 US stocks and ETFs of the
// catalogue, whole or fractional. The "Boost" CFD account stays out.
//
// Pricing page and FAQs read 2026-10-26:
//   https://nemo.money/pricing/stocks
//   https://nemo.money/faq/investing-with-nemo
//   https://nemo.money/faq/deposits-and-withdrawals
//
//   commission   $0 each way: "zero commissions and no monthly fee";
//                "Investing and trading with Nemo is commission-free."
//   spread       "we don't receive any portion of spread from stock and ETF
//                trading"; Nemo is "paid a small amount every time" it
//                routes an order (no figure): the book carries it.
//   SEC/TAF/CAT  not printed, so 0 (owner's rule).
//   deposits     "Nemo doesn't charge any commissions on deposits but your
//                card provider/ bank will convert the funds to USD ($)".
//
// Formula: book + 0 + 0.
//
// Routing: no page names the US executing broker, so no 606 key: a listed US
// line takes the quoted NBBO (the folder is passed to spreads/rule606.mjs,
// so an ALIASES entry added later is picked up).
//
// Cash: the account is in dollars (the card provider or bank converts on the
// way in, not Nemo), so a dollar line needs no conversion.
//
//   node brokers/nemomoney/nemomoney_cost.mjs NVDA XNAS USD --shares=5.5 --price=180
//   node brokers/nemomoney/nemomoney_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Nemo",
  folder: "nemomoney",
  catalogueUrl: new URL("nemomoney-parsed.json", import.meta.url),
  url: "https://nemo.money/pricing/stocks",
  readOn: "2026-10-26",
  entity: "Exinity ME Limited (ADGM, FSRA 200015)",
  rule606: null,
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: false, taf: false, cat: false },
  basis:
    "page tarifs Nemo « Stocks », relue le 2026-10-26 : « zero commissions and no monthly fee », " +
    "aucune part de l'écart reçue ; 0 $ de commission",
  notes: [
    "courtier exécutant américain non nommé : NBBO coté (pas de 606)",
    "conversion faite par la banque ou la carte du client à l'entrée, pas par Nemo",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
