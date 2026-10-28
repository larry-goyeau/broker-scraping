// What one round trip costs at Banque Cantonale du Jura (BCJ): buy n
// shares or ETF units on SIX Swiss Exchange through BCJ-Net or mobile
// banking and sell them straight back, in dollars. The SIX book, the
// federal stamp, the SIX fee, taxMap and the conversion are
// ../migros/sixCost.mjs; this file gives the courtage and the account
// currencies.
//
// "Tarif des prestations financières", valid from 1 October 2025, read on
// 2026-10-26:
//   https://www.bcj.ch/Htdocs/Files/v/88cbf8c7140727ac6270d4899f9fba9e4c682ed1604dcab19190d9d34cae2845.pdf/250826_BCJ_tarif_prestations_financieres_2025.pdf
//   "Courtages — Actions | Obligations | Fonds | Produit structurés |
//   Warrants", Marché suisse, rate of the band on the CHF amount:
//     "Jusqu'à 50'000 CHF 1.00%", "Jusqu'à 250'000 CHF 0.80%",
//     "Jusqu'à 500'000 CHF 0.50%", "Au dessus de 500'000 CHF 0.25%",
//     "Courtage minimum CHF 80.–".
//   "Réduction de 50% sur les produits du marché monétaire."
//   "Courtage BCJ-Net 50% du tarif standard."
//   "Les opérations d'achat et de vente de titres sont par ailleurs
//   soumises au droit de timbre fédéral de négociation, ainsi que, le cas
//   échéant, aux taxes et impôts de la bourse concernée" (the stamp and
//   the SIX fee, in the engine).
// So each side is 50 % of the standard tariff, its CHF 80 minimum
// included: max(CHF 40, half the band rate x amount); a SIX "Money Market"
// ETF takes a further 50 % on the rate. BCJ's January 2018 tariff printed
// the same "Courtage BCJ-net 50% du tarif standard" with "Courtage minimum
// : CHF 40.–" under a CHF 80 standard minimum:
//   https://www.bcj.ch/Htdocs/Files/v/5968.pdf/Brochures/Tarif-de-nos-prestations-financieres-janvier-2018.pdf
// Custody "Tarif de base 0.30% p.a.", "Minimum CHF 50.– par dépôt p.a.":
// a remark.
//
// Accounts: the "Compte revenu" in CHF and the "Compte courant EUR"; no
// other currency account is offered to private clients. CHF and EUR lines
// stay unconverted.
//   https://www.bcj.ch/fr/Particuliers/Comptes-et-Cartes/Comptes-revenus.html
// FX: BCJ prints no conversion margin for private clients (its currency
// brochure speaks of "La marge en fonction du volume annuel" without a
// figure). A USD, GBP, JPY, AUD, CAD or SGD line would convert both ways at
// an unpublished rate: N/A.
//   https://www.bcj.ch/fr/Entreprises/Gestion-des-liquidites/Operation-sur-devises/Operation-sur-devises.html
//
// Left out: the adviser channel, the BCJ advisory mandate (CHF 100
// ticket), foreign markets (1.50 %, CHF 120 minimum), the free first
// purchase of BCJ shares (adviser only) and the custody fee: not per
// trade or not online.
//
//   node brokers/banquecantonaled/banquecantonaled_cost.mjs NESN XSWX CHF --shares=13 --price=77.46
//   node brokers/banquecantonaled/banquecantonaled_cost.mjs 29GA XSWX EUR --shares=190 --price=5.283
//   node brokers/banquecantonaled/banquecantonaled_cost.mjs NESN XSWX CHF --shares=1000 --price=77.46
//
// `roundTrip(...)` reads files, not the network.

import { bandRate, cli, makeRoundTrip, pctFr } from "../migros/sixCost.mjs";

const PAGE =
  "https://www.bcj.ch/Htdocs/Files/v/88cbf8c7140727ac6270d4899f9fba9e4c682ed1604dcab19190d9d34cae2845.pdf/250826_BCJ_tarif_prestations_financieres_2025.pdf";
const ONLINE = 0.5;
const MONEY_MARKET = 0.5;
const MIN_CHF = 80 * ONLINE;
const BANDS = [
  { upTo: 50000, rate: 0.01 },
  { upTo: 250000, rate: 0.008 },
  { upTo: 500000, rate: 0.005 },
  { upTo: Infinity, rate: 0.0025 },
];
const isMoneyMarket = (row) => /\|\s*Money Market\s*(\||$)/i.test(String(row?.raw || ""));

export const roundTrip = makeRoundTrip({
  folder: "banquecantonaled",
  brand: "Banque Cantonale du Jura",
  catalogue: new URL("banquecantonaled-parsed.json", import.meta.url),
  page: PAGE,
  readOn: "2026-10-26",
  deposits: ["CHF", "EUR"],
  fx: null,
  onlineBuy: true,
  remark: "Custody is 0.3% a year, min CHF 50.",
  sources: { accounts: "https://www.bcj.ch/fr/Particuliers/Comptes-et-Cartes/Comptes-revenus.html" },
  commission({ amountChf, row }) {
    const band = BANDS.find((b) => amountChf <= b.upTo);
    const mm = isMoneyMarket(row);
    const rate = band.rate * ONLINE * (mm ? MONEY_MARKET : 1);
    return {
      chf: bandRate([{ upTo: Infinity, rate }], amountChf, MIN_CHF),
      rate,
      min: MIN_CHF,
      basis:
        `marché suisse ${pctFr(band.rate)} % pour ce montant, courtage BCJ-Net 50 % du tarif standard` +
        (mm ? ", réduction de 50 % sur les produits du marché monétaire" : "") +
        ` → ${pctFr(rate)} %, courtage minimum CHF 80 à 50 % → CHF ${MIN_CHF}.`,
      confidence: "courtage BCJ-Net à 50 % du tarif standard, minimum compris (CHF 40, comme le tarif BCJ de 2018 l'imprimait)",
    };
  },
});

cli(import.meta.url, roundTrip);
