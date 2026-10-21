// What one round trip costs at Interactive Brokers Securities Japan: buy n
// shares at price p, sell them straight back, online, in dollars.
//
// Interactive Brokers Securities Japan Inc. (IBSJ, Kanto Local Finance
// Bureau No. 187). The fee guideline IBSJ hands out under FIEA art. 37-3
// (手数料ガイドライン, June 2023) sends Japanese and foreign stock fees to
// the web price list. Read on 2026-10-20:
//
//   https://www.interactivebrokers.co.jp/en/pricing/commissions-stocks.php
//   https://www.interactivebrokers.co.jp/jp/pricing/commissions-stocks-asia-pacific.php
//   https://www.interactivebrokers.co.jp/en/pricing/commissions-spot-currencies.php
//   https://www.interactivebrokers.co.jp/aces/Agreement/AgreementVersion/4101/8885
//
// "All commissions and fees include the 10% Japanese consumption tax", so
// nothing is added on top. The amounts are the global card's (shared
// through `makeIbkr` from brokers/ibkrca/ibkrca_cost.mjs), on fewer
// markets: IBSJ prints the United States, Canada, Mexico, Belgium, France,
// Germany, Italy, the Netherlands, Norway, Spain, Sweden, Switzerland, the
// UK, Australia, Hong Kong, Japan, Singapore, Korea and Taiwan.
//
//   Japan (TSE)      0.08 %, min JPY 80, Fixed: no third-party fee.
//   United States    USD 0.005 a share, min 1, max 1 %; SEC 0.0000206 of a
//                    sale, CAT. The IBSJ page still prints FINRA TAF USD
//                    0.000195 a share sold; FINRA's fee holiday (1 Oct -
//                    31 Dec 2026) is on the other IBKR pages and the
//                    shared code keeps TAF at 0.
//   Canada           CAD 0.01 a share, min 1, max 0.5 % (USD lines: TSX
//                    only). Alpha Exchange is a Canadian venue on this
//                    card (its fees are in the Canada third-party list).
//   Mexico 0.10 % min MXN 60. Europe 0.05 % min EUR 3 / GBP 3 / CHF 5 /
//   USD 4 / NOK, SEK 49; Swedish EUR 0.10 % min 4; Swiss JPY 0.08 % min
//   80. Hong Kong 0.08 % min HKD 18 / USD 2.25 / CNH 15 plus SFC, FRC and
//   stamp. Australia 0.08 % min AUD 6. Singapore 0.08 % min SGD 2.50 ...
//   Korea and Taiwan print Tiered only (first bucket, as on ibkrca).
//
// Not on the IBSJ card, so N/A: Austria, the Baltics, Czechia, Denmark,
// Hungary, Poland, Portugal, Romania, Slovenia, Brazil, Israel, Saudi
// Arabia, the UAE, Malaysia, Stock Connect, Helsinki, Dublin and
// Johannesburg.
//
// FX: IBSJ takes JPY, USD, EUR and GBP (deposits.mjs). A listing in one of
// them is a remark ("FX 0.03% when cash ≠ CCY."); any other currency is
// auto-converted both ways at the 0.03 % IBSJ prints, in the total. A
// manual conversion back to JPY costs USD 2 a ticket; not part of this
// trip. US book: Interactive Brokers LLC's 606 Q.
//
//   node brokers/ibkrjp/ibkrjp_cost.mjs 7203 XTKS JPY --shares=100 --price=3000
//   node brokers/ibkrjp/ibkrjp_cost.mjs AAPL XNAS USD --shares=5 --price=230
//   node brokers/ibkrjp/ibkrjp_cost.mjs 700 XHKG HKD --shares=100 --price=500
//
// `roundTrip(...)` reads files, not the network.

import { makeIbkr, runCli } from "../ibkrca/ibkrca_cost.mjs";

export const READ_ON = "2026-10-20";

// Markets the IBSJ page does not print.
const OFF_CARD = ["at", "baltic", "cz", "dk", "hu", "pl", "pt", "ro", "si", "br", "il", "sa", "adx", "dfm", "my", "connect"];

const ibkrjp = makeIbkr({
  folder: "ibkrjp",
  entity: "Interactive Brokers Securities Japan",
  base: "JPY",
  page: "https://www.interactivebrokers.co.jp/en/pricing/commissions-stocks.php",
  catalogueUrl: new URL("ibkrjp-parsed.json", import.meta.url),
  markets: Object.fromEntries(OFF_CARD.map((key) => [key, null])),
});

export const roundTrip = ibkrjp.roundTrip;

runCli(import.meta.url, roundTrip);
