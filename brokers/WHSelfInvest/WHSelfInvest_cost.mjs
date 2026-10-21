// What one round trip costs at WH SelfInvest: buy n shares at price p, sell
// them back at once, in dollars.
//
// The affine triple hid the floors. 0.09 % of a 2 300 $ Apple ticket is
// 2.07 $, but America is 0.01 $ a share with a 1.90 $ minimum, so ten
// shares pay 1.90 $ a side. `roundTrip` is given the size and charges
// what is charged.
//
// WH SELFINVEST S.A. (LU, CSSF), introducing broker onto Interactive
// Brokers. Catalogue `WHSelfInvest_scraping.mjs` — the IBKR book. Until
// that file has been run, this one answers that the book is missing.
// `nonEuResident` (no KID) stays priced; `listingAccepts` hides it from an
// EEA nationality, not from an empty country box.
// Options, futures, CFDs, turbos and telephone closes are not this trip.
//
// Tables re-read 2026-09-18 from
// https://www.whselfinvest.com/en-lu/investing-best-broker/all-exchanges-and-fees
// (same grid on the DE page). Marketing summaries disagree on the Swiss
// floor (9.95 vs 14 CHF) and the Xetra cap (99 vs 89 €); the exchange
// table is the one copied.
//
//   Xetra              0.09 %, min 3.90 €
//                      The page's 89 € cap is not the real account. On
//                      2026-10-13 U27795602 asked for 180 € on 200 000 €.
//   Frankfurt          0.09 %, min 3.90 €
//                      The page prints a specialist. On 2026-10-13
//                      U27795602 asked for the same 3.90 € as Xetra.
//   Stuttgart          0.09 %, min 3.90 €
//                      The page's 5.90 € is not this account: 4 000 €
//                      asked for 3.90 €.
//   Chi-X / BATS / Tradegate / Turquoise DE
//                      0.09 %, min 1.90 €
//   USA listed         0.01 $/share, min 1.90 $, cap 1 %
//   USA OTC / Pink     p < 1 $ : 0.00003 $/share ; else 0.003 $/share
//                      + NSCC/DTC 0.0002 $/share, cap 0.5 %
//   Canada             0.01 CAD/share, min 1 CAD, cap 1 %
//   UK                 0.10 %, min 7 £
//   Switzerland        0.09 %, min 14 CHF
//   Netherlands        0.09 %, min 1.90 €
//   AT                 0.09 %, min 2.65 €   (voestalpine, same account)
//   BE / FR / ES / IT / SE
//                      0.09 %, min 3.90 €
//   Vienna was grouped with those floors. The ticket is 2.65 €.
//   Norway             0.09 %, min 59 NOK
//   Mexico             0.20 %, min 70 MXN
//   Japan              0.09 %, min 200 JPY
//   Hong Kong          0.09 %, min 19 HKD
//   Australia          0.09 %, min 9.90 AUD
//
// "All exchange fees are included (exceptions are marked)." The page marks
// a Frankfurt specialist. On 2026-10-13, account U27795602, nothing sent:
// Lufthansa on FWB and on Xetra both asked for 3.90 € on 4 000 €, and one
// share near the market printed the same 1.90 … 3.90 € range. The
// specialist is not in the number. Stuttgart's specialist stays on the
// page only.
// TASE is not on the card. On 2026-10-10 the open portal previewed TEVA
// routed to TASE and nothing was sent. The quote is in agorot: a limit of
// 12,000 was a share at 120 ILS. One, ten and one hundred shares asked for
// 15 ILS. One thousand shares, notional 120,000, asked for 120 ILS, and
// five thousand asked for 600 ILS, which is 0.10 %. One share at 1 ILS
// also asked for 15 ILS, so the floor is 15 ILS. No cap appeared through
// 600,000 ILS. Taiwan is not on the card either. On 2026-10-10 the
// open portal previewed 2330 routed to TWSE and nothing was sent. One
// share at 2,550 asked for 80.51 TWD. Ten shares asked for 85.10. Thirty
// two shares asked for 96.32. Forty shares asked for 102, which is 0.10 %
// of 102,000. One thousand shares asked for 2,550 and five thousand for
// 12,750, still 0.10 %. The charge is the larger of 0.10 % and 80 TWD
// plus 0.02 %. No cap appeared. The rest of the IBKR book that is not on the card stays N/A,
// not a neighbour's floor. Singapore is not on the card either. On
// 2026-10-10 the open portal previewed D05 (DBS) routed to SGX and
// nothing was sent. One share at 73.36 asked for 2.50 SGD. One hundred
// shares asked for 5.87 SGD, which is 0.08 % of 7,336. One thousand
// shares asked for 58.69 SGD and ten thousand asked for 586.88 SGD,
// still 0.08 % of 733,600. No cap appeared. A one-share order at 1 SGD
// also asked for 2.50 SGD, so the floor is 2.50 SGD.
// Warsaw is not on the card either. On 2026-10-05 the open portal
// (account DUR224479) previewed PKO and ETFBCASH on WSE and nothing was
// sent. One share and a hundred shares asked for 15 PLN. A thousand shares
// asked for 0.10 % of the consideration (118.58 PLN on PKO at 118.58,
// 146.98 PLN on ETFBCASH at 146.98). Copenhagen is not on the card
// either. On 2026-10-07 the open portal previewed EMBLA on CPH and
// nothing was sent. One share and 3 500 shares asked for 49 DKK.
// 3 600 shares at 27.85 asked for 50.13 DKK, which is 0.05 % of
// 100 260. 50 000 shares asked for 696.25 DKK, still 0.05 %. No cap
// appeared. Prague is not on the card either. On 2026-10-08 the open
// portal previewed CEZ routed to PRA and nothing was sent. One share
// and ten shares at 1 332 asked for 70 CZK. 100 shares asked for
// 199.80 CZK, which is 0.15 % of 133 200. 1 000 shares asked for
// 1 998 CZK, still 0.15 %. No cap appeared. That is IBKR fixed for the
// Czech Republic. The spread is not on this ticket. Helsinki is not on
// the card either. On 2026-10-08 the open portal previewed NOKIA routed
// to HEX and nothing was sent. One, 20, 100 and 500 shares at 9.26
// asked for 3 EUR. 2 000 shares asked for 9.26 EUR, which is 0.05 % of
// 18 520. 20 000 shares asked for 92.60 EUR, still 0.05 %. No cap
// appeared. That is IBKR fixed for western Europe. The real account
// U27795602 on 2026-10-13 does not bill it: 0.09 %, minimum 3.90 €.
// Ljubljana is not on
// the card either. On 2026-10-10 the open portal previewed KRKG routed
// to LJSE and nothing was sent. One share at 258 asked for 3 EUR. Ten
// shares asked for 9.03 EUR, which is 0.35 % of 2 580. Fifty, 100, 400
// and 2 000 shares stayed on 0.35 %, the last of them at 1 806 EUR. No
// cap appeared. That is IBKR fixed for Slovenia. gettex is not on the
// card either. On 2026-10-10 the open portal previewed BMW routed to
// GETTEX and to GETTEX2 and nothing was sent. One, ten and a hundred
// shares at 53.60 asked for 3 EUR. Four hundred shares asked for
// 10.72 EUR, which is 0.05 % of 21,440. Two thousand shares asked for
// 53.60 EUR, still 0.05 % of 107,200. No cap appeared. The real account
// U27795602 on 2026-10-13 bills 0.09 %, minimum 3.90 €. São Paulo is not
// on the card either. On 2026-10-10 the open portal previewed PETR4
// routed to B3 and nothing was sent. One share at 56 BRL asked for
// 0.06 BRL. One hundred shares asked for 5.60, one thousand for 56,
// five thousand for 280 and twenty thousand for 1,120. That is 0.10 %
// at every size. One share at 0.50 BRL asked for 0.00, so no floor
// appeared. No cap appeared through 1,120,000 BRL. Tadawul is not on
// the card either. On 2026-10-10 the open portal previewed 2222 routed
// to TADAWUL and nothing was sent. One share at 25.74 asked for 0.03 SAR,
// ten for 0.26, one hundred for 2.57, one thousand for 25.74, five
// thousand for 128.70 and twenty thousand for 514.80. That is 0.10 %.
// One share at 1 SAR asked for 0.00, so no floor appeared. No cap
// appeared through 514,800 SAR. The spread is not on
// this ticket. KRX is not on the
// card either. The portal cash check on 122450,
// 2026-09-28, named it: 100 shares at 2 550 asked for 170.90 EUR, and
// 3 000 shares asked for 5 050.90 EUR. That is 4 000 KRW, then 4 590 KRW,
// which is 0.06 %, not the 0.09 % of the other rows. No order was sent.
//
// Bursa is not on the card either. On 2026-10-02 the open portal
// (account DUR224479) previewed 3REN on BURSAMY and nothing was sent.
// The commission line is IBKR tier I, not the 0.09 % of the other rows:
// 0.08 % minimum 12 MYR, plus stamp 0.1 % rounded up to the next ringgit
// (maximum 1 000; none on an ETF), clearing 0.03 % (maximum 1 000) and
// 43.40 MYR of settlement. The same line was measured on CapTrader.
//   100 at 0.375     56.41 MYR
//   200 at 0.375     56.42
//   1 000 at 0.375   56.51
//   10 000 at 0.375  60.52
//   100 000 at 0.375 122.65
// Crypto (Zero Hash / Paxos) has no published % .
//
// The American and Canadian caps bind the per-share amount and the
// minimum binds the result, in that order. Floor-then-cap would let 1 %
// of a cheap share cut under 1.90 $.
//
// What is in the number: the commission each way at its floor and cap;
// OTC clearing as printed; UK 0.50 % and Irish 1 % stamp on a share
// purchase (taxMap, else the rates the page says it passes through);
// French / Italian FTT, which the page says it withholds (Italy is
// carried locally — the root map reads Trading212's off-venue zero);
// current SEC and TAF on an American sale (the OTC table still prints
// 0.0000218 / 0.000119 / 5.95 $). CAT is not named. PTM and HK stamp
// are not on the page and are not invented.
//
// Cash is not imposed — the IBKR account holds the listing currency —
// so FX stays in the remark. On 2026-10-13, account U27795602, nothing
// sent: selling euros on IDEALPRO asked for a flat euro amount, the same
// at 100 € and at 1 000 €. The 0.2 bp is still under that minimum here.
// Inactivity
// (1 $ / month under 1 000 $ NAV with no order), the first withdrawal
// free then 1 € SEPA / 8 € wire, and real-time quotes stay in the remark.
// USA-ADRs print 0.01–0.02 $/share with no floor: the trip uses 0.01, in
// brokerFees, only on a US-listed name that calls itself ADR / GDR / ADS.
// Opening, custody, dividends and TWS are free.
//
//   https://www.whselfinvest.com/en-lu/investing-best-broker/all-exchanges-and-fees
//   https://www.whselfinvest.com/en-DE/investing-best-broker/all-exchanges-and-fees
//
//   node brokers/WHSelfInvest/WHSelfInvest_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node brokers/WHSelfInvest/WHSelfInvest_cost.mjs VWCE IBIS2 EUR --shares=10 --price=140
//   node brokers/WHSelfInvest/WHSelfInvest_cost.mjs TTE SBF EUR --shares=10 --price=60
//   node brokers/WHSelfInvest/WHSelfInvest_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, fxRemark } from "../../fx.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("whselfinvest-parsed.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.whselfinvest.com/en-lu/investing-best-broker/all-exchanges-and-fees",
  de: "https://www.whselfinvest.com/en-DE/investing-best-broker/all-exchanges-and-fees",
  readOn: "2026-09-18",
  entity: "WH SELFINVEST S.A. (LU), IBKR introducing broker",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS", "IEX"]);
