// What one round trip costs at BBO Bank Brienz Oberhasli: buy n shares or
// ETF units on SIX Swiss Exchange through BBO E-Banking and sell them
// straight back, in dollars. The SIX book, the federal stamp, the SIX
// exchange fee, taxMap and the FX rule come from
// ../graubundnerkanto/sixPlaceCost.mjs (engine ../migros/sixCost.mjs); this
// file gives the courtage and the currencies.
//
// "Konditionen Anlegen", read on 2026-10-26:
//   https://bbobank.ch/cmsfiles/dienstleistungen_anlegen.pdf
//   Page 1, "Aktien, Warrants, strukturierte Produkte und ähnliche Papiere",
//   "Abschlüsse in der Schweiz, inkl. an der SIX kotierte Fonds", columns
//   "Tarif" and "via BBO E-Banking": "Minimalcourtage CHF 80.00 | CHF 40.00",
//   "1 bis 25 000 1,1%", "25 001 bis 50 000 1,0%", "50 001 bis 100 000
//   0,8%", "100 001 bis 150 000 0,6%", "150 001 bis 200 000 0,4%",
//   "200 001 bis 250 000 0,3%", "250 001 bis 500 000 0,2%", E-Banking
//   "50% Rabatt". "Tarif wird gestaffelt berechnet" (slices).
//   "Bei Kleinstabschlüssen bis CHF 800.00 werden 10% des Kurswertes,
//   mindestens CHF 15.00, berechnet": taken without the 50 % (the higher
//   reading), and never above the normal fee (smallOrder); online it only
//   bites below CHF 400.
//   "Allfällige fremde Kommissionen, Spesen sowie gesetzliche Abgaben und
//   Steuern werden vollumfänglich weiterverrechnet": no exchange-fee amount
//   is printed, so the official SIX List of Charges (retail order, with the
//   promotions) is used, as the engine does.
//   Page 2, "Börsenkotierte Fonds gemäss vorstehendem Tarif für Abschlüsse
//   in der Schweiz" (ETF, ETN, ETC take the same line).
//   Page 4, "Grundtarif Depotgebühren": "0,25% des Depotwertes",
//   "Mindestens CHF 40.00 pro Jahr pro Depot", "Postengebühr CHF 10.00 pro
//   Valor", plus 8.1 % VAT: a remark.
//
// Commission, one side: half of each slice's rate (0.55 % / 0.50 % / 0.40 %
// / 0.30 % / 0.20 % / 0.15 % / 0.10 %), minimum CHF 40; above CHF 500,000 no
// rate is printed and the last one (0.10 %) is kept; up to CHF 800,
// min(normal, max(15, 10 % of the value)).
//
// Accounts: "Euro-Konto / Fremdwährungskonto", "Das Konto zur Abwicklung der
// Bankgeschäfte in Euro oder in Fremdwährungen": CHF and EUR named; USD and
// GBP are taken as the foreign-currency accounts (as for the other banks of
// the SIX group). No markup for converting a securities settlement is
// printed, so a JPY, AUD, CAD or SGD line is N/A.
//   https://bbobank.ch/de/Info/Zahlen/Euro-Konto__Fremdwahrungskonto
//
// Left out: the branch "Tarif" column (not online); "Abschlüsse im Ausland";
// fund issues, the fund savings plan and Eurex options; custody (remark).
//
//   node brokers/bbobrienzoberhas/bbobrienzoberhas_cost.mjs NESN XSWX CHF --shares=10 --price=81
//   node brokers/bbobrienzoberhas/bbobrienzoberhas_cost.mjs VWRL XSWX CHF --shares=6 --price=135
//   node brokers/bbobrienzoberhas/bbobrienzoberhas_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//
// `roundTrip(...)` reads files, not the network.

import { cli, makeRoundTrip, sliced, smallOrder, pctFr } from "../graubundnerkanto/sixPlaceCost.mjs";

const PAGE = "https://bbobank.ch/cmsfiles/dienstleistungen_anlegen.pdf";
const ACCOUNTS = "https://bbobank.ch/de/Info/Zahlen/Euro-Konto__Fremdwahrungskonto";
const DISCOUNT = 0.5;
const LIST = [
  { upTo: 25000, rate: 0.011 },
  { upTo: 50000, rate: 0.01 },
  { upTo: 100000, rate: 0.008 },
  { upTo: 150000, rate: 0.006 },
  { upTo: 200000, rate: 0.004 },
  { upTo: 250000, rate: 0.003 },
  { upTo: Infinity, rate: 0.002 },
];
const SLICES = LIST.map((b) => ({ upTo: b.upTo, rate: b.rate * DISCOUNT }));
const MIN = 40;
const SMALL = { upTo: 800, rate: 0.1, min: 15 };

export const roundTrip = makeRoundTrip({
  folder: "bbobrienzoberhas",
  brand: "BBO Bank Brienz Oberhasli",
  catalogue: new URL("bbobrienzoberhas-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "USD", "GBP"],
  fx: null,
  onlineBuy: true,
  remark: "Custody 0.25% a year (min CHF 40) plus CHF 10 per holding.",
  sources: { accounts: ACCOUNTS },
  commission: ({ amountChf }) => {
    const normal = sliced(SLICES, amountChf, MIN);
    const chf = smallOrder(normal, amountChf, SMALL);
    return {
      chf,
      rate: SLICES[0].rate,
      min: MIN,
      basis:
        `BBO E-Banking (50 % de rabais), tarif par tranches : ` +
        SLICES.map((b) => `${pctFr(b.rate)} %`).join(" / ") +
        ` (tranches de CHF 25 000, 50 000, 100 000, 150 000, 200 000, 250 000, 500 000), minimum CHF ${MIN} ; ` +
        `petit ordre jusqu'à CHF 800 : 10 % du montant, minimum CHF 15, jamais au-dessus du tarif` +
        (chf < normal ? ` (appliqué ici : CHF ${Number(chf.toFixed(2))}).` : "."),
      confidence: "barème «gestaffelt» publié, rabais E-Banking appliqué ; petit ordre sans le rabais (lecture la plus haute)",
    };
  },
});

cli(import.meta.url, roundTrip);
