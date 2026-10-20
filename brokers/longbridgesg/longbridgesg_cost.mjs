// What one round trip costs at Long Bridge Securities Pte. Ltd.
// (Longbridge Singapore): buy n shares, sell them back, in dollars. Online
// cash order on Singapore, Hong Kong and US shares and ETFs. DLCs,
// structured warrants, options, funds, margin and fractional shares (under
// one share) stay out.
//
// https://longbridge.com/sg/en/pricing ("Learn more" for each market)
// Read on 2026-10-18. The page adds 9 % GST to "all the above fees".
//   Singapore stocks and ETFs, each side
//                                        commission 0.03 %, minimum 0.99 SGD
//                                        platform 0.03 %, minimum 0.99 SGD
//                                        SGX trading fee 0.0075 %
//                                        SGX clearing fee 0.0325 %, 0.001 % on an
//                                        SGX-traded money market fund
//                                        settlement instruction 0.70 SGD, absorbed
//                                        GST 9 % on every line above
//   A line in USD or HKD takes the SGD minimum at the fx table.
//   A Philippine share dual-listed on SGX (an SGX line with a PH ISIN)
//   pays, on the sale only, the row "Philippines Stock Transaction Tax
//   (PH STT) (see Note B) | 0.63% (for sell orders only) | SGX", Note B:
//   "Applicable for Philippine stocks which are dual listed on SGX-ST
//   (0.6% PH STT and 0.03% collection fee of gross sale value of
//   transaction)" (the "Learn more" dialog for Singapore, read on
//   2026-10-18). The side agrees with the tax law: STT "is a final tax
//   due on and payable by the seller of the shares, and is required to be
//   collected by and paid to the Philippine tax authorities by the selling
//   stockbroker" (Emperador Inc. on SGXNet, 1 July 2025,
//   https://links.sgx.com/1.0.0/corporate-announcements/SQC1TWYZFZZIQ19T/850513_Stock%20Transaction%20Tax%20Reminder_updated%20as%20of%2001July2025.pdf).
//   That notice also says the statutory rate fell from 0.6 % to 0.1 % on
//   1 July 2025 (Republic Act No. 12214, CMEPA); Longbridge still prints
//   0.6 %, and its own figure is priced. The 0.6 % is a Philippine tax and
//   takes no GST; the 0.03 % collection fee takes the 9 % GST like the
//   other lines. Neither goes in `brokerFees`, as for the SGX levies.
//   Hong Kong stocks and ETFs, each side
//                                        commission 0.03 %, minimum 5 HKD
//                                        platform 15 HKD an order
//                                        settlement (HKSCC) 0.0042 %
//                                        stamp 0.1 %, minimum 1 HKD, rounded up to
//                                        the next Hong Kong dollar; 0 on an ETF
//                                        trading fee 0.00565 %, minimum 0.01 HKD
//                                        SFC levy 0.0027 %, minimum 0.01 HKD
//                                        FRC levy 0.00015 %, minimum 0.01 HKD
//   United States stocks and ETFs, each side
//                                        commission 0.003 USD a share, minimum 0.99 USD,
//                                        at most 0.5 % of the order
//                                        platform 0.005 USD a share, minimum 0.99 USD,
//                                        at most 1 % of the order
//                                        settlement 0.003 USD a share, at most 7 % of the order
//                                        CAT 0.000003 USD a share, minimum 0.01 USD
//                                        SEC 0.00206 % on the sale, minimum 0.01 USD
//                                        TAF 0 USD
//   GST is put on Longbridge's own commission and platform fee in every
//   market and on the SGX lines. It is not put on Hong Kong stamp and
//   levies or on US regulatory fees: those are foreign taxes and levies,
//   not a Singapore supply. That reading of "all the above fees" is ours.
//   Commission is 0 for life for a client on the welcome offer ("Lifetime
//   Free*"). That is the remark, as at futu.
//   Longbridge Singapore names no US broker-dealer: US shares are
//   received at "DTC 0534" with no firm named. Long Bridge Securities LLC
//   (CRD 314519) has no report in the FINRA 606 bulk file (2025 Q4 to
//   2026 Q2). DTC 0534 is Interactive Brokers LLC's, so by user decision a
//   US line takes that firm's 606 Q (../../spreads/rule606.mjs).
//   https://longbridge.com/sg/en/support/topics/stocktransfer/transferinstockdetails.md
//
// The account holds SGD, USD and HKD, and converts between them at no
// service fee. An SGX line in EUR, GBP, JPY or CNY, or an HKEX line in
// CNY, has no cash to settle in and answers N/A.
// https://longbridge.com/sg/en/support/topics/currencyexchange/FAQs.md
//
// Custody (waived), ADR fees, scrip and dividend handling are not per
// trade and stay out. The shared arithmetic is ../../longbridgeFees.mjs.
//
//   node brokers/longbridgesg/longbridgesg_cost.mjs D05 SGX SGD --shares=100 --price=50
//   node brokers/longbridgesg/longbridgesg_cost.mjs ES3 SGX SGD --shares=100 --price=4.3
//   node brokers/longbridgesg/longbridgesg_cost.mjs 00700 HKEX HKD --shares=100 --price=600
//   node brokers/longbridgesg/longbridgesg_cost.mjs SPY AMEX USD --shares=10 --price=660
//
// `roundTrip(...)` reads files, not the network.

