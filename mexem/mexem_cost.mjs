// What one round trip costs at Mexem: buy n shares at price p, sell them back at
// once, in dollars.
//
// The affine triple this file used to answer — a × p × n + b × n + c — could not
// hold this card at all, and the reason is worth stating because it is the same
// reason everywhere: Mexem's whole schedule is a minimum. « The minimum fees are
// per order », and on every tier it publishes the minimum is the entire bill at
// any size a retail reader trades. One euro on a European order binds up to
// 1 667 € of notional; one dollar on an American order binds up to 200 shares.
// The old file computed that floor correctly and then put it in a `floor` field
// the page had no column for, leaving `c` at zero — so the page printed the
// percentage alone and was wrong by the whole ticket on every small trade.
//
// Worse on the two per-share tiers. America is 0,005 $ a share and Canada 0,01,
// and the old file left `b` at zero on the ground that « under 200 shares the
// minimum is the whole bill ». True under 200 shares, and false above: a
// thousand-share order pays 5 $ a side that the affine answer never mentioned.
// The 2 % American and 1 % Canadian caps lived only in `exactCost`, which the
// page did not call. `roundTrip` is given the size and charges what is charged.
//
// MEXEM Ltd (CY, CySEC 325/17) is an introducing broker onto Interactive
// Brokers LLC — the page says it is not part of the IBKR group — so the
// catalogue is the IBKR book (`mexem_scraping.mjs`). It is no longer the ETF
// shelf this file was written against: the sweep now carries 54 815 lines of
// which 35 495 are stocks, and it is still running, so any count here is a
// reading and not a total.
//
// Barème relu le 2026-09-14, page inchangée depuis le 22 juillet 2026. Par
// sens, plancher par ordre, sans plafond sauf où il est dit :
//
//   USD     0,005 $/part,  min 1 $        plafond 2 % du montant
//   CAD     0,01 $/part,   min 2 CAD      plafond 1 % du montant
//   EUR     0,06 %,        min 1 €        (Bolsa de Madrid : même %, min 3 €)
//   DKK     0,06 %,        min 10
//   GBP     0,08 %,        min 2,5
//   HUF     0,08 %,        min 500
//   NOK     0,08 %,        min 20
//   CHF     0,10 %,        min 7,5
//   ILS     0,10 %,        min 15
//   PLN     0,10 %,        min 20
//   AUD     0,12 %,        min 8
//   HKD     0,12 %,        min 20
//   JPY     0,12 %,        min 200        (imprimé deux fois, mêmes chiffres)
//   SEK     0,12 %,        min 20
//   SGD     0,12 %,        min 4
//   CNH     0,15 %,        min 25
//   MXN     0,15 %,        min 75
//
// Three things the old file did not carry, all read off the page on 2026-09-14.
//
// The first is the conversion. The old file wrote `fxIfConverted: 0` and said in
// its header that cash is not converted automatically, so FX stays out — which
// is half the page and the wrong half. The « FX » tab prices the conversion the
// client is then obliged to do by hand: 0,005 % of the amount, minimum 5 in the
// currency (7 HKD et SGD, 75 ILS, 100 MXN, 600 JPY, 1 000 HUF, 65 ZAR). A
// declared zero said a euro account could buy in dollars for nothing. On a
// thousand-euro order needing a conversion each way that is ten euros of
// minimum, five times the commission. It cannot go in the number — whether a
// conversion happens at all is a fact about the client's cash and not about the
// trade — so it goes in the remark, with its minimum, where the reader can see
// that it dwarfs the ticket at small sizes.
//
// The second is the withdrawal. The first in any thirty days is free, then
// 1 € by SEPA, 8 € by wire, 10 $, 7 £. Nobody escapes it forever.
//
// The third is the depositary receipt. Mexem passes through the ADR/GDR fee at
// « a typical range of 0.01 to 0.03 per share », which is a yearly charge on the
// holding and not on the trade. 382 lines of the catalogue name themselves ADR,
// GDR or ADS, and those are the ones the remark warns.
//
// Custody is free, and so are account opening, dividend processing, telephone
// orders and incoming transfers — the « Other Costs » tab says so in as many
// words, which is a zero one can quote rather than a silence one has to read.
//
// What is charged and is in the number: the commission each way at its floor and
// its cap; UK stamp 0,5 % and Irish 1 % on a purchase of a share, passed through
// by Mexem's own note, taken from `taxMap.mjs` first and from those printed rates
// otherwise; the PTM levy of 1 £ per transaction above 10 000 £ on a UK, Channel
// Islands or Isle of Man registered stock, which the old file could only hand
// over as a `threshold` the page had no way to apply; the SEC fee and FINRA's
// TAF on an American sale, which Mexem does not reprint but which IBKR's fixed
// tariff passes through by name; and the market spread, once, since the book is
// already a round trip.
//
// The seventeen European venues whose « exchange and regulatory costs apply »
// with no figure anywhere on the page — VSE, NASDAQ Baltic, BATS Europe,
// Turquoise, CHIX, ENEXT.BE, SBF, FWB, IBIS, SWB, TradeLink, BUX, BVME, AEB,
// BVL, EBS, WSE — used to be a hole this file merely named, then a figure taken
// at Amsterdam and applied to all sixteen others. Nine of them have now been
// asked on a share, and the answers changed the shape of the charge and not just
// its size.
//
// Amsterdam bills nothing on a share and 0,80 € on an ETF, and this file read
// that as a rule: nothing on a share anywhere. It is not a rule, but it is very
// nearly the truth. Nine venues have now answered on a share and seven charge
// nothing — Amsterdam, Xetra, Frankfurt, Stuttgart, Brussels, Lisbon, and Paris
// at six cents which is nearly nothing. The two that charge, charge a lot: Milan
// 0,77 € and Vienna 0,90 € on ordinary listed stock, which is most of a second
// commission. There is no pattern by operator, currency or country to predict it
// from, which is why each venue is carried as measured rather than as a rule.
//
// German stock permissions landed on 2026-09-15 and Xetra, Frankfurt and
// Stuttgart all answered a flat euro on a share — the permission was the whole
// block. Funds on those boards are not a single number. Frankfurt was flat on
// five UCITS and 1,00 … 1,80 on a sixth (RCRS), so the 0,80 € ceiling still
// holds. Stuttgart was flat on 4UB9 and opened 1,00 … 4,50 on BUNH even with the
// order sent to SWB by name, so the ceiling there is 3,50 € and not 0,80.
//
// So `VENUE_FEE` carries what was measured and `VENUE_FEE_DEFAULT` covers the
// handful nobody could reach — EBS, Warsaw, Budapest, the Baltics and the four
// MTFs. Charging the widest seen is the right direction to be wrong in, since
// the total already charges the whole book spread and so assumes the order takes
// liquidity, which is the case that draws the top of the range. But after nine
// venues it is a ceiling and not an estimate, and `confidence` says so.
//
// Ten currencies in the catalogue have no printed tier at all — KRW, TWD, INR,
// BRL, SAR, MYR, ZAR, AED, CZK, RON, CNY — and the page says that where a
// product is missing « the price as shown in the platform always applies
// first ». 6 745 lines therefore answer N/A on the commission rather than borrow
// a neighbour's percentage.
//
// 22 045 of the 54 815 lines carry both a tier and a book. The book is the
// binding constraint, not the tariff: Tokyo, Hong Kong, Toronto, Sydney,
// Stockholm and Shanghai are all priced by Mexem and unsourced by `spread.mjs`.
//
// `nonEuResident` (no KID) is a residency fact carried by the catalogue row;
// `listingAccepts` hides such a row from an EEA visitor. It does not belong in
// `onlineBuy`, or a Taiwanese ETF vanishes from the page when no country is
// selected.
//
// No live trip in this deposit, but the tariff is no longer read off the page
// alone: `mexem-whatif.mjs` asks the portal to price an order before the order
// exists, and the answers are recorded beside `MEASURED` below. They confirm the
// euro floor to the cent, confirm that it is per order and not per share — the
// same euro at one share and at fifteen — and put a figure on the venue fees the
// page declines to print: nothing on a share, up to 0,80 € on an ETF, at
// Amsterdam. Nothing was traded.
//
// One of those previews corrected this file rather than confirming it. A single
// Ford share at 13,65 $ carries 0,005 $ of per-share fee against a 1 $ minimum
// and a 2 % cap worth 0,27 $, and this file used to floor first and cap after,
// which let the cap cut below the minimum and answered 0,27 $. The portal
// answered 1 $. So the cap binds the per-share amount and the minimum binds the
// result, in that order, which is how IBKR's own tariff reads once you stop
// treating "maximum" as if it outranked "minimum". The error was worth up to
// 3,7× on any American order small enough for the minimum to matter, which is
// most of the ones a retail reader places.
//
// Four more tiers are confirmed without a preview and without spending
// anything, because a refusal is a measurement too. The portal declines an order
// the account cannot fund and names the sum it wanted, and that sum is the
// notional plus the commission it would have charged. London asked 3,17 £ for a
// 0,67 £ share, Vienna-EBS 149,88 CHF for 142,38, Warsaw 166,80 PLN for 146,80
// and Budapest 787 HUF for 287 — leaving 2,50 £, 7,50 CHF, 20 PLN and 500 HUF,
// which are the four printed floors to the unit. That is why no cash was
// converted to reach those markets: the conversion would have cost 5,84 € to
// learn what the refusals already said.
//
// The conversion was priced all the same, since the portal previews it for
// nothing: 30 € into pounds announced « Includes commission of 5.84 EUR », and
// 5,84 € at the 0,8561 quoted is 5,00 £ exactly. So the « FX » tab's minimum is
// five units of the currency bought, billed in the currency sold, which is what
// `FX_CONVERT` says and had never been checked.
//
// What no preview has settled is which cap it is. Mexem prints 2 % and IBKR's
// fixed tariff prints 1 %, and the two only differ where the cap clears the 1 $
// minimum — past about 50 $ of notional, on a line under 0,50 $ a share. That
// wants some 400 shares of a sub-dollar stock, about 120 $, where the account
// holds 36,87 $. `CAP_UNSETTLED` keeps the figures; `maxPct` keeps the page's
// 2 %, the dearer of the two.
//
//   https://www.mexem.com/fees
//
//   node mexem/mexem_cost.mjs IWDA AEB EUR
//   node mexem/mexem_cost.mjs SPY ARCA USD --shares=10 --price=600
//   node mexem/mexem_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("mexem-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.mexem.com/fees",
  readOn: "2026-09-14",
  pageUpdated: "2026-07-22",
  entity: "MEXEM Ltd (CY, CySEC 325/17), introducing broker onto Interactive Brokers LLC",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const PTM = { each: 1, ccy: "GBP", above: 10000 };
