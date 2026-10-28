// What one round trip costs at Valuable Capital (華盛証券, Hong Kong; the
// Vbkr / 華盛通 app): buy n shares at price p, sell them straight back, in
// dollars. Online order on the fixed platform-fee plan (固定方案), the plan
// an account opens on; the tiered plan (新階梯收費方案) costs more until the
// month's order or share count is large, and is a choice made in the app.
// Phone orders, margin, short selling, IPOs, options and grey market stay out.
//
// Fee pages read on 2026-10-26:
//   Hong Kong stocks and ETFs ("港股買賣交易收費"), each side
//     commission 0.03 % of the order, minimum 3 HKD ("免佣期內不收取": the
//     commission-free period is the remark)
//     platform fee 15 HKD an order (fixed plan)
//     stamp 0.1 %, a part of a dollar counts as one HKD (0 on an ETF; the
//     REIT exemption is the statute's, ../primehk/hkexCost.mjs)
//     SFC 0.0027 %, HKEX 0.00565 %, AFRC 0.00015 %, each at least 0.01 HKD
//     CCASS settlement 0.0042 % (from 30 Jun 2025, no floor or cap)
//     A USD or RMB counter takes the 3 and 15 HKD at their equivalent.
//     https://www.valuable.com.hk/help/topic2-hong-kong-stock-trading-fees
//   China Connect A shares ("A股通買賣交易收費"), each side
//     commission 0.03 %, minimum 3 RMB; platform fee 15 RMB an order
//     stamp 0.05 % on the sale, handling 0.00341 %, CSRC 0.002 %, transfer
//     0.003 % (ChinaClear and HKSCC); each line to two decimals (四捨五入).
//     The ETF page ("A股通ETF買賣交易收費") prints the same commission and
//     platform fee; an ETF pays the statutory ETF lines (handling 0.004 %,
//     HKSCC 0.002 %, no CSRC, ChinaClear or stamp).
//     The 0.008 % a year portfolio fee is not per trade.
//     https://www.valuable.com.hk/help/topic2-a-share-connect-fees-of-vbrokers-a-share-connect
//   US stocks and ETFs ("美股買賣交易收費"), each side, every line rounded to
//   the cent (四捨五入)
//     commission 0.0049 USD a share, minimum 0.99 USD, at most 0.5 % of the
//     order; platform fee 0.005 USD a share, minimum 1 USD, at most 0.5 %.
//     Where the 0.5 % cap is under the floor, the floor is charged (as the
//     page's own example charges 0.99 for a 0.49 commission).
//     settlement 0.003 USD a share, minimum 0.01 (US clearing, with the levies)
//     SEC 0.00206 % of the sale, minimum 0.01
//     TAF 0.000195 USD a share sold, 0.01 to 9.79, waived 1 Oct - 31 Dec 2026
//     CAT 0.000003 USD a share, minimum 0.01, each side
//     https://www.valuable.com.hk/help/topic2-us-stock-trading-fees
//
// Cash: HKD, USD and CNH (deposits.mjs), so no line is converted; Valuable
// prints no FX margin, so there is no FX remark. Valuable names no US
// broker-dealer on these pages: the US book is the quoted NBBO.
//
//   node brokers/valuable/valuable_cost.mjs 00700 HKEX HKD --shares=100 --price=400
//   node brokers/valuable/valuable_cost.mjs 02800 HKEX HKD --shares=500 --price=25
//   node brokers/valuable/valuable_cost.mjs 600519 "Shanghai Stock Exchange" CNH --shares=100 --price=1500
//   node brokers/valuable/valuable_cost.mjs AAPL XNAS USD --shares=100 --price=9.78
//
// `roundTrip(...)` reads files, not the network.

import { hkexRoundTrip } from "../primehk/hkexCost.mjs";
import { usRoundTrip } from "../wellstrade/usCost.mjs";
import { adjust, cashOf, cents, connectRoundTrip, engineOf, printCli } from "../bocomhk/hkMarketsCost.mjs";

