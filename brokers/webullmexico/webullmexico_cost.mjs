// What one round trip costs at Webull México (webull.com.mx): buy n shares at
// price p, sell them straight back, in the app, in dollars. US-listed shares,
// ETFs and the OTC lines of Webull Financial's own OTC list, in the dollar
// account at Webull Financial LLC. Options, crypto and algo orders stay out.
//
// The site's "COMISIONES" link, https://www.webull.com.mx/pricing, answers
// "301 Moved Permanently" to Webull Financial's own schedule, read in full
// 2026-10-26:
//   https://www.webull.com/pricing
//
//   commission   "Webull does not charge commissions for trading stocks,
//                ETFs and options listed on U.S. exchanges"
//   SEC          "$0.0000206 * Total Trade Volume", sells only
//   FINRA TAF    printed at "$0 per share for each sale of a covered equity
//                security, with a maximum charge of $0 per trade" (FINRA's
//                pause, 2026-10-01 to 2026-12-31). Kept on: after the pause
//                the helper charges $0.000195 a share, cap $9.79.
//   CAT          "$0.000003 * Total Trade Volume" (shares), buys and sells;
//                OTC "$0.00000003"
//   OTC          "$0.0002 per share (maximum 5% charge of principal value)"
//                on transactions over 100,000 shares priced under $1.00,
//                each side (a $1,000 trip reaches it below 1 cent a share)
//
// No rounding is printed, so SEC and CAT are charged as computed, as the
// Webull US card does (../webull/webull_cost.mjs). Left out: F-stock
// settlement ($5 buy / $0.05 sell: no line of the OTC list is an F-share),
// the NSCC illiquidity charge (no rate), algo orders ($0.005 a share),
// ADR depositary fees (not printed).
//
// Formula: book (605 × Q of Webull) + 2 × ticket (0, or the OTC low-price
// charge) + SEC + TAF + CAT both legs. OTC lines keep the OTC touch in bp.
//
// Routing: orders go to Webull Financial LLC (CRD 289063), which files its
// own 606: rule606 key "webull".
//
// Cash: "Con Webull Financial LLC, puedes tener una cuenta en la que
// depositas tus dólares y operas (compra/venta) en el mercado de valores de
// Estados Unidos"; pesos sit at Vifaru, S.A. de C.V., Casa de Bolsa, which
// buys the dollars at a "tipo de cambio competitivo" (no rate printed). The
// line is in dollars and dollars are held: no conversion in the number, and
// no FX remark without a printed rate.
//   https://www.webull.com.mx/
//
//   node brokers/webullmexico/webullmexico_cost.mjs US0378331005 XNAS USD --shares=2.8758 --price=347.725
//   node brokers/webullmexico/webullmexico_cost.mjs US3135861090 "OTC Markets" USD --shares=317.46 --price=3.15
//   node brokers/webullmexico/webullmexico_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const OTC_LOW = { perShare: 0.0002, cap: 0.05, shares: 100_000, price: 1 };

/** Webull's charge on one side: 0, or the OTC low-priced surcharge. */
export function ticket({ otc, shares, price, notional }) {
  if (!(shares > 0) || !(price > 0)) return null;
  if (otc && shares > OTC_LOW.shares && price < OTC_LOW.price) return Math.min(shares * OTC_LOW.perShare, notional * OTC_LOW.cap);
  return 0;
}

const SCHEDULE = {
  broker: "Webull México",
  folder: "webullmexico",
  catalogueUrl: new URL("webullmexico-parsed.json", import.meta.url),
  url: "https://www.webull.com/pricing",
  redirectFrom: "https://www.webull.com.mx/pricing",
  readOn: "2026-10-26",
  entity: "Webull Financial LLC (CRD 289063); pesos at Vifaru, S.A. de C.V., Casa de Bolsa",
  rule606: "webull",
  cash: "USD",
  deposits: ["MXN", "USD"],
  feeCurrency: "USD",
  ticket: (ctx) => {
    const each = ticket(ctx);
    if (each == null) return null;
    return {
      buy: each,
      sell: each,
      note: each > 0 ? `surcharge OTC ${OTC_LOW.perShare} $ la part (plus de ${OTC_LOW.shares} parts sous 1 $), plafond 5 % : ${Number(each.toFixed(4))} $ par ordre` : null,
    };
  },
  levies: { sec: "exact", taf: "exact", cat: { perShare: 0.000003, otcPerShare: 0.00000003, mode: "exact" } },
  basis:
    "barème Webull Financial (webull.com.mx/pricing renvoie vers webull.com/pricing), relu le 2026-10-26 : " +
    "0 $ de commission sur les actions et ETF cotés aux États-Unis, SEC, TAF et CAT répercutées",
  notes: [
    "aucun arrondi imprimé : SEC et CAT comptées au calcul, comme la carte Webull US",
    "frais F-stock, charge d'illiquidité NSCC et ordres algo hors trajet",
    "compte en dollars chez Webull Financial LLC ; les pesos (Vifaru) achètent les dollars à un taux non publié",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
