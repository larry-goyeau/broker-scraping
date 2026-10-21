// What one round trip costs at IBKR for a UK resident: buy n shares at price
// p, sell them straight back, online, in dollars.
//
// Interactive Brokers (U.K.) Limited (FCA 208159) is the contracting broker;
// the funding tool on the .co.uk site files a UK resident under it, with GBP
// as the domestic currency. The catalogue is the IBKR group's stock and ETF
// book under the "co.uk" domain (`ibkruk_scraping.mjs`). The price list is
// IBUK's, read on 2026-10-20:
//
//   https://www.interactivebrokers.co.uk/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.co.uk/en/pricing/commissions-spot-currencies.php
//
// Its stock tables are word for word the Canadian ones (no IBKR Lite column
// on .co.uk; it adds "Commissions on Western European stocks is just £3/€3
// per trade ... over £6000/€6000 the cost is .05%", which is the same rule).
// The rules, third-party fees, N/A places and FX treatment are the ones
// written out in brokers/ibkrca/ibkrca_cost.mjs, shared through `makeIbkr`:
// IBKR Pro Fixed + IB SmartRouting (US USD 0.005 a share, min 1, max 1 %;
// LSE 0.05 % min GBP 3; Europe 0.05 % min EUR 3 ...), Tiered only where
// nothing else is printed (Korea, Taiwan, Malaysia, Brazil). UK stamp duty
// (0.5 % on a UK share purchase, "applied to all UK share purchases") comes
// from taxMap; the PTM levy (GBP 1.50 a side above GBP 10 000) from the
// shared file. VAT "where applicable": a trade commission is VAT-exempt in
// the UK, so no rate. The account is in GBP; a listing in one of the 22
// deposit currencies (deposits.mjs) is a remark, "FX 0.03% when cash ≠
// CCY." (the auto-conversion spread), any other (KRW, TWD, MYR, BRL, SAR,
// RON, CNY) converts both ways at 0.03 % in the total. Custody is free (a
// minimum activity fee applies to ISA/JISA accounts only). US book:
// Interactive Brokers LLC's 606 Q (IBUK's US orders are carried there).
//
//   node brokers/ibkruk/ibkruk_cost.mjs 100D XLON GBP --shares=50 --price=90
//   node brokers/ibkruk/ibkruk_cost.mjs AAPL XNAS USD --shares=5 --price=230
//   node brokers/ibkruk/ibkruk_cost.mjs 0E5F XETR EUR --shares=20 --price=30
//
// `roundTrip(...)` reads files, not the network.

import { makeIbkr, runCli } from "../ibkrca/ibkrca_cost.mjs";

const ibkruk = makeIbkr({
  folder: "ibkruk",
  entity: "Interactive Brokers (U.K.) Limited",
  base: "GBP",
  page: "https://www.interactivebrokers.co.uk/en/pricing/commissions-stocks.php",
  catalogueUrl: new URL("ibkruk-parsed.json", import.meta.url),
});

export const roundTrip = ibkruk.roundTrip;

runCli(import.meta.url, roundTrip);