// Italian FTT on a market buy, 0.2 % from 1 Jan 2026 (L. 199/2025).
const OWN_FTT = { IT: { name: "ITALIAN_FTT", rate: 0.002 } };

const SPECIALIST_ON_PAGE = {
  frankfurt: { rate: 0.000504, min: 2.52 },
  stuttgart: { rate: 0.000672, min: 0.63, dax: 0.000336 },
};

const WITHDRAW = { firstFree: true, sepa: 1, wire: 8, ccy: "EUR" };
const INACTIVITY = { navBelow: 1000, fee: 1, ccy: "USD" };
const FX_BP = 0.00002;
// The portal billed euros. These are that charge times the EUR.USD bid
// of the same preview, 1.12014. U27795602, 2026-10-13, nothing sent.
const FX_MIN_USD = {
  USD: 3.52, GBP: 4.64, CHF: 4.21, ZAR: 3.64, PLN: 3.57,
  ILS: 3.26, SGD: 3.06, CNH: 3, HUF: 2.77, CAD: 2.46,
  AUD: 2.44, HKD: 2.43, DKK: 2.25, MXN: 2.14,
  JPY: 2.01, SEK: 2.01, NOK: 2.01, CZK: 2.01,
};

const RULE = {
  us: { perShare: 0.01, min: 1.9, maxPct: 0.01, ccy: "USD" },
  // The USA-ADRs row: 0.01–0.02 $/share, no minimum, no cap. 0.01 is the
  // figure they print first; 0.015 would be invented.
  adr: { perShare: 0.01, ccy: "USD" },
  ca: { perShare: 0.01, min: 1, maxPct: 0.01, ccy: "CAD" },
  otc: { perShareLow: 0.00003, perShareHigh: 0.003, clearPerShare: 0.0002, clearMaxPct: 0.005, ccy: "USD" },
  // U27795602, 2026-10-13. 0.09 % from 10 000 € (9 €) through 200 000 €
  // (180 €). The page's 89 € cap does not bind.
  xetra: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  cheap: { rate: 0.0009, min: 1.9, ccy: "EUR" },
  frankfurt: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  // U27795602, 2026-10-13. 4 000 € asked for 3.90 €, not the page's 5.90 €.
  stuttgart: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  // Same account. One voestalpine share at 1 € asked for 2.65 €.
  // 100 000 € asked for 90 €, which is 0.09 %.
  at: { rate: 0.0009, min: 2.65, ccy: "EUR" },
  ch: { rate: 0.0009, min: 14, ccy: "CHF" },
  uk: { rate: 0.001, min: 7, ccy: "GBP" },
  fr: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  be: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  nl: { rate: 0.0009, min: 1.9, ccy: "EUR" },
  es: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  it: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  // U27795602, 2026-10-13. Apotea and Axfood asked for 39 SEK
  // through 2 000 SEK. The 0.09 % is still under that floor.
  se: { rate: 0.0009, min: 39, ccy: "SEK" },
  no: { rate: 0.0009, min: 59, ccy: "NOK" },
  mx: { rate: 0.002, min: 70, ccy: "MXN" },
  jp: { rate: 0.0009, min: 200, ccy: "JPY" },
  hk: { rate: 0.0009, min: 19, ccy: "HKD" },
  au: { rate: 0.0009, min: 9.9, ccy: "AUD" },
  // Not on the card. Portal cash check on 122450, 2026-09-28.
  kr: { rate: 0.0006, min: 4000, ccy: "KRW" },
  // Not on the card. Portal preview of 3REN, 2026-10-02. Statutory pieces
  // are added beside this rate in bursaStatutory.
  my: { rate: 0.0008, min: 12, ccy: "MYR" },
  // U27795602, 2026-10-13. PKO asked for 20 PLN through 1 000 PLN.
  // The 0.10 % is still under that floor. The 15 PLN was an older preview.
  wse: { rate: 0.001, min: 20, ccy: "PLN" },
  // U27795602, 2026-10-13. Not the 49 DKK of the earlier preview.
  // XACTC25 and Better Collective printed about 10 … 16.31 DKK through
  // 2 000 DKK. The 0.05 % is still under that top.
  cph: { rate: 0.0005, min: 16.31, ccy: "DKK" },
  // Not on the card. Portal preview of CEZ on PRA, 2026-10-08.
  // IBKR fixed: 0.15 %, minimum 70 CZK, no cap.
  pra: { rate: 0.0015, min: 70, ccy: "CZK" },
  // U27795602, 2026-10-13. Not the 0.05 % / 3 € of the earlier portal.
  // 4 000 € asked for 3.90 €, 10 000 € for 9 €. Same 0.09 % as Xetra.
  hel: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  // Not on the card. Portal preview of KRKG on LJSE, 2026-10-10.
  // IBKR fixed Slovenia: 0.35 %, minimum 3 EUR, no cap seen.
  si: { rate: 0.0035, min: 3, ccy: "EUR" },
  // U27795602, 2026-10-13. Not the 0.05 % / 3 € of the earlier portal.
  // BMW on GETTEX: 4 000 € asked for 3.90 €, 10 000 € for 9 €.
  gettex: { rate: 0.0009, min: 3.9, ccy: "EUR" },
  // Not on the card. Portal preview of PETR4 on B3, 2026-10-10.
  // 0.10 % at every size. One share at 0.50 BRL asked for 0.00, so no floor.
  // No cap through 1,120,000 BRL.
  brl: { rate: 0.001, ccy: "BRL" },
  // Not on the card. Portal preview of D05 on SGX, 2026-10-10.
  // 0.08 %, minimum 2.50 SGD, no cap through 733,600 SGD.
  sg: { rate: 0.0008, min: 2.5, ccy: "SGD" },
  // Not on the card. Portal preview of 2222 on TADAWUL, 2026-10-10.
  // U27795602, 2026-10-13. 2222: 0.105 %. 200 SAR asked for 0.21,
  // 2 000 for 2.10. One share at 10 SAR asked for 0.01.
  sar: { rate: 0.00105, ccy: "SAR" },
  // Not on the card. Portal preview of TEVA on TASE, 2026-10-10.
  // 0.10 %, minimum 15 ILS. No cap through 600,000 ILS.
  ils: { rate: 0.001, min: 15, ccy: "ILS" },
  // Not on the card. Portal preview of 2330 on TWSE, 2026-10-10.
  // The larger of 0.10 % and 80 TWD plus 0.02 %. No cap through 12,750,000 TWD.
  // Taipei Exchange, 2026-10-14, 3434: 80.01 on 50 TWD, 80.10 on 500, 80.40 on 2 000.
  twd: { rate: 0.001, min: 80, floorRate: 0.0002, ccy: "TWD" },
  // Same account, 2026-10-14. Al Buhaira. 5 AED through 2 000 AED,
  // 6 AED on 6 000, which is 0.10 %.
  adx: { rate: 0.001, min: 5, ccy: "AED" },
  // Air Arabia. 15 AED through 2 000 AED, 25 AED on 6 000:
  // 15 plus 0.25 % of the amount above 2 000.
  dfm: { min: 15, flatUntil: 2000, excessRate: 0.0025, ccy: "AED" },
  // Jardine Matheson. 2.50 USD at 100 and at 1 000. 1 500 asked for 2.65,
  // which is 2.50 plus 0.03 % of the amount above 1 000. 1 800 asked for
  // 2.78 and 2 000 for 2.87, a few cents more than that line.
  sgxUsd: { min: 2.5, flatUntil: 1000, excessRate: 0.0003, ccy: "USD" },
  // Galp. 1.90 EUR from 1 € through 1 600 €. The 3 000 € ticket printed
  // no commission. No percentage showed under that floor.
  bvl: { flat: 1.9, ccy: "EUR" },
  // Kingspan. 1.90 EUR from 10 € through 2 000 €. The Irish stamp is not
  // in that figure. No percentage showed under that floor.
  ised: { flat: 1.9, ccy: "EUR" },
  // Real account U27795602, 2026-10-13, nothing sent. Not the demo band.
  // OTP: 200 HUF plus 0.52 %. 100 HUF asked for 200.52, 40 000 for 408,
  // 80 000 for 616, 400 000 for 2 280. The 200 is added, not a floor.
  bux: { rate: 0.0052, plus: 200, ccy: "HUF" },
  // Not on the card. Real account U27795602, 2026-10-13, nothing sent.
  // Banca Transilvania: 1 000 RON asked for 10, 5 000 for 14, 8 000 for
  // 22.40. Same 0.28 %, floor 10 RON, as the demo. No cap.
  bvb: { rate: 0.0028, min: 10, ccy: "RON" },
  // Not on the card. Real account U27795602, 2026-10-13, nothing sent.
  // The demo floor was 15 CNH. Moutai and Wuliangye asked for 20 CNH
  // from 1 000 CNH through 15 000 CNH. This balance cannot reach the
  // notional where 0.08 % would clear 20 CNH, so the slope stays the
  // demo's.
  connect: { rate: 0.0008, min: 20, ccy: "CNH" },
  // Not on the card. Real account U27795602, 2026-10-14, nothing sent.
  // PPC on ATH asked for 1.90 EUR from 1 EUR through 2 000 EUR. Above
  // that the ticket prints no commission, so no percentage is stored.
  ath: { flat: 1.9, ccy: "EUR" },
  // Not on the card. Same account, 2026-10-14, nothing sent. TKM1T on
  // N.TALLINN asked for 10 EUR from 1 EUR through 2 000 EUR. Above that
  // the ticket prints no commission, so no percentage is stored.
  tal: { flat: 10, ccy: "EUR" },
  // Same account, 2026-10-14, nothing sent. BAL1R on N.RIGA asked for
  // 10 EUR from 1 EUR through 2 000 EUR. Above that the ticket prints
  // no commission, so no percentage is stored.
  rig: { flat: 10, ccy: "EUR" },
  // Same account, 2026-10-14, nothing sent. AKO1L on N.VILNIUS asked for
  // 10 EUR from 1 EUR through 2 000 EUR. Above that the ticket prints
  // no commission, so no percentage is stored.
  vil: { flat: 10, ccy: "EUR" },
};

