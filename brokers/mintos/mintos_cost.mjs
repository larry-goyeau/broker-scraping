// What one round trip costs at Mintos (AS Mintos Marketplace, Riga, LV):
// buy n shares and sell them straight back, online, in dollars. Every
// catalogue line (4,000 shares, 1,000 UCITS ETFs, 130 crypto ETPs) is
// Tradegate BSX (XGAT) in EUR, executed through Upvest
// (mintos_scraping.mjs header, Order Execution Policy Appendix A). The
// place, the book and the taxes come from the shared module
// brokers/tradegatedirect/tradegateCost.mjs; this file passes Mintos's
// own order price.
//
// Tariff, read 2026-10-26:
//   https://www.mintos.com/en/how-it-works/fees/
//     Investing: "Free for ETFs, stocks, manual loans, and real estate."
//     "Crypto ETP  0.49% per transaction, minimum €0.99"
//     "Currency exchange  From 0.50% depending on the currency pair"
//   https://www.mintos.com/en/investing-in-crypto/
//     "a small fee on each buy or sell order you make of €0.99 or 0.49% of
//     the order amount, whichever is higher" → a side, on the buy and on
//     the sell. The same page's "zero fees for a limited time" is a
//     promotion, not the price list: the 0.49 % stays.
//   https://www.mintos.com/en/investing-in-stocks/
//     "Global stocks are offered natively in EUR on the Mintos platform,
//     and there are no foreign exchange (FX) charges added."
//     "You can invest in stocks from €1" (fractional euro amounts).
//   help.mintos.com 33574547117457 (fees and charges, 2026-10-02): the same
//     list; the 0.85 % Secondary Market fee is for loan / note sales.
//
// Crypto ETP = catalogue type ETN or ETC (the scraper keeps only crypto
// ETPs among them). Minimum order: €1 for shares and ETFs, €5 for crypto
// ETPs ("crypto investing via ETPs from €5"; an older help article says
// €1: the higher one is kept).
//
//   share / ETF     0 €
//   crypto ETP      max(0,49 %, 0,99 €) a side
//   FX              none: every line is EUR and EUR is a Mintos cash
//                   currency. Cash in CZK, GBP, KZT, PLN, SEK or MXN must be
//                   exchanged to EUR first ("Our platform does not support
//                   cross-currency investments", help 29836238795153) at
//                   "starting at 0.50%" (help 360001364498): remark only.
//
// Left out: custody (none), inactivity €4.90 a month (only an empty,
// unused account), card deposits 2 %, Smart Cash and loan products.
//
//   node brokers/mintos/mintos_cost.mjs US0378331005 Tradegate EUR --shares=4 --price=215
//   node brokers/mintos/mintos_cost.mjs FR0000121014 Tradegate EUR --shares=2 --price=430
//   node brokers/mintos/mintos_cost.mjs CH0454664001 Tradegate EUR --shares=20 --price=43

import { tradegateRoundTrip, pctFee, printCli } from "../tradegatedirect/tradegateCost.mjs";

const CRYPTO_ETP = ["ETN", "ETC"];
const isCrypto = (listing) => CRYPTO_ETP.includes(String(listing?.type || "").toUpperCase());

export const SCHEDULE = {
  broker: "Mintos",
  folder: "mintos",
  catalogueUrl: new URL("mintos-parsed.json", import.meta.url),
  url: "https://www.mintos.com/en/how-it-works/fees/",
  readOn: "2026-10-26",
  entity: "AS Mintos Marketplace (LV), exécution Upvest Securities GmbH sur Tradegate BSX",
  // Wallet currencies (help 9318879624849): CZK, EUR, GBP, KZT, PLN, SEK, MXN.
  cash: ["EUR", "CZK", "GBP", "KZT", "PLN", "SEK", "MXN"],
  fx: null,
  onlineBuy: true,
  basis:
    "grille Mintos relue le 2026-10-26 : actions et ETF gratuits, ETP crypto 0,49 % min 0,99 € par ordre, " +
    "tout en EUR sur Tradegate via Upvest",
  minBuy: ({ listing }) => (isCrypto(listing) ? 5 : 1),
  commission: ({ notionalEur, listing }) =>
    isCrypto(listing)
      ? pctFee(notionalEur, { rate: 0.0049, min: 0.99, label: "ETP crypto" })
      : { eur: 0, note: "0 € (actions et ETF)" },
  remark: "FX from 0.5% when cash ≠ EUR.",
};

export function roundTrip(query) {
  return tradegateRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