const UK_STAMP = 0.005;
const IE_STAMP = 0.01;
const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "BATS"]);
const UK_REGISTERED = /^(GB|GG|JE|IM)/;

// Per side. `rate` of the amount or `perShare` per share, floored at `min` and,
// where the page prints one, capped at `maxPct` of the amount. All in `ccy`.
const RULE = {
  usd: { perShare: 0.005, min: 1, maxPct: 0.02, ccy: "USD" },
  ca: { perShare: 0.01, min: 2, maxPct: 0.01, ccy: "CAD" },
  madrid: { rate: 0.0006, min: 3, ccy: "EUR" },
  eur: { rate: 0.0006, min: 1, ccy: "EUR" },
  dkk: { rate: 0.0006, min: 10, ccy: "DKK" },
  gbp: { rate: 0.0008, min: 2.5, ccy: "GBP" },
  huf: { rate: 0.0008, min: 500, ccy: "HUF" },
  nok: { rate: 0.0008, min: 20, ccy: "NOK" },
  chf: { rate: 0.001, min: 7.5, ccy: "CHF" },
  ils: { rate: 0.001, min: 15, ccy: "ILS" },
  pln: { rate: 0.001, min: 20, ccy: "PLN" },
  aud: { rate: 0.0012, min: 8, ccy: "AUD" },
  hkd: { rate: 0.0012, min: 20, ccy: "HKD" },
  jpy: { rate: 0.0012, min: 200, ccy: "JPY" },
  sek: { rate: 0.0012, min: 20, ccy: "SEK" },
  sgd: { rate: 0.0012, min: 4, ccy: "SGD" },
  cnh: { rate: 0.0015, min: 25, ccy: "CNH" },
  mxn: { rate: 0.0015, min: 75, ccy: "MXN" },
};

