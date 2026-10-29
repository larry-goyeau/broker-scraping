// What one round trip costs at Desert Financial Credit Union (Arizona): buy n
// shares at price p, sell them back at once, online, in regular hours, in
// dollars. US exchange-listed stocks and ETFs in "Desert Financial Digital
// Investing" inside its online banking and app. The robo-advisor (0.35% a
// year) and options stay out.
//
// Broker TAPP Engine Securities, LLC (CRD 314806), an introducing broker;
// clearing, execution and custody RQD* Clearing LLC (CRD 134284). Pages read
// 2026-10-26:
//
//   https://www.desertfinancial.com/en/invest-and-insure/digital-investing
//   https://www.tappengine.com/disclosure-library   (Form CRS, April 17 2025;
//                                                    Account Terms V1.0.04102025)
//
//   subscription   "For just $3.50 per month, or free for Rewards+ members,
//                  you get all the perks of Desert Financial Digital
//                  Investing", which include real-time trading; "The $3.50
//                  monthly fee will be automatically debited from your linked
//                  Desert Financial deposit account and is waived for
//                  Rewards+ members". Same trading prices either way, so no
//                  plan split: remark, not in the total.
//   commission     $0 each way: "All transactions are commission free";
//                  "There are no transaction fees such as commissions for
//                  brokerage services" (Form CRS)
//   SEC / TAF        the Account Terms say the client bears "trading-related
//                  regulatory fees", with no figure: SEC and TAF at the
//                  regulators' rates, rounded up to the cent (no rounding
//                  printed). CAT not named, 0.
//   minimum        "Just $5 can get you in on partial shares"
//
// Formula: book (quoted NBBO, see below) + 0 + SEC and TAF on the sale.
//
// Routing: TAPP Engine files no 606 of its own. The FINRA 606 bulk file, 2026
// Q2 adopt-by-reference list, has "314806|TAPP ENGINE SECURITIES|134284|RQD*
// CLEARING, LLC" (2026 Q1). RQD's 2026 Q2 report is not in that
// zip; spreads/rule606.mjs reads it on FINRA's CDN (key `rqd`): the book is
// the blended 605 × that 606's Q.
//   https://cdn.finra.org/606/2026/134284_606_NMS_2026_Q2_V1.xml
//
// Cash is the member's Desert Financial account in dollars and every line is
// in dollars: no conversion.
//
//   node brokers/desertcreditunio/desertcreditunio_cost.mjs AAPL XNAS USD --shares=2.876 --price=347.725
//   node brokers/desertcreditunio/desertcreditunio_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const SCHEDULE = {
  broker: "Desert Financial CU",
  folder: "desertcreditunio",
  catalogueUrl: new URL("desertcreditunio-parsed.json", import.meta.url),
  url: "https://www.desertfinancial.com/en/invest-and-insure/digital-investing",
  crs: "https://cdn.sanity.io/files/04cxogfb/production/4aa8f2fb4d2e8dcd952506a54f28a9ab125e3092.pdf",
  readOn: "2026-10-26",
  entity: "TAPP Engine Securities, LLC (CRD 314806), clearing RQD* Clearing LLC (CRD 134284)",
  // TAPP Engine adopts RQD Clearing's 606 by reference; RQD has no key yet.
  rule606: "rqd",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => 0,
  levies: { sec: "up", taf: "up", cat: false },
  remark: "$3.50/month, free for Rewards+ members.",
  basis:
    "page Digital Investing de Desert Financial et Form CRS de TAPP Engine Securities relues le 2026-10-26 : « All transactions are commission free »",
  notes: [
    "abonnement 3,50 $/mois (offert aux membres Rewards+) hors trajet",
    "frais réglementaires à la charge du client selon les conditions TAPP : SEC et TAF aux taux des régulateurs, arrondi au centime supérieur (arrondi non imprimé)",
    "achat minimum 5 $",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
