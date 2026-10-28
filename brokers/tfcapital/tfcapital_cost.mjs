// What one round trip costs at TF Capital (TF Capital AD Podgorica): buy n
// shares at price p in the TF Trader app, sell them back at once, in
// dollars. US shares and ETFs; clearing, settlement and custody at Alpaca
// Securities LLC. Montenegro Stock Exchange orders are taken by the
// brokerage team (office or e-mail), not online, and are not in the
// catalogue.
//
// The pricing page, read on 2026-10-26:
//   https://tfcapital.me/en/pricing
//   "US Stock Exchanges, Trading via the TF Trader app — stocks and ETFs on
//   US exchanges", by transaction value, each side:
//     Up to $500.00             $2.50 + regulatory costs
//     Up to $1,000.00           $5.00 + regulatory costs
//     $1,000.00 and above       0.5% of transaction value + regulatory costs
//   "Regulatory costs (SEC / FINRA)":
//     SEC Fee (Sells only)      "$0.0000206 × $1,000 = $0.0206 → rounded up
//                               to $0.02" ("$20.60 per $1,000,000"; the
//                               headline "$27.80 / $1,000,000" and
//                               "$0.0000278" disagree with the page's own
//                               example and with Alpaca's current rate, so
//                               $20.60 a million is used)
//     FINRA TAF (Sells only)    $0.000195 a share, max $9.79 a trade
//     FINRA CAT (Buys and Sells) $0.000035 a share
//     each rounded up to the cent, per trade, as the page's examples do.
//   "What you don't pay": account opening, custody, withdrawal, closing,
//   inactivity, "Spread on stocks and ETFs trading $0".
//   "Currency conversion fee 0.25% Applied to all deposits converted from
//   EUR to a foreign currency".
//
// Money. The account's base currency is EUR (deposits.mjs: EUR); no dollar
// deposit is named for the TF Trader account. A dollar line is therefore a
// forced conversion: 0.25 % of the amount bought goes in the total. The
// page prices only the EUR → foreign leg; the sale's dollars stay on the
// Alpaca account, so one conversion is counted.
//
// Formula: commission both ways + CAT on the buy + SEC, TAF and CAT on the
// sell (each up to the cent) + 0.25 % FX + the book.
//
// Book: Alpaca Securities LLC's 606 once spreads/rule606.mjs maps
// "tfcapital" to "alpaca" (as investlink); until then the quoted NBBO.
//
//   node brokers/tfcapital/tfcapital_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node brokers/tfcapital/tfcapital_cost.mjs AAPL NASDAQ USD --shares=3 --price=230
//   node brokers/tfcapital/tfcapital_cost.mjs SPY AMEX USD --shares=10 --price=500
//
// `roundTrip(...)` reads files, not the network.

import { makeLineCost, printLineCli, upCent } from "../xpbr/lineCost.mjs";

const PAGE = "https://tfcapital.me/en/pricing";
const READ_ON = "2026-10-26";
export const BANDS = [
  { upTo: 500, fee: 2.5 },
  { upTo: 1000, fee: 5 },
];
const RATE = 0.005;
const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const CAT_PER_SHARE = 0.000035;
const FX = 0.0025;

const fr = (x, d = 2) => Number(x).toFixed(d).replace(".", ",");

/** TF Capital's commission on one US order, in dollars. */
export function commission(notional) {
  const band = BANDS.find((b) => notional <= b.upTo + 1e-9);
  return band ? band.fee : notional * RATE;
}

export const roundTrip = makeLineCost({
  folder: "tfcapital",
  name: "TF Capital",
  catalogue: new URL("tfcapital-parsed.json", import.meta.url),
  url: PAGE,
  base: "EUR",
  price: ({ us, listing, notional, n }) => {
    if (!us) return { buy: null, sell: null, why: `TF Capital ne publie aucun tarif en ligne pour ${listing.exchange}` };
    const each = commission(notional);
    const cat = upCent(n * CAT_PER_SHARE);
    const sec = upCent(notional * SEC_RATE);
    const taf = upCent(Math.min(n * TAF_PER_SHARE, TAF_CAP));
    return {
      buy: each,
      sell: each,
      feeCurrency: "USD",
      regulatoryUsd: cat + sec + taf + cat,
      basis:
        `barème TF Capital relu le ${READ_ON} : TF Trader, 2,50 $ jusqu'à 500 $, 5,00 $ jusqu'à 1 000 $, 0,5 % au-delà, par ordre ; ` +
        `SEC 20,60 $ par million et TAF 0,000195 $ la part (plafond 9,79 $) à la vente, CAT 0,000035 $ la part à chaque sens, chacun arrondi au centime supérieur`,
      confidence:
        `${fr(each)} $ par ordre ; réglementaire ${fr(cat + sec + taf + cat)} $ (CAT ${fr(cat)} + SEC ${fr(sec)} + TAF ${fr(taf)} + CAT ${fr(cat)})`,
      forcedFx: { rate: FX },
      detail: { bands: BANDS, rate: RATE, sec, taf, cat: 2 * cat, fx: FX },
    };
  },
});

printLineCli(roundTrip, import.meta.url);
