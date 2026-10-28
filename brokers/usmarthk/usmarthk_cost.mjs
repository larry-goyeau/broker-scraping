// What one round trip costs at uSMART Securities (盈立證券, Hong Kong; uSmart
// Securities Limited): buy n shares at price p, sell them straight back, in
// dollars. App order on the Standard Account and its standard commission
// plan, the account a client opens on. The uSMART Trader Account (holders of
// a valid Hong Kong identity document) and the promotional "Designated
// Individual Standard Account" price lower: that is the remark. The PRO
// account, the high-frequency plans, algorithm trading, phone orders,
// margin, grey market and IPOs stay out.
//
// https://hk.usmartglobal.com/en/charges, read on 2026-10-26:
//   Hong Kong stocks and ETFs, each side
//     commission 0.03 % of the order, no minimum; platform fee 12 HKD
//     stamp 0.1 %, a part of a dollar counts as one HKD (0 on an ETF or a REIT)
//     HKEX trading fee 0.00565 % (minimum 0.01), SFC 0.0027 %, AFRC 0.00015 %,
//     HKSCC settlement 0.0042 %
//     The "Selected Hong Kong ETFs" at 0 commission and 0 platform fee are a
//     time-limited promotion with no published list: not priced.
//     Trader Account: commission 0 %, platform 12 HKD.
//   A-shares (Stock Connect), each side, in RMB
//     commission 0.02 % (APP Trade), minimum 5 RMB; platform fee 12 RMB
//     handling 0.00341 %, CSRC 0.002 %, ChinaClear 0.001 %, HKSCC 0.002 %,
//     each at least 0.01; stamp 0.05 % on the sale. The page prints no ETF
//     line, so an ETF pays the statutory ETF lines (handling 0.004 %, HKSCC
//     0.002 %, no CSRC, ChinaClear or stamp). The 0.008 % portfolio fee is
//     not per trade.
//   US exchange-listed stocks and ETFs, Standard Account, each side
//     commission 0; platform fee 0.009 USD a share, minimum 1.88 USD,
//     capped at 1 % of the order ("If this conflicts with the minimum fee,
//     the minimum fee applies")
//     Designated Individual Standard Account (Hong Kong customers, and
//     others within 180 days of opening): 0.99 USD an order on a stock
//     priced 100 USD or more, the standard line below that.
//     Trader Account standard fees: 0.005 USD a share, minimum 1 USD, cap 1 %.
//     A fraction of a share: 0.99 USD an order.
//   US OTC stocks, each side
//     commission 0; platform fee 0.019 USD a share, minimum 6 USD, at most
//     2 % of the order (the minimum prevailing, as on the listed line)
//   US levies, every US line
//     settlement fee 0.003 USD a share, minimum 0.01, at most 3 % of the
//     order, each side ("The Depository Trust & Clearing Corporation (DTCC)
//     and uSMART"): with the levies
//     SEC 0.00206 % of the sale, minimum 0.01; TAF printed as 0;
//     CAT 0.000003 USD a share, minimum 0.01, each side
//   The French / Italian FTT on an ADR purchase comes from the tax map.
//
// Cash: HKD, USD and CNH (deposits.mjs), so no line is converted. uSMART
// prints no FX margin, so there is no FX remark. uSMART names no US
// broker-dealer (the transfer page gives only DTC participant numbers,
// 3856 for the cash account): the US book is the quoted NBBO. OTC lines
// keep the OTC Markets touch.
//
//   node brokers/usmarthk/usmarthk_cost.mjs 00700 HKEX HKD --shares=100 --price=400
//   node brokers/usmarthk/usmarthk_cost.mjs 02800 HKEX HKD --shares=500 --price=25
//   node brokers/usmarthk/usmarthk_cost.mjs 600519 "Shanghai Stock Exchange" CNH --shares=100 --price=1500
//   node brokers/usmarthk/usmarthk_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/usmarthk/usmarthk_cost.mjs AAGAF "OTC Markets" USD --shares=1000 --price=0.5
//
// `roundTrip(...)` reads files, not the network.

import { hkexRoundTrip } from "../primehk/hkexCost.mjs";
import { usRoundTrip } from "../wellstrade/usCost.mjs";
import { addRemark, adjust, cashOf, cents, connectRoundTrip, engineOf, pctOf, printCli } from "../bocomhk/hkMarketsCost.mjs";

const FOLDER = "usmarthk";
const CATALOGUE = new URL("usmarthk-parsed.json", import.meta.url);
const READ_ON = "2026-10-26";
const PAGE = "https://hk.usmartglobal.com/en/charges";
const CASH = cashOf(FOLDER);
const CHANNEL = "ordre par l'appli, compte Standard, formule de courtage standard";