const BY_CCY = {
  USD: "usd",
  CAD: "ca",
  EUR: "eur",
  DKK: "dkk",
  GBP: "gbp",
  GBX: "gbp",
  HUF: "huf",
  NOK: "nok",
  CHF: "chf",
  ILS: "ils",
  PLN: "pln",
  AUD: "aud",
  HKD: "hkd",
  JPY: "jpy",
  SEK: "sek",
  SGD: "sgd",
  CNH: "cnh",
  MXN: "mxn",
};

// The « FX » tab, which is what converting cash actually costs here. Same rate
// everywhere, a minimum that is 5 in most currencies and larger where 5 units
// would be pennies.
const FX_CONVERT = {
  rate: 0.00005,
  min: {
    AUD: 5, CAD: 5, CHF: 5, CZK: 5, DKK: 5, EUR: 5, GBP: 5, NOK: 5, NZD: 5,
    PLN: 5, SEK: 5, USD: 5, HKD: 7, SGD: 7, ZAR: 65, ILS: 75, MXN: 100,
    RUB: 300, JPY: 600, HUF: 1000,
  },
};

// First in any thirty days free, then this.
const WITHDRAW = { sepa: 1, wire: 8, ccy: "EUR", usd: 10, gbp: 7 };
const ADR = { low: 0.01, high: 0.03 };
const ADR_NAMED = /\b(ADR|GDR|ADS)\b/i;

// « Exchange and regulatory costs apply » on these, with no amount printed
// anywhere on the page.
const VENUE_FEES_UNPRICED = [
  "VSE", "NASDAQ Baltic", "BATS Europe", "Turquoise", "CHIX", "ENEXT.BE", "SBF",
  "FWB", "IBIS", "SWB", "TradeLink", "BUX", "BVME", "AEB", "BVL", "EBS", "WSE",
];
const VENUE_FEES_CODES = new Set(VENUE_FEES_UNPRICED.map((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "")));

// What the portal answers when asked to price an order it has not been given
// (`mexem-whatif.mjs`, 2026-09-14, compte U28294463). Four readings, all at
// Amsterdam, which is the only venue this account may reach:
//
//   1 IWDA  ETF     126,28 €   commission « 1.00 ... 1.80 EUR »
//   1 VUSA  ETF     125,11 €   commission « 1.00 ... 1.80 EUR »
//   1 CMCOM action    6,90 €   commission « 1 EUR »
//  20 CMCOM action  138,00 €   commission « 1 EUR »
//
// Three things fall out. The euro floor is exactly the euro floor, confirmed
// rather than inferred. The share count does not move it — twenty shares cost
// what one costs — so the European tier really is per order. And the unpriced
// « exchange and regulatory costs » are real but narrow: nothing at all on a
// share, and up to 0,80 € per order on an ETF, which is Euronext's own ETF
// schedule showing through. The portal quotes it as a range because the fee
// depends on how the order executes, so it cannot be pinned to one number; the
// total below charges the floor, which is therefore a lower bound on a European
// ETF and exact on a European share.
const MEASURED = {
  on: "2026-09-15",
  how: "aperçu whatif du portail, aucun ordre passé",
  venues: ["AEB", "SBF", "IBIS", "FWB", "SWB", "BVME", "VSE", "ENEXT.BE", "BVL"],
  floorConfirmed: true,
  // The same euro at one share and at fifteen, so the European tier is per order
  // and not per share. Twenty was refused: 137 € against 128,37 € of settled
  // euro, which is the account's size and not the tariff's.
  perOrderConfirmed: true,
  perOrderSeen: { symbol: "CMCOM", venue: "AEB", shares: 15, price: 6.8, commission: "1 EUR" },
  // The American floor, and the reason this file's arithmetic changed. One Ford
  // share at 13.65 $ is 0.005 $ of per-share fee, a 2 % cap of 0.27 $ and a 1 $
  // minimum. The portal answered 1 $, so the cap does not cut under the
  // minimum — it binds the per-share amount and the minimum binds the result.
  usFloor: { symbol: "F", shares: 1, price: 13.65, commission: "1 USD" },

  // Four tiers confirmed without spending anything, and without a preview. The
  // portal refuses an order the account cannot fund, and the refusal names the
  // sum it wanted — which is the notional plus the commission it would have
  // charged. Subtract the one and the other falls out. Every one of the four
  // landed on the printed floor to the unit.
  //
  // It confirms the floor and is silent on the venue fee: the credit check was
  // only ever run on lines where no surcharge is known to apply, and at
  // Amsterdam 20 CMCOM asked for 137,00 € against 136 € of stock, which is the
  // bare euro and matches a share there charging nothing.
  floorsFromRefusals: {
    GBP: { symbol: "CARD", venue: "LSE", price: 0.67, asked: 3.17, implies: 2.5 },
    CHF: { symbol: "XSMI", venue: "EBS", price: 142.38, asked: 149.88, implies: 7.5 },
    PLN: { symbol: "ETFBCASH", venue: "WSE", price: 146.8, asked: 166.8, implies: 20 },
    HUF: { symbol: "OPUS", venue: "BUX", price: 287, asked: 787, implies: 500 },
  },

  // The « FX » tab priced, at last, on the portal's own conversion preview:
  // 30 € into pounds announced « Includes commission of 5.84 EUR », and 5,84 €
  // at the 0,8561 shown is 5,00 £ to the cent. So the minimum is five units of
  // the currency bought, billed in the currency sold, exactly as `FX_CONVERT`
  // has it. Nothing was submitted; the balances are unchanged.
  fxConvert: { from: "EUR", to: "GBP", amount: 30, rate: 0.8561, commission: "5.84 EUR", implies: "5 GBP" },
};

