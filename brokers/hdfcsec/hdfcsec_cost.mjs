// What one round trip costs at HDFC Securities (HDFC securities Ltd, the
// classic hdfcsec.com / InvestRight account; not HDFC Sky, ../hdfcsky): buy
// n shares, sell them back, in dollars. Online delivery. Not intraday, not
// F&O, not the Encash facility (0.20% more for same-day sale proceeds).
//
// Each plan a resident can take online is a row (`query.plan`), on the
// market it prices:
//   standard   the brokerage article's table. The default for NSE and BSE.
//   optima … elite   the Value Plans of the brokerage plans page, bought
//              once ("Tenure Life Time") with a free cash volume for 90
//              days.
//   basic      Global Investing Basic. The default for a US line.
//   silver     Global Investing Silver.
//   gold       Global Investing Gold and Super Gold (same commission): one
//              row.
// Under an Indian plan a US line is not that row (onlineBuy: false), and
// the same for an Indian line under a US plan.
//
// India, https://www.hdfcsec.com/article/brokeragecharges-3044 (read through
// https://www.hdfcsec.com/api/cmsapi/GetArticleByPermalink?permalink=brokeragecharges-3044,
// as the page renders it) read on 2026-10-28.
//   Minimum brokerage per order   "Rs.25/-" "subject to ceiling of 2.5% of
//                                 total traded value", buy and sell
//   Delivery, resident            "0.50% or min Rs.25/- or ceiling of 2.5%
//                                 on transaction value (Both Buy & Sell)";
//                                 NRI 0.75% (not a row: the Value Plans
//                                 are resident only and the site is read
//                                 as a resident's)
//   Scrips under ₹10 a share      "Minimum brokerage of Rs. 0.05/- per
//                                 unit": a third floor on that table
//   Same-day square-off           Cash & Carry scrips 0.10% or min ₹25
//                                 (margin scrips 0.05%; the higher one is
//                                 the remark's base)
//   GST                           18% on brokerage; SEBI "Plus GST 18%";
//                                 transaction charges "as prescribed":
//                                 18% on them too, as the law does
//   STT                           0.1% buy and sell; "STT on sale of an
//                                 unit of an Equity Oriented Fund is
//                                 0.001%": an equity ETF pays 0.001% on
//                                 the sale only, a gold, silver, debt,
//                                 liquid or foreign-index ETF none
//   Stamp                         0.015% on the buy
//   SEBI                          0.0001% (₹10 per crore)
//   Exchange transaction          "levied as per slab given by exchange",
//                                 no figure: NSE 0.00297%, the rate the
//                                 same company prints for HDFC Sky
//                                 (hdfcsky.com/pricing, 2026-10-12); BSE by
//                                 scrip group, BSE's own table
//                                 (../bajaj/indiaAbroad.mjs)
//   IPFT                          not printed: 0
// Value Plans, https://www.hdfcsec.com/brokerage-plans read on 2026-10-28
// (a table drawn in the page; "This plan will only be activated if your
// linked bank is HDFC BANK and the POA is active. It is applicable only for
// resident customers"):
//   plan      price (excl. GST)  free cash volume, 90 days  delivery  intraday
//   optima       ₹999               ₹2,00,000                0.30%     0.03%
//   maxima     ₹2,999               ₹5,00,000                0.20%     0.02%
//   premia     ₹4,999              ₹12,00,000                0.15%     0.015%
//   platina    ₹9,999              ₹25,00,000                0.10%     0.01%
//   supreme   ₹24,999           ₹1,00,00,000                 0.075%    0.0075%
//   elite     ₹49,999           ₹5,00,00,000                 0.05%     0.005%
// The page prints no minimum. HDFC Bank's sheet of the same plans
// (value-plan-changes.pdf, hdfc.bank.in, created 2026-03-02): "Minimum
// brokerage will apply regardless of the customer's base brokerage plan:
// Platina - ₹10, Premia - ₹15, Maxima - ₹20, Optima - ₹25". Supreme and
// Elite are not in it: they take Platina's ₹10, the lowest floor printed
// (stand-in). The 2.5% ceiling is SEBI's and stays on every plan. The free
// volume is a one-off from purchase, not a monthly allowance: the trip is
// priced at the plan's rate and the remark gives it.
//   DP on a delivery sell  the CDSL fiche of DP 86700 (HDFC Securities Ltd,
//                          CDSL DP ID 12086700),
//                          https://www.cdslindia.com/dp/dpdetails.aspx?dp_id=86700
//                          read 2026-10-28: "For Equity/Equity MF ... On
//                          Market -- 0.04% of the value of txn or Rs. 20/-
//                          whichever is higher", no maximum for equity. No
//                          GST printed on it: none added. AMC ₹750 a year,
//                          the first year free: not per trade.
//
// United States, https://www.hdfcsec.com/globalinvesting read on
// 2026-10-28. "Global Investing product of HDFC Securities is powered by
// Vested Finance"; the account is at "Vested's VF Securities, Inc. (member
// FINRA/SIPC)", whose fee schedule (vestedfinance.com/legal/fee-schedule)
// names DriveWealth as the custodian. Two broker-dealers named, neither said
// to take a given order: the highest 606 Q of the two (owner's rule
// 2026-10-26; VF Securities' 2026-Q2 file has no market-order mix, so
// DriveWealth's Q is the one that exists).
//   Basic (free)                 $2.99 a trade up to 299 shares, $0.01 a
//                                share beyond: max($2.99, $0.01 × shares)
//   Silver, ₹3,999 a year        $0.99 a trade up to 99 shares, $0.01 a
//                                share beyond: max($0.99, $0.01 × shares)
//   Gold, ₹13,999 a year;        $0.01 a share
//   Super Gold, ₹49,999 once
// NRIs see the same commissions in dollars ($149, $299, $999). Neither HDFC
// nor Vested prints a regulatory fee: the US rule (owner, 2026-10-28) puts
// SEC 0.00206% of the sale and FINRA TAF $0.000195 a share sold (max $9.79)
// on, each rounded up to the cent; CAT 0. No GST printed on the commission:
// none added. The account holds dollars (deposits.mjs: INR, USD), so a US
// line pays no forced conversion: FX is the remark "FX 1.5% when cash ≠
// USD." HDFC Securities prints no rate (the page says only "the lowest FX
// rates"); the figure is its named partner's, Vested's fee article
// https://support.vestedfinance.com/portal/en/kb/articles/how-is-this-platform-fee-calculated-and-how-much-am-i-charged
// read on 2026-10-28: a table "Remittance | HDFC | ICICI | Other Banks |
// Vested", row "FX Markup (over IBR)": HDFC "1.6%-1.9%", ICICI "2%", other
// banks "Upto 2%", Vested "1.5%*" ("Fees may vary slightly during the date
// as rates move"); the Vested column is the in-app transfer "via our
// partnered banks" (HDFC, ICICI, Axis), the one hdfcsec.com/globalinvesting
// describes, with its platform fee inside and fixed fee ₹0. Vested's older
// FAQ says "~1-3%" through those banks, and its CEO (community post,
// 2025-01-30) "1% - 1.5% (including platform fees wherever applicable)":
// 1.5% is the single figure, also the top of the latter. INR→USD on the way
// in; the way back is not printed. INR lines get no FX remark: the dollars
// sit at Vested/DriveWealth and cannot buy on NSE or BSE.
//
//   node brokers/hdfcsec/hdfcsec_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400
//   node brokers/hdfcsec/hdfcsec_cost.mjs INE002A01018 BSE INR --shares=10 --price=1400 --plan=platina
//   node brokers/hdfcsec/hdfcsec_cost.mjs NIFTYBEES NSE INR --shares=100 --price=280
//   node brokers/hdfcsec/hdfcsec_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/hdfcsec/hdfcsec_cost.mjs SPY ARCX USD --shares=10 --price=600 --plan=gold
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, pct, sameDaySell, sebiRate } from "../../indianDelivery.mjs";
import { fxRemark } from "../../fx.mjs";
import { qOf } from "../../spreads/rule606.mjs";
import { BSE_TABLE_BASIS, bseTxnRate, catalogueRows, cliArgs, goesToIndia, notThisPlan, usRoundTrip } from "../bajaj/indiaAbroad.mjs";