const FOLDER = "valuable";
const CATALOGUE = new URL("valuable-parsed.json", import.meta.url);
const READ_ON = "2026-10-26";
const PAGES = {
  HK: "https://www.valuable.com.hk/help/topic2-hong-kong-stock-trading-fees",
  CN: "https://www.valuable.com.hk/help/topic2-a-share-connect-fees-of-vbrokers-a-share-connect",
  US: "https://www.valuable.com.hk/help/topic2-us-stock-trading-fees",
};
const CASH = cashOf(FOLDER);
const CHANNEL = "ordre en ligne (appli), forfait de plateforme fixe";

const HK = {
  broker: "Valuable",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGES.HK,
  readOn: READ_ON,
  channel: CHANNEL,
  commission: { rate: 0.0003, min: 3 },
  perOrder: 15,
  settlement: { rate: 0.000042, label: "frais de règlement CCASS" },
  cash: CASH,
  fxEach: null,
  remark: "Commission is 0 during the commission-free period.",
};

const CN = {
  broker: "Valuable",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGES.CN,
  readOn: READ_ON,
  channel: CHANNEL,
  commission: { rate: 0.0003, min: 3 },
  perOrder: 15,
  round: "cent",
  cash: CASH,
  fxEach: null,
};

const usCents = (x) => Math.round(x * 100 + 1e-9) / 100;
// One side: commission and platform, each floored and capped at 0.5 %.
function usSide(shares, notional) {
  const cap = notional * 0.005;
  const commission = Math.max(0.99, Math.min(usCents(shares * 0.0049), cap));
  const platform = Math.max(1, Math.min(usCents(shares * 0.005), cap));
  return cents(commission + platform);
}
const clearingSide = (shares) => Math.max(0.01, usCents(shares * 0.003));

const US = {
  broker: "Valuable",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGES.US,
  readOn: READ_ON,
  entity: "Valuable Capital Limited",
  rule606: null,
  cash: "USD",
  ticket: ({ shares, notional }) => {
    const side = cents(usSide(shares, notional) + clearingSide(shares));
    return { buy: side, sell: side };
  },
  levies: { sec: "penny", taf: "penny", cat: { perShare: 0.000003, mode: "penny" } },
  basis: `ordre en ligne, forfait de plateforme fixe, barème Valuable relu le ${READ_ON}. Courtage 0,0049 USD par action (0,99 à 0,5 % de l'ordre), plateforme 0,005 USD par action (1 USD à 0,5 %), le plancher l'emportant sur le plafond ; frais de règlement 0,003 USD par action (plancher 0,01) ; SEC 0,00206 % de la vente, TAF 0,000195 USD par action vendue (suspendue du 1er octobre au 31 décembre 2026), CAT 0,000003 USD par action, chacun au moins 0,01 USD. Vente identique.`,
  notes: ["aucun courtier américain nommé : NBBO coté"],
};

export function roundTrip(query) {
  const market = engineOf(CATALOGUE, query);
  if (market === "CN") return connectRoundTrip(CN, query);
  if (market === "US") {
    const out = usRoundTrip(US, query);
    const n = Number(query.shares);
    if (!(n > 0) || out.brokerFees == null) return out;
    // The 0.003 USD a share is the US clearing's, not Valuable's: it moves
    // from the ticket to the levies.
    const clearing = clearingSide(n) * 2;
    return adjust(out, { broker: -clearing, levy: clearing, buy: -clearingSide(n), sell: -clearingSide(n), note: `frais de règlement ${cents(clearing)} USD (aller-retour) avec les prélèvements` });
  }
  return hkexRoundTrip(HK, query);
}

export const SCHEDULE = { pages: PAGES, readOn: READ_ON, hk: HK, cn: CN, us: US };

printCli(import.meta.url, roundTrip);
