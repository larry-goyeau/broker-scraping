// What one round trip costs at Mondeum Capital (Mondeum Pro, a direct-access
// account on DAS Trader Pro or Sterling Trader Pro; clearing at RQD*
// Clearing): buy n shares at price p, sell them straight back, online, in
// regular hours, in dollars, as a marketable order (it takes liquidity on
// both legs). US-listed stocks and ETFs of the catalogue.
//
// Pricing page, "Trading Platform" tab, read in full 2026-10-26:
//   https://www.mondeumcapital.com/pricing/
//   https://www.mondeumcapital.com/overview/   (what each route does)
//
//   "Commission 0.0005 per share"
//   routing fees, "Add Liquidity / Take Liquidity" per share:
//     MONDPFOF -0.0003 / -0.0003   MONDPRPS -0.0010 / 0.0035 (pre/post)
//     MONDDARK  0.0022 /  0.0022   MONDMID   0.0022 / 0.0022
//     MONDSOR   0.0027 /  0.0027   MOO, MOC  0.0035 / 0.0035
//   "Trading Fees Billed On Trade":
//     "Administrative 0.000010 per share"
//     "NSCC 0.000030 per share (estimate)"
//     "Reporting 0.000001 per share"
//     "Pre/Post Market 0.003000 per share" (not this trip: regular hours)
//     "SEC 0.000008 x dollar ammount"
//     "TAF 0.000145 per share (sell side only)"
//   "All trading fees and commissions are rounded up to the next hundredths
//   decimal place when assessed."
//   Platform: DAS Trader Pro $150.00, Sterling Trader Pro $175.00 a month,
//   free for the first three months; market data from $1.50 a feed a month.
//
// Route: the trip takes MONDSOR, the general smart route ("accesses dark and
// lit venues to provide high fill rates", 4:00am to 8:00pm), at its
// take-liquidity rate. The PFOF route pays a rebate instead
// (-0.0003 a share): remark "Fees might be x% lower.", x the PFOF ticket as a
// cut of the MONDSOR ticket (commission, route and per-share fees, cents
// rounded up). MOO/MOC are auction orders, MONDPRPS is for pre/post market.
//
// Each line is rounded up to the cent on its own, as assessed (the largest
// reading of the rounding sentence). SEC and TAF: the printed figures are
// older regulator rates, passed through ("ECN, TAF, SEC and NSCC Fees ... are
// passed on to the client"), so the trip charges the regulators' current
// rates rounded up: SEC 0.0000206 of the sale since 2026-04-04; the FINRA
// TAF is paused from 2026-10-01 to 2026-12-31 (SR-FINRA-2026-021), so $0
// today. CAT not printed: 0.
//
// Left out: the ECN fee that "may" apply to orders "not in a multiple of
// 100 shares" (no rate), short-locate and margin costs, the $50 inactivity
// fee every 90 days, ACH withdrawal $5, wire out $35.
//
// Formula: book + 2 × ticket + SEC (up) + TAF (up), ticket =
//   ⌈0.0005 n⌉ + ⌈0.0027 n⌉ + ⌈0.00001 n⌉ + ⌈0.00003 n⌉ + ⌈0.000001 n⌉ (cents)
//
// Routing: Mondeum Capital LLC (CRD 309574) files its own 606
// (309574_606_NMS_2026_Q2_V1, FINRA 606 bulk 2026 Q2). rule606.mjs has no
// key for it, so the folder is passed and the book is the quoted NBBO until
// an ALIASES entry is added.
//
// Funding "must be made in US Dollars" (FAQ) and every line is in dollars:
// no conversion.
//
//   node brokers/mondeum/mondeum_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/mondeum/mondeum_cost.mjs F XNYS USD --shares=100 --price=12.17
//   node brokers/mondeum/mondeum_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const PER_SHARE = {
  commission: 0.0005,
  administrative: 0.00001,
  nscc: 0.00003,
  reporting: 0.000001,
};
const ROUTE = { MONDSOR: 0.0027, MONDPFOF: -0.0003 };
const DEFAULT_ROUTE = "MONDSOR";
const PLATFORM = { das: 150, sterling: 175, freeMonths: 3 };
const CENT = 0.01;

// Rounded up to the next cent, as assessed; a rebate rounds toward zero.
const up = (x) => Number((Math.ceil(x / CENT - 1e-9) * CENT).toFixed(2));

/** One marketable order in regular hours, in dollars, on `route`. */
export function ticket({ shares }, route = DEFAULT_ROUTE) {
  const n = Number(shares);
  if (!(n > 0) || ROUTE[route] == null) return null;
  const lines = [PER_SHARE.commission, ROUTE[route], PER_SHARE.administrative, PER_SHARE.nscc, PER_SHARE.reporting];
  return Number(lines.reduce((sum, rate) => sum + up(rate * n), 0).toFixed(2));
}

function remarkOf(ctx) {
  const lines = [];
  const sor = ticket(ctx, "MONDSOR");
  const pfof = ticket(ctx, "MONDPFOF");
  if (sor != null && pfof != null && sor > 0) {
    const x = ((sor - pfof) / sor) * 100;
    const v = x >= 10 ? Math.round(x) : Number(x.toFixed(1));
    if (v > 0) lines.push(`Fees might be ${v}% lower.`);
  }
  lines.push(`Platform $${PLATFORM.das}/month after ${PLATFORM.freeMonths} months.`);
  return lines.join(" ");
}

const SCHEDULE = {
  broker: "Mondeum Capital",
  folder: "mondeum",
  catalogueUrl: new URL("mondeum-parsed.json", import.meta.url),
  url: "https://www.mondeumcapital.com/pricing/",
  readOn: "2026-10-26",
  entity: "Mondeum Capital LLC",
  crd606: "309574",
  clearing: "RQD* Clearing, LLC",
  rule606: null,
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: (ctx) => {
    const each = ticket(ctx);
    return each == null
      ? null
      : { buy: each, sell: each, note: `route ${DEFAULT_ROUTE} (prise de liquidité) : ${each} $ par ordre, lignes arrondies chacune au centime supérieur` };
  },
  levies: { sec: "up", taf: "up", cat: false },
  remark: remarkOf,
  basis:
    "grille Mondeum Pro, relue le 2026-10-26 : commission 0,0005 $ la part, route MONDSOR 0,0027 $ la part, " +
    "frais administratifs 0,00001 $, NSCC 0,00003 $ (estimation), reporting 0,000001 $ la part, à l'achat comme à la vente",
  notes: [
    "SEC et TAF répercutées (« passed on to the client ») : taux imprimés anciens (SEC 0,000008, TAF 0,000145), le trajet prend les taux en vigueur, au centime supérieur",
    "route PFOF (remise de 0,0003 $ la part) en remarque ; plateforme DAS 150 $/mois (Sterling 175 $) après trois mois gratuits, données de marché en sus, hors trajet",
    "frais ECN éventuels sur les ordres hors multiples de 100 parts : non chiffrés, non comptés",
    "Mondeum Capital (CRD 309574) publie son propre 606, sans clé dans rule606.mjs : NBBO coté",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
