// What one round trip costs at Tien Phong Securities (TPS, tpbs.com.vn): buy
// n shares, sell them back, in dollars. A share, a fund certificate or an
// ETF on HOSE, HNX or UPCOM.
//
// https://web-api.tpbs.com.vn/static/uploads/Bieu_phi_giao_dich_update_26.03.2026.pdf
// (linked from https://tpbs.com.vn/vi/san-pham-dich-vu/dich-vu-chung-khoan/bieu-phi-giao-dich)
// read on 2026-10-18.
//   Online, each side   0.15% of the fill, an order the client places
//              himself on iTrade or the mobile app. Placed any other way
//              it is 0.30% under 200 million dong, 0.25% to 500 million,
//              0.20% to 1 billion, then 0.15%. Not priced here.
//   Odd lot    0.3% of the odd-lot value, at least 20,000 dong, per
//              side. The board lot on HOSE, HNX and UPCOM is 100 shares,
//              so the shares past the last full hundred are an odd-lot
//              order and pay this line; the full hundreds pay 0.15%.
//              The shared helper has no odd-lot line, so this file adds
//              it on top of the helper's answer.
//   Sale tax   0.1% of the sale, the personal income tax TPS withholds
//              on every sale, gain or loss. The PDF prints it.
//   The cash line prints no separate exchange fee and no other floor,
//              so none is added.
//   Custody    0.27 dong a share a month. The months are not an input,
//              so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/tpbs/tpbs_cost.mjs VNM HOSE VND --shares=100 --price=57200
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, frPct, SALE_TAX } from "../../vietnamDelivery.mjs";
import { toUsd } from "../../fx.mjs";
import { finite } from "../../na.mjs";

const ONLINE = pct("0.15");
const ODD_LOT = pct("0.3");
const ODD_LOT_FLOOR = 20_000;
const BOARD_LOT = 100;

const SCHEDULE = {
  broker: "TPS",
  folder: "tpbs",
  catalogueUrl: new URL("tpbs-parsed.json", import.meta.url),
  url: "https://web-api.tpbs.com.vn/static/uploads/Bieu_phi_giao_dich_update_26.03.2026.pdf",
  readOn: "2026-10-18",
  rate: () => ONLINE,
  basis: "ordre passé soi-même sur iTrade ou l'appli",
  remark: "Custody is 0.27 VND a share a month.",
};

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

export function roundTrip(query) {
  const answer = vietnamRoundTrip(SCHEDULE, query);
  if (!answer.trade || answer.brokerFees == null) return answer;

  const { shares: n, price: p, notional, currency } = answer.trade;
  const odd = n % BOARD_LOT;
  if (!odd) return answer;

  // One side: the full hundreds at the online rate, the rest as an odd lot.
  const round = (n - odd) * p;
  const side = round * ONLINE + Math.max(odd * p * ODD_LOT, ODD_LOT_FLOOR);
  const ticket = side + side + notional * SALE_TAX;
  const brokerFees = dollars(ticket, currency);
  const bookUsd = answer.usd == null ? null : answer.usd - answer.brokerFees;
  const usd = bookUsd == null || brokerFees == null ? null : bookUsd + brokerFees;
  const rate = Number((side / notional).toPrecision(12));

  return {
    ...answer,
    basis: `${answer.basis.split(" Achat ")[0]} ${odd} parts en lot impair à ${frPct(ODD_LOT)}, au moins ${ODD_LOT_FLOOR} VND par sens. Achat ${frPct(rate)}. Vente ${frPct(rate)}, plus ${frPct(SALE_TAX)} d'impôt sur la cession.`,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: { buy: rate, sell: Number((rate + SALE_TAX).toPrecision(12)), currency },
  };
}

printCli(import.meta.url, roundTrip);
