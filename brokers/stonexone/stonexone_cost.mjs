// What one round trip costs at StoneX One: buy n shares at price p, sell
// them back at once, online, in dollars. US-listed shares and ETFs (the
// whole US exchange book, see stonexone_scraping.mjs).
//
// StoneX Securities Inc. (CRD 18456): "StoneX One accounts opened through
// StoneX Securities Inc. are introduced to and custodied at StoneX
// Financial Inc. (SFI)". Self-directed accounts page re-read 2026-10-26:
//
//   https://www.stonex.com/en-us/business/self-directed-services/self-directed-accounts/
//     "StoneX One offers investors commission-free trading for equities,
//     options, mutual funds, and ETFs"
//   footnote (self-directed services page, quoted by the scraper):
//     "Commission-free trading refers to equity, equity option, and mutual
//     fund trades placed using the StoneX One platform. Exchange,
//     regulatory, and other charges may apply"
//
//   The full schedule it points to, http://www.stonexone.com/pricing,
//   answered 404 on 2026-10-25 and 2026-10-26.
//
//   commission       $0 each way
//   SEC, TAF         passed on: the Form CRS of StoneX Securities says "we
//                    pass along estimates of exchange and other regulatory
//                    charges we will incur". No rate or rounding printed:
//                    the regulators' rates, rounded up to the cent.
//                    https://files.brokercheck.finra.org/crs_18456.pdf
//   CAT              not named, 0
//
// Formula: book + 0 + SEC and TAF on the sale.
//
// Routing: the FINRA 606 bulk file, 2026 Q2 adopt-by-reference list, has
// StoneX Securities adopting Pershing (7560) and StoneX Financial Inc.
// (CRD 45993) by reference. StoneX One accounts sit at StoneX Financial,
// which files its own report (45993_606_NMS_2026_Q2_INTL). Key
// `stonexfinancial` in spreads/rule606.mjs: the book is the blended 605 ×
// that 606's Q.
//   https://cdn.finra.org/606reportBulk/2026/606_NMS_2026_Q2.zip
//
// Cash is dollars only (U.S. persons only), every line is in dollars: no
// conversion.
//
//   node brokers/stonexone/stonexone_cost.mjs AAPL XNAS USD --shares=3.8 --price=262
//   node brokers/stonexone/stonexone_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "StoneX One",
  folder: "stonexone",
  catalogueUrl: new URL("stonexone-parsed.json", import.meta.url),
  url: "https://www.stonex.com/en-us/business/self-directed-services/self-directed-accounts/",
  pricing: "http://www.stonexone.com/pricing",
  readOn: "2026-10-26",
  entity: "StoneX Securities Inc. (CRD 18456), introduced to and custodied at StoneX Financial Inc. (CRD 45993)",
  rule606: "stonexfinancial",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  basis: "page StoneX One relue le 2026-10-26 : « commission-free trading for equities, options, mutual funds, and ETFs »",
  notes: [
    "« we pass along estimates of exchange and other regulatory charges » (Form CRS) : SEC et TAF aux taux des régulateurs, arrondi au centime supérieur (arrondi non imprimé)",
    "606 de StoneX Financial Inc. (CRD 45993), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