const CATALOGUE = new URL("hdfcsec-parsed.json", import.meta.url);
const PAGE = "https://www.hdfcsec.com/article/brokeragecharges-3044";
const PLANS_PAGE = "https://www.hdfcsec.com/brokerage-plans";
const US_PAGE = "https://www.hdfcsec.com/globalinvesting";
const READ_ON = "2026-10-28";
const CEILING = 0.025;

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00297");
  if (exchange === "BSE") return bseTxnRate(row, catalogueRows(CATALOGUE));
  return null;
}

// STT is 0.1% a side on a share. An equity ETF pays 0.001% on the sale
// only: 0.01 of one 0.1% side. A gold, silver, debt, liquid or foreign-index
// ETF is not an equity-oriented fund and pays none.
const NOT_EQUITY_FUND =
  /GOLD|SILVER|SILV|SLVR|LIQUID|LIQ|GILT|GSEC|G-SEC|\bG5\b|BOND|BBETF|SDL|CASHIETF|MONEY ?MARKET|OVERNIGHT|NASDAQ|MON100|MONQ50|MAFANG|MAHKTECH|HANG ?SENG|HNGSNG|MASPTOP50|S&P 500/i;
function sttSides(row) {
  if (String(row?.type || "").toUpperCase() !== "ETF") return 2;
  return NOT_EQUITY_FUND.test(`${row?.ticker || ""} ${row?.name || ""}`) ? 0 : 0.01;
}