import { makeRoundTrip, printCli } from "../../longbridgeFees.mjs";
import { toUsd, fxRemark } from "../../fx.mjs";
import { finite, plus } from "../../na.mjs";

const READ_ON = "2026-10-18";

const base = makeRoundTrip(
  {
    folder: "longbridgesg",
    label: "Longbridge Singapour",
    page: "https://longbridge.com/sg/en/pricing",
    pages: {},
    cash: ["SGD", "USD", "HKD"],
    rates: {
      SG: { rate: 0.0003, min: 0.99, platformRate: 0.0003, platformMin: 0.99, gst: 0.09 },
      HK: { rate: 0.0003, min: 5, platform: 15, gst: 0.09 },
      US: {
        perShare: 0.003,
        min: 0.99,
        cap: 0.005,
        platformPerShare: 0.005,
        platformMin: 0.99,
        platformCap: 0.01,
        settlement: true,
        gst: 0.09,
      },
    },
    basis: {
      SG: `livraison en ligne, barème relu le ${READ_ON}. Commission 0,03 %, plancher 0,99 SGD. Plateforme 0,03 %, plancher 0,99 SGD. Frais SGX 0,0075 % et compensation 0,0325 %. TPS 9 % sur le tout. Vente identique.`,
      HK: `livraison en ligne, barème relu le ${READ_ON}. Commission 0,03 %, plancher 5 HKD. Plateforme 15 HKD. TPS 9 % sur ces deux lignes. Règlement 0,0042 %, timbre 0,1 % arrondi au dollar supérieur (0 sur un ETF), frais de bourse, prélèvements SFC et FRC. Vente identique.`,
      US: `livraison en ligne, barème relu le ${READ_ON}. Commission 0,003 USD par action, plancher 0,99 USD, plafond 0,5 % de l'ordre. Plateforme 0,005 USD par action, plancher 0,99 USD, plafond 1 % de l'ordre. TPS 9 % sur ces deux lignes. Règlement 0,003 USD par action, CAT, SEC à la vente. Vente identique.`,
    },
    missing: {
      CN: "Longbridge Singapour ne vend pas d'actions A",
    },
    remark: () => "",
  },
  new URL("longbridgesg-parsed.json", import.meta.url),
);

// A Philippine share on SGX: 0.6 % STT and 0.03 % collection fee (plus
// GST) on the gross value of the sale.
const PH_STT = 0.006;
const PH_COLLECTION = 0.0003;
const GST = 0.09;

// A USD or HKD line is held, not converted: the in-app exchange prints no rate.
// Re-read 2026-10-18 (FAQ modified 2026-07-23): no service fee, rates "charged
// by LBS" from bank rates, shown in-app only; no board, spread or markup.
function withFx(out) {
  if (!out.cashCurrency || out.cashCurrency === "SGD" || !out.listing) return out;
  return { ...out, remark: [out.remark, fxRemark("", out.listing.currency)].filter(Boolean).join(" ") };
}

export function roundTrip(query) {
  const out = withFx(base(query));
  const l = out.listing;
  const sgx = l?.mic === "XSES" || String(l?.brokerExchange || "").toUpperCase() === "SGX";
  if (!out.trade || !sgx || !/^PH/i.test(l?.isin || "")) return out;
  const { notional, currency } = out.trade;
  const stt = notional * PH_STT;
  const collection = notional * PH_COLLECTION * (1 + GST);
  const local = Number((stt + collection).toPrecision(12));
  const usdTax = toUsd(local, currency);
  const taxes = usdTax == null ? null : finite(usdTax, 6);
  return {
    ...out,
    basis: `${out.basis} Action philippine cotée à SGX : à la vente seulement, taxe philippine sur les transactions (STT) 0,6 % et frais de collecte 0,03 % (TPS 9 % sur ces frais) de la valeur brute vendue.`,
    usd: out.usd == null || taxes == null ? null : finite(plus(out.usd, taxes), 6),
    phStt: { stt: Number(stt.toPrecision(12)), collection: Number(collection.toPrecision(12)), currency },
    taxes,
    remark: [out.remark, "Philippine STT: Longbridge shows 0.6%; the legal rate is 0.1% since 1 July 2025 (CMEPA law). Longbridge's figure is used."]
      .filter(Boolean)
      .join(" "),
    ...(taxes == null && !out.why ? { why: `pas de cours de change pour ${currency}` } : {}),
  };
}

printCli(import.meta.url, roundTrip);
