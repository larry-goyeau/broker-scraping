// Cash round trip on the Nepal Stock Exchange (XNEP, NPR) for the NEPSE
// members whose cost files sit beside this one (Online Securities, Secured,
// NIMB, Agrawal, Linch, Midas, ... see the header of each broker file). A
// thin layer on ../kumari/nepseDelivery.mjs: the listing lookup, the book,
// FX and the output shape are that module's; this one only adds the few
// page shapes the NEPSE members print that it does not take.
//
// Market-wide figures (the SEBON commission cap, effective Jestha 1, 2081 =
// 14 May 2024, the 10 % cut; https://www.sharesansar.com/newsdetail/sebon-to-enact-revised-commission-rates-for-stockbrokers-implementation-begins-today-2024-05-14):
//   Rs 50,000 or less 0.36 %, to Rs 5 lakh 0.33 %, to Rs 20 lakh 0.31 %,
//   to Rs 1 crore 0.27 %, above 0.24 % (NEPSE_BANDS below). The commission
//   already holds NEPSE's 20 % and SEBON's 0.6 % regulatory share
//   (https://ssl.com.np/trading-commission-and-fees: "79.4% broker
//   commission, 20% NEPSE exchange commission, and 0.6% SEBON"), so those
//   are never added.
//   SEBON transaction fee 0.015 % of the amount, equity, each side.
//   CDSC/DP transfer charge Rs 25 per scrip per transfer day, each side
//   (the broker calculators add it to the buy and to the sell).
//   Capital gains tax is on the gain: a round trip at one price has none.
//
// schedule: the nepseDelivery schedule ({ broker, folder, catalogueUrl,
// url, readOn, bands, sebon, dp, remark }) plus, all optional:
//   minimum      floor in rupees on the brokerage of each order
//                ("0.36% or Rs 10 whichever is higher", "minimum Rs 25")
//   flat         { upTo, fee }: a flat brokerage of `fee` rupees for an
//                order of `upTo` rupees or less ("Upto Rs 2,500 Flat Rs
//                10"); above it the band rate alone applies
//   dpSellOnly   the DP charge is taken on the sell alone
//   marketWide   ["sebon"], ["dp"] or both: the page does not print that
//                fee, it is taken at the market-wide figure (said in
//                `confidence`)
//
// nepseCost(schedule, query) returns what nepseRoundTrip returns, with the
// brokerage, brokerFees, usd, commission and parts recomputed for these
// options, and the basis/confidence wording fixed (no Kumari bond-floor
// sentence for a broker whose page says nothing of the kind).

import { nepseRoundTrip, printCli, frPct } from "../kumari/nepseDelivery.mjs";
import { toUsd } from "../../fx.mjs";
import { plus, finite } from "../../na.mjs";

export { printCli, frPct };

// Upper bound of the band in rupees (inclusive) and its rate.
export const NEPSE_BANDS = Object.freeze([
  { upTo: 50_000, rate: 0.0036 },
  { upTo: 500_000, rate: 0.0033 },
  { upTo: 2_000_000, rate: 0.0031 },
  { upTo: 10_000_000, rate: 0.0027 },
  { upTo: Infinity, rate: 0.0024 },
]);
export const SEBON_FEE = 0.00015;
export const DP_CHARGE = 25;

const KUMARI_FLOOR =
  "aucun minimum publié pour les actions (le plancher de 10 NPR de la page vaut pour les obligations et les fonds)";
const nprUsd = (amount) => {
  const v = toUsd(amount, "NPR");
  return v == null ? null : Number(v.toPrecision(12));
};
const fr = (x) => String(Math.round(x * 100) / 100).replace(".", ",");

export function nepseCost(schedule, query) {
  const minimum = schedule.minimum || 0;
  const flat = schedule.flat || null;
  const dpSides = schedule.dpSellOnly ? 1 : 2;
  const marketWide = new Set(schedule.marketWide || []);
  const answer = nepseRoundTrip(schedule, query);

  const floorWords = [
    flat ? `forfait ${flat.fee} NPR par ordre jusqu'à ${flat.upTo.toLocaleString("fr-FR")} NPR` : null,
    minimum ? `minimum ${minimum} NPR par ordre` : null,
  ].filter(Boolean);
  const words = (text) => {
    if (!text) return text;
    let out = text;
    if (floorWords.length) out = out.replace(", chaque sens ; frais SEBON", `, ${floorWords.join(", ")}, chaque sens ; frais SEBON`);
    if (dpSides === 1) {
      out = out.replace(`et frais DP ${schedule.dp} NPR, chaque sens.`, `chaque sens ; frais DP ${schedule.dp} NPR à la vente seulement.`);
    }
    out = out.replace(KUMARI_FLOOR, floorWords.length ? floorWords.join(", ") : "aucun minimum publié pour les actions");
    return out;
  };
  const notes = [
    marketWide.has("sebon") ? `frais SEBON ${frPct(schedule.sebon)} non imprimés par ${schedule.broker} : taux de place` : null,
    marketWide.has("dp") ? `frais DP ${schedule.dp} NPR non imprimés par ${schedule.broker} : tarif CDSC de place` : null,
  ].filter(Boolean);
  const out = {
    ...answer,
    basis: words(answer.basis),
    confidence: answer.confidence ? [words(answer.confidence), ...notes].join(" ; ") : answer.confidence,
  };
  if (!answer.trade || !answer.commission) return out;

  const { notional } = answer.trade;
  const rate = answer.commission.rate;
  const byRate = flat && notional <= flat.upTo ? flat.fee : notional * rate;
  const perOrder = Math.max(minimum, byRate);
  const courtageNpr = perOrder * 2 + schedule.dp * dpSides;
  const brokerFees = nprUsd(courtageNpr);
  const usd = answer.parts.marché == null ? null : plus(answer.parts.marché, brokerFees, answer.parts.taxes);
  if (flat && notional <= flat.upTo) out.confidence += ` ; ${fr(notional)} NPR dans le forfait : ${flat.fee} NPR par ordre`;
  else if (minimum && byRate < minimum) out.confidence += ` ; ${fr(byRate)} NPR sous le minimum : ${minimum} NPR par ordre`;
  return {
    ...out,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: {
      ...answer.commission,
      buy: finite(perOrder, 8),
      sell: finite(perOrder, 8),
      minimum,
      ...(flat ? { flat } : {}),
      dpPerSide: dpSides === 2 ? schedule.dp : 0,
      dpSell: schedule.dp,
    },
    parts: { ...answer.parts, courtage: finite(brokerFees, 6), courtageNpr: finite(courtageNpr, 6) },
  };
}
