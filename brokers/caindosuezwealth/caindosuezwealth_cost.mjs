// What one round trip costs at CA Indosuez Wealth (Europe) (Crédit Agricole
// private bank, Luxembourg): buy n shares at price p, sell them back at once,
// in dollars. US-listed shares and ETFs ordered online (E-banking / My
// Indosuez), outside a discretionary mandate or an advisory agreement.
//
// Fee schedule applicable from 1 September 2025 (V2025-0109), read in full
// 2026-10-26:
//   https://luxembourg.ca-indosuez.com/en/pdfPreview/66904
//
//   E-BANKING / MY INDOSUEZ, "Transactions in financial instruments"
//     "Equities / Equity ETFs 0.65% 0.58% 0.50% 0.38%" by gross assets
//     deposited (< EUR 2M, EUR 2-10M, EUR 10-20M, > EUR 20M),
//     "EUR Minimum 150", each transaction (buy and sell).
//     The < EUR 2M column is the price; the lower columns are the remark.
//     (Orders given otherwise: 1.30% ... 0.75%, EUR minimum 150; not this
//     trip, only online prices count.)
//   "These commissions ... exclude broker fees": the third-party broker's fee
//     has no figure, so 0, as consorsbank's "ggf." third-party costs.
//   SEC / TAF / CAT     not printed: 0 (owner's rule)
//   spot FX              "0 - 50k 2.10%" (Basket 1, USD), up to 0.30% above
//                        EUR 200k: remark only, the client can hold dollars
//   custody              0.40% a year (< EUR 2M), "Minimum amount per
//                        quarter: EUR 500": remark (real and sizeable)
//   account management   "Account management fees: EUR 800" (services
//                        attached to the accounts): remark
//
// Formula: book (quoted NBBO) + max(0.65% × amount, EUR 150) × 2.
//
// Routing: the July 2025 best execution policy executes US equities on
// Bloomberg MTF or through ten brokers (Canaccord, Citigroup, Goldman Sachs,
// Intesa Sanpaolo, Instinet, JP Morgan, Stifel Europe, UBS, Kepler, RBC):
// no single US dealer. ALIASES `caindosuezwealth` in spreads/rule606.mjs
// takes the highest Q of those with a 606 key (as for ii).
//   https://luxembourg.ca-indosuez.com/en/pdfPreview/40796
//
// Cash: the reference currency is the euro unless the client chooses another,
// and "The Bank may, on its own initiative or at the Client's request, open
// one or more foreign currency accounts for a Client" (general terms
// 1.2.3.1), so a dollar account is kept: no conversion in the figure.
//   https://luxembourg.ca-indosuez.com/en/pdfPreview/45073
//
//   node brokers/caindosuezwealth/caindosuezwealth_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/caindosuezwealth/caindosuezwealth_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";
import { usdPer } from "../../fx.mjs";

const RATE = 0.0065; // < EUR 2M of assets deposited, online
const RATE_LOW = 0.0038; // > EUR 20M
const MIN_EUR = 150;

const eurOf = (usd) => (usd == null ? null : usd / usdPer("EUR"));
const legEur = (amountEur, rate = RATE) => (amountEur == null ? null : Math.max(rate * amountEur, MIN_EUR));

// The > EUR 20M column's cut of this order's commission itself (0.65% →
// 0.38% is 42%, less while the EUR 150 minimum binds): whole from 10 up,
// one decimal below.
function tierRemark(ctx) {
  const eur = eurOf(ctx.notionalUsd);
  if (!(eur > 0)) return "";
  const raw = ((legEur(eur) - legEur(eur, RATE_LOW)) * 100) / legEur(eur);
  const gap = raw >= 10 ? Math.round(raw) : Math.round(raw * 10) / 10;
  return gap > 0 ? `Fees might be up to ${gap}% lower if assets deposited exceed EUR 2M.` : "";
}

const SCHEDULE = {
  broker: "CA Indosuez Wealth (Europe)",
  folder: "caindosuezwealth",
  catalogueUrl: new URL("caindosuezwealth-parsed.json", import.meta.url),
  url: "https://luxembourg.ca-indosuez.com/en/pdfPreview/66904",
  readOn: "2026-10-26",
  entity: "CA Indosuez Wealth (Europe) S.A., Luxembourg",
  rule606: "caindosuezwealth",
  cash: "EUR",
  deposits: ["EUR", "USD"],
  feeCurrency: "EUR",
  ticket: (ctx) => {
    const leg = legEur(eurOf(ctx.notionalUsd));
    return leg == null ? null : { buy: leg, sell: leg, note: `max(0,65 % ; 150 €) par ordre = ${leg.toFixed(2)} € à l'achat et à la vente` };
  },
  levies: { sec: false, taf: false, cat: false },
  fx: { rate: 0.021, label: "2.1" },
  remark: (ctx) => [tierRemark(ctx), "Custody 0.4% a year, min EUR 500 a quarter. Account management fee EUR 800."].filter(Boolean).join(" "),
  basis:
    "barème CA Indosuez Wealth (Europe) du 01/09/2025, relu le 2026-10-26 : ordres via E-banking / My Indosuez, " +
    "« Equities / Equity ETFs 0.65% » (actifs < 2 M€), « EUR Minimum 150 » par transaction",
  notes: [
    "« exclude broker fees » : frais du courtier tiers sans montant, comptés 0",
    "tarifs dégressifs selon les actifs déposés (0,58 %, 0,50 %, 0,38 %) : remarque",
    "change au comptant 2,10 % jusqu'à 50 k€ (panier 1, USD) : compte en dollars possible (CG 1.2.3.1), remarque",
    "courtiers US de la politique d'exécution, le Q le plus haut (606 2026 T2)",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
