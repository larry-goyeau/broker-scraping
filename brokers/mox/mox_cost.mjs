// What one round trip costs at Mox Invest (Mox Bank, Hong Kong): buy n
// shares at price p, sell them straight back, in dollars. App order, at the
// Basic Invest tier: the tier of a client whose month's Mox Invest volume is
// up to HKD 100,000. The higher tiers are activity tiers (the month's
// aggregate buys and sells, Hong Kong and US together, or the fund
// holdings), so they are the remark. Systematic Investment Plans, virtual
// assets, funds and the Core Portfolio stay out.
//
// "Mox Invest fees and charges", last updated 16 March 2026, read on
// 2026-10-26:
//   Hong Kong stocks and ETFs, each side
//     commission by Invest tier (% of the transaction amount, minimum
//     HKD 35 an order): Basic 0.18 %, Advanced 0.15 %, Pro 0.12 %,
//     Elite 0.10 %. "There is no trading commission for odd lot orders": a
//     quantity that is not a whole number of board lots (`lot` of the row,
//     HKEX's List of Securities) pays commission on the board-lot part only,
//     and nothing when it is under one lot.
//     Settlement fee (HKEX), stamp duty, trading fee, SFC and AFRC levies:
//     "Subject to the latest applicable rules and charges of the third
//     party", so the statutory rates of ../primehk/hkexCost.mjs and the
//     HKSCC settlement fee, 0.0042 % since 30 Jun 2025. No stamp on an ETF.
//     A USD counter takes the HKD 35 at its equivalent.
//   US stocks and ETFs, each side
//     commission per share by Invest tier, minimum USD 10 an order:
//     Basic 0.015, Advanced 0.013, Pro 0.011, Elite 0.009 USD; a quantity
//     under one share is USD 1 an order.
//     SEC transaction fee and FINRA trading activity fee on the sale,
//     "Subject to the latest applicable rules" (../wellstrade/usCost.mjs:
//     SEC 0.00206 % since 4 Apr 2026, TAF waived 1 Oct - 31 Dec 2026). No CAT
//     line is printed: 0.
//   Invest tiers by Monthly Aggregate Transaction Volume: Basic up to
//   HKD 100,000, Advanced over HKD 100,000, Pro over HKD 500,000, Elite over
//   HKD 1,500,000.
//   Custody is waived.
//   https://mox.com/static/260316_Mox_Invest_Fees_and_Charges.pdf
//
// Cash: HKD and USD (deposits.mjs); the catalogue holds no RMB counter, so
// no line is converted. A USD line gets the FX remark: Mox's "General Fees
// and Charges" (16 March 2026, read on 2026-10-26), "Fees relating to
// currency exchanges": "Currency exchange fee The higher of: 1. up to 2% of
// the actual selling amount (the percentage will vary depending on the
// currency pair); and 2. the smallest denomination of the selling currency
// [...] or USD0.01 or its equivalent". The HKD/USD percentage is shown only
// in the app, so the remark prints the ceiling as Mox words it.
//   https://mox.com/static/260316_General_Fees_and_Charges.pdf
// The Mox Invest schedule names no US broker-dealer ("Broker" means any
// person Mox appoints): the US book is the quoted NBBO.
//   https://mox.com/static/260331_Mox_Invest_Schedule.pdf
//
//   node brokers/mox/mox_cost.mjs 00700 HKEX HKD --shares=100 --price=400
//   node brokers/mox/mox_cost.mjs 00700 HKEX HKD --shares=150 --price=400
//   node brokers/mox/mox_cost.mjs 02800 HKEX HKD --shares=500 --price=25
//   node brokers/mox/mox_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/mox/mox_cost.mjs F XNYS USD --shares=2000 --price=12
//
// `roundTrip(...)` reads files, not the network.

import { hkexRoundTrip } from "../primehk/hkexCost.mjs";
import { usRoundTrip } from "../wellstrade/usCost.mjs";
import { addRemark, adjust, cashKey, cashOf, cents, engineOf, pctOf, printCli } from "../bocomhk/hkMarketsCost.mjs";
import { fxRemark, toUsd, usdPer } from "../../fx.mjs";

const FOLDER = "mox";
const CATALOGUE = new URL("mox-parsed.json", import.meta.url);
const READ_ON = "2026-10-26";
const PAGE = "https://mox.com/static/260316_Mox_Invest_Fees_and_Charges.pdf";
const CASH = cashOf(FOLDER);

