// What one round trip costs at EBSI Direct (formerly SHK Direct; China
// Everbright Securities International's online brokerage, Hong Kong): buy n
// shares at price p, sell them straight back, in dollars. Online order. Phone
// orders (HKD 20 surcharge), grey market, margin, options and futures stay
// out.
//
// Two rows on Hong Kong shares (`query.plan`):
//   standard  Basic Commission, the default: 0.138 %, minimum HKD 88 (monthly
//             turnover under HKD 13.8 million; the lower turnover bands are
//             the remark)
//   aycpro    HK Shares AYCT Pro Program: HKD 6,888 a month (the remark),
//             0.038 %, no minimum
// China Connect and US lines price the same on both.
//
// "EBSI Direct Fees and Charges" (effective 7 October 2026), read on
// 2026-10-26:
//   A. HK shares, each side
//     Basic Commission by monthly turnover: under HKD 13.8 million 0.138 %,
//     HKD 13.8 to 30 million 0.108 %, over HKD 30 million 0.088 %; minimum
//     HKD 88 a transaction. "If the trade is not settled in HKD, monthly
//     turnover and minimum commission will be calculated in HKD equivalent."
//     stamp 0.10 % (rounded up to the nearest dollar; 0 on an ETF or a REIT)
//     SFC 0.0027 %, HKEX trading fee 0.00565 %, CCASS settlement 0.0042 %,
//     AFRC 0.00015 %
//   B. China Connect A shares, each side
//     commission 0.138 %, minimum RMB 88
//     handling 0.00341 % (ETF 0.004 %), securities management 0.002 % (ETF
//     waived), transfer ChinaClear 0.001 % (ETF waived) and HKSCC 0.002 %,
//     stamp 0.05 % on the sale (ETF waived). Portfolio fee not per trade.
//   D. US shares, UStock Pro (the online platform open to new clients;
//     US Trader II is "for existing US Trader II client only"), each side
//     commission 0.138 % (USD), minimum USD 15
//     SEC fee 0.00206 % of the sale. No TAF or CAT line: 0.
//   https://download.ebshk.com/fees/pricing-table-os-en.pdf
//   https://www.ebshkdirect.com/en/info-fees
//
// Cash: HKD, USD and CNH (deposits.mjs, owner 2026-10-26: the account
// switches between currencies and pays out USD and RMB). A USD or RMB line
// is paid from that cash, so no FX enters the total. EBSI converts at its
// real-time rate with "no commissions or extra charges" and prints no
// spread, so there is no FX figure to show.
//   https://www.ebshkdirect.com/en/investment-Foreign+Exchange+Services
// EBSI names no US broker-dealer for UStock Pro: the US book is the quoted
// NBBO.
//
//   node brokers/shkdirect/shkdirect_cost.mjs 00700 HKEX HKD --shares=100 --price=400
//   node brokers/shkdirect/shkdirect_cost.mjs 00700 HKEX HKD --shares=100 --price=400 --plan=aycpro
//   node brokers/shkdirect/shkdirect_cost.mjs 02800 HKEX HKD --shares=500 --price=25
//   node brokers/shkdirect/shkdirect_cost.mjs 600519 "Shanghai Stock Exchange" CNH --shares=100 --price=1500
//   node brokers/shkdirect/shkdirect_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { hkexRoundTrip } from "../primehk/hkexCost.mjs";
import { usRoundTrip } from "../wellstrade/usCost.mjs";
import { addRemark, cashOf, cents, connectRoundTrip, engineOf, pctOf, printCli } from "../bocomhk/hkMarketsCost.mjs";
import { usdPer } from "../../fx.mjs";

const FOLDER = "shkdirect";
const CATALOGUE = new URL("shkdirect-parsed.json", import.meta.url);
const READ_ON = "2026-10-26";
const PAGE = "https://download.ebshk.com/fees/pricing-table-os-en.pdf";
const CASH = cashOf(FOLDER);

export const PLANS = {
  standard: { rate: 0.00138, min: 88, label: "Basic Commission" },
  aycpro: { rate: 0.00038, min: 0, monthly: 6888, label: "HK Shares AYCT Pro" },
};
const planOf = (plan) => (PLANS[String(plan || "").toLowerCase()] ? String(plan).toLowerCase() : "standard");
// Lower turnover bands of the Basic Commission.
const BANDS = [
  { from: "HKD 13.8 million or more", rate: 0.00108 },
  { from: "over HKD 30 million", rate: 0.00088 },
];

const hkSchedule = (id) => ({
  broker: "EBSI Direct",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  channel: `ordre en ligne, ${PLANS[id].label}${PLANS[id].monthly ? ` (${PLANS[id].monthly} HKD par mois)` : ""}`,
  commission: { rate: PLANS[id].rate, min: PLANS[id].min },
  settlement: { rate: 0.000042, label: "frais de règlement CCASS" },
  cash: CASH,
  fxEach: null,
});

const CN = {
  broker: "EBSI Direct",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  channel: "ordre en ligne",
  commission: { rate: 0.00138, min: 88 },
  cash: CASH,
  fxEach: null,
};

const US = {
  broker: "EBSI Direct",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  entity: "China Everbright Securities (HK) Limited",
  rule606: null,
  cash: "USD",
  ticket: ({ notional }) => Math.max(15, cents(notional * 0.00138)),
  levies: { sec: "nearest", taf: false, cat: false },
  basis: `ordre en ligne (UStock Pro), barème EBSI Direct relu le ${READ_ON}. Courtage 0,138 %, plancher 15 USD ; SEC 0,00206 % de la vente ; pas de TAF ni de CAT imprimée. Vente identique.`,
  notes: ["aucun courtier américain nommé : NBBO coté", "compte en HKD, USD et CNH : pas de change dans le total ; écart de change EBSI non publié"],
};

function bandRemark(out) {
  const notional = out.trade.notional;
  const ccy = out.trade.currency;
  const min = ccy === "HKD" ? 88 : (88 * usdPer("HKD")) / usdPer(ccy);
  const side = (rate) => Math.max(min, cents(notional * rate));
  const base = side(PLANS.standard.rate);
  // The cut on the Basic Commission of the trip.
  const gaps = BANDS.map((b) => pctOf((base - side(b.rate)) * 2, base * 2));
  if (!gaps.some(Boolean)) return "";
  return `${BANDS[0].from} traded a month: fees are ${gaps[0]}% lower; ${BANDS[1].from}: ${gaps[1]}% lower.`;
}

export function roundTrip(query) {
  const plan = planOf(query.plan);
  const market = engineOf(CATALOGUE, query);
  if (market === "CN") return { ...connectRoundTrip(CN, query), plan };
  if (market === "US") return { ...usRoundTrip(US, query), plan };
  const out = { ...hkexRoundTrip(hkSchedule(plan), query), plan };
  if (plan === "aycpro") return addRemark(out, `AYCT Pro is HKD ${PLANS.aycpro.monthly.toLocaleString("en-US")} a month.`);
  return out.trade ? addRemark(out, bandRemark(out)) : out;
}

export const SCHEDULE = { page: PAGE, readOn: READ_ON, plans: PLANS, bands: BANDS, cn: CN, us: US };

printCli(import.meta.url, roundTrip);
