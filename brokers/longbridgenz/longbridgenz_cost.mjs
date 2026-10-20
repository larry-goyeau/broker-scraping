// What one round trip costs at Long Bridge Securities Limited (Longbridge
// New Zealand): buy n shares, sell them back, in dollars. Online cash
// order on Hong Kong, US and Singapore shares and ETFs, Standard Account. Margin,
// options and IPOs stay out.
//
// https://longbridge.com/nz/en/rate
// Read on 2026-10-18. The page prints no platform fee, and only the
// commission per market, "applicable to Long Bridge Standard Account".
//   United States, each side              commission 0.0088 USD a share, minimum 1.88 USD
//   Hong Kong, each side                  commission 0.028 %, minimum 15 HKD
//   Singapore, each side                  commission 0.15 %, minimum 10 SGD
//   China A-shares (0.04 %, minimum 18 CNH) are printed too, but the
//   catalogue does not carry them.
//
// Singapore's third-party lines are on the group help centre's
// Singapore fee table (Long Bridge Securities Limited, NZ), read on
// 2026-10-19: platform fee 0, clearing 0.0325 %, SGX access fee 0.0075 %,
// clearing instruction 0.35 SGD, each side. GST (9 % of the commission)
// is charged to Singapore residents only, and this entity's clients are
// not Singapore residents.
//   https://support.longbridge.global/topics/1dc1l7t/n53j9n
//
// The NZ page names no exchange, clearing or regulatory charge. The ones
// the market itself levies on every broker are added at the rates the
// group's Hong Kong entity prints (https://longbridge.com/hk/en/rate, read
// on 2026-10-18):
//   Hong Kong, each side   CCASS 0.0042 %; stamp 0.1 %, rounded up to the
//                          next Hong Kong dollar, 0 on an ETF; trading fee
//                          0.00565 %, SFC levy 0.0027 %, AFRC levy 0.00015 %,
//                          each with a 0.01 HKD minimum
//   United States          SEC 0.00206 % on the sale, minimum 0.01 USD; CAT
//                          0.000003 USD a share, minimum 0.01 USD, each side;
//                          TAF 0
// The 0.003 USD a share US settlement fee that the Hong Kong and Singapore
// entities pass on is their clearing agent's charge, not a market levy.
// The NZ page does not name it, so it stays out.
// The page's own question-and-answer block (not shown on the live page)
// says US and HK trading is commission-free under a limited-time offer.
// An offer is not the tariff, so the commission stays in.
// US shares are held through Phillip Capital USA (DTC 8460), the receiving
// broker on the NZ transfer page. Neither it nor Long Bridge Securities LLC
// (CRD 314519) has a report in the FINRA 606 bulk file (2025 Q4 to
// 2026 Q2), so a US line keeps the NBBO book.
// https://longbridge.com/nz/en/support/topics/sharetransfer/1yp33rg.md
//
// Deposits go to the custodian in USD and HKD only. The in-app exchange
// holds SGD too, so an SGX line settles in SGD. An HKEX line in CNY has no
// cash to settle in and answers N/A. The exchange page names no
// fee for conversion.
// https://longbridge.com/nz/en/support/topics/conversion/1boirpz.md
//
// Custody, ADR fees and dividend handling are not per trade and stay out.
// The shared arithmetic is ../../longbridgeFees.mjs.
//
//   node brokers/longbridgenz/longbridgenz_cost.mjs 00700 HKEX HKD --shares=100 --price=600
//   node brokers/longbridgenz/longbridgenz_cost.mjs 02800 HKEX HKD --shares=500 --price=24.58
//   node brokers/longbridgenz/longbridgenz_cost.mjs SPY AMEX USD --shares=10 --price=660
//
// `roundTrip(...)` reads files, not the network.

import { makeRoundTrip, printCli } from "../../longbridgeFees.mjs";
import { fxRemark } from "../../fx.mjs";

const READ_ON = "2026-10-18";

const base = makeRoundTrip(
  {
    folder: "longbridgenz",
    label: "Longbridge Nouvelle-Zélande",
    page: "https://longbridge.com/nz/en/rate",
    pages: {},
    cash: ["USD", "HKD", "SGD"],
    rates: {
      HK: { rate: 0.00028, min: 15, platform: 0 },
      SG: { rate: 0.0015, min: 10, platformRate: 0, platformMin: 0, instruction: 0.35, gst: 0 },
      US: { perShare: 0.0088, min: 1.88, cap: null, settlement: false },
    },
    basis: {
      HK: `livraison en ligne, compte Standard, barème relu le ${READ_ON}. Commission 0,028 %, plancher 15 HKD. Pas de plateforme. Prélèvements de marché aux taux de Long Bridge HK : CCASS 0,0042 %, timbre 0,1 % arrondi au dollar supérieur (0 sur un ETF), frais de bourse, SFC et AFRC. Vente identique.`,
      US: `livraison en ligne, compte Standard, barème relu le ${READ_ON}. Commission 0,0088 USD par action, plancher 1,88 USD. Pas de plateforme. SEC à la vente et CAT aux taux de Long Bridge HK. Vente identique.`,
      SG: `livraison en ligne, compte Standard, barème relu le ${READ_ON}. Commission 0,15 %, plancher 10 SGD. Pas de plateforme. Compensation 0,0325 %, frais d'accès SGX 0,0075 %, instruction de compensation 0,35 SGD (grille Singapour du centre d'aide, relue le 2026-10-19). TPS réservée aux résidents de Singapour. Vente identique.`,
    },
    missing: {
      CN: "le catalogue Longbridge NZ ne porte pas d'actions A",
    },
    remark: () => "",
  },
  new URL("longbridgenz-parsed.json", import.meta.url),
);

// A line in held cash is not converted: the in-app exchange prints no rate.
// Re-read 2026-10-18 (page updated 2025-10-14): no fee, real-time rate; no
// board, spread or markup.
export function roundTrip(query) {
  const out = base(query);
  if (!out.cashCurrency || !out.listing) return out;
  return { ...out, remark: [out.remark, fxRemark("", out.listing.currency)].filter(Boolean).join(" ") };
}

printCli(import.meta.url, roundTrip);
