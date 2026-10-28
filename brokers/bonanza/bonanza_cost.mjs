// What one round trip costs at Bonanza (Bonanza Portfolio Ltd, online as
// Bigul; US shares through Bonanza Portfolio IFSC): buy n shares, sell them
// back, in dollars. Online delivery. Not intraday, not F&O, not an order
// through the dealing desk (₹25 more).
//
// India, https://www.bigul.co/pricing read on 2026-10-26.
//   Brokerage                   "₹ 18* Flat brokerage per Order", delivery
//                               and intraday alike
//   STT                         0.1% on buy and sell
//   Transaction                 NSE 0.00307%, BSE 0.00375%; "BSE has
//                               revised transaction charges in XC, XD, XT,
//                               Z and ZP groups to ₹10,000 per crore"
//                               (XC and XD are now X): 0.1% there. The page
//                               names no other group.
//   GST                         18% on (brokerage + IPFT + transaction +
//                               SEBI). The page prints no IPFT rate: 0.
//   SEBI                        0.0001%
//   Stamp                       0.015% on the buy
//   CM charges                  nil
//   DP on a delivery sell       "DP charges of ₹14.16 per scrip are
//                               levied, inclusive of applicable Depository
//                               charges and GST"
// AMC (₹0 the first year, then ₹300 + GST a year) is not per trade.
//
// United States, https://bonanzaifsc.com/pricing/ read on 2026-10-26,
// Standard Account. Bonanza IFSC names no US broker-dealer on its pricing
// page, home page or FAQ, so the book is the quoted NBBO.
//   Monthly charges             $0
//   Brokerage, each side        0.25%, "Minimum of $1 or 0.25%, whichever is
//                               higher", then GST 18% "on the brokerage
//                               collected"
//   CAT                         $0.000035 × buy/sell quantity, each side
//   FINRA TAF                   $0.000195 × sell quantity. A pass-through,
//                               so FINRA's own $9.79 cap holds.
//   IFSCA turnover              0.005% of the trade value, each side
//   SEC                         not printed: 0
//   Payment gateway $1 per deposit, withdrawal $0: not per trade.
// The IFSC account is funded in dollars (deposits.mjs: INR, USD), so a US
// line pays no forced conversion. The FAQ's "Forex Markup fee" on an INR
// deposit "depends on the bank": no number.
//
//   node brokers/bonanza/bonanza_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400
//   node brokers/bonanza/bonanza_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/bonanza/bonanza_cost.mjs AAPL XNAS USD --shares=1 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, pct, sebiRate } from "../../indianDelivery.mjs";
import { bseGroup, catalogueRows, cliArgs, goesToIndia, usRoundTrip } from "../bajaj/indiaAbroad.mjs";

const CATALOGUE = new URL("bonanza-parsed.json", import.meta.url);
const PAGE = "https://www.bigul.co/pricing";
const US_PAGE = "https://bonanzaifsc.com/pricing/";
const READ_ON = "2026-10-26";
const BSE_POINT1 = new Set(["X", "XC", "XD", "XT", "Z", "ZP"]);

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00307");
  if (exchange === "BSE") return BSE_POINT1.has(bseGroup(row)) ? pct("0.1") : pct("0.00375");
  return null;
}

const INDIA = {
  broker: "Bonanza",
  folder: "bonanza",
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  brokerageEach: () => 18,
  txnRate,
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnIpft: true,
  dpIncludesGst: true,
  ipftRate: 0,
  dpInr: 14.16,
  basis:
    "Bigul : courtage 18 ₹ par ordre. DP 14,16 ₹ par valeur à la vente, GST comprise. " +
    "BSE 0,00375 % ; groupes X, XT, Z, ZP 0,1 % (page Bigul).",
  remark: "",
};

const US = {
  broker: "Bonanza",
  folder: "bonanza",
  catalogueUrl: CATALOGUE,
  url: US_PAGE,
  readOn: READ_ON,
  dealer: null,
  commissionEach: ({ notional }) => Math.max(1, notional * 0.0025),
  gst: 0.18,
  catPerShare: 0.000035,
  tafPerShare: 0.000195,
  tafCap: 9.79,
  ifsca: 0.00005,
  basis:
    `Bonanza IFSC, compte Standard, page relue le ${READ_ON} : courtage 0,25 % par ordre, minimum 1 $, puis GST 18 %. ` +
    "CAT 0,000035 $ par part et IFSCA 0,005 % à chaque sens, TAF 0,000195 $ par part à la vente (plafond FINRA 9,79 $). SEC non imprimée. " +
    "Aucun courtier US nommé : carnet NBBO coté. Compte en dollars : pas de change forcé.",
};

export function roundTrip(query) {
  if (goesToIndia(catalogueRows(CATALOGUE), query)) return indiaRoundTrip(INDIA, query);
  return usRoundTrip(US, query);
}

let called = false;
try {
  called = import.meta.url === pathToFileURL(process.argv[1]).href;
} catch {
  called = false;
}
if (called) console.log(JSON.stringify(roundTrip(cliArgs()), null, 2));
