// What one round trip costs at VM Wealth Management (VM Group, Jamaica):
// buy n shares at price p online, sell them straight back, in dollars.
// Jamaica Stock Exchange lines through JTrader (Main and Junior Markets in
// JMD, the USD Market in USD); US shares and ETFs on the Interactive
// Brokers platform VM sets the client up on ("Prefer to trade
// independently? We'll set you up"). Branch orders are other lines.
//
// Read on 2026-10-26.
//   https://vmwealth.myvmgroup.com/wp-content/uploads/2026/06/Schedule-of-Fees-Charges-March-2026.pdf
//     Page 4, "EQUITY TRADING", columns J$ and FX-USD:
//       Equity Trade Commission (Online)   2.5 %      2.5 %
//       Equity Trade Commission (In Branch) 2.5 %     2.5 %   (not online)
//       IB Trading (USD equities)          -          $0.025 Per unit
//       IB Trading (USD equities) Transfer fee        $41.00  (not a trade)
//     "NB: Charges include General Consumption Tax (GCT) of 15% unless
//     otherwise stated": 2.5 % each side, GCT inside; $0.025 a share, GCT
//     inside.
//   https://vmwealth.myvmgroup.com/personal-solutions/us-equities/
//     "Pay as little as US$10 per trade, with a cap at US$0.025 per
//     share": $0.025 a share with a $10 minimum an order, each side.
//
// Market charges on every JSE equity trade, each side, on the contract
// note (as ../gkcapital/gkcapital_cost.mjs reads them): JSE cess 0.32 % of
// the value traded ("On each side of the transaction", JSE Junior Market
// fee page, 2026; the cess covers all trades enacted on the JSE, USD Market
// included) and JCSD settlement 4 bp (JMD and USD schedules effective
// 1 January 2025). VM prints neither and says nothing of GCT on them, so
// they are taken without GCT, as GK does.
//   https://www.jamstockex.com/investors/fee-schedule/jse-junior-market-fees/
//   https://www.jamstockex.com/investors/fee-schedule/jcsd-broker-fees/
// Jamaica levies no stamp duty or transaction tax on a JSE trade.
// No SEC, TAF, CAT or IBKR third-party fee is printed for the US desk: 0.
//
// Each JSE side: 2.5 % + 0.32 % + 0.04 % = 2.86 %, 5.72 % for the round
// trip, no minimum printed.
//
// The account holds JMD and USD (deposits.mjs): each line settles in its
// own currency, no conversion; VM prints no FX rate, so no FX remark.
//
// Book: venues.mjs has no Jamaica Stock Exchange yet, so a JSE line has no
// bid and ask to read: `usd` is N/A and `why` says so; `brokerFees` is the
// commission. A US line uses Interactive Brokers LLC's 606 once
// spreads/rule606.mjs maps "vmwealth" to "interactivebrokers"; until then
// the quoted NBBO.
//
//   node brokers/vmwealth/vmwealth_cost.mjs NCBFG XJAM JMD --shares=1000 --price=70
//   node brokers/vmwealth/vmwealth_cost.mjs PROVEN XJAM USD --shares=50000 --price=0.059
//   node brokers/vmwealth/vmwealth_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/vmwealth/vmwealth_cost.mjs F XNYS USD --shares=1000 --price=11
//
// `roundTrip(...)` reads files, not the network.

import { makeLineCost, printLineCli } from "../xpbr/lineCost.mjs";

const SCHEDULE = "https://vmwealth.myvmgroup.com/wp-content/uploads/2026/06/Schedule-of-Fees-Charges-March-2026.pdf";
const US_PAGE = "https://vmwealth.myvmgroup.com/personal-solutions/us-equities/";
const READ_ON = "2026-10-26";
const RATE = 0.025; // online equity commission, GCT included, each side
const CESS = 0.0032; // JSE cess, each side
const SETTLEMENT = 0.0004; // JCSD settlement, each side
const US_PER_SHARE = 0.025;
const US_MIN = 10;

const fr = (x, d = 2) => Number(x).toFixed(d).replace(".", ",");

export const roundTrip = makeLineCost({
  folder: "vmwealth",
  name: "VM Wealth",
  catalogue: new URL("vmwealth-parsed.json", import.meta.url),
  url: SCHEDULE,
  price: ({ us, listing, notional, n }) => {
    if (us) {
      const each = Math.max(US_MIN, n * US_PER_SHARE);
      return {
        buy: each,
        sell: each,
        feeCurrency: "USD",
        url: US_PAGE,
        basis:
          `VM Wealth, barème du 2026-03 relu le ${READ_ON} : « IB Trading (USD equities) $0.025 Per unit », minimum 10 $ par ordre ` +
          `(« as little as US$10 per trade »), GCT comprise, à l'achat et à la vente ; SEC, TAF, CAT et frais tiers IBKR non imprimés, comptés 0`,
        confidence: each === US_MIN ? "minimum de 10 $ par ordre" : `${n} × 0,025 $ = ${fr(each)} $ par ordre`,
        detail: { perShare: US_PER_SHARE, min: US_MIN },
      };
    }
    if (listing.mic === "XJAM" || /jamaica/i.test(listing.brokerExchange || "")) {
      const each = notional * RATE;
      return {
        buy: each,
        sell: each,
        market: 2 * notional * (CESS + SETTLEMENT),
        basis:
          `VM Wealth, barème du 2026-03 relu le ${READ_ON} : « Equity Trade Commission (Online) » 2,5 % en J$ comme en USD, GCT comprise, ` +
          `à l'achat et à la vente ; cess JSE 0,32 % et règlement JCSD 0,04 % chaque sens`,
        confidence: `${fr(each)} ${listing.currency} de commission par ordre sur ${fr(notional)} ${listing.currency}`,
        detail: { rate: RATE, cess: CESS, settlement: SETTLEMENT },
      };
    }
    return { buy: null, sell: null, why: `VM Wealth ne publie aucun tarif pour ${listing.exchange}` };
  },
});

printLineCli(roundTrip, import.meta.url);
