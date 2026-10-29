// What one round trip costs at American Century Brokerage (American Century
// Investment Services, Inc., cleared by Pershing LLC): buy n shares at price
// p, sell them straight back, online, in dollars. US-listed common stock,
// preferred stock and ETFs. Funds, options, bonds and metals stay out.
//
// Commission and fee schedule "effective as of February 15, 2026", read in
// full 2026-10-26:
//   https://www.americancentury.com/invest/accounts/brokerage/commissions-and-fees/
//
//   Equities more than $1 a share, "Brokerage Clients / Online":
//     "$24.95 + 2¢/share for each additional share over 1,000",
//     "maximum charge of $250 for all clients except Platinum"
//   Equities under $1 a share, "All Other Clients":
//     "$24.95 + 3% of transaction amount; maximum charge of $250"
//   "American Century and Avantis Investors ETFs are commission-free"
//   "With a representative" $45.00: not online, not this trip
//   Priority tiers by American Century mutual fund assets: Silver $19.95,
//     Gold $14.95 (+ 2¢ over 1,000 / + 3% under $1), Platinum ($500,000 or
//     more) $9.95 flat. A holding condition, not a plan: remark "Fees might
//     be x% lower if ..." with Platinum's cut of the commission at the
//     trade's size
//   Non-IRA outgoing transfer $100, paper fees, semiannual maintenance $50
//     (waived with two trades every six months), ADR agent fee "Variable":
//     not on an order
//   SEC, TAF, CAT        SEC and TAF added at the regulators' rates on the
//                        sale, rounded up to the cent (none is printed; owner,
//                        2026-10-28). CAT: no rate printed, 0.
//
// Formula: book + 2 × ticket, ticket =
//   AC/Avantis ETF                     $0
//   price > $1     min($24.95 + $0.02 × max(0, n − 1,000), $250)
//   price ≤ $1     min($24.95 + 3% × n × p, $250)
// A line at exactly $1 is not "more than $1": it takes the under-$1 row.
//
// Routing: American Century Investment Services, Inc. (CRD 17437) files its
// own 606 (FINRA 606 bulk 2026 Q2, 17437_606_NMS_2026_Q2_V1: Citadel, G1,
// HRT, StoneX, Jane Street) and is also on the adopt-by-reference list with
// Pershing LLC (CRD 7560). Its own report is used: key `americancenturyis`
// in spreads/rule606.mjs, the book is the blended 605 × that 606's Q.
//
// Accounts are for US citizens and resident aliens; cash is dollars and every
// line is in dollars: no conversion.
//
//   node brokers/americancentury/americancentury_cost.mjs US0378331005 XNAS USD --shares=2.876 --price=347.725
//   node brokers/americancentury/americancentury_cost.mjs AVUV ARCX USD --shares=10 --price=100
//   node brokers/americancentury/americancentury_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { usRoundTrip, printCli } from "../wellstrade/usCost.mjs";

const ONLINE = { base: 24.95, perShareOver: 0.02, sharesIncluded: 1000, cap: 250, underDollarRate: 0.03 };
const PLATINUM = 9.95;
// Funds of the house: commission-free (name of the line, as the catalogue gives it).
const HOUSE_ETF = /^(American Century|Avantis)\b/i;

const isHouseEtf = (row) => /^ETF$/i.test(String(row?.type || "")) && HOUSE_ETF.test(String(row?.name || ""));

/** One online equity order, in dollars. */
export function commission({ shares, price, notional, row }) {
  if (isHouseEtf(row)) return 0;
  if (!(shares > 0) || !(price > 0)) return null;
  const raw =
    price > 1
      ? ONLINE.base + ONLINE.perShareOver * Math.max(0, shares - ONLINE.sharesIncluded)
      : ONLINE.base + ONLINE.underDollarRate * notional;
  return Number(Math.min(raw, ONLINE.cap).toFixed(2));
}

// Platinum's cut of this order's commission itself ($24.95 → $9.95 = 60%):
// whole from 10 up, one decimal below.
function remarkOf(ctx) {
  const each = commission(ctx);
  if (!each || !(ctx.notional > 0)) return "";
  const raw = ((each - PLATINUM) * 100) / each;
  const gap = raw >= 10 ? Math.round(raw) : Math.round(raw * 10) / 10;
  if (!(gap > 0)) return "";
  return `Fees might be ${gap}% lower if you hold $500,000 or more in American Century mutual funds.`;
}

const SCHEDULE = {
  broker: "American Century Brokerage",
  folder: "americancentury",
  catalogueUrl: new URL("americancentury-parsed.json", import.meta.url),
  url: "https://www.americancentury.com/invest/accounts/brokerage/commissions-and-fees/",
  readOn: "2026-10-26",
  entity: "American Century Investment Services, Inc.",
  crd606: "17437",
  clearing: "Pershing LLC",
  rule606: "americancenturyis",
  cash: "USD",
  deposits: ["USD"],
  feeCurrency: "USD",
  ticket: (ctx) => commission(ctx),
  levies: { sec: "up", taf: "up", cat: false },
  remark: remarkOf,
  basis: (ctx) =>
    isHouseEtf(ctx.row)
      ? "barème American Century (effectif le 2026-02-15), relu le 2026-10-26 : ETF American Century et Avantis sans commission"
      : "barème American Century (effectif le 2026-02-15), relu le 2026-10-26 : client Brokerage en ligne, " +
        (ctx.price > 1
          ? "24,95 $ + 0,02 $ la part au-delà de 1 000 parts, plafond 250 $"
          : "action à 1 $ ou moins : 24,95 $ + 3 % du montant, plafond 250 $") +
        ", à l'achat comme à la vente",
  notes: (ctx) => [
    isHouseEtf(ctx.row) ? null : `paliers Priority (avoirs en fonds American Century) : Platinum ${PLATINUM} $ l'ordre, en remarque`,
    "ordre avec un représentant 45 $ : hors ligne, non compté",
    "606 de American Century Investment Services (CRD 17437), 2026 T2",
  ],
};

export function roundTrip(query) {
  return usRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip, SCHEDULE);
