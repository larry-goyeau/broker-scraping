// What one round trip costs at IBKR for an Australian resident: buy n shares
// at price p, sell them straight back, online, in dollars.
//
// Interactive Brokers Australia Pty Ltd (AFSL 453554; ASX, ASX 24 and Cboe
// Australia participant) is the contracting broker; the funding tool on the
// .com.au site files an Australian resident under it, with AUD as the
// domestic currency. The catalogue is the IBKR group's stock and ETF book
// under the "com.au" domain (`ibkrau_scraping.mjs`). The price list is
// IBKR Australia's, read on 2026-10-20:
//
//   https://www.interactivebrokers.com.au/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.com.au/en/pricing/commissions-spot-currencies.php
//
// Its stock tables are word for word the Canadian ones (no IBKR Lite
// column), shared through `makeIbkr` in brokers/ibkrca/ibkrca_cost.mjs:
// IBKR Pro Fixed + IB SmartRouting (US USD 0.005 a share, min 1, max 1 %;
// Europe 0.05 % min EUR 3 ...; Hong Kong 0.08 % min HKD 18 ...), Tiered
// only where nothing else is printed (Korea, Taiwan, Malaysia, Brazil).
// One difference: the Australia table (ASX, Cboe Australia: 0.08 %, min
// AUD 6) is printed "Exclusive of GST" with an "Inclusive of GST" toggle
// (x 1.1: "400 Shares @ AUD 50 = AUD 16.00", "AUD 17.60" with GST), and
// "GST is only applied for Australian resident clients". So the 10 % GST is
// on the commission of an Australian trade. No other stock table carries
// GST, so none elsewhere.
//
// The account is in AUD; a listing in one of the five deposit currencies
// (AUD, EUR, GBP, HKD, USD; deposits.mjs) is a remark, "FX 0.03% when cash
// ≠ CCY." (the auto-conversion spread, which carries no commission and so
// no GST), any other (JPY, CAD, CHF, SGD, KRW, ...) converts both ways at
// 0.03 % in the total. Custody is free. US book: Interactive Brokers LLC's
// 606 Q (IBKR Australia's US orders are carried there).
//
//   node brokers/ibkrau/ibkrau_cost.mjs 10X XASX AUD --shares=1000 --price=0.5
//   node brokers/ibkrau/ibkrau_cost.mjs 1GOV XASX AUD --shares=200 --price=50
//   node brokers/ibkrau/ibkrau_cost.mjs AAPL XNAS USD --shares=5 --price=230
//
// `roundTrip(...)` reads files, not the network.

import { makeIbkr, runCli } from "../ibkrca/ibkrca_cost.mjs";

export const GST = 0.1;

const ibkrau = makeIbkr({
  folder: "ibkrau",
  entity: "Interactive Brokers Australia",
  base: "AUD",
  page: "https://www.interactivebrokers.com.au/en/pricing/commissions-stocks.php",
  catalogueUrl: new URL("ibkrau-parsed.json", import.meta.url),
  commissionTax: { rate: GST, label: "GST 10 % (résident australien, grille Australie)", markets: ["au"] },
});

export const roundTrip = ibkrau.roundTrip;

runCli(import.meta.url, roundTrip);