// indiaRoundTrip hands brokerageEach the notional only: the share count and
// price are set here before each call (synchronous, one query at a time).
let sharesNow = 0;
let priceNow = 0;

// One order: the rate, the floors, the 2.5% ceiling.
function orderFee(notional, rate, floor, perUnit) {
  const unitFloor = perUnit && priceNow > 0 && priceNow < 10 ? sharesNow * 0.05 : 0;
  return Math.min(notional * CEILING, Math.max(notional * rate, floor, unitFloor));
}

const lakh = (inr) => (inr >= 1e7 ? `₹${inr / 1e7} crore` : `₹${inr / 1e5} lakh`);

function valuePlan(name, price, free, delivery, intraday, floor) {
  return {
    name,
    delivery: pct(delivery),
    intraday: pct(intraday),
    floor,
    perUnit: false,
    page: PLANS_PAGE,
    basis:
      `Value Plan ${name} (${price.toLocaleString("en-IN")} ₹ HT une fois, à vie ; ${lakh(free).replace("₹", "")} ₹ de volume cash gratuit 90 jours, hors de cet aller-retour) : ` +
      `livraison ${delivery.replace(".", ",")} % par ordre, minimum ${floor} ₹${floor === 10 && /Supreme|Elite/.test(name) ? " (celui de Platina, le plus bas imprimé : non publié pour ce plan)" : " (fiche HDFC Bank des Value Plans)"}, plafond 2,5 %.`,
    remark: `₹${price.toLocaleString("en-IN")} + GST once; no brokerage on the first ${lakh(free)} traded in 90 days.`,
  };
}

const INDIA = {
  standard: {
    name: "Standard",
    delivery: pct("0.5"),
    intraday: pct("0.1"),
    floor: 25,
    perUnit: true,
    page: PAGE,
    basis: "Barème standard résident : livraison 0,50 % par ordre, minimum 25 ₹ (0,05 ₹ par part sous 10 ₹), plafond 2,5 %.",
    remark: "",
  },
  optima: valuePlan("Optima", 999, 2e5, "0.30", "0.03", 25),
  maxima: valuePlan("Maxima", 2999, 5e5, "0.20", "0.02", 20),
  premia: valuePlan("Premia", 4999, 12e5, "0.15", "0.015", 15),
  platina: valuePlan("Platina", 9999, 25e5, "0.10", "0.01", 10),
  supreme: valuePlan("Supreme", 24999, 1e7, "0.075", "0.0075", 10),
  elite: valuePlan("Elite", 49999, 5e7, "0.05", "0.005", 10),
};

function india(plan) {
  return {
    broker: "HDFC Securities",
    folder: "hdfcsec",
    catalogueUrl: CATALOGUE,
    url: plan.page,
    readOn: READ_ON,
    brokerageEach: (notional) => orderFee(notional, plan.delivery, plan.floor, plan.perUnit),
    txnRate,
    sttRate: pct("0.1"),
    sttSides,
    stampRate: pct("0.015"),
    sebiRate: sebiRate(),
    gstRate: 0.18,
    gstOnDp: false,
    ipftRate: 0,
    dpInr: (notional) => Math.max(20, notional * pct("0.04")),
    basis:
      `${plan.basis} GST 18 % sur courtage, frais de bourse et SEBI. STT 0,1 % achat et vente ; ETF actions 0,001 % à la vente seulement, ETF or, argent, dette, liquidité ou indice étranger sans STT. ` +
      `NSE 0,00297 % (taux imprimé par HDFC Sky, même société ; la page dit « as per slab given by exchange »). DP à la vente 0,04 %, minimum 20 ₹, sans GST imprimé (fiche CDSL 86700). ${BSE_TABLE_BASIS}`,
    remark: plan.remark,
  };
}