const TO_VENUES = {
  TSE: "TSX",
  TSEJ: "TSEJ",
  "BVME.ETF": "BVME",
  "ENEXT.BE": "XBRU",
  LSEIOB1: "LSE",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const fxCcy = (currency) => {
  const c = String(currency || "").toUpperCase();
  if (c === "GBX") return "GBP";
  if (c === "CNH") return "CNY";
  return c;
};
const dollars = (amount, currency) => {
  const v = toUsd(amount, fxCcy(currency));
  return v == null ? null : Number(v.toPrecision(6));
};
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = fxCcy(from);
  const b = fxCcy(to);
  if (a === b) return amount;
  const usd = toUsd(amount, a);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}
const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(fxCcy(currency)) });
const venueRow = (row) => ({ ...row, exchange: TO_VENUES[row.exchange] || row.exchange });
const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const isCrypto = (row) =>
  String(row?.type || "").toUpperCase() === "CRYPTO" || /^(ZEROHASH|PAXOS|CRYPTO)$/i.test(String(row?.exchange || ""));
const isAmerican = (exchange, mic) => US_MICS.has(String(mic || "").toUpperCase()) || US_EX.has(loose(exchange));
export function feeMarketOf(exchange, mic, currency) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  if (code === "ZEROHASH" || code === "PAXOS" || code === "CRYPTO") return "crypto";
  // Tencent on PINK, U27795602, 2026-10-13: 1 share asked for 1.90 USD
  // and 400 shares at 4 USD asked for 4 USD. That is the listed US
  // schedule, not the OTC card.
  if (code === "PINK" || /PINK|OTCM/i.test(code)) return "us";
  if (code === "VALUE" || code === "ARCAEDGE" || code === "OTCBB") {
    return "otc";
  }
  if (m === "BATE" || m === "CHIX" || m === "TRQX" || code === "BATSEUR" || code === "CHIX" || code === "TRQX") {
    return "cheap";
  }
  if (code === "BATS" && (ccy === "EUR" || ccy === "GBP" || ccy === "CHF")) return "cheap";
  if (US_MICS.has(m) || US_EX.has(code)) return "us";
  if (code === "IBIS" || code === "IBIS2" || m === "XETR") return "xetra";
  if (
    code === "TGATE" ||
    code === "TRADEGATE" ||
    m === "XGAT"
  ) {
    return "cheap";
  }
  if (code === "FWB" || code === "FWB2" || m === "XFRA") return "frankfurt";
  if (code === "SWB" || code === "SWB2" || m === "XSTU") return "stuttgart";
  if (code === "VSE" || m === "XWBO") return "at";
  if (code === "EBS" || m === "XSWX") return "ch";
  if (code === "LSE" || code === "LSEETF" || code === "LSEIOB1" || code === "AQSE" || m === "XLON") return "uk";
  if (code === "TSE" || code === "TSX" || code === "VENTURE" || code === "AEQLIT" || code === "PURE" || m === "XTSE") return "ca";
  if (code === "TSEJ" || m === "XJPX" || m === "XTKS") return "jp";
  if (code === "SBF" || m === "XPAR") return "fr";
  if (code === "AEB" || m === "XAMS") return "nl";
  if (code === "ENEXTBE" || m === "XBRU") return "be";
  if (code === "BVME" || code === "BVMEETF" || m === "XMIL") return "it";
  if (code === "BM" || m === "XMAD" || m === "XMCE") return "es";
  if (code === "OSE" || code === "OMXNO" || m === "XOSL") return "no";
  if (code === "SFB" || m === "XSTO") return "se";
  if (code === "MEXI" || m === "XMEX") return "mx";
  if (code === "SEHK" || m === "XHKG") return "hk";
  if (code === "ASX" || m === "XASX") return "au";
  if (code === "KRX") return "kr";
  if ((code === "BURSAMY" || code === "BURSA" || m === "XKLS") && (!ccy || ccy === "MYR")) return "my";
  if (code === "WSE" || m === "XWAR") return "wse";
  if (code === "CPH" || m === "XCSE") return "cph";
  if (code === "PRA" || m === "XPRA") return "pra";
  if (code === "HEX" || m === "XHEL") return "hel";
  if (code === "LJSE" || m === "XLJU") return "si";
  if ((code === "GETTEX" || code === "GETTEX2" || m === "XMUN") && (ccy === "EUR" || !ccy)) return "gettex";
  if ((code === "B3" || code === "BVMF" || m === "BVMF" || m === "XBSP") && (ccy === "BRL" || !ccy)) return "brl";
  if (code === "SGX" || m === "XSES") {
    if (ccy === "USD") return "sgxUsd";
    if (ccy === "SGD" || !ccy) return "sg";
  }
  if ((code === "BVL" || m === "XLIS") && (ccy === "EUR" || !ccy)) return "bvl";
  if (code === "ISED" || m === "XDUB") return "ised";
  if (code === "ADX" || m === "XADS") return "adx";
  if (code === "DFM" || m === "XDFM") return "dfm";
  if ((code === "TADAWUL" || m === "XSAU") && (ccy === "SAR" || !ccy)) return "sar";
  if ((code === "TASE" || m === "XTAE") && (ccy === "ILS" || !ccy)) return "ils";
  if ((code === "TWSE" || code === "TPEX" || m === "XTAI") && (ccy === "TWD" || !ccy)) return "twd";
  if ((code === "SEHKNTL" || code === "SEHKSZSE") && (ccy === "CNH" || !ccy)) return "connect";
  if (code === "BUX" && (ccy === "HUF" || !ccy)) return "bux";
  if (code === "BVB" && ccy === "RON") return "bvb";
  if (code === "ATH" || m === "XATH") return "ath";
  if (code === "NTALLINN" || m === "XTAL") return "tal";
  if (code === "NRIGA" || m === "XRIS") return "rig";
  if (code === "NVILNIUS" || m === "XLIT") return "vil";
  return null;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rowsNamed(rows, asked, (r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCrypto(r) && loose(r.ticker) === asked;
  });
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(venueRow(r));
    const book = isCrypto(r)
      ? { leaf: null, mic: null }
      : spreadLeaf(spreads, {
          isin: r.isin,
          mic: venue?.mic ?? null,
          currency: r.currency,
          unsourced,
          broker: "whselfinvest",
          ticker: r.ticker,
        });
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic, r.currency) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    const hasBook = book.leaf?.bp != null || book.leaf?.perShare != null;
    if (hasBook) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (hasBook) mk.withBook += 1;
  }
  return out;
}

