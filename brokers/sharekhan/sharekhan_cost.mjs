// What one round trip costs at Mirae Asset Sharekhan (Sharekhan Ltd): buy n
// shares, sell them back, in dollars. Online delivery. Not intraday, not
// F&O, not Dial-N-Trade.
//
// India, https://www.sharekhan.com/pricing read on 2026-10-28. One tariff
// for every account opened since 27 May 2023, "via all channels (DIY, FOS,
// Branch channels)", resident Indians; no other online plan is printed (the
// May 2026 zero-brokerage offer on Mirae Asset ETFs has ended):
//   Equity delivery             "0.30% on trade price or minimum 1 paisa per
//                               share", each side; "Brokerage will not
//                               exceed the SEBI and Exchange prescribed
//                               limits": 2.5% of the order at most. ETFs
//                               take the same equity line.
//   Equity intraday             "0.02% on trade price or minimum 1 paisa per
//                               share (each side)": the same-day remark, at
//                               this order.
//   STT                         0.1% on the buy and on the sell
//   Transaction                 NSE 0.00297%, BSE 0.00375% (as printed; the
//                               page gives one BSE rate, not the group table)
//   Stamp                       0.015% on the buy
//   SEBI                        ₹10 per crore
//   GST                         18% "on the sum total of brokerage +
//                               transaction charges + SEBI Transaction
//                               Charges"
//   IPFT                        not printed: 0
//   DP on a delivery sell       "Debit transactions (Sell) Nil (sale via
//                               Mirae Asset Sharekhan)": ₹0.
// Demat AMC: ₹400 a year for a non-BSDA account, free the first year.
//
// United States, https://www.sharekhan.com/global-markets/invest-in-us-stocks
// and https://gift.sharekhan.com/ (its terms, §11-12) read on 2026-10-28.
// Mirae Asset Capital Markets (IFSC) with ViewTrade International IFSC
// (VTI-IFSC), the IFSCA Global Access Provider that holds the account;
// orders are "Routed to US market makers" and filled "at NBBO". The book is
// the 605 × ViewTrade Securities' Rule 606 Q (spreads/rule606.mjs key
// `viewtrade`), the US broker-dealer of VTI-IFSC as Geojit, Dhan and
// Bonanza name it.
//   Brokerage                   not printed: "Brokerage and other charges
//                               will apply as per tariff rates at the sole
//                               discretion of Sharekhan Limited and
//                               ViewTrade International IFSC Pvt. Ltd."
//                               Stand-in (proposed 2026-10-28, US_STAND_IN):
//                               Geojit IFSC's printed tariff on the same
//                               VTI-IFSC platform (../geojit/geojit_cost.mjs,
//                               read 2026-10-26): 0.25% of the trade value,
//                               minimum $0.01 an order, IGST 18% on the
//                               brokerage for a resident Indian, IFSCA
//                               turnover 0.005% each side. Bonanza IFSC (also
//                               VTI-IFSC) prints the same 0.25%, Dhan 0.10%.
//   SEC, TAF                    "Relevant SEC and FINRA fees apply": SEC
//                               and TAF at the regulators' rates on the sale,
//                               rounded up to the cent
//                               (../wellstrade/usCost.mjs; TAF is $0 during
//                               FINRA's pause to 2026-12-31). CAT: no rate
//                               printed, 0.
//   Withdrawal $0 for a resident Indian ($10 for an NRI), account and
//   platform fee ₹0: not per trade.
// The GIFT City wallet holds dollars (deposits.mjs: INR, USD), so a US line
// pays no forced conversion: the rupee leg is the remark "FX x% when cash ≠
// USD.". The US page says only "Funds converted at competitive rates and
// credited to your GIFT City wallet"; the remittance runs through Glomo
// Payments IFSC from the client's own Indian bank, and Glomo's LRS FAQ
// (https://docs.glomo.one/product-guide/payin/resident-india-remittance-under-lrs/integration-guide/faq,
// read 2026-10-28) says "Glomo adds no markup of its own; the partner
// bank's FX markup applies" and "GST is applicable on the FX component".
// No Sharekhan, Mirae Asset, ViewTrade or Glomo page prints that markup.
// Stand-in (proposed 2026-10-28, as SBI Securities takes SBI's card rate):
// the card rate of the first bank Sharekhan names for the same-day online
// route ("Private banks (HDFC, ICICI, Axis)"), HDFC Bank, which is also the
// widest of the three, (TT selling − mid) / mid with mid the TT buy/sell
// average:
//   HDFC   93.30 / 96.70, 28-10-2026 09:28 → 1.79 %
//     https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/interest-rates/hdfc-bank-treasury-forex-card-rates.pdf
//   Axis   93.37 / 96.66, 28-10-2026 19:31 → 1.73 %
//     https://application.axis.bank.in/webforms/corporatecardrate/index.aspx
//   ICICI  93.43 / 96.37, 28-10-2026 09:14 → 1.55 %
//     https://www.icici.bank.in/business-banking/global-markets/forex/forex-card-rates
// The GST on the conversion (CGST rule 32(2)(b), 0.18% up to ₹1 lakh,
// lower above) is left out, as in ../sbisecurities.
//
//   node brokers/sharekhan/sharekhan_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400
//   node brokers/sharekhan/sharekhan_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, pct, sameDaySell, sebiRate } from "../../indianDelivery.mjs";
import { catalogueRows, cliArgs, goesToIndia, usRoundTrip } from "../bajaj/indiaAbroad.mjs";
import { secFee, secRate, tafFee } from "../wellstrade/usCost.mjs";
import { finite, plus } from "../../na.mjs";
import { fxRemark } from "../../fx.mjs";

