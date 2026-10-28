// What one round trip costs at Lakshmishree (Lakshmishree Investment &
// Securities Pvt Ltd): buy n shares, sell them back, in dollars. Online
// delivery. Not intraday, not F&O.
//
// India, https://www.lakshmishree.com/brokerage-calculator/Equity-Delivery.php
// read on 2026-10-26 (and its script, brokerage-calculator/css/abc.js).
//   Brokerage, delivery         "Rs 17 Per Executed Order", charged on the
//                               buy and on the sell (calc1: buybroker =
//                               sellbroker = 17). The "Fix Monthly Plan"
//                               column has no price and its "Rs 8" option
//                               is hidden: not a plan. Intraday is the same
//                               ₹17: no same day remark.
//   STT                         0.1% on buy and sell
//   Stamp                       0.015% on the buy
//   Transaction                 the calculator still carries NSE
//                               0.00325% and BSE 0.00375% (its radio
//                               values), an old table. Exchange charges
//                               are the exchange's: NSE 0.00307%, BSE by
//                               scrip group (BSE's own table,
//                               ../bajaj/indiaAbroad.mjs).
//   SEBI                        ₹10 per crore (the calculator's ₹15 on
//                               ₹1 crore is an old rate)
//   GST                         18% on brokerage + transaction + SEBI
//   DP on a delivery sell       the CDSL fiche of DP 12059100 (the DP ID
//                               the page footer prints),
//                               https://www.cdslindia.com/dp/dpdetails.aspx?dp_id=59100
//                               read on 2026-10-26: "Transaction (Debit) :
//                               Rs. 15/- + (GST) PER Transaction"
// AMC (online e-KYC: lifetime nil) is not per trade.
//
// United States, https://www.lakshmishree.com/global-investing read on
// 2026-10-26: "Invest in top US stocks", assets with "top-tier US regulated
// clearing partners (e.g., DriveWealth/Apex)". No commission, no platform
// and no partner is named, and the account is funded "via net banking
// using the Liberalised Remittance Scheme" (deposits.mjs: INR only), a
// conversion at an unprinted rate. The US lines stay N/A (`why`).
//
//   node brokers/lakshmishree/lakshmishree_cost.mjs INE002A01018 NSE INR --shares=10 --price=1400
//   node brokers/lakshmishree/lakshmishree_cost.mjs INE002A01018 BSE INR --shares=10 --price=1400
//   node brokers/lakshmishree/lakshmishree_cost.mjs AAPL XNAS USD --shares=10 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { pathToFileURL } from "node:url";
import { indiaRoundTrip, pct, sebiRate } from "../../indianDelivery.mjs";
import { BSE_TABLE_BASIS, bseTxnRate, catalogueRows, cliArgs, goesToIndia, usRoundTrip } from "../bajaj/indiaAbroad.mjs";

const CATALOGUE = new URL("lakshmishree-parsed.json", import.meta.url);
const PAGE = "https://www.lakshmishree.com/brokerage-calculator/Equity-Delivery.php";
const US_PAGE = "https://www.lakshmishree.com/global-investing";
const READ_ON = "2026-10-26";

function txnRate(exchange, row) {
  if (exchange === "NSE") return pct("0.00307");
  if (exchange === "BSE") return bseTxnRate(row, catalogueRows(CATALOGUE));
  return null;
}

const INDIA = {
  broker: "Lakshmishree",
  folder: "lakshmishree",
  catalogueUrl: CATALOGUE,
  url: PAGE,
  readOn: READ_ON,
  brokerageEach: () => 17,
  txnRate,
  sttRate: pct("0.1"),
  stampRate: pct("0.015"),
  sebiRate: sebiRate(),
  gstRate: 0.18,
  gstOnDp: true,
  ipftRate: 0,
  dpInr: 15,
  basis: `Courtage livraison 17 ₹ par ordre exécuté. DP 15 ₹ + GST par transaction à la vente (fiche CDSL 59100). ${BSE_TABLE_BASIS}`,
  remark: "",
};

const US = {
  broker: "Lakshmishree",
  folder: "lakshmishree",
  catalogueUrl: CATALOGUE,
  url: US_PAGE,
  readOn: READ_ON,
  dealer: null,
  basis: `Investissement global, page relue le ${READ_ON}.`,
  noTariff: () =>
    "Lakshmishree n'imprime ni commission ni partenaire pour les actions US, et le compte est alimenté en roupies converties à un taux non publié",
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