// Still open, and the only one of these that needs money rather than patience.
// Mexem's page prints a 2 % American cap where IBKR's fixed tariff prints 1 %,
// and no preview run so far separates them: the cap only rises above the 1 $
// minimum past about 50 $ of notional, and it only binds at all under 0,50 $ a
// share, so the question needs roughly 400 shares of a sub-dollar line — 120 $
// or so of settled dollars, against the 36,87 $ the account holds. Until then
// `maxPct` below is the page's 2 %, which is the figure that charges more.
const CAP_UNSETTLED = { page: 0.02, ibkrFixed: 0.01, needsUsd: 120 };

// The unpriced « exchange and regulatory costs », asked of nine of the
// seventeen venues by preview on 2026-09-15. Each figure is the top of the range
// the portal quotes above the 1 € floor, per order and so twice over a round
// trip. The portal gives a range rather than a number because the fee depends on
// how the order executes; the top is the taking-liquidity case, which is the
// case the rest of this file already assumes when it charges the whole spread.
//
// A fund on the same German board is not one fee. Frankfurt answered 1 € flat
// on five UCITS and 1,00 … 1,80 on RCRS; Stuttgart answered 1 € on 4UB9 and
// 1,00 … 4,50 on BUNH, directed. The number below is the ceiling of what that
// venue was seen to charge, not the mode.
const VENUE_FEE = {
  AEB: { stock: 0, etf: 0.8, saw: "CMCOM 15 parts 1 EUR sec, IWDA 1.00 ... 1.80" },
  SBF: { stock: 0.06, etf: 0.8, saw: "ORA 1.00 ... 1.06, PAEEM 1.00 ... 1.80" },
  IBIS: { stock: 0, etf: 0.8, saw: "TUI1 1 EUR sec, 0EMU 1.00 ... 1.80" },
  FWB: { stock: 0, etf: 0.8, saw: "02V 1 EUR sec, EQSP CHSZ BCFK ESTE EEAX 1 EUR sec, RCRS 1.00 ... 1.80" },
  SWB: { stock: 0, etf: 3.5, saw: "02M 1 EUR sec, 4UB9 1 EUR sec, BUNH dirigé SWB 1.00 ... 4.50" },
  BVME: { stock: 0.77, etf: null, saw: "ISP 1.00 ... 1.77" },
  VSE: { stock: 0.9, etf: null, saw: "UQA 1.00 ... 1.90" },
  ENEXTBE: { stock: 0, etf: null, saw: "PROX 1 EUR sec" },
  BVL: { stock: 0, etf: null, saw: "BCP 1 EUR sec" },
};

// For the venues nobody has been able to ask — EBS, Warsaw, Budapest, the
// Baltics and the four MTFs — and for the classes a measured venue was not asked
// about. The fund figure stays 0,80 €, which Amsterdam, Paris, Xetra and the
// dearer Frankfurt line agree on. Stuttgart's 3,50 € is carried on SWB only:
// it was one fund of two, and spreading it to Warsaw would invent a fee.
//
// The share figure is the widest seen and not the typical one, and after nine
// venues that is worth stating plainly: seven of the nine charge nothing, Paris
// charges six cents, Milan 0,77 € and Vienna 0,90 €. So 0,90 € is a ceiling
// rather than an estimate, and `confidence` says so on every line that gets it.
// It is still the right way to be wrong — a comparison table that rounds an
// unknown charge down to zero flatters whoever charges it — but a reader
// comparing an unmeasured venue should know the modal answer was zero.
const VENUE_FEE_DEFAULT = { stock: 0.9, etf: 0.8 };
const VENUE_FEE_SEEN_ON_STOCK = { zero: 7, of: 9, widest: 0.9, at: "VSE" };
const VENUE_FEE_CCY = "EUR";