function nativeAmount(shares, price, currency) {
  if (shares == null || price == null) return null;
  const amount = Number(shares) * Number(price);
  if (!Number.isFinite(amount)) return null;
  return String(currency || "").toUpperCase() === "GBX" ? amount / 100 : amount;
}

export function taxesFor(isin, listing) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  const cc = String(isin || "").slice(0, 2).toUpperCase();
  const own = isStock(listing) ? OWN_FTT[cc] : null;
  const already = own && Object.keys(mapped).some((k) => /ITALIAN/i.test(k));
  const added = own && !already ? { [own.name]: own.rate } : {};
  const rates = { ...mapped, ...added };
  if (isStock(listing) && !Object.keys(rates).length) {
    if (cc === "IE" || listing.mic === "XDUB") return { tax, rates: { stamp: IE_STAMP }, added: ["stamp"], source: "whselfinvest" };
    if (cc === "GB" || listing.mic === "XLON") return { tax, rates: { stamp: UK_STAMP }, added: ["stamp"], source: "whselfinvest" };
  }
  return { tax, rates, added: Object.keys(added), source: Object.keys(mapped).length ? "taxMap" : null };
}

function remarkOf({ listing, market } = {}) {
  const lines = [];
  const raw = String(listing?.currency || "").toUpperCase();
  const settle = fxCcy(raw);
  const fxMin = FX_MIN_USD[raw === "CNH" ? "CNH" : settle];
  if (market !== "crypto") {
    lines.push(
      fxMin != null
        ? `FX min ${fxMin.toFixed(2)} USD when cash ≠ ${settle}.`
        : fxRemark((100 * FX_BP).toFixed(3).replace(/\.?0+$/, ""), settle)
    );
  }
  if (market === "adr") lines.push("USA-ADRs print $0.01–0.02/share; 0.01 used.");
  if (market === "stuttgart") {
    const s = SPECIALIST_ON_PAGE.stuttgart;
    lines.push(
      `Specialist ${(100 * s.rate).toFixed(4)}% (min ${s.min} €) is marked on the Stuttgart row and is not in the number.`
    );
  }
  return lines.join("\n");
}

