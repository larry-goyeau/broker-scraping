// What one round trip costs at LPL Trade Direct (Client Trade Direct, the
// self-directed accounts of LPL Financial LLC, member FINRA/SIPC): buy n
// shares at price p, sell them straight back, entered online, in dollars.
// US-listed stocks and ETFs. Options, funds and bonds stay out.
//
// Fee schedule "FS07-CTD Revised 0926":
//   https://www.lpl.com/content/dam/edam/practice-management/fees/fs07-ctd.pdf
// lpl.com answers plain HTTP clients (and WebFetch) with a Cloudflare 403,
// and the Wayback Machine holds no copy, so it could not be re-read on
// 2026-10-26. The figures below are the ones quoted in the scraper header
// (lpltradedirect_scraping.mjs), read in a browser on 2026-10-25:
//
//   "Equities, ETFs and Options — Orders entered electronically (internet)
//   $14.95 + Confirm Fee"; Confirm Fee $5 per transaction
//   foreign securities: "Transaction (not applicable to American Depository
//   Receipts) $40" (no foreign line in the catalogue)
//   SEC, TAF, CAT        not quoted: 0 (owner rule)
//
// Formula: book (quoted NBBO × shares) + 2 × ($14.95 + $5.00).
//
// Routing: LPL Financial LLC (CRD 6413) files its own 606
// (6413_606_NMS_2026_Q2_LPL_LPL_V1, FINRA 606 bulk 2026 Q2). Key `lpl` in
// spreads/rule606.mjs: the book is the blended 605 × that 606's Q.
//
// Cash is dollars and every line is in dollars: no conversion.
//
//   node brokers/lpltradedirect/lpltradedirect_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/lpltradedirect/lpltradedirect_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const ONLINE = 14.95;
const CONFIRM = 5.0;

const SCHEDULE = {
  broker: "LPL Trade Direct",
  folder: "lpltradedirect",
  catalogueUrl: new URL("lpltradedirect-parsed.json", import.meta.url),
  url: "https://www.lpl.com/content/dam/edam/practice-management/fees/fs07-ctd.pdf",
  readOn: "2026-10-25",
  revision: "FS07-CTD Revised 0926",
  entity: "LPL Financial LLC",
  crd606: "6413",
  rule606: "lpl",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: () => Number((ONLINE + CONFIRM).toFixed(2)),
  levies: { sec: false, taf: false, cat: false },
  basis:
    "barème LPL Client Trade Direct (FS07-CTD Revised 0926), lu le 2026-10-25 : ordre saisi en ligne 14,95 $ " +
    "+ frais de confirmation 5 $, à l'achat comme à la vente",
  notes: [
    "lpl.com renvoie une 403 Cloudflare aux clients HTTP : barème non relu le 2026-10-26, chiffres de l'en-tête du scraper (lecture navigateur du 2026-10-25)",
    "606 de LPL Financial (CRD 6413), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