// The refusal that priced this tier's floor, where there is one.
function refusalFloor(rule) {
  const seen = MEASURED.floorsFromRefusals[rule.ccy];
  return seen && seen.implies === rule.min ? seen : null;
}

function venueFeeFor(listing) {
  const key = loose(listing.brokerExchange);
  const kind = isStock(listing) ? "stock" : "etf";
  const seen = VENUE_FEE[key];
  const amount = seen && seen[kind] != null ? seen[kind] : VENUE_FEE_DEFAULT[kind];
  return { amount, measured: Boolean(seen && seen[kind] != null), key, kind, saw: seen?.saw ?? null };
}

const TO_VENUES = {
  TSE: "TSX",
  TSEJ: "TSEJ",
  "BVME.ETF": "BVME",
  "ENEXT.BE": "XBRU",
  LSEIOB1: "LSE",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// The offshore renminbi is quoted CNH and the reference rates know it as CNY.
const fxCcy = (currency) => (String(currency || "").toUpperCase() === "CNH" ? "CNY" : currency);

const dollars = (amount, currency) => {
  const v = toUsd(amount, fxCcy(currency));
  return v == null ? null : Number(v.toPrecision(6));
};

// Money in `to`, from an amount in `from`.
function convert(amount, from, to) {
  if (amount == null || Number.isNaN(amount)) return null;
  const a = String(fxCcy(from) || "").toUpperCase();
  const b = String(fxCcy(to) || "").toUpperCase();
  if (a === b) return amount;
  const usd = toUsd(amount, a);
  const per = usdPer(b);
  return usd == null || !(per > 0) ? null : usd / per;
}

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(fxCcy(currency)) });

const venueRow = (row) => ({ ...row, exchange: TO_VENUES[row.exchange] || row.exchange });

const isStock = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";

const isAmerican = (exchange, mic) => US_MICS.has(String(mic || "").toUpperCase()) || US_EX.has(loose(exchange));

export function feeMarketOf(exchange, mic, currency) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  if (code === "BM" || m === "XMAD" || m === "XMCE") return "madrid";
  if (ccy === "CAD" || ((code === "TSE" || code === "TSX" || code === "VENTURE" || code === "AEQLIT" || m === "XTSE") && !ccy)) {
    return "ca";
  }
  return BY_CCY[ccy] || null;
}

// London quotes in pence; every rate on the card is a rate on pounds.
function nativeAmount(shares, price, currency) {
  if (shares == null || price == null) return null;
  const amount = Number(shares) * Number(price);
  if (!Number.isFinite(amount)) return null;
  return String(currency || "").toUpperCase() === "GBX" ? amount / 100 : amount;
}

function stampOf({ listing, tax }) {
  const rates = taxRates(tax);
  const fromMap = Object.values(rates).reduce((s, r) => s + r, 0);
  if (fromMap) return { pct: fromMap, rates, source: "taxMap" };
  if (!isStock(listing)) return { pct: 0, rates: {}, source: null };
  const isin = String(listing.isin || "").toUpperCase();
  const mic = String(listing.mic || "").toUpperCase();
  if (isin.startsWith("IE") || mic === "XDUB" || mic === "XMSM") {
    return { pct: IE_STAMP, rates: { stamp: IE_STAMP }, source: "mexem" };
  }
  if (mic === "XLON" || isin.startsWith("GB")) {
    return { pct: UK_STAMP, rates: { stamp: UK_STAMP }, source: "mexem" };
  }
  return { pct: 0, rates: {}, source: null };
}

/**
 * One side's commission, at the floor and under the cap. Returns the money in
 * the tier's own currency, and says which of the two bit, because that is the
 * whole story of this card at retail size.
 */