const HK = {
  broker: "uSMART",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  channel: CHANNEL,
  commission: { rate: 0.0003, min: 0 },
  perOrder: 12,
  settlement: { rate: 0.000042, label: "frais de règlement HKSCC" },
  cash: CASH,
  fxEach: null,
};

const CN = {
  broker: "uSMART",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  channel: CHANNEL,
  commission: { rate: 0.0002, min: 5 },
  perOrder: 12,
  round: "cent-min",
  cash: CASH,
  fxEach: null,
};

const usCents = (x) => Math.round(x * 100 + 1e-9) / 100;
// A platform line: per share, a floor, a cap as a share of the order; the
// floor wins over the cap.
const platform = (shares, notional, { perShare, min, cap }) => Math.max(min, Math.min(usCents(shares * perShare), notional * cap));
const STANDARD = { perShare: 0.009, min: 1.88, cap: 0.01 };
const TRADER = { perShare: 0.005, min: 1, cap: 0.01 };
const OTC = { perShare: 0.019, min: 6, cap: 0.02 };
const clearingSide = (shares, notional) => Math.min(notional * 0.03, Math.max(0.01, usCents(shares * 0.003)));

function usTicket({ shares, notional, otc, fractional }) {
  if (fractional && shares < 1) return 0.99;
  return cents(platform(shares, notional, otc ? OTC : STANDARD));
}

const US = {
  broker: "uSMART",
  folder: FOLDER,
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  entity: "uSmart Securities Limited",
  rule606: null,
  cash: "USD",
  ticket: (ctx) => {
    const side = cents(usTicket(ctx) + clearingSide(ctx.shares, ctx.notional));
    return { buy: side, sell: side };
  },
  levies: { sec: "penny", taf: false, cat: { perShare: 0.000003, mode: "penny" } },
  basis: ({ otc }) =>
    otc
      ? `ordre par l'appli, barème uSMART relu le ${READ_ON}. OTC : pas de commission, plateforme 0,019 USD par action, plancher 6 USD, plafond 2 % de l'ordre (le plancher l'emporte) ; frais de règlement 0,003 USD par action (0,01 USD à 3 % de l'ordre) ; SEC 0,00206 % de la vente et CAT 0,000003 USD par action, chacun au moins 0,01 USD ; TAF imprimée à 0. Vente identique.`
      : `ordre par l'appli, compte Standard, barème uSMART relu le ${READ_ON}. Pas de commission, plateforme 0,009 USD par action, plancher 1,88 USD, plafond 1 % de l'ordre (le plancher l'emporte) ; frais de règlement 0,003 USD par action (0,01 USD à 3 % de l'ordre) ; SEC 0,00206 % de la vente et CAT 0,000003 USD par action, chacun au moins 0,01 USD ; TAF imprimée à 0. Vente identique.`,
  notes: ["aucun courtier américain nommé : NBBO coté (ligne cotée), fourchette OTC Markets (ligne OTC)"],
};

function usRemark(out, n, p) {
  if (!out.trade || out.listing?.mic === "OTCM" || !(n >= 1)) return "";
  const notional = n * p;
  const standard = platform(n, notional, STANDARD);
  if (p >= 100) {
    const gap = pctOf((standard - 0.99) * 2, standard * 2);
    return gap ? `Fees might be ${gap}% lower if you are a Hong Kong customer or opened the account in the last 180 days.` : "";
  }
  const gap = pctOf((standard - platform(n, notional, TRADER)) * 2, standard * 2);
  return gap ? `Fees might be ${gap}% lower if you hold a valid Hong Kong identification document.` : "";
}

export function roundTrip(query) {
  const market = engineOf(CATALOGUE, query);
  const n = Number(query.shares);
  const p = Number(query.price);
  if (market === "CN") return connectRoundTrip(CN, query);
  if (market === "US") {
    let out = usRoundTrip(US, query);
    if (n > 0 && p > 0 && out.brokerFees != null) {
      // The settlement fee is the DTCC's line: it moves to the levies.
      const side = clearingSide(n, n * p);
      out = adjust(out, { broker: -side * 2, levy: side * 2, buy: -side, sell: -side, note: `frais de règlement ${cents(side * 2)} USD (aller-retour) avec les prélèvements` });
    }
    return addRemark(out, n > 0 && p > 0 ? usRemark(out, n, p) : "");
  }
  const out = hkexRoundTrip(HK, query);
  if (!(n > 0 && p > 0) || !out.trade) return out;
  // Trader Account: no commission, the same 12 HKD platform fee.
  const gap = pctOf((out.commission?.brokerage || 0) * 2, (out.commission?.buy || 0) + (out.commission?.sell || 0));
  return addRemark(out, gap ? `Fees might be ${gap}% lower if you hold a valid Hong Kong identification document.` : "");
}

export const SCHEDULE = { page: PAGE, readOn: READ_ON, hk: HK, cn: CN, us: US };

printCli(import.meta.url, roundTrip);