function specialistSide(amountEur, spec) {
  if (!spec || !(amountEur > 0)) return null;
  const raw = amountEur * spec.rate;
  const charged = Math.max(spec.min, raw);
  return { raw, charged, floored: charged > raw, currency: "EUR" };
}

// Stamp, clearing and the flat settlement the portal folds into the
// commission line. An ETF pays no stamp.
function bursaStatutory(notional, type) {
  const fund = /^(ETF|ETN|ETC)$/.test(String(type || "").toUpperCase());
  const stamp = fund ? 0 : Math.min(1000, Math.ceil(Number(notional) * 0.001 - 1e-9));
  const clearing = Math.min(1000, Number(notional) * 0.0003);
  return stamp + clearing + 43.4;
}

/**
 * One side's commission, at the floor and under the cap.
 */
export function commissionSide({ shares, amount, price, market }) {
  const rule = RULE[market];
  if (!rule) return null;

  if (market === "otc") {
    if (shares == null || !Number.isFinite(Number(shares)) || price == null) return null;
    const ps = Number(price) < 1 ? rule.perShareLow : rule.perShareHigh;
    const raw = ps * Number(shares);
    const clearRaw = rule.clearPerShare * Number(shares);
    const clearCap = amount != null ? Number(amount) * rule.clearMaxPct : null;
    const clear = clearCap != null ? Math.min(clearRaw, clearCap) : clearRaw;
    return {
      raw: raw + clear,
      charged: raw + clear,
      clear,
      floored: false,
      capped: clearCap != null && clear < clearRaw,
      currency: rule.ccy,
    };
  }

  if (rule.perShare != null) {
    if (shares == null || !Number.isFinite(Number(shares))) return null;
    const raw = rule.perShare * Number(shares);
    const ceiling = rule.maxPct != null && amount != null ? Number(amount) * rule.maxPct : null;
    const capped = ceiling != null && ceiling < raw;
    const perShareAmount = capped ? ceiling : raw;
    const charged = rule.min != null ? Math.max(rule.min, perShareAmount) : perShareAmount;
    return {
      raw,
      charged,
      floored: rule.min != null && perShareAmount < rule.min,
      capped,
      currency: rule.ccy,
    };
  }

  if (rule.flat != null) {
    return { raw: rule.flat, charged: rule.flat, floored: false, capped: false, currency: rule.ccy };
  }
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  if (rule.plus != null) {
    const raw = Number(amount) * rule.rate + rule.plus;
    return { raw, charged: raw, floored: false, capped: false, currency: rule.ccy };
  }
  if (rule.band != null && rule.bandRate != null) {
    const n = Number(amount);
    const raw = n <= rule.band ? n * rule.rate : rule.band * rule.rate + (n - rule.band) * rule.bandRate;
    const floored = rule.min != null ? Math.max(rule.min, raw) : raw;
    return { raw, charged: floored, floored: rule.min != null && raw < rule.min, capped: false, currency: rule.ccy };
  }
  if (rule.flatUntil != null) {
    const n = Number(amount);
    const raw = n <= rule.flatUntil ? rule.min : rule.min + (n - rule.flatUntil) * rule.excessRate;
    return { raw, charged: raw, floored: false, capped: false, currency: rule.ccy };
  }
  if (rule.floorRate != null) {
    const n = Number(amount);
    const pct = n * rule.rate;
    const floor = rule.min + n * rule.floorRate;
    const charged = Math.max(pct, floor);
    return { raw: pct, charged, floored: pct < floor, capped: false, currency: rule.ccy };
  }
  const raw = Number(amount) * rule.rate;
  const floored = rule.min != null ? Math.max(rule.min, raw) : raw;
  const charged = rule.max != null ? Math.min(floored, rule.max) : floored;
  return { raw, charged, floored: rule.min != null && raw < rule.min, capped: rule.max != null && rule.max < floored, currency: rule.ccy };
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `brokerFees` is WH SelfInvest's ticket (and the printed OTC clearing).
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "" };

  if (!catalogue) {
    return { ...answer, why: "le catalogue WH SelfInvest n'existe pas encore : lancer `node brokers/WHSelfInvest/WHSelfInvest_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue WH SelfInvest` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez WH SelfInvest`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  const book = crypto
    ? { leaf: null, mic: null, unsourced: null }
    : spreadLeaf(spreads, {
        isin: m.row.isin,
        mic: m.venue?.mic ?? null,
        currency: m.row.currency,
        unsourced: m.unsourced,
        broker: "whselfinvest",
        ticker: m.row.ticker,
      });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: crypto ? m.row.exchange : m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const listed = feeMarketOf(m.row.exchange, listing.mic, listing.currency);
  // BABA on NYSE, same account: 1 share asked for 1.90 USD and 200 shares
  // at 5 USD asked for 2 USD. The order is the US schedule. The printed
  // 0.01–0.02 $/share ADR fee was not on that preview.
  const market = listed;
  const rule = market && market !== "crypto" ? RULE[market] : null;
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = isAmerican(m.row.exchange, listing.mic) || market === "us" || market === "adr" || market === "otc";
  const { tax, rates, added, source: taxSource } = taxesFor(listing.isin, listing);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf({ listing, market }),
    withdraw: WITHDRAW,
  };

  if (crypto || market === "crypto") {
    return {
      ...shared,
      basis: `aucun % crypto publié sur la carte actions WHS du ${SCHEDULE.readOn}`,
      why: "Zero Hash / Paxos est au catalogue IBKR, pas sur la carte actions / ETF",
    };
  }

  if (!rule) {
    // The commission stays N/A. The book, when it was measured, still has to
    // reach the spread column: that needs the trade the page converts with.
    const n = Number(shares);
    const p = Number(price);
    const notional = n > 0 && p > 0 ? nativeAmount(n, p, listing.currency) : null;
    const settle = listing.currency === "GBX" ? "GBP" : listing.currency;
    const notionalUsd = notional == null ? null : dollars(notional, settle);
    return {
      ...shared,
      ...(notional != null
        ? { trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency } }
        : {}),
      remark: [shared.remark, "No published commission for this exchange."].filter(Boolean).join("\n"),
      basis: `aucun palier publié pour ${listing.brokerExchange || listing.exchange || "cette place"} chez WH SelfInvest`,
      why:
        `${listing.brokerExchange || listing.exchange || "cette place"} n'a pas de palier sur la carte WHS ` +
        `du ${SCHEDULE.readOn}`,
    };
  }

  const basis =
    (market === "kr"
      ? `barème WH SelfInvest ${market}, lu le 2026-09-28 sur le contrôle de trésorerie du portail : `
      : market === "my"
        ? `barème WH SelfInvest ${market}, aperçu du portail le 2026-10-02 : `
        : market === "wse"
          ? `barème WH SelfInvest ${market}, aperçu du portail le 2026-10-05 : `
          : market === "cph"
            ? `barème WH SelfInvest ${market}, aperçu du portail le 2026-10-07 : `
            : market === "si" || market === "brl" || market === "sg" || market === "sar" || market === "ils" || market === "twd"
              ? `barème WH SelfInvest ${market}, aperçu du portail le 2026-10-10 : `
              : market === "pra"
                ? `barème WH SelfInvest ${market}, aperçu du portail le 2026-10-08 : `
                : market === "hel" || market === "gettex" || market === "bux" || market === "bvb" || market === "connect"
                  ? `barème WH SelfInvest ${market}, aperçu du compte U27795602 le 2026-10-13 : `
                : market === "ath" || market === "tal" || market === "rig" || market === "vil" || market === "adx" || market === "dfm" || market === "sgxUsd" || market === "bvl" || market === "ised"
                  ? `barème WH SelfInvest ${market}, aperçu du compte U27795602 le 2026-10-14 : `
            : `barème WH SelfInvest ${market}, relu le ${SCHEDULE.readOn} : `) +
    (rule.plus != null
      ? `${(100 * rule.rate).toFixed(2)} % plus ${rule.plus} ${rule.ccy} par ordre`
      : rule.band != null
      ? `${(100 * rule.rate).toFixed(2)} % jusqu'à ${rule.band} ${rule.ccy}, puis ${(100 * rule.bandRate).toFixed(2)} %` +
        (rule.min != null ? `, plancher ${rule.min} ${rule.ccy}` : "")
      : rule.flatUntil != null
      ? `${rule.min} ${rule.ccy} jusqu'à ${rule.flatUntil} ${rule.ccy}, puis ${(100 * rule.excessRate).toFixed(2)} % du surplus`
      : rule.floorRate != null
      ? `0,10 % par sens, ou ${rule.min} ${rule.ccy} plus 0,02 % si c'est davantage`
      : (rule.flat != null
      ? `${rule.flat} ${rule.ccy} par sens`
      : rule.rate != null
      ? `${(100 * rule.rate).toFixed(2)} % par sens`
      : market === "otc"
        ? `OTC ${rule.perShareLow}/${rule.perShareHigh} $ la part`
        : `${rule.perShare} ${rule.ccy} par part`) +
    (rule.min != null ? `, plancher ${rule.min} ${rule.ccy}` : "") +
    (rule.max != null ? `, plafond ${rule.max} ${rule.ccy}` : "") +
    (rule.maxPct != null ? `, plafond ${(100 * rule.maxPct).toFixed(Number.isInteger(100 * rule.maxPct) ? 0 : 1)} % du montant` : "")) +
    (market === "my"
      ? `, plus timbre 0,1 % arrondi au ringgit supérieur (plafond 1 000, aucun sur un ETF), compensation 0,03 % (plafond 1 000) et 43,40 MYR de règlement`
      : "");

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs",
    };
  }

  const notional = nativeAmount(n, p, listing.currency);
  const settle = fxCcy(listing.currency);
  const notionalUsd = dollars(notional, settle);
  const notionalInRule = convert(notional, settle, rule.ccy);

  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buyComm = commissionSide({ shares: n, amount: notionalInRule, price: p, market });
  const sellComm = commissionSide({ shares: n, amount: notionalInRule, price: p, market });
  const bursaExtra = market === "my" && notionalInRule != null ? bursaStatutory(notionalInRule, listing.type) : 0;
  const buyCharged = buyComm ? buyComm.charged + bursaExtra : null;
  const sellCharged = sellComm ? sellComm.charged + bursaExtra : null;
  const buyCommUsd = buyCharged != null ? dollars(buyCharged, buyComm.currency) : null;
  const sellCommUsd = sellCharged != null ? dollars(sellCharged, sellComm.currency) : null;
  const specialist = null;
  const specialistUsd = specialist ? dollars(specialist.charged, specialist.currency) : 0;
  const specialistRoundUsd = specialist ? plus(specialistUsd, specialistUsd) : 0;

  const stampUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_PER_SHARE * n, TAF_CAP) : 0;

  const usd = plus(bookUsd, buyCommUsd, sellCommUsd, specialistRoundUsd, stampUsd, secUsd, tafUsd);
  const brokerFees = plus(buyCommUsd, sellCommUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why:
            `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ` +
            `${m.unsourced?.why || "pas de source de spread"}`,
        }
      : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: {
      commission: finite(buyCommUsd, 6),
      native: buyComm
        ? {
            charged: finite(buyComm.charged, 6),
            raw: finite(buyComm.raw, 6),
            floored: buyComm.floored,
            capped: buyComm.capped,
            currency: buyComm.currency,
          }
        : null,
    },
    sell: {
      commission: finite(sellCommUsd, 6),
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      native: sellComm
        ? {
            charged: finite(sellComm.charged, 6),
            raw: finite(sellComm.raw, 6),
            floored: sellComm.floored,
            capped: sellComm.capped,
            currency: sellComm.currency,
          }
        : null,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(plus(buyCommUsd, sellCommUsd), 6),
      réglementaire: finite(plus(secUsd, tafUsd, specialistRoundUsd), 6),
      taxes: finite(stampUsd, 6),
    },
    commission: {
      rate: rule.rate ?? null,
      perShare: rule.perShare ?? null,
      min: rule.min ?? null,
      max: rule.max ?? null,
      maxPct: rule.maxPct ?? null,
      currency: rule.ccy,
      eachWay: true,
    },
    basis,
    confidence: confidenceOf({
      market,
      rule,
      buyComm,
      marketBp,
      marketPerShare,
      rates,
      taxPct,
      taxSource,
      added,
      american,
      unsourced: m.unsourced,
      listing,
      n,
      specialist,
    }),
  };
}