export function commissionSide({ shares, amount, market }) {
  const rule = RULE[market];
  if (!rule) return null;

  if (rule.perShare != null) {
    if (shares == null || !Number.isFinite(Number(shares))) return null;
    const raw = rule.perShare * Number(shares);
    // The cap binds the per-share amount and the floor binds the result, in that
    // order and not the other. This file used to floor first and cap after,
    // which let the cap cut below the minimum: one Ford share at 13.65 $ came
    // out at 0.27 $ where the portal's own preview on 2026-09-15 answered 1 $.
    // A cap under the minimum is not a cheaper order, it is a minimum.
    const ceiling = rule.maxPct != null && amount != null ? Number(amount) * rule.maxPct : null;
    const capped = ceiling != null && ceiling < raw;
    const perShareAmount = capped ? ceiling : raw;
    const charged = Math.max(rule.min, perShareAmount);
    return { raw, charged, floored: perShareAmount < rule.min, capped, currency: rule.ccy };
  }

  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const raw = Number(amount) * rule.rate;
  const charged = Math.max(rule.min, raw);
  return { raw, charged, floored: raw < rule.min, capped: false, currency: rule.ccy };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
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
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
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

// The remark carries what the number cannot: a conversion that depends on the
// client's cash rather than on the trade, and a depositary fee that depends on
// holding the line rather than trading it. Everything else the card charges is
// in `usd`.
//
// The withdrawal is not here. It prices moving cash out of the account, not
// buying and selling, and it is paid once however many round trips it follows —
// the same reason custody is not in a transaction cost. It stays readable in the
// answer's `withdraw` field and under `--schedule`.
function remarkOf({ listing }) {
  const ccy = String(listing.currency || "").toUpperCase();
  const settle = ccy === "GBX" ? "GBP" : fxCcy(ccy);
  // The FX tab prints twenty currencies and the catalogue holds thirty. Where the
  // settlement currency is not one of the twenty, the conversion has no published
  // price either, and quoting the rate of its neighbours would be inventing one.
  const min = FX_CONVERT.min[settle];
  const said = [
    min != null
      ? `FX ${(100 * FX_CONVERT.rate).toFixed(3)}% (min ${min} ${settle}) per conversion ` +
        `if the cash is not already in ${settle}.`
      : `FX conversion into ${settle} is not priced on the fee page.`,
  ];
  if (ADR_NAMED.test(String(listing.name || ""))) {
    said.push(`ADR/GDR pass-through ${ADR.low}–${ADR.high} per share per year.`);
  }
  return said.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `buy` and `sell` say what each side paid.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = { usd: null, etf, place, currency, onlineBuy: true, cashCurrency: "" };

  if (!catalogue) {
    return { ...answer, why: "le catalogue Mexem n'existe pas encore : lancer `node mexem/mexem_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Mexem` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Mexem`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row.exchange, listing.mic, listing.currency);
  const rule = RULE[market];
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = isAmerican(m.row.exchange, listing.mic);
  const tax = taxesOf(listing.isin);
  const stamp = stampOf({ listing, tax });
  const venueFees = VENUE_FEES_CODES.has(loose(m.row.exchange));

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    remark: remarkOf({ listing }),
  };

  if (!rule) {
    return {
      ...shared,
      basis: `aucun palier publié pour ${listing.currency || "cette devise"} chez Mexem`,
      why:
        `${listing.currency || "cette devise"} n'a pas de palier sur la carte Mexem : ` +
        `la page renvoie au prix affiché dans la plateforme`,
    };
  }

  const basis =
    `barème Mexem ${market}, lu le ${SCHEDULE.readOn} (page du ${SCHEDULE.pageUpdated}) : ` +
    (rule.rate != null
      ? `${(100 * rule.rate).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} % par sens`
      : `${rule.perShare} ${rule.ccy} par part`) +
    `, plancher ${rule.min} ${rule.ccy} par ordre` +
    (rule.maxPct != null ? `, plafond ${(100 * rule.maxPct).toFixed(0)} % du montant` : ", sans plafond");

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      basis,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
    };
  }

  const notional = nativeAmount(n, p, listing.currency);
  const notionalUsd = dollars(notional, listing.currency === "GBX" ? "GBP" : listing.currency);
  const notionalInRule = convert(notional, listing.currency === "GBX" ? "GBP" : listing.currency, rule.ccy);

  // The book is already a round trip — Rule 605 effective spread per share in
  // America, basis points elsewhere — so it is added once, not per side.
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buyComm = commissionSide({ shares: n, amount: notionalInRule, market });
  const sellComm = commissionSide({ shares: n, amount: notionalInRule, market });
  const buyCommUsd = buyComm ? dollars(buyComm.charged, buyComm.currency) : null;
  const sellCommUsd = sellComm ? dollars(sellComm.charged, sellComm.currency) : null;

  // The venue's own fee, per order and so twice over, on one of the seventeen
  // boards the page names without a figure. Seven of them have now been asked.
  const venueFee = venueFees ? venueFeeFor(listing) : null;
  const venueFeeSideUsd = venueFee?.amount ? dollars(venueFee.amount, VENUE_FEE_CCY) : 0;
  const venueFeeUsd = venueFee?.amount ? plus(venueFeeSideUsd, venueFeeSideUsd) : 0;

  // Stamp duty is a charge on the purchase alone, so it is counted once.
  const stampUsd = notionalUsd == null ? null : notionalUsd * stamp.pct;

  // America's two sell-side levies. Mexem reprints neither, and IBKR's fixed
  // tariff passes both through by name.
  const secUsd = american ? (notionalUsd == null ? null : notionalUsd * SEC_RATE) : 0;
  const tafUsd = american ? Math.min(TAF_PER_SHARE * n, TAF_CAP) : 0;

  // « A 1 GBP fee on any transaction exceeding a value of 10.000 GBP » — a
  // transaction, so both the purchase and the sale when both exceed it.
  const notionalGbp = convert(notional, listing.currency === "GBX" ? "GBP" : listing.currency, PTM.ccy);
  const ptmDue = !isStock(listing) || !UK_REGISTERED.test(listing.isin) ? false : notionalGbp == null ? null : notionalGbp > PTM.above;
  const ptmUsd = ptmDue === false ? 0 : ptmDue === null ? null : dollars(2 * PTM.each, PTM.ccy);

  const usd = plus(bookUsd, buyCommUsd, sellCommUsd, venueFeeUsd, stampUsd, secUsd, tafUsd, ptmUsd);
  // What the broker keeps, told apart from the total because the page prints the
  // two side by side. A free trade, a discount, a plan waives a commission and
  // nothing else: the book belongs to whoever quoted it, the transaction taxes
  // to a treasury, the regulatory levies to a regulator, and no broker can
  // forgive any of them. A remark about free trades next to a single number
  // would read as if it did.
  // Le droit de place est refacturé sur la même ligne que la commission et
  // n'est pas remis non plus, mais il n'est ni un impôt ni un carnet.
  const brokerFees = plus(buyCommUsd, sellCommUsd, venueFeeUsd);

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
      taxes: finite(stampUsd, 6),
      taxRates: Object.keys(stamp.rates).length ? stamp.rates : null,
      venue: finite(venueFeeSideUsd, 6),
      ptm: ptmDue ? finite(dollars(PTM.each, PTM.ccy), 6) : ptmDue === null ? null : 0,
    },
    sell: {
      commission: finite(sellCommUsd, 6),
      native: sellComm
        ? {
            charged: finite(sellComm.charged, 6),
            raw: finite(sellComm.raw, 6),
            floored: sellComm.floored,
            capped: sellComm.capped,
            currency: sellComm.currency,
          }
        : null,
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
      venue: finite(venueFeeSideUsd, 6),
      ptm: ptmDue ? finite(dollars(PTM.each, PTM.ccy), 6) : ptmDue === null ? null : 0,
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(plus(buyCommUsd, sellCommUsd), 6),
      place: finite(venueFeeUsd, 6),
      taxes: finite(stampUsd, 6),
      réglementaire: american ? finite(plus(secUsd, tafUsd), 6) : 0,
      ptm: ptmUsd === null ? null : finite(ptmUsd, 6),
    },
    commission: {
      rate: rule.rate ?? null,
      perShare: rule.perShare ?? null,
      min: rule.min,
      maxPct: rule.maxPct ?? null,
      currency: rule.ccy,
      eachWay: true,
      minPerOrder: true,
    },
    conversion: { ...FX_CONVERT, ifNeeded: true },
    withdraw: WITHDRAW,
    basis,
    confidence: confidenceOf({
      market,
      rule,
      buyComm,
      marketBp,
      marketPerShare,
      stamp,
      american,
      venueFees,
      venueFee,
      ptmDue,
      unsourced: m.unsourced,
      listing,
      n,
    }),
  };
}