function indiaTrip(plan, query) {
  sharesNow = Number(query.shares) || 0;
  priceNow = Number(query.price) || 0;
  const out = indiaRoundTrip(india(plan), query);
  sharesNow = Number(query.shares) || 0;
  priceNow = Number(query.price) || 0;
  return sameDaySell(
    out,
    (notional) => orderFee(notional, plan.delivery, plan.floor, plan.perUnit),
    (notional) => orderFee(notional, plan.intraday, plan.floor, plan.perUnit),
  );
}

// VF Securities and DriveWealth: the one with the higher 606 Q.
const DEALERS = { vested: "VF Securities", drivewealth: "DriveWealth" };
function dealer() {
  let best = null;
  let bestQ = -Infinity;
  for (const key of Object.keys(DEALERS)) {
    const q = qOf(key);
    if (q != null && q > bestQ) {
      best = key;
      bestQ = q;
    }
  }
  return best ?? "vested";
}

const US = {
  basic: { name: "Global Investing Basic", each: (shares) => Math.max(2.99, 0.01 * shares), text: "2,99 $ par ordre jusqu'à 299 parts, 0,01 $ par part au-delà", remark: "" },
  silver: { name: "Global Investing Silver", each: (shares) => Math.max(0.99, 0.01 * shares), text: "0,99 $ par ordre jusqu'à 99 parts, 0,01 $ par part au-delà", remark: "₹3,999 a year." },
  gold: { name: "Global Investing Gold / Super Gold", each: (shares) => 0.01 * shares, text: "0,01 $ par part", remark: "₹13,999 a year, or ₹49,999 once for life." },
};

const SEC = 0.0000206;
const TAF = 0.000195;
const TAF_CAP = 9.79;

function usTariff(id) {
  const plan = US[id];
  const key = dealer();
  return {
    broker: "HDFC Securities",
    folder: "hdfcsec",
    catalogueUrl: CATALOGUE,
    url: US_PAGE,
    readOn: READ_ON,
    dealer: key,
    dealerName: DEALERS[key],
    commissionEach: ({ shares }) => plan.each(shares),
    gst: 0,
    sec: SEC,
    tafPerShare: TAF,
    tafCap: TAF_CAP,
    basis:
      `${plan.name} (Vested, VF Securities ; dépositaire DriveWealth), page relue le ${READ_ON} : ${plan.text}. ` +
      "SEC 0,00206 % de la vente et TAF 0,000195 $ par part vendue (plafond 9,79 $), chacun arrondi au cent supérieur : ni HDFC ni Vested n'impriment de frais réglementaires. CAT 0. Compte en dollars : pas de change forcé ; " +
      "change INR→USD 1,5 % au-dessus du taux interbancaire par le virement intégré de Vested (article de frais de Vested, colonne « Vested »), en remarque.",
    remark: () => [plan.remark, fxRemark("1.5", "USD")].filter(Boolean).join("\n"),
  };
}

const cents = (x) => Math.ceil(Math.round(x * 1e8) / 1e6) / 100;

// usRoundTrip adds SEC and TAF unrounded: each is rounded up to the cent
// here, and the total moves by the same amount.
function roundLevies(out) {
  const c = out?.commission;
  if (!c || c.sec == null || c.taf == null) return out;
  const sec = cents(c.sec);
  const taf = cents(c.taf);
  const delta = sec - c.sec + (taf - c.taf);
  return {
    ...out,
    usd: out.usd == null ? null : Number((out.usd + delta).toPrecision(12)),
    commission: { ...c, sec, taf },
    parts: out.parts ? { ...out.parts, levies: out.parts.levies == null ? null : Number((out.parts.levies + delta).toPrecision(12)) } : out.parts,
  };
}

export function roundTrip(query) {
  const id = String(query.plan || "").toLowerCase();
  if (goesToIndia(catalogueRows(CATALOGUE), query)) {
    const out = indiaTrip(INDIA[id] || INDIA.standard, query);
    return US[id] ? notThisPlan(out, `${US[id].name} ne tarife que les lignes US`) : out;
  }
  const out = roundLevies(usRoundTrip(usTariff(US[id] ? id : "basic"), query));
  return INDIA[id] ? notThisPlan(out, `le plan ${INDIA[id].name} ne tarife que NSE et BSE`) : out;
}

let called = false;
try {
  called = import.meta.url === pathToFileURL(process.argv[1]).href;
} catch {
  called = false;
}
if (called) console.log(JSON.stringify(roundTrip(cliArgs()), null, 2));