// Each tier: Hong Kong rate, US rate a share. Basic is priced.
export const TIERS = {
  basic: { hk: 0.0018, us: 0.015 },
  advanced: { hk: 0.0015, us: 0.013, over: 100000 },
  pro: { hk: 0.0012, us: 0.011, over: 500000 },
  elite: { hk: 0.001, us: 0.009, over: 1500000 },
};
const HK_MIN = 35;
const US_MIN = 10;
// Currency exchange fee, General Fees and Charges: "up to 2%", by currency
// pair; a range at the bank's discretion, so its maximum (owner's rule).
const FX_PAGE = "https://mox.com/static/260316_General_Fees_and_Charges.pdf";
const FX_PCT = "2";

const HK = {
  broker: "Mox",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  channel: "ordre par l'appli Mox, palier Basic",
  commission: { rate: TIERS.basic.hk, min: HK_MIN },
  settlement: { rate: 0.000042, label: "frais de règlement HKSCC" },
  cash: CASH,
  fxEach: null,
};

const usSide = (shares, rate) => (shares < 1 ? 1 : Math.max(US_MIN, cents(shares * rate)));

const US = {
  broker: "Mox",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  entity: "Mox Bank Limited",
  rule606: null,
  cash: "USD",
  ticket: ({ shares }) => usSide(shares, TIERS.basic.us),
  levies: { sec: "nearest", taf: "nearest", cat: false },
  basis: `ordre par l'appli Mox, palier Basic, barème Mox relu le ${READ_ON}. Commission 0,015 USD par action, plancher 10 USD par ordre (1 USD sous une action) ; SEC et TAF à la vente au tarif des régulateurs (TAF suspendue du 1er octobre au 31 décembre 2026) ; pas de CAT imprimée. Vente identique.`,
  notes: ["aucun courtier américain nommé : NBBO coté"],
};

// "Over HKD 100,000 traded a month: fees are x% lower; over HKD 1,500,000:
// y% lower.", x and y the cut on the Basic commission of the trip.
function tierRemark(trip) {
  const a = pctOf(trip.basic - trip.advanced, trip.basic);
  const b = pctOf(trip.basic - trip.elite, trip.basic);
  if (!a && !b) return "";
  return `Over HKD 100,000 traded a month: fees are ${a}% lower; over HKD 1,500,000: ${b}% lower.`;
}

function hkTrip(out, n, p) {
  const ccy = out.trade.currency;
  const lot = out.lot;
  const board = lot ? n - (n % lot) : n;
  const minLocal = ccy === "HKD" ? HK_MIN : (HK_MIN * usdPer("HKD")) / usdPer(ccy);
  const side = (rate) => (board > 0 ? Math.max(minLocal, cents(board * p * rate)) : 0);
  return {
    sideBasic: cents(side(TIERS.basic.hk)),
    basic: side(TIERS.basic.hk) * 2,
    advanced: side(TIERS.advanced.hk) * 2,
    elite: side(TIERS.elite.hk) * 2,
    board,
  };
}

// A held currency other than HKD: "FX 2% when cash ≠ USD."
function withFx(out) {
  const ccy = out?.listing?.currency || out?.trade?.currency;
  if (!ccy || cashKey(ccy) === "HKD" || !CASH.includes(cashKey(ccy))) return out;
  return addRemark(out, fxRemark(FX_PCT, ccy));
}

export function roundTrip(query) {
  return withFx(priced(query));
}

function priced(query) {
  const market = engineOf(CATALOGUE, query);
  const n = Number(query.shares);
  const p = Number(query.price);
  if (market === "US") {
    const out = usRoundTrip(US, query);
    if (!(n > 0 && p > 0) || !out.trade) return out;
    const trip = {
      basic: usSide(n, TIERS.basic.us) * 2,
      advanced: usSide(n, TIERS.advanced.us) * 2,
      elite: usSide(n, TIERS.elite.us) * 2,
    };
    return addRemark(out, tierRemark(trip));
  }
  let out = hkexRoundTrip(HK, query);
  if (!(n > 0 && p > 0) || !out.trade || out.commission?.brokerage == null) return out;
  const trip = hkTrip(out, n, p);
  // Odd lot: no commission on the part that is not a whole board lot.
  const delta = trip.sideBasic - out.commission.brokerage;
  if (Math.abs(delta) > 1e-9) {
    out = adjust(out, {
      broker: delta * 2,
      buy: delta,
      sell: delta,
      note: trip.board > 0
        ? `rompu de ${n - trip.board} sans commission : commission sur ${trip.board} actions`
        : "ordre en rompu : pas de commission",
    });
    out = { ...out, commission: { ...out.commission, brokerage: trip.sideBasic } };
  }
  return addRemark(out, tierRemark(trip));
}

export const SCHEDULE = { page: PAGE, fxPage: FX_PAGE, fxPct: FX_PCT, readOn: READ_ON, tiers: TIERS, hk: HK, us: US, toUsd };

printCli(import.meta.url, roundTrip);