const CATALOGUE = new URL("sharekhan-parsed.json", import.meta.url);
const PAGE = "https://www.sharekhan.com/pricing";
const US_PAGE = "https://www.sharekhan.com/global-markets/invest-in-us-stocks";
const READ_ON = "2026-10-28";
const DELIVERY = pct("0.30");
const INTRADAY = pct("0.02");
const PAISA = 0.01;
const SEBI_CAP = pct("2.5");
// false: the US lines go back to N/A (no published brokerage).
const US_STAND_IN = true;
// LRS rupee leg each way: HDFC Bank's USD TT selling over its TT mid on
// 2026-10-28 (header).
const FX_STAND_IN = (96.7 - 95.0) / 95.0;

// indiaRoundTrip hands brokerageEach the notional only: the share count is
// set here before each call (synchronous, one query at a time).
let sharesNow = 0;

const perOrder = (rate) => (notional) => Math.min(Math.max(notional * rate, sharesNow * PAISA), notional * SEBI_CAP);
const deliveryEach = perOrder(DELIVERY);
const intradayEach = perOrder(INTRADAY);

const INDIA = {
  broker: "Mirae Asset Sharekhan",
  folder: "sharekhan",
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  brokerageEach: deliveryEach,
  txnRate: (exchange) => (exchange === "NSE" ? pct("0.00297") : exchange === "BSE" ? pct("0.00375") : null),
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: false,
  ipftRate: 0,
  dpInr: 0,
  basis:
    "Courtage livraison 0,30 % par ordre, minimum 1 paisa par part, plafond SEBI 2,5 %. GST 18 % sur courtage, frais de transaction et SEBI. " +
    "Transaction NSE 0,00297 %, BSE 0,00375 % (taux imprimés). DP à la vente 0 ₹ (vente via Sharekhan).",
  remark: "Demat AMC is ₹400 a year after the first year.",
};

function indiaTrip(query) {
  sharesNow = Number(query.shares) || 0;
  return sameDaySell(indiaRoundTrip(INDIA, query), deliveryEach, intradayEach);
}

const US = {
  broker: "Mirae Asset Sharekhan",
  folder: "sharekhan",
  catalogueUrl: CATALOGUE,
  url: US_PAGE,
  readOn: READ_ON,
  dealer: "viewtrade",
  dealerName: "ViewTrade",
  commissionEach: ({ notional }) => Math.max(0.01, notional * 0.0025),
  gst: 0.18,
  // SEC and TAF are added below, rounded up to the cent.
  sec: 0,
  tafPerShare: 0,
  ifsca: 0.00005,
  basis:
    `Mirae Asset Capital Markets (IFSC) via ViewTrade International IFSC, page relue le ${READ_ON} : courtage non publié ` +
    "(« as per tariff rates at the sole discretion of Sharekhan Limited and ViewTrade International IFSC »). " +
    "Substitut proposé : barème imprimé de Geojit IFSC sur la même plateforme VTI-IFSC, 0,25 % par ordre, minimum 0,01 $, " +
    "IGST 18 % sur le courtage (résident indien), IFSCA 0,005 % à chaque sens. " +
    `SEC ${secRate()} de la vente et TAF à la vente, chacune au centime supérieur (« Relevant SEC and FINRA fees apply ») ; CAT non imprimée : 0. ` +
    "Portefeuille GIFT City en dollars : pas de change forcé. Change LRS non publié (Glomo : marge de la banque du client) : " +
    "remarque au cours de vente TT de HDFC Bank, première banque nommée, 1,79 % au-dessus du milieu le 2026-10-28 (substitut proposé).",
  // IGST is charged to resident Indians only: x is that IGST as a cut of
  // the brokerage with IGST, both sides (18/118). Left out when the IGST is
  // under 0.005% of the order.
  // The FX remark follows, for a USD line (USD is the only foreign cash).
  remark: ({ gst, commission, notionalUsd, listing }) => {
    const fx = listing.currency === "USD" ? fxRemark((100 * FX_STAND_IN).toFixed(2), "USD") : "";
    if (!Math.round((gst / notionalUsd) * 100 * 100)) return fx;
    const x = (gst / (commission + gst)) * 100;
    return [`Fees might be ${x >= 10 ? Math.round(x) : Number(x.toFixed(1))}% lower if you are not a Resident Indian.`, fx].filter(Boolean).join("\n");
  },
  noTariff: US_STAND_IN
    ? null
    : () => "courtage US non publié (« as per tariff rates at the sole discretion of Sharekhan Limited and ViewTrade International IFSC »)",
};

// usRoundTrip's SEC and TAF are not rounded: they are added here, each
// rounded up to the cent, on the sale.
function usTrip(query) {
  const out = usRoundTrip(US, query);
  const notionalUsd = out?.trade?.notionalUsd;
  if (!(notionalUsd > 0) || out.brokerFees == null) return out;
  const sec = secFee(notionalUsd, "up");
  const taf = tafFee(out.trade.shares, "up");
  const levies = plus(out.parts.levies, sec, taf);
  return {
    ...out,
    usd: out.usd == null ? null : finite(plus(out.usd, sec, taf), 6),
    commission: { ...out.commission, sec, taf },
    parts: { ...out.parts, levies: finite(levies, 6) },
  };
}

export function roundTrip(query) {
  if (goesToIndia(catalogueRows(CATALOGUE), query)) return indiaTrip(query);
  return usTrip(query);
}

let called = false;
try {
  called = import.meta.url === pathToFileURL(process.argv[1]).href;
} catch {
  called = false;
}
if (called) console.log(JSON.stringify(roundTrip(cliArgs()), null, 2));
