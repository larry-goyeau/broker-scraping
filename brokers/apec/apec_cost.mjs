// What one round trip costs at APEC Securities (Chứng khoán Châu Á Thái
// Bình Dương, APS): buy n shares, sell them back, in dollars. A share or an
// ETF on HOSE, HNX or UPCOM.
//
// https://apec.com.vn/bieu-phi/
// read on 2026-10-20. The trading sheet applies from 23 June 2025, the
// custody sheet from 20 February 2020.
//   Smart account, each side   0.10% of the fill. The sheet prices two
//              account types and no channel: Smart at 0.10% and A Broker
//              Plus (APS's adviser service) at 0.20%. This file prices
//              Smart. The rate is read on the day's total value, buys and
//              sells together; no step is printed, so the value does not
//              change it. No floor is printed.
//   Exchange fee   the sheet's note: "Mức phí nộp Sở giao dịch chứng khoán
//              trên tổng giá trị giao dịch thu theo quy định hiện hành",
//              so the fee paid to the exchange is charged on top, each
//              side. The rates are the exchange's as the Mirae and MSVN
//              sheets print them: 0.027% for a share on HOSE or HNX,
//              0.018% for a share on UPCOM or an ETF.
//   Sale transfer  0.3 dong a share for "chuyển khoản để thực hiện giao
//              dịch bán chứng khoán", at most 500,000 dong a transfer and
//              a symbol. It is charged on every sale, so it is in the
//              number.
//   Sale tax   0.1% of the sale, the personal income tax the broker
//              withholds on every sale, gain or loss. This sheet does not
//              print it for a listed share. The rate is the law's.
//   Custody    0.27 dong a share or a fund certificate a month. The
//              months are not an input, so it stays in the remark.
//   HOSE, HNX, UPCOM     the BSC board, read by spreads/vn-touch.mjs
// The account holds dong only, so there is no FX leg. The sums are in
// ../../vietnamDelivery.mjs.
//
//   node brokers/apec/apec_cost.mjs VNM HOSE VND --shares=10 --price=57200
//   node brokers/apec/apec_cost.mjs E1VFVN30 HOSE VND --shares=100 --price=30000
//   node brokers/apec/apec_cost.mjs ACB HNX VND --shares=100 --price=25000
//
// `roundTrip(...)` reads files, not the network.

import { vietnamRoundTrip, printCli, pct, frPct, perShareOnSale } from "../../vietnamDelivery.mjs";

const RATE = pct("0.10");
// Fee paid to the exchange, each side.
const EXCHANGE_LISTED = pct("0.027");
const EXCHANGE_UPCOM_OR_ETF = pct("0.018");

const SCHEDULE = {
  broker: "APEC",
  folder: "apec",
  catalogueUrl: new URL("apec-parsed.json", import.meta.url),
  url: "https://apec.com.vn/bieu-phi/",
  readOn: "2026-10-20",
  rate: () => RATE,
  basis: "compte Smart",
  remark: "Custody is 0.27 VND a share a month.",
  saleFee: perShareOnSale(0.3, { max: 500_000 }),
};

function exchangeFee(listing) {
  if (!listing) return null;
  const board = String(listing.brokerExchange || "").toUpperCase();
  if (listing.type === "ETF" || board === "UPCOM") return EXCHANGE_UPCOM_OR_ETF;
  return EXCHANGE_LISTED;
}

export function roundTrip(query) {
  // The first pass finds the line; the exchange fee depends on its board
  // and type, so the second pass prices commission plus that fee.
  const first = vietnamRoundTrip(SCHEDULE, query);
  const fee = exchangeFee(first.listing);
  if (fee == null) return first;
  return vietnamRoundTrip(
    {
      ...SCHEDULE,
      rate: () => Number((RATE + fee).toPrecision(12)),
      basis: `compte Smart, ${frPct(RATE)} de courtage plus ${frPct(fee)} de frais de bourse par sens`,
    },
    query
  );
}

printCli(import.meta.url, roundTrip);