function confidenceOf({ market, rule, buyComm, marketBp, marketPerShare, stamp, american, venueFees, venueFee, ptmDue, unsourced, listing, n }) {
  const said = [];
  said.push(
    `commission Mexem, palier ${market}, lue le ${SCHEDULE.readOn} sur la page du ${SCHEDULE.pageUpdated}, ` +
      `facturée par sens et convertie en dollars au mid BCE du ${FX_AS_OF}`
  );
  if (buyComm) {
    said.push(
      buyComm.capped
        ? `plafonnée à ${(100 * rule.maxPct).toFixed(0)} % du montant : ${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
        : buyComm.floored
          ? `au plancher : le ticket de ${rule.min} ${rule.ccy} est toute la commission, ` +
            `le calcul au barème n'en donnerait que ${Number(buyComm.raw).toPrecision(3)}` +
            // The Ford preview is a fact about the per-share tiers, where a cap
            // exists to get the order of operations wrong. On a percentage tier
            // there is no cap and nothing to say.
            (rule.maxPct != null
              ? `. Mesuré le ${MEASURED.on} : l'aperçu du portail sur ${MEASURED.usFloor.shares} ` +
                `${MEASURED.usFloor.symbol} à ${MEASURED.usFloor.price} $ répond ` +
                `${MEASURED.usFloor.commission}, donc le plafond ne descend pas sous le plancher`
              : // A refusal names the cash it wanted, notional plus commission,
                // so it prices the floor for four currencies nobody funded.
                refusalFloor(rule)
                ? `. Confirmé le ${MEASURED.on} par le contrôle de trésorerie du portail : ` +
                  `${refusalFloor(rule).symbol} à ${refusalFloor(rule).price} sur ` +
                  `${refusalFloor(rule).venue} s'est vu réclamer ${refusalFloor(rule).asked}, ` +
                  `soit le cours plus ${refusalFloor(rule).implies} ${rule.ccy}`
                : "")
          : `au-dessus du plancher : ${Number(buyComm.charged).toPrecision(4)} ${rule.ccy} par sens`
    );
    // Only worth saying where the two published caps would actually differ:
    // above the minimum, which is where the reader's bill changes.
    if (rule.maxPct != null && buyComm.capped) {
      said.push(
        `le plafond retenu est celui de la page Mexem, ${(100 * CAP_UNSETTLED.page).toFixed(0)} %, quand le tarif ` +
          `fixe IBKR en imprime ${(100 * CAP_UNSETTLED.ibkrFixed).toFixed(0)} % : aucun aperçu ne les sépare encore, ` +
          `il y faudrait ${CAP_UNSETTLED.needsUsd} $ de liquidités sur une ligne sous 0,50 $, et c'est le plus cher ` +
          `des deux qui est compté`
      );
    }
  }
  if (rule.perShare != null && n >= rule.min / rule.perShare) {
    said.push(
      `au-delà de ${Math.round(rule.min / rule.perShare)} parts la commission cesse d'être le ticket ` +
        `et devient ${rule.perShare} ${rule.ccy} la part — ce que le modèle affine ne disait pas`
    );
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp).toPrecision(4)} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet 605 ${marketPerShare} $ la part, aller-retour`);
  else said.push(`aucun carnet : ${unsourced?.why || "place sans source de spread"} — le total est N/A et non un total sans marché`);

  if (stamp.pct) {
    said.push(
      `droit de timbre ${(100 * stamp.pct).toFixed(2)} % à l'achat seulement, ` +
        (stamp.source === "taxMap" ? "depuis taxMap.mjs" : "au taux imprimé par Mexem")
    );
  }
  if (american) {
    said.push(
      `vente américaine : SEC ${SEC_RATE} du montant et TAF FINRA ${TAF_PER_SHARE} la part ` +
        `(plafond ${TAF_CAP} $), que Mexem ne réimprime pas mais que le tarif fixe IBKR répercute nommément`
    );
  }
  if (ptmDue === null) said.push(`prélèvement PTM indécidable : le montant n'a pas pu être converti en livres`);
  else if (ptmDue) said.push(`prélèvement PTM de ${PTM.each} £ par sens, le montant dépassant ${PTM.above} £`);

  if (venueFees && venueFee) {
    const euros = `${venueFee.amount.toFixed(2).replace(".", ",")} ${VENUE_FEE_CCY}`;
    const what = venueFee.kind === "stock" ? "une action" : "un fonds";
    said.push(
      venueFee.measured
        ? venueFee.amount === 0
          ? `aucun frais de place : la page annonce « exchange and regulatory costs » sur ` +
            `${listing.brokerExchange} sans montant, et l'aperçu du ${MEASURED.on} y donne le plancher ` +
            `sec sur ${what} (${venueFee.saw})`
          : `frais de place ${euros} par sens, mesurés le ${MEASURED.on} par aperçu sur ` +
            `${listing.brokerExchange} (${venueFee.saw}) : le haut de la fourchette est retenu puisque le ` +
            `total facture déjà l'écart entier du carnet`
        : `frais de place ${euros} par sens, extrapolés : la page annonce « exchange and regulatory costs » ` +
          `sur ${listing.brokerExchange} sans aucun montant, et ` +
          (venueFee.kind === "etf"
            ? `Amsterdam, Paris, Xetra et le plus cher des fonds de Francfort donnent 0,80 € ; ` +
              `Stuttgart a ouvert 3,50 € sur un fonds et ce chiffre reste sur SWB`
            : `c'est un plafond et non une estimation — sur ${VENUE_FEE_SEEN_ON_STOCK.of} places mesurées ` +
              `${VENUE_FEE_SEEN_ON_STOCK.zero} ne facturent rien sur une action, et ${euros} est le plus ` +
              `haut relevé, à ${VENUE_FEE_SEEN_ON_STOCK.at}`)
    );
  }
  said.push(
    `hors total : la conversion à ${(100 * FX_CONVERT.rate).toFixed(3)} % (plancher 5 dans la plupart des devises), ` +
      `qui dépend de la trésorerie du client et non de l'ordre — le fichier précédent l'annonçait à zéro. ` +
      `Mesurée le ${MEASURED.on} sur l'aperçu de conversion du portail : ${MEASURED.fxConvert.amount} ` +
      `${MEASURED.fxConvert.from} en ${MEASURED.fxConvert.to} annonce ${MEASURED.fxConvert.commission}, ` +
      `soit ${MEASURED.fxConvert.implies} au taux affiché — le plancher se compte dans la devise achetée`
  );
  said.push(`garde et tenue de compte gratuites, l'onglet « Other Costs » le dit en toutes lettres`);
  said.push(`aucun aller-retour réel chez Mexem dans ce dépôt`);
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
          conversion: FX_CONVERT,
          withdraw: WITHDRAW,
          venueFeesUnpriced: VENUE_FEES_UNPRICED,
          venueFee: { measured: VENUE_FEE, fallback: VENUE_FEE_DEFAULT, onStock: VENUE_FEE_SEEN_ON_STOCK, ccy: VENUE_FEE_CCY },
          measured: MEASURED,
          capUnsettled: CAP_UNSETTLED,
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
      "usage : node mexem_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node mexem_cost.mjs --schedule\n" +
        "  ex.   node mexem_cost.mjs IWDA AEB EUR --shares=10 --price=100\n" +
        "        node mexem_cost.mjs SPY ARCA USD --shares=10 --price=600"
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

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Mexem propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);

  const money = (x) => (x == null ? "N/A" : `${Number(x).toFixed(4)} $`);
  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` +
        `${Number(t.notional).toFixed(2)} ${t.currency === "GBX" ? "GBP" : t.currency}` +
        (t.notionalUsd != null ? ` (${Number(t.notionalUsd).toFixed(2)} $)` : "") +
        "\n"
    );
    const side = (name, s) => {
      const lines = [];
      if (s.commission != null || s.native) {
        lines.push(
          `  commission   ${money(s.commission)}` +
            (s.native
              ? `   (${Number(s.native.charged).toPrecision(4)} ${s.native.currency}` +
                `${s.native.floored ? ", au plancher" : s.native.capped ? ", plafonnée" : ""})`
              : "")
        );
      }
      if (s.venue) lines.push(`  place        ${money(s.venue)}`);
      if (s.taxes) lines.push(`  timbre       ${money(s.taxes)}`);
      if (s.sec) lines.push(`  SEC          ${money(s.sec)}`);
      if (s.taf) lines.push(`  TAF          ${money(s.taf)}`);
      if (s.ptm) lines.push(`  PTM          ${money(s.ptm)}`);
      if (lines.length) console.log(`${name}\n${lines.join("\n")}`);
    };
    side("achat", out.buy || {});
    side("vente", out.sell || {});
    if (out.parts?.marché != null) console.log(`marché\n  carnet       ${money(out.parts.marché)}   (aller-retour)`);
    console.log(
      `\ntotal        ${money(out.usd)}` +
        (out.usd != null && out.trade.notionalUsd
          ? `   soit ${((100 * out.usd) / out.trade.notionalUsd).toFixed(3)} % du montant`
          : "")
    );
  }
  if (out.usd == null && out.why) console.log(`coût N/A — ${out.why}`);
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ").filter(Boolean)) console.log(`  ${line}`);
  if (out.remark) console.log(`\nremarque\n  ${out.remark.split("\n").join("\n  ")}`);
  if (out.url) console.log(`\n${out.url}`);
}
