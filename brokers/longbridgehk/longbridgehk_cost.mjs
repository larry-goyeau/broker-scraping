// What one round trip costs at Long Bridge HK Limited (Longbridge Hong
// Kong): buy n shares, sell them back, in dollars. Online cash order. The
// account opens on the fixed platform fee, so that is the line priced
// here. The tiered platform fee, margin, options, IPOs, the grey market
// and fractional shares stay out.
//
// https://longbridge.com/hk/en/rate ("Learn More" for each market)
// Read on 2026-10-18.
//   Hong Kong stocks, ETFs and warrants, each side
//                                        commission 0.03 %, minimum 3 HKD
//                                        platform 15 HKD an order (fixed plan)
//                                        CCASS 0.0042 %
//                                        stamp 0.1 %
//                                        trading fee 0.00565 %, minimum 0.01 HKD
//                                        SFC levy 0.0027 %, minimum 0.01 HKD
//                                        AFRC levy 0.00015 %, minimum 0.01 HKD
//   The page prints stamp with a 0.01 HKD minimum. The help-centre worked
//   example rounds it up to the next Hong Kong dollar, and that is what is
//   charged here.
//   https://longbridge.com/hk/en/support/topics/hkmarket/rpop8q.md
//   An ETF pays no stamp (Stamp Duty Ordinance waiver), so a line the
//   catalogue types ETF pays none.
//   United States stocks and ETFs, each side
//                                        commission 0.0049 USD a share, minimum 0.99 USD,
//                                        at most 0.5 % of the order
//                                        platform 0.005 USD a share, minimum 1 USD,
//                                        at most 0.99 % of the order
//                                        (the minimum wins over the cap)
//                                        settlement 0.003 USD a share, at most 7 % of the order
//                                        CAT 0.000003 USD a share, minimum 0.01 USD
//                                        SEC 0.00206 % on the sale, minimum 0.01 USD
//                                        TAF 0 USD
//   Commission is 0 on Hong Kong and US shares for a client who qualifies
//   for the lifetime commission-free offer (Hong Kong ID, net transfer of
//   HKD 10,000 or more). That is the remark, as at futu.
//   https://longbridge.com/hk/en/support/topics/28nggs8/8g1um4.md
//   Long Bridge HK names no US broker-dealer: US shares are received at
//   "DTC 0534", account U11928885, with no firm named. Long Bridge
//   Securities LLC (CRD 314519) has no report in the FINRA 606 bulk file
//   (2025 Q4 to 2026 Q2). DTC 0534 and the U account are Interactive
//   Brokers LLC's, so by user decision a US line takes that firm's 606 Q
//   (../../spreads/rule606.mjs).
//   https://longbridge.com/hk/en/support/topics/sharetransfer/13tncp6.md
//
// The rate page prints Hong Kong and US only. The catalogue also carries
// Stock Connect A-shares, and no Long Bridge HK page prints their
// commission, so they answer N/A with a reason. Singapore is not sold.
//
// The account holds HKD and USD. In-app exchange is between those two at
// no service fee. An HKEX line traded in CNY has no cash to settle in and
// answers N/A.
// https://longbridge.com/hk/en/support/topics/conversion/hk-exchange.md
//
// Custody, ADR fees, scrip and dividend handling are not per trade and
// stay out. The shared arithmetic is ../../longbridgeFees.mjs.
//
//   node brokers/longbridgehk/longbridgehk_cost.mjs 00700 HKEX HKD --shares=100 --price=600
//   node brokers/longbridgehk/longbridgehk_cost.mjs 02800 HKEX HKD --shares=500 --price=24.58
//   node brokers/longbridgehk/longbridgehk_cost.mjs SPY AMEX USD --shares=10 --price=660
//   node brokers/longbridgehk/longbridgehk_cost.mjs 600519 SSE CNY --shares=100 --price=1450
//
// `roundTrip(...)` reads files, not the network.

import { makeRoundTrip, printCli } from "../../longbridgeFees.mjs";
import { fxRemark } from "../../fx.mjs";

const READ_ON = "2026-10-18";
const FREE =
  "Zero commission for life for clients eligible for the offer (HK ID card, net transfer ≥ 10,000 HKD). Tiered platform fee on request.";

const base = makeRoundTrip(
  {
    folder: "longbridgehk",
    label: "Long Bridge HK",
    page: "https://longbridge.com/hk/en/rate",
    pages: {
      HK: "https://longbridge.com/hk/en/rate",
      US: "https://longbridge.com/hk/en/rate",
    },
    cash: ["HKD", "USD"],
    rates: {
      HK: { rate: 0.0003, min: 3, platform: 15 },
      US: {
        perShare: 0.0049,
        min: 0.99,
        cap: 0.005,
        platformPerShare: 0.005,
        platformMin: 1,
        platformCap: 0.0099,
        settlement: true,
      },
    },
    basis: {
      HK: `livraison en ligne, plateforme au forfait fixe, barème relu le ${READ_ON}. Commission 0,03 %, plancher 3 HKD. Plateforme 15 HKD. CCASS 0,0042 %, timbre 0,1 % arrondi au dollar supérieur (0 sur un ETF), frais de bourse, prélèvements SFC et AFRC. Vente identique.`,
      US: `livraison en ligne, plateforme au forfait fixe, barème relu le ${READ_ON}. Commission 0,0049 USD par action, plancher 0,99 USD, plafond 0,5 % de l'ordre. Plateforme 0,005 USD par action, plancher 1 USD, plafond 0,99 % de l'ordre. Règlement 0,003 USD par action, CAT, SEC à la vente. Vente identique.`,
    },
    missing: {
      SG: "la page tarifaire de Long Bridge HK n'imprime pas de commission pour Singapour",
      CN: "la page tarifaire de Long Bridge HK n'imprime pas de commission pour les actions A par Stock Connect",
    },
    remark: (market) => (market === "HK" || market === "US" ? FREE : ""),
  },
  new URL("longbridgehk-parsed.json", import.meta.url),
);

// A USD line is held, not converted: the in-app exchange prints no rate.
// Re-read 2026-10-18 (page modified 2026-08-04): "no service fees", the rate
// "in effect at the time of conversion"; no board, spread or markup.
export function roundTrip(query) {
  const out = base(query);
  if (!out.cashCurrency || out.cashCurrency === "HKD" || !out.listing) return out;
  return { ...out, remark: [out.remark, fxRemark("", out.listing.currency)].filter(Boolean).join(" ") };
}

printCli(import.meta.url, roundTrip);
