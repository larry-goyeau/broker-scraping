// What one round trip costs at Banque Cantonale Neuchâteloise (BCN): buy
// n shares or ETF units on SIX Swiss Exchange through BCN-Netbanking and
// sell them straight back, in dollars. The SIX book, the federal stamp,
// the SIX fee, taxMap and the conversion are ../migros/sixCost.mjs; this
// file gives the courtage, the account currencies and the FX board.
//
// Brochure "Prestations et tarifs" (BCN_Brochure_Tarifs_A4_070826.pdf),
// read on 2026-10-26. bcn.ch/brochure/prestations-et-tarifs is a Frontify
// share (marque.bcn.ch/share/rB9pGbFCizWDLRGCrRhP) whose one asset is that
// PDF, served at the media URL below.
//   https://bcn.ch/brochure/prestations-et-tarifs
//   https://media.ffycdn.net/eu/banque-cantonale-neuchateloise/aFbJcRKjzwtLXd7cv5Cf.pdf
// "Courtages — Actions, titres assimilés et BCN Certificat Horizon":
//   "Les ordres transmis par internet et mobile banking bénéficient d'un
//   rabais de 50% sur les tarifs indiqués ci-dessous."
//   "Minimum CHF 80.- pour les places suisses ... Maximum 10% du montant
//   brut du décompte."
//   Places suisses, rate of the band on the CHF amount of the order:
//     up to CHF 25,000 1.10 %, 50,000 1.05 %, 100,000 1.00 %,
//     200,000 0.80 %, 300,000 0.60 %, 400,000 0.40 %, 1,000,000 0.30 %,
//     above 0.20 %.
//   "Fonds immobiliers et ETF (Exchange Trades Funds): Le tarif « actions
//   et titres assimilés » est appliqué à l'achat et à la vente." ETN/ETC
//   (structured products) are titres assimilés.
//   "Les opérations d'achat et de vente de titres sont soumises au droit de
//   timbre fédéral ... ainsi qu'à une taxe de bourse sur les titres côtés
//   aux bourses suisses" (the stamp and the SIX fee, in the engine).
// So each side is 50 % of max(CHF 80, band rate x amount), i.e. max(CHF
// 40, half the band rate x amount), capped at 10 % of the amount: the
// discount is on "les tarifs indiqués ci-dessous", and the CHF 80 minimum
// is a line of that table.
// Custody (commission d'administration) "0,30% jusqu'à CHF 499'999.-",
// "Minimum CHF 50.- par dépôt": a remark.
//
// Accounts: the "Compte de Gestion", "destiné exclusivement aux opérations
// d'achat et de vente de titres", is kept in CHF, EUR, GBP, USD and
// "autres" (interest rates printed for each); CHF, EUR, GBP and USD lines
// stay unconverted.
//   https://www.bcn.ch/prives/comptes-et-cartes/comptes-prives/compte-de-gestion
// FX: BCN prints its "Cours des devises" (Achat / Vente), snapshot
// 2026-10-26 11:08: EUR 0.9091 / 0.9415, USD 0.8115 / 0.8405, GBP 1.0828 /
// 1.1214, JPY (100) 0.5157 / 0.5341, CAD 0.5790 / 0.5996, AUD 0.5707 /
// 0.5911, SGD 0.6341 / 0.6567: every pair is 1.75 % either side of the
// mid, (vente - achat) / (vente + achat). JPY, AUD, CAD and SGD lines
// convert both ways at 1.75 %; on a USD, EUR or GBP line it is a remark.
//   https://www.bcn.ch/prives/investir/cours-et-taux/devises-et-billets
//
// Left out: foreign exchanges (1.75 % / 1.95 % bands, CHF 120 minimum),
// bonds, funds outside ETFs, the custody fee and the CHF 10 a month for
// clients domiciled abroad (CHF 35 in the US): not per trade.
//
//   node brokers/banquecantonalen/banquecantonalen_cost.mjs NESN XSWX CHF --shares=13 --price=77.46
//   node brokers/banquecantonalen/banquecantonalen_cost.mjs CSSPX XSWX USD --shares=1 --price=826.43
//   node brokers/banquecantonalen/banquecantonalen_cost.mjs JPNY XSWX JPY --shares=3 --price=46604.425
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip, pctFr } from "../migros/sixCost.mjs";

const PAGE = "https://bcn.ch/brochure/prestations-et-tarifs";
const PDF = "https://media.ffycdn.net/eu/banque-cantonale-neuchateloise/aFbJcRKjzwtLXd7cv5Cf.pdf";
const ONLINE = 0.5;
const MIN_CHF = 80 * ONLINE;
const CAP = 0.1;
const BANDS = [
  { upTo: 25000, rate: 0.011 },
  { upTo: 50000, rate: 0.0105 },
  { upTo: 100000, rate: 0.01 },
  { upTo: 200000, rate: 0.008 },
  { upTo: 300000, rate: 0.006 },
  { upTo: 400000, rate: 0.004 },
  { upTo: 1000000, rate: 0.003 },
  { upTo: Infinity, rate: 0.002 },
];

export const roundTrip = makeRoundTrip({
  folder: "banquecantonalen",
  brand: "Banque Cantonale Neuchâteloise",
  catalogue: new URL("banquecantonalen-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR", "GBP", "USD"],
  fx: {
    rate: 0.0175,
    label: "1.75",
    basis: "au cours des devises BCN (achat / vente à 1,75 % du milieu pour chaque monnaie, relevé le 2026-10-26)",
  },
  onlineBuy: true,
  remark: "Custody is 0.3% a year, min CHF 50.",
  sources: {
    pdf: PDF,
    fx: "https://www.bcn.ch/prives/investir/cours-et-taux/devises-et-billets",
    accounts: "https://www.bcn.ch/prives/comptes-et-cartes/comptes-prives/compte-de-gestion",
  },
  commission({ amountChf }) {
    const band = BANDS.find((b) => amountChf <= b.upTo);
    const rate = band.rate * ONLINE;
    const raw = bandRate([{ upTo: Infinity, rate }], amountChf, MIN_CHF);
    const chf = Math.min(raw, amountChf * CAP);
    const capped = chf < raw;
    return {
      chf,
      rate,
      min: MIN_CHF,
      basis:
        `places suisses ${pctFr(band.rate)} % pour ce montant, rabais internet de 50 % → ${pctFr(rate)} %, ` +
        `minimum CHF 80 réduit de moitié → CHF ${MIN_CHF}, maximum 10 % du montant brut` +
        (capped ? " (plafond atteint)." : "."),
      confidence: "rabais internet de 50 % appliqué à tout le tarif «indiqué ci-dessous», minimum CHF 80 compris (CHF 40)",
    };
  },
});

cli(import.meta.url, roundTrip);