function confidenceOf({
  market,
  rule,
  buyComm,
  marketBp,
  marketPerShare,
  rates,
  taxPct,
  taxSource,
  added,
  american,
  unsourced,
  listing,
  n,
  specialist,
}) {
  const said = [];
  said.push(
    (market === "kr"
      ? `commission WH SelfInvest, palier ${market}, lue le 2026-09-28 sur le contrôle de trésorerie du portail, `
        : market === "my"
        ? `commission WH SelfInvest, palier ${market}, aperçu 3REN sur BURSAMY le 2026-10-02, `
        : market === "cph"
          ? `commission WH SelfInvest, palier ${market}, aperçu EMBLA sur CPH le 2026-10-07, `
          : market === "pra"
            ? `commission WH SelfInvest, palier ${market}, aperçu CEZ sur PRA le 2026-10-08, `
            : market === "hel"
              ? `commission WH SelfInvest, palier ${market}, aperçu NOKIA sur HEX le 2026-10-13, `
              : market === "si"
                ? `commission WH SelfInvest, palier ${market}, aperçu KRKG sur LJSE le 2026-10-10, `
                : market === "gettex"
                  ? `commission WH SelfInvest, palier ${market}, aperçu BMW sur GETTEX le 2026-10-13, `
                  : market === "brl"
                    ? `commission WH SelfInvest, palier ${market}, aperçu PETR4 sur B3 le 2026-10-10, `
                    : market === "sg"
                      ? `commission WH SelfInvest, palier ${market}, aperçu D05 sur SGX le 2026-10-10, `
                      : market === "sar"
                        ? `commission WH SelfInvest, palier ${market}, aperçu 2222 sur TADAWUL le 2026-10-10, `
                        : market === "ils"
                          ? `commission WH SelfInvest, palier ${market}, aperçu TEVA sur TASE le 2026-10-10, `
                          : market === "twd"
                            ? `commission WH SelfInvest, palier ${market}, aperçu 2330 sur TWSE le 2026-10-10, `
              : `commission WH SelfInvest, palier ${market}, lue le ${SCHEDULE.readOn} sur la carte all-exchanges, `) +
      `facturée par sens et convertie en dollars au mid BCE du ${FX_AS_OF}`
  );
  if (buyComm) {
    said.push(
      buyComm.capped
        ? `plafonnée : ${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
        : buyComm.floored
          ? `au plancher : le ticket de ${rule.min} ${rule.ccy} est toute la commission, ` +
            `le calcul au barème n'en donnerait que ${Number(buyComm.raw).toPrecision(3)}`
          : rule.min != null
            ? `au-dessus du plancher : ${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
            : `${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
    );
  }
  if (market === "frankfurt") {
    said.push(
      `spécialiste Francfort marqué sur la carte, hors total : ` +
        `le 2026-10-13 U27795602 demande le même 3,90 € que Xetra`
    );
  }
  if (market === "stuttgart") {
    const s = SPECIALIST_ON_PAGE.stuttgart;
    said.push(
      `spécialiste ${(100 * s.rate).toFixed(4)} % (min ${s.min} €) marqué en exception, hors total : ` +
        `aucun aperçu WHS dans ce dépôt`
    );
  }
  if (specialist) {
    said.push(
      `spécialiste Francfort ${Number(specialist.charged).toPrecision(3)} € par sens` +
        (specialist.floored ? `, au plancher de ${SPECIALIST_ON_PAGE.frankfurt.min} €` : "") +
        `, aperçu du 2026-09-29 : +2,52 € contre Xetra sur Lufthansa`
    );
  }
  if (rule.perShare != null && rule.min != null && n >= rule.min / rule.perShare) {
    said.push(
      `au-delà de ${Math.round(rule.min / rule.perShare)} parts la commission cesse d'être le ticket ` +
        `et devient ${rule.perShare} ${rule.ccy} la part`
    );
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp).toPrecision(4)} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet 605 × Q IBKR, ${marketPerShare} $ la part, aller-retour`);
  else said.push(`aucun carnet : ${unsourced?.why || "place sans source de spread"} — le total est N/A et non un total sans marché`);

  if (taxPct) {
    const named = Object.entries(rates)
      .map(([k, v]) => `${k} ${(100 * v).toFixed(2)} %`)
      .join(", ");
    said.push(
      `taxe à l'achat ${named}` +
        (added?.includes("ITALIAN_FTT")
          ? `, l'italienne vient de la note WHS (12/2015) et non de la carte racine`
          : taxSource === "whselfinvest"
            ? `, au taux imprimé par WH SelfInvest`
            : `, depuis taxMap.mjs`)
    );
  }
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant et TAF FINRA ${TAF_PER_SHARE} la part ` +
        `(plafond ${TAF_CAP} $). La table OTC imprime encore 0,0000218 / 0,000119 / 5,95 $, ` +
        `les chiffres courants sont ceux que le tarif IBKR répercute. CAT n'est pas nommé`
    );
  }
  said.push(
    `hors total : la conversion, plancher mesuré le 2026-10-13, le 0,2 bp reste en dessous. ` +
      `Le premier retrait du mois civil est gratuit, ensuite ${WITHDRAW.sepa} € SEPA / ${WITHDRAW.wire} € virement`
  );
  said.push(`garde, ouverture et TWS gratuites ; inactivité ${INACTIVITY.fee} $ si NAV < ${INACTIVITY.navBelow} $ sans ordre`);
  said.push(`aucun aller-retour réel dans ce dépôt`);
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          rules: RULE,
          withdraw: WITHDRAW,
          inactivity: INACTIVITY,
          fxBp: FX_BP,
          ownFtt: OWN_FTT,
          specialistOnPage: SPECIALIST_ON_PAGE,
          coverage: coverage(),
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node WHSelfInvest_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node WHSelfInvest_cost.mjs --schedule\n" +
        "  ex.   node WHSelfInvest_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node WHSelfInvest_cost.mjs VWCE IBIS2 EUR --shares=10 --price=140\n" +
        "        node WHSelfInvest_cost.mjs TTE SBF EUR --shares=10 --price=60"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\nce que WH SelfInvest propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
        `${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
