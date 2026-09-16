// What one round trip costs at Robinhood: buy n shares at price p — or a coin
// for a given number of dollars — and sell the line back at once. The answer is
// one number in dollars, `usd`, and beside it `brokerFees`, the part Robinhood
// keeps.
//
// Robinhood is three brokers wearing one name, and which one serves you is decided
// by where you live, not by anything you pick. The residency the front already
// filters on therefore chooses the schedule:
//
//   US        Robinhood Financial LLC. Real US shares, no commission, three
//             regulators, and crypto through Robinhood Crypto.
//   GB        Robinhood U.K. Ltd. The same real shares through the same US
//             clearer, so the same three regulators, plus a currency conversion
//             between the sterling and dollar sides. Shares and ADRs only: no
//             crypto, and no exchange-traded fund at all, which PRIIPs forbids
//             for want of a key information document.
//   EEA       Robinhood Europe UAB. Not a share at all: a Classic Stock Token, a
//             MiFID II derivative issued in Vilnius over the US line. No US
//             regulator reaches it, no commission is charged, and the whole cost
//             is a 0.10 % conversion each way. Crypto is a flat 0.50 % a leg.
//
// The gap between them is not a detail. A French buyer pays 0.20 % on a round trip
// where an American pays two thousandths of a percent, a hundred times less, and
// the Frenchman's crypto costs half the American's. A single schedule for all three
// would be wrong by more than any spread this file measures.
//
// What `brokerFees` holds, and what it does not: Robinhood charges no commission
// anywhere on this shelf, so the column is the conversion it bills — the British
// 0.10 % when an ISA forces it, the European 0.10 % which cannot be avoided — and
// the crypto spread it is paid out of. The three American regulators are not
// Robinhood's money and never appear there, and neither does the book. Robinhood
// UK's own fee schedule says as much of the book: "bid-offer spreads apply in the
// markets and are considered implicit third-party costs".
//
// ---- who may buy what, which is read rather than guessed ----
//
// The catalogue already carries the European split: `usOnly` marks the 10 253 lines
// absent from Robinhood Europe's Specific Information Document, the published list
// of underlyings, leaving 2 014 an EEA resident can buy.
//
// The British side has no such list of names, but it has a list of kinds, and
// "Investments you can make on Robinhood UK" is explicit. The account takes US
// exchange-listed stocks, ADRs "listed on US exchanges or the Over-the-Counter
// (OTC) Market", and certain OTC equities. It refuses, in as many words,
// exchange-traded funds, cryptocurrency, non-US-domiciled stocks, stocks that
// trade on non-US exchanges, preferred stocks, closed-end funds, limited
// partnerships, royalty trusts, units and New York registry shares. The ISA is
// narrower again: US exchange-listed stocks and ADRs, and nothing else.
//
// Two of those lines the catalogue can act on, and this file used to act on
// neither well.
//
//   the packaged products  ETF, ETN and ETC, 5 993 lines of the 12 267. Only
//                          "ETF" is named by Robinhood; that ETNs and ETCs fall
//                          with them is this file's reading of the same KID rule,
//                          which reaches every packaged product. The header used
//                          to call this 5 919, counting the funds and forgetting
//                          the 74 notes and commodities the code already dropped.
//
//   the OTC shelf          740 of the 6 206 shares. An OTC ticker is five letters
//                          by convention and the last one says what the line is:
//                          Y an American Depositary Receipt, F a foreign ordinary
//                          share traded here rather than at home. The catalogue
//                          carries no flag — only 124 of the 638 Y lines spell
//                          "ADR" in the name, and AIA Group, ABN AMRO and ASMPT
//                          do not — so the suffix is what this file reads, and it
//                          splits cleanly: 638 in Y, 88 in F, 14 in neither, and
//                          not one F line calls itself an ADR.
//
//                          That corrects the file twice, in opposite directions.
//                          The 88 foreign ordinaries are "non-US-domiciled
//                          stocks" trading off a US exchange, which Robinhood UK
//                          refuses outright — this file used to sell them. And the
//                          638 ADRs are admitted to an ISA by name, where this
//                          file used to withhold the whole OTC shelf: the ISA
//                          loses 14 lines, not 740.
//
// So Robinhood UK sells 6 118 of the catalogue's lines and its ISA 6 104. Its own
// press puts the universe near 5 000, so some British narrowing is still invisible
// here — a name the list would take that Robinhood does not actually carry.
//
// ---- the American schedule, which the British one inherits ----
//
// Nothing is charged as commission. What is left is the three regulators, and
// Robinhood is unusual in waiving two of them on small orders: the SEC fee is not
// passed on for a sale of 500 $ or less, and the TAF is not passed on for a sale of
// fifty shares or fewer. Both waivers are the help centre's words, not the
// schedule's — "Robinhood doesn't pass this fee on to you for equity sales with a
// notional value of $500 or less" and "we pass this fee to our customers, except
// for sales of 50 shares or less". CAT survives both but rounds to the nearest
// penny and is dropped when it comes to less than one, which a fifty-share order
// always does. So a small American trade costs exactly zero here, and `roundTrip`
// says so: the waivers are applied to the trade it is handed rather than averaged
// into a rate, which is the whole reason this file no longer answers an affine
// triple.
//
// The same three rates sit in the tastytrade and Alpaca files, being the same
// regulators: 20.60 $ per million on the sell, 0.000195 $ a share on the sell,
// 0.000003 $ a share on both legs — a hundredth of that on OTC, where the fee is
// written per share of OTC equity rather than per equivalent share.

// The British account adds one line to that card: 0.10 % to convert between its
// sterling and dollar sides on a weekday, 0.30 % from Friday 17:00 New York to
// Sunday 17:00 and on US holidays. It sits in `fxIfConverted` rather than in the
// total, because the schedule says the fee applies "only ... between your
// Robinhood USD account and GBP account" — a general account holds both and can
// keep dollars. An ISA cannot, being sterling only, and the same sentence says so:
// "for ISA accounts (GBP only) conversion fees apply to USD trades". So for an ISA
// the conversion is part of the price and joins the total.
//
// ---- the European schedule ----
//
// A Classic Stock Token is a derivative contract with Robinhood Europe, recorded on
// a blockchain, one token per underlying share. The fee schedule is one sentence:
// 0.10 % of the euro value on each conversion, euros to dollars on the buy and back
// on the sell, and "Robinhood Europe does not apply any other fees related to the
// trading of Classic Stock Tokens". No SEC, no TAF, no CAT: the client is not
// selling a US security. The conversion cannot be avoided, the account being euro
// only, so it is inside the total and not beside it.
//
// The token is quoted at the underlying's price, so the underlying's book is still
// what crossing costs, and the 605 leaf is kept. One caveat the KID states and this
// file cannot: the token trades around the clock from Monday to Saturday, and
// outside US hours the reference market it tracks is thinner than the 605 average.
//
// European crypto is a flat 0.50 % of the euro value each way, one cent minimum,
// and EURC is free — the euro stablecoin bought with euros, the same exemption the
// Revolut file records for USDC bought with dollars.
//
// ---- the American crypto, which used to hide and no longer does ----

// Crypto is where the money is, and where the screen says nothing. Since the 4th of
// April 2026 an order takes one of two roads. The app's default routes to market
// makers and shows no fee at all; the other, exchange routing, is the only one on
// Legend and on the ladder and charges an explicit taker fee whose first tier,
// under 10 000 $ of thirty-day volume, is 0.95 %.
//
// The default road is priced on Robinhood's own routing page, and this file used to
// read only half of what that page says. The half it read: "as of June 15, 2026 for
// every $100 of notional crypto order volume executed through market maker routing,
// Robinhood Crypto receives $0.95 from its market maker". On that alone the header
// called the figure a floor with the market maker's own edge sitting on top,
// unnamed. The page names it, in the next sentence: "if you place a $100 buy order
// and the buy spread is 0.96%, Robinhood Crypto will receive $0.95 of the $0.96 buy
// spread", and "orders are filled at the bid or ask price, not at the mid price".
//
// So the client pays the half-spread from the mid on each leg, Robinhood keeps all
// but a hundredth of a point of it, and a round trip costs about 1.92 % where this
// file charges 1.90 %. The floor is still a floor — 0.96 % is Robinhood's worked
// example and not a published rate — but it is a floor within a hundredth of the
// answer, which is a different claim from the open-ended one this header made.
//
// No crypto book is added on top. The 0.95 % is the market maker's compensation
// for crossing, so counting a Binance or Coinbase touch as well would charge the
// spread twice — the same reasoning as the Revolut file.
//
// Nothing on the American side was measured. The European side was, twice. A real
// round trip on bitcoin on 2026-09-13 found a percent taken inside the buy price
// and nothing inside the sell, which doubles the announced 1 % to 2 %. The same
// test on a Classic Stock Token on 2026-09-14 found no such percent — the fills
// landed within 0.03 % of the screen, both ways — but it did find the conversion
// running on two rates 0.088 % apart, which the schedule does not mention and
// which lifts a euro round trip from the announced 0.20 % to 0.288 %.
//
// So the two European shelves fail differently: the crypto hides a percent in the
// price, the token hides a tenth of one in the exchange rate.
//
//   node robinhood/robinhood_cost.mjs AAPL --shares=10 --price=230
//   node robinhood/robinhood_cost.mjs AAPL --shares=10 --price=230 --nat=FR
//   node robinhood/robinhood_cost.mjs AAPL --shares=10 --price=230 --nat=GB --isa
//   node robinhood/robinhood_cost.mjs BTC --amount=1000 --nat=FR
//   node robinhood/robinhood_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { EEA } from "../accepted.mjs";

const CATALOGUE = new URL("robinhood-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://cdn.robinhood.com/assets/robinhood/legal/RHF+Fee+Schedule.pdf",
  uk: "https://cdn.robinhood.com/assets/robinhood/legal/RHUK_Fee_Schedule.pdf",
  eu: "https://cdn.robinhood.com/assets/robinhood/legal/fee_schedule_EU.pdf",
  crypto: "https://cdn.robinhood.com/assets/robinhood/legal/rhc-fee-schedule.pdf",
  routing: "https://robinhood.com/us/en/support/articles/crypto-order-routing/",
  fees: "https://robinhood.com/us/en/support/articles/trading-fees-on-robinhood/",
  ukUniverse: "https://robinhood.com/gb/en/support/articles/investments-you-can-make-on-robinhood/",
  // The stamp each schedule carries in its own footer, so that a reader can tell
  // which edition was read without trusting a date typed by hand.
  usOn: "20260831-5886092-18771991",
  ukOn: "20260626-5663461-17983127",
  euOn: "20260622-5628651-17828471",
  cryptoOn: "20260622-5628344-17827487",
  secFrom: "2026-04-04",
  tafFrom: "2026-01-01",
  cryptoFrom: "2026-04-04",
  // The rebate figure has a date of its own, later than the schedule's.
  rebateFrom: "2026-06-15",
  readOn: "2026-09-14",
};

// Which of the three companies serves a visitor. The EEA list is the one
// `accepted.mjs` already uses to open the broker, so the two cannot drift apart.
// An unnamed country falls to the American card, which is the one the catalogue is
// overwhelmingly written in.
const EEA_SET = new Set(EEA);

export function entityOf(nat) {
  const code = String(nat || "").trim().toUpperCase();
  if (code === "GB") return "uk";
  if (EEA_SET.has(code)) return "eu";
  return "us";
}

const ENTITY_NAME = {
  us: "Robinhood Financial LLC",
  uk: "Robinhood U.K. Ltd",
  eu: "Robinhood Europe UAB",
};

// The cash a client of each company funds in. A British general account holds
// both sides, but sterling is the one it is opened in.
const ENTITY_CASH = { us: "USD", uk: "GBP", eu: "EUR" };

const SEC_RATE = 0.0000206;
// Not passed on below this, on the sale's own notional. The help centre says
// "equity sales with a notional value of $500 or less", so the bound is inclusive.
const SEC_FREE_UPTO = 500;

const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const TAF_FREE_UPTO_SHARES = 50;

const CAT_PER_SHARE = 0.000003;
const CAT_OTC_PER_SHARE = 0.00000003;

const COMMISSION_RATE = 0;

// What the market maker pays Robinhood on the default road, per leg, quoted by
// Robinhood as 0.95 $ per 100 $ of notional. Read as a cost because the client
// meets it in the price.
const CRYPTO_MARKET_MAKER = 0.0095;

// The whole half-spread from the mid, in the worked example on the same page. It
// is not a published rate, so it prices nothing here — it only says how much room
// is left above the 0.95 %, and the answer is a hundredth of a point.
const CRYPTO_SPREAD_EXAMPLE = 0.0096;

// Exchange routing, taker then maker, by trailing thirty-day volume through that
// road. A market order is always a taker, so the taker column is the one a retail
// buy meets. The first tier's taker is the same 0.95 % as the other road.
const CRYPTO_TIERS = [
  { upto: 10e3, taker: 0.0095, maker: 0.005 },
  { upto: 50e3, taker: 0.0075, maker: 0.0035 },
  { upto: 250e3, taker: 0.0025, maker: 0.00125 },
  { upto: 500e3, taker: 0.0015, maker: 0.00075 },
  { upto: 1e6, taker: 0.00125, maker: 0.0006 },
  { upto: 5e6, taker: 0.001, maker: 0.0004 },
  { upto: 10e6, taker: 0.0004, maker: 0.0002 },
  { upto: 25e6, taker: 0.0003, maker: 0.0001 },
  { upto: Infinity, taker: 0.0003, maker: 0 },
];

// Robinhood UK, between its sterling and dollar sides. The weekend rate runs from
// Friday 17:00 New York to Sunday 17:00, and over US holidays.
const UK_FX_WEEKDAY = 0.001;
const UK_FX_WEEKEND = 0.003;

// Robinhood Europe. The conversion is on every order, both ways, and cannot be
// held off since the account is euro only.
const EU_FX_EACH_WAY = 0.001;
const EU_CRYPTO_EACH_WAY = 0.005;
const EU_CRYPTO_MIN_EUR = 0.01;

// Measured, and the schedule names none of it. The conversion carries two rates,
// not one: a token round trip bought its euros at 1.155456 $/€ and sold them back
// at 1.156473, 0.0881 % apart, on top of the 0.10 % it bills each way. The gap is
// structural rather than drift — the quote endpoint hands out the same two rates
// at rest, 0.0817 % apart over seven readings two minutes before the orders.
//
// Held per leg so it reads next to the billed rate, which it sits beside rather
// than replaces: a euro round trip costs 0.288 %, not the 0.20 % announced.
const EU_FX_SPREAD_EACH_WAY = 0.00044;

// Measured, and it is the half of the price the schedule does not mention. A real
// round trip on bitcoin at 02:41 Paris on 2026-09-13 bought at exactly 1 % above
// the price the buy screen was showing, while the sale a minute later went off at
// the price the sell screen was showing, to five decimal places. So the crossing
// costs 1 % and it is all taken on the way in — which doubles a round trip from
// the 1 % the commission announces to 2 %.
//
// Whether Robinhood reads this as a markup over its own quote or as a book whose
// ask is a percent above its bid does not change the euro: the buyer pays it, and
// nothing on either screen names it.
const EU_CRYPTO_MARKUP = 0.01;

const EU_CRYPTO_CHECK = {
  on: "2026-09-13 02:41 Paris",
  coin: "BTC",
  spent: 150.0,
  got: 0.00221969,
  askShown: 66574.84,
  effective: 67240.8,
  markup: 0.010003,
  sellQuoted: 66585.66,
  sellFilled: 66585.34,
  sellSlip: -0.000005,
  roundTrip: 0.019756,
};

// The same test on a token, and it answers the question the crypto raised: there
// is no percent hidden in the price here. A hundred euros of the Apple token went
// out and 99.7382 came back twenty-nine seconds later, 0.2790 % gone, of which
// 0.20 % is the billed conversion and 0.0881 % the gap between the two exchange
// rates. Nothing is left for the token's own spread.
//
// The fills sat 0.0175 % above the buy screen and 0.0278 % above the sell screen —
// the second in the client's favour — where the bitcoin buy sat 1.0003 % above.
const EU_TOKEN_CHECK = {
  on: "2026-09-14 19:13 Paris",
  token: "AAPL",
  paid: 100.0172,
  back: 99.7382,
  roundTrip: 0.00279,
  buyShown: 289.8,
  buyFilled: 289.850577,
  sellShown: 289.54,
  sellFilled: 289.620603,
  buyFx: 1.155456,
  sellFx: 1.156473,
  fxGap: 0.000881,
  fxGapAtRest: 0.000817,
};

// Free on the euro stablecoin bought with euros, as the schedule's footnote says —
// and on that one alone: USDC, which the catalogue does carry, pays the full rate.
// EURC itself is not in the catalogue today, so this is a rule waiting for a line.
const EU_FREE_COINS = new Set(["EURC"]);

// The packaged products Robinhood UK will not sell. Only "ETF" is named on its
// universe page; the notes and commodities fall with it under the same KID rule.
const UK_BARRED = new Set(["ETF", "ETC", "ETN"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cryptoBase = (ticker) => String(ticker || "").split(/[/:_-]/)[0].toUpperCase();
const isOverTheCounter = (row) => /^(OTC|PINK)/i.test(String(row?.exchange || ""));
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));

// The last letter of a five-letter OTC ticker: Y an American Depositary Receipt,
// F a foreign ordinary share. See the header — the catalogue names neither.
const isAdr = (row) => isOverTheCounter(row) && /^[A-Z]{4}Y$/.test(String(row?.ticker || "").toUpperCase());
const isForeignOrdinary = (row) =>
  isOverTheCounter(row) && /^[A-Z]{4}F$/.test(String(row?.ticker || "").toUpperCase());

const catPerShare = (otc) => (otc ? CAT_OTC_PER_SHARE : CAT_PER_SHARE);

// Rounded up to the penny, as both schedules say of the SEC fee alone.
const up = (value, step) => Math.ceil(value / step - 1e-9) * step;
// The other two round to the nearest penny, and to zero below one — which is not
// the same thing as rounding to nearest, and is what makes a small order free.
const penny = (value) => (value < 0.01 ? 0 : Math.round(value * 100) / 100);

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked) return true;
    return isCrypto(r) && loose(cryptoBase(r.ticker)) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    return { named, matches: [{ row: crypto[0], venue: null }] };
  }

  const matches = named
    .filter((r) => !isCrypto(r))
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "USD").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, otc: 0, adr: 0, ordinary: 0 });
    slot.n += 1;
    if (isOverTheCounter(r)) slot.otc += 1;
    if (isAdr(r)) slot.adr += 1;
    if (isForeignOrdinary(r)) slot.ordinary += 1;
    if (isCrypto(r)) continue;
    const { venue } = listingKey(r);
    const leaf =
      venue?.mic &&
      spreads[String(r.isin || "").toUpperCase()]?.[venue.mic]?.[String(r.currency || "USD").toUpperCase()];
    if (leaf?.bp != null || leaf?.perShare != null) slot.withBook += 1;
  }
  return out;
}

// Whether a company sells this line at all, and why not when it does not. The
// European answer is a list of names the catalogue already carries; the British
// one is a list of kinds, read off the universe page.
function refuseOf({ who, row, isa, matches }) {
  if (who === "eu") {
    if (matches.length && matches.every((m) => m.row.usOnly)) {
      return `${row.ticker || row.isin} n'est pas un Classic Stock Token : Robinhood Europe ne le vend pas`;
    }
    return null;
  }

  if (who !== "uk") return null;

  const type = String(row.type || "").toUpperCase();
  if (UK_BARRED.has(type)) return `Robinhood U.K. ne vend pas d'${type} : pas de KID au sens PRIIPs`;
  if (isForeignOrdinary(row)) {
    return `Robinhood U.K. ne vend pas d'action non américaine hors bourse américaine : ${row.ticker} est une ordinaire étrangère`;
  }
  // The ISA takes US exchange-listed stocks and ADRs. An OTC line that is neither
  // — and there are fourteen — falls out; the 638 ADRs do not.
  if (isa && isOverTheCounter(row) && !isAdr(row)) {
    return `l'ISA de Robinhood U.K. ne prend que les titres cotés en bourse américaine et les ADR`;
  }
  return null;
}

export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount,
  nat = "",
  entity = null,
  bp = null,
  perShare = null,
  commission = COMMISSION_RATE,
  weekend = false,
  isa = false,
}) {
  const who = entity || entityOf(nat);
  const european = who === "eu";
  const base = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: ENTITY_CASH[who],
    entity: who,
    entityName: ENTITY_NAME[who],
  };

  if (!catalogue) {
    return { ...base, why: "le catalogue Robinhood n'existe pas encore : lancer `node robinhood/robinhood_scraping.mjs`" };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...base, why: `${etf} n'est pas dans le catalogue Robinhood` };

  const cryptoRow = named.find(isCrypto);
  if (cryptoRow && (!place || /crypto/i.test(place))) return cryptoTrip(cryptoRow, { base, amount, who });

  // A line absent from Robinhood Europe's token list is not sold by the European
  // company at all. `onlineBuy: false` drops the row rather than pricing a trade
  // that cannot be placed.
  if (european) {
    const refused = refuseOf({ who, row: named[0], isa, matches });
    if (refused) return { ...base, onlineBuy: false, why: refused };
  }

  if (!matches.length) {
    return {
      ...base,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Robinhood`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const otc = isOverTheCounter(m.row);
  const adr = isAdr(m.row);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency || "USD",
    unsourced: m.unsourced,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
    otc,
    adr,
  };

  const refused = refuseOf({ who, row: m.row, isa, matches });
  if (refused) return { ...base, listing, onlineBuy: false, why: refused };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const ukFx = weekend ? UK_FX_WEEKEND : UK_FX_WEEKDAY;

  const answer = {
    ...base,
    listing,
    feeMarket: european ? "token" : otc ? "otc" : "us",
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? (european ? SCHEDULE.eu : who === "uk" ? SCHEDULE.uk : SCHEDULE.source),
    fx: fxNote(listing.currency),
    basis: european
      ? `barème Robinhood Europe ${SCHEDULE.euOn}, relu le ${SCHEDULE.readOn}`
      : `barème ${who === "uk" ? `Robinhood U.K. ${SCHEDULE.ukOn}` : `Robinhood Financial ${SCHEDULE.usOn}`}, relu le ${SCHEDULE.readOn}`,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...answer,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      remark: remarkOf({ who, isa, adr, ukFx }),
    };
  }

  const notional = toUsd(n * p, listing.currency);
  // The book is already a round trip — the Rule 605 effective spread per share on
  // the American tape — so it is added once, not per side.
  const bookUsd =
    marketBp != null && notional != null
      ? (notional * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  // The European token is not a US security, so no American regulator reaches it.
  const sec = european || notional == null || notional <= SEC_FREE_UPTO ? 0 : up(notional * SEC_RATE, 0.01);
  const taf = european || n <= TAF_FREE_UPTO_SHARES ? 0 : penny(Math.min(n * TAF_PER_SHARE, TAF_CAP));
  const cat = european ? 0 : penny(2 * n * catPerShare(otc));
  const regulators = sec + taf + cat;

  // Conversion. Unavoidable in Vilnius, unavoidable in an ISA, optional in a
  // British general account which holds dollars of its own. The European leg is
  // the billed rate plus the measured spread between the two rates; the British
  // one is the billed rate alone, its spread never having been measured.
  const fxRate = european ? EU_FX_EACH_WAY + EU_FX_SPREAD_EACH_WAY : who === "uk" ? ukFx : 0;
  const forced = european || (who === "uk" && isa);
  const fxUsd = forced && notional != null ? 2 * notional * fxRate : 0;

  const feeUsd = notional != null ? 2 * notional * commission : 0;

  const usd = plus(bookUsd, regulators, fxUsd, feeUsd);
  // What Robinhood keeps. No commission anywhere on this shelf, so the column is
  // the conversion it bills and nothing else: the three regulators are not its
  // money, and its own UK schedule calls the book an "implicit third-party cost".
  const brokerFees = plus(fxUsd, feeUsd);

  return {
    ...answer,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    // The fees are known and the book is not, so the total is N/A rather than the
    // fees alone: a missing measurement must not read as a cheap venue.
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de source 605"}`,
        }
      : {}),
    trade: { shares: n, price: p, notional: n * p, notionalUsd: finite(notional, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      réglementaire: Number(regulators.toFixed(6)),
      change: Number(fxUsd.toFixed(6)),
      commission: Number(feeUsd.toFixed(6)),
      taxes: 0,
    },
    sell: { sec: Number(sec.toFixed(6)), taf: Number(taf.toFixed(6)) },
    waivers: european
      ? null
      : {
          sec: notional != null && notional <= SEC_FREE_UPTO,
          taf: n <= TAF_FREE_UPTO_SHARES,
          cat: 2 * n * catPerShare(otc) < 0.01,
          secFreeUpto: SEC_FREE_UPTO,
          tafFreeUptoShares: TAF_FREE_UPTO_SHARES,
        },
    // The European conversion is inside the total: it is not an "if". The British
    // one is, unless the account is an ISA.
    fxIfConverted: who === "uk" && !isa ? 2 * ukFx : null,
    measured: european ? EU_TOKEN_CHECK : null,
    remark: remarkOf({ who, isa, adr, ukFx }),
    confidence: confidenceOf({
      who,
      listing,
      marketBp,
      marketPerShare,
      notional,
      n,
      otc,
      adr,
      commission,
      ukFx,
      isa,
      unsourced: m.unsourced,
    }),
  };
}

function cryptoTrip(row, { base, amount, who }) {
  const ticker = String(row.ticker || "").toUpperCase();
  const coin = cryptoBase(ticker);
  const listing = {
    isin: null,
    ticker: row.ticker,
    name: row.name,
    type: "CRYPTO",
    mic: null,
    exchange: who === "eu" ? "Robinhood Europe (crypto)" : "Robinhood Crypto",
    // The European account holds euros and nothing else, and the tickets quote the
    // coin in euros, so the catalogue's dollar is the American book's and not this
    // one's.
    currency: who === "eu" ? "EUR" : String(row.currency || "USD").toUpperCase(),
  };

  // Robinhood UK has no crypto arm. Its fee schedule names stocks, options and
  // futures and stops there, and its universe page refuses cryptocurrency by name.
  if (who === "uk") {
    return {
      ...base,
      listing,
      feeMarket: "crypto",
      onlineBuy: false,
      why: "Robinhood U.K. Ltd ne vend pas de crypto",
    };
  }

  const a = Number(amount);
  const answer = {
    ...base,
    listing,
    feeMarket: "crypto",
    fx: fxNote(listing.currency),
    url: who === "eu" ? SCHEDULE.eu : SCHEDULE.routing,
  };

  if (!(a > 0)) return { ...answer, why: "aucun montant pour cette pièce", remark: "" };

  return who === "eu" ? euCryptoTrip({ answer, amount: a, coin }) : usCryptoTrip({ answer, amount: a });
}

function usCryptoTrip({ answer, amount }) {
  const tier = CRYPTO_TIERS[0];
  // Both roads cost a small account the same 0.95 % a leg: on the default road it
  // is inside the spread and paid to Robinhood, on the other it is billed as a
  // taker fee. Neither is charged a book on top — the crossing is what this is.
  const usd = 2 * amount * CRYPTO_MARKET_MAKER;

  return {
    ...answer,
    usd: finite(usd, 6),
    brokerFees: finite(usd, 6),
    bp: Number((2 * CRYPTO_MARKET_MAKER * 1e4).toFixed(0)),
    perShare: null,
    trade: { amount, currency: QUOTE },
    parts: { marché: finite(usd, 6), réglementaire: 0, change: 0, commission: 0, taxes: 0 },
    tiers: CRYPTO_TIERS,
    basis:
      `0,95 % par jambe, barème Robinhood Crypto ${SCHEDULE.cryptoOn} du ${SCHEDULE.cryptoFrom} : ` +
      `routage teneur de marché (défaut de l'app, aucun frais affiché, 0,95 $ par 100 $ reversés à Robinhood ` +
      `depuis le ${SCHEDULE.rebateFrom}) ou routage bourse, premier palier sous 10 000 $ de volume 30 jours, taker ${tier.taker}`,
    fxIfConverted: null,
    measured: null,
    remark: "",
    confidence:
      `les deux routages coûtent le même 0,95 % par jambe à un petit compte, ce qui donne 1,90 % l'aller-retour ; ` +
      `le défaut de l'app n'affiche aucun frais, le chiffre vient de la page de routage ; ` +
      `Robinhood y chiffre aussi l'écart entier : « si vous passez un ordre d'achat de 100 $ et que l'écart d'achat est de 0,96 %, ` +
      `Robinhood Crypto reçoit 0,95 $ sur les 0,96 $ », et les ordres sont exécutés au bid ou à l'ask, pas au mid — ` +
      `l'aller-retour réel tourne donc autour de ${(200 * CRYPTO_SPREAD_EXAMPLE).toFixed(2)} % et ce chiffre reste un plancher, ` +
      `mais à un centième de point près et non plus ouvert ; ` +
      `le carnet Binance / Coinbase n'est pas ajouté, la traversée est déjà dedans ; ` +
      `aucun aller-retour réel sur la crypto américaine, barème lu le ${SCHEDULE.readOn}`,
  };
}

function euCryptoTrip({ answer, amount, coin }) {
  const free = EU_FREE_COINS.has(coin);
  const minUsd = toUsd(EU_CRYPTO_MIN_EUR, "EUR");
  // The minimum is per transaction, so each leg meets it on its own. The crossing
  // rides on the buy alone, and it is inside the price rather than billed.
  const leg = free ? 0 : Math.max(amount * EU_CRYPTO_EACH_WAY, minUsd ?? 0);
  const fee = 2 * leg;
  const markup = free ? 0 : amount * EU_CRYPTO_MARKUP;
  const usd = fee + markup;

  return {
    ...answer,
    usd: finite(usd, 6),
    // Both halves are Robinhood's: the commission it bills and the percent it
    // takes inside its own quote. There is no exchange here the client could have
    // crossed instead, so none of this belongs to a market.
    brokerFees: finite(usd, 6),
    bp: free ? 0 : Number(((2 * EU_CRYPTO_EACH_WAY + EU_CRYPTO_MARKUP) * 1e4).toFixed(0)),
    perShare: null,
    trade: { amount, currency: QUOTE },
    parts: { marché: finite(markup, 6), réglementaire: 0, change: 0, commission: finite(fee, 6), taxes: 0 },
    atMinimum: !free && amount * EU_CRYPTO_EACH_WAY < (minUsd ?? 0),
    basis: free
      ? `barème Robinhood Europe ${SCHEDULE.euOn} : l'EURC est exempté, achat comme vente`
      : `0,50 % par transaction au barème Robinhood Europe ${SCHEDULE.euOn}, ` +
        `plus 1,00 % pris dans le prix à l'achat, mesuré`,
    fxIfConverted: null,
    measured: free ? null : EU_CRYPTO_CHECK,
    remark: free ? "0 % à l'achat comme à la vente en euros." : "",
    confidence: free
      ? `l'EURC est gratuit à l'achat et à la vente chez Robinhood Europe, comme le dit la note du barème ` +
        `(${SCHEDULE.euOn}) ; reste l'écart du carnet, que ce fichier ne chiffre pas pour un jeton à 1,0000`
      : `1,00 % de commission sur l'aller-retour, plus 1,00 % pris dans le prix d'achat : 2,00 % en tout, ` +
        `soit à peu près le coût américain et non la moitié ; le barème n'annonce que la première moitié ; ` +
        `aller-retour réel sur BTC le ${EU_CRYPTO_CHECK.on} : ${EU_CRYPTO_CHECK.spent} € ont acheté ` +
        `${EU_CRYPTO_CHECK.got} BTC quand l'écran affichait ${EU_CRYPTO_CHECK.askShown} €, soit un prix payé de ` +
        `${EU_CRYPTO_CHECK.effective} € — 1,0003 % au-dessus ; la vente une minute plus tard est partie au prix ` +
        `affiché à 0,0005 % près, commission comprise et rien d'autre : la marge est entière sur l'achat ; ` +
        `aller-retour constaté 1,98 % à prix constant ; minimum 1 centime, il ne mord que sous 2 €`,
  };
}

function remarkOf({ who, isa, adr, ukFx }) {
  // Le compte est en euros et rien d'autre, donc la conversion n'est pas une
  // option à signaler : elle est dans le total de tout ordre. Sa composition — le
  // taux facturé et l'écart mesuré entre les deux taux — reste dans `confidence`.
  if (who === "eu") return "";
  if (who === "uk") {
    return isa
      ? `FX ${(ukFx * 100).toFixed(2)}% each way, unavoidable in an ISA: in the total.`
      : `FX ${(ukFx * 100).toFixed(2)}% each way if converted.` +
          (adr ? "\nOff-exchange ADR: some carry a depositary bank custody fee." : "");
  }
  // Les deux dispenses sont déjà dans le total, qui tombe à zéro de lui-même sous
  // les seuils : les répéter ici reviendrait à facturer deux fois la même lecture.
  // Le détail reste lisible dans `waivers`.
  return adr ? "Off-exchange ADR: some carry a depositary bank custody fee." : "";
}

function confidenceOf({
  who,
  listing,
  marketBp,
  marketPerShare,
  notional,
  n,
  otc,
  adr,
  commission,
  ukFx,
  isa,
  unsourced,
}) {
  const kind = listing.type === "STOCK" ? "action" : listing.type === "ETF" ? "fonds" : listing.type || "titre";
  const lines = [];

  if (who === "eu") {
    lines.push(
      `Classic Stock Token de Robinhood Europe (${kind} sous-jacent) : un dérivé MiFID II émis à Vilnius, pas la part américaine`
    );
    lines.push(
      `aucune commission, aucun régulateur américain, ${(EU_FX_EACH_WAY * 100).toFixed(2)} % de change facturés à l'aller et au retour, ` +
        `plus ${(EU_FX_SPREAD_EACH_WAY * 100).toFixed(3)} % d'écart entre les deux taux, hors barème et mesuré : ` +
        `${((EU_FX_EACH_WAY + EU_FX_SPREAD_EACH_WAY) * 200).toFixed(3)} % l'aller-retour — inévitable, le compte étant en euros`
    );
    lines.push(
      `aller-retour réel de 100 € sur le jeton ${EU_TOKEN_CHECK.token} le ${EU_TOKEN_CHECK.on} : ` +
        `${EU_TOKEN_CHECK.paid} € sortis, ${EU_TOKEN_CHECK.back} € rentrés vingt-neuf secondes plus tard, ` +
        `soit ${(EU_TOKEN_CHECK.roundTrip * 100).toFixed(4)} %, dont 0,20 % de commission et ` +
        `${(EU_TOKEN_CHECK.fxGap * 100).toFixed(4)} % entre les taux d'achat et de vente ` +
        `(${EU_TOKEN_CHECK.buyFx} puis ${EU_TOKEN_CHECK.sellFx} $/€) : il ne reste rien pour l'écart du jeton, ` +
        `et le remplissage n'a dépassé l'écran que de ${((EU_TOKEN_CHECK.buyFilled / EU_TOKEN_CHECK.buyShown - 1) * 100).toFixed(4)} % à l'achat — ` +
        `la crypto européenne, elle, le dépasse de 1 %`
    );
    lines.push(
      `le jeton se traite du lundi au samedi en continu : hors séance américaine, le marché de référence est plus mince que la moyenne 605 lue ici`
    );
  } else {
    lines.push(
      `frais lus au barème ${who === "uk" ? "Robinhood U.K." : "Robinhood Financial"} (${kind}` +
        (adr ? ", ADR hors bourse" : otc ? ", OTC : CAT à 0,00000003 $ la part" : "") +
        `), commission nulle sur les titres américains` +
        (commission ? `, commission de ${(commission * 100).toFixed(2)} % par jambe imposée` : "")
    );
    if (who === "uk") {
      lines.push(
        `change ${(ukFx * 100).toFixed(2)} % entre les poches livre et dollar` +
          (isa
            ? `, inévitable en ISA qui n'est qu'en livres, donc dans le total`
            : `, évitable en gardant des dollars — le barème dit qu'il ne frappe que la conversion entre les deux poches — donc hors du total`)
      );
      lines.push(
        `univers lu sur la page « Investments you can make on Robinhood UK » : ni ETF, ni crypto, ni action non américaine ; ` +
          `l'ISA prend les titres cotés en bourse américaine et les ADR, et le suffixe du ticker OTC dit lequel est lequel`
      );
    }
    lines.push(
      `SEC en vigueur depuis le ${SCHEDULE.secFrom}, TAF depuis le ${SCHEDULE.tafFrom}, lus le ${SCHEDULE.readOn}`
    );
    const freeSec = notional != null && notional <= SEC_FREE_UPTO;
    const freeTaf = n <= TAF_FREE_UPTO_SHARES;
    if (freeSec || freeTaf) {
      lines.push(
        `dispenses appliquées à cette taille : ` +
          [freeSec ? `pas de SEC sous ${SEC_FREE_UPTO} $ de vente` : null, freeTaf ? `pas de TAF à ${TAF_FREE_UPTO_SHARES} parts ou moins` : null]
            .filter(Boolean)
            .join(", ") +
          `, et le CAT tombe à zéro sous le centime`
      );
    } else {
      lines.push(
        `au-dessus des deux dispenses : ${SEC_FREE_UPTO} $ de vente et ${TAF_FREE_UPTO_SHARES} parts, sous lesquelles un ordre ne paie rien`
      );
    }
  }

  lines.push(
    "la colonne « frais du courtier » ne porte que le change : les trois régulateurs américains ne sont pas l'argent de Robinhood, " +
      "et son propre barème britannique appelle le carnet un « coût implicite de tiers »"
  );

  if (marketBp == null && marketPerShare == null) {
    lines.push(`aucun carnet : ${unsourced?.name || "cette place"}, ${unsourced?.why || "pas de source 605"} — à lire comme un plancher`);
  } else {
    lines.push(
      "spread effectif publié : moyenne mensuelle sur les ordres immédiats de 100 à 499 parts, cinq teneurs, Citadel et Virtu manquants"
    );
    if ((marketPerShare ?? 0) > 0.01) {
      lines.push(
        "ATTENTION carnet large : sous 100 parts, l'amélioration de prix que ce chiffre contient n'a pas lieu — pour un lot rompu, passer la touche cotée en `perShare`"
      );
    }
  }

  lines.push(
    who === "eu"
      ? `l'aller-retour réel porte sur le jeton ${EU_TOKEN_CHECK.token} et non sur cette ligne : le change mesuré vaut pour toute l'étagère, l'écart du carnet non`
      : "aucun aller-retour réel sur cette ligne"
  );
  return lines.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = argv.filter((a) => !a.startsWith("--"));

  if (argv.includes("--schedule")) {
    console.log(`barème Robinhood, relu le ${SCHEDULE.readOn}`);
    console.log(`  titres US  ${SCHEDULE.source}   (${SCHEDULE.usOn})`);
    console.log(`  titres UK  ${SCHEDULE.uk}   (${SCHEDULE.ukOn})`);
    console.log(`  Europe     ${SCHEDULE.eu}   (${SCHEDULE.euOn})`);
    console.log(`  crypto US  ${SCHEDULE.crypto}   (${SCHEDULE.cryptoOn})`);
    console.log(`  routage    ${SCHEDULE.routing}`);
    console.log(`  univers UK ${SCHEDULE.ukUniverse}\n`);
    console.log("  trois sociétés, la résidence décide :");
    console.log(`    US   ${ENTITY_NAME.us} — la part américaine, compte en ${ENTITY_CASH.us}`);
    console.log(`    GB   ${ENTITY_NAME.uk} — la même part, plus le change, compte en ${ENTITY_CASH.uk}`);
    console.log(`    EEE  ${ENTITY_NAME.eu} — un Classic Stock Token, dérivé MiFID II, compte en ${ENTITY_CASH.eu}\n`);
    console.log("  États-Unis et Royaume-Uni, actions, ETF, ETN, ETC et OTC :");
    console.log(`    commission     0`);
    console.log(`    SEC            ${SEC_RATE} du montant, à la vente seule, arrondi au centime supérieur`);
    console.log(`                   dispensée sous ${SEC_FREE_UPTO} $ de vente, en vigueur depuis le ${SCHEDULE.secFrom}`);
    console.log(`    FINRA TAF      ${TAF_PER_SHARE} par part, à la vente seule, plafond ${TAF_CAP} $`);
    console.log(`                   dispensée à ${TAF_FREE_UPTO_SHARES} parts ou moins, en vigueur depuis le ${SCHEDULE.tafFrom}`);
    console.log(`    CAT            ${CAT_PER_SHARE} par part cotée, ${CAT_OTC_PER_SHARE.toFixed(8)} par part OTC, aux deux jambes`);
    console.log(`    arrondi        SEC au centime supérieur ; TAF et CAT au centime le plus proche, à 0 sous le centime`);
    console.log(`    change UK      ${UK_FX_WEEKDAY} en semaine, ${UK_FX_WEEKEND} du vendredi 17 h à New York au dimanche`);
    console.log(`                   entre les poches livre et dollar ; inévitable en ISA, qui est en livres seules`);
    console.log(`\n  Europe, Classic Stock Tokens (${SCHEDULE.euOn}) :`);
    console.log(`    commission     0, et aucun régulateur américain : c'est un dérivé, pas une part`);
    console.log(`    change         ${EU_FX_EACH_WAY} de la valeur en euros par ordre, aux deux sens, inévitable`);
    console.log(`                   plus ${EU_FX_SPREAD_EACH_WAY} par sens entre les deux taux, hors barème, mesuré le ${EU_TOKEN_CHECK.on}`);
    console.log(`    crypto         ${EU_CRYPTO_EACH_WAY} par transaction, minimum ${EU_CRYPTO_MIN_EUR} €, ${[...EU_FREE_COINS].join(" / ")} exempté`);
    console.log(`                   plus ${EU_CRYPTO_MARKUP} pris dans le prix à l'achat, hors barème, mesuré le ${EU_CRYPTO_CHECK.on}`);
    console.log(`    staking        15 % des récompenses`);
    console.log(`    perpétuels     0,02 % maker / 0,02 % taker Robinhood, plus 0,02 % taker de place — pas au catalogue`);
    console.log(`\n  crypto américaine, depuis le ${SCHEDULE.cryptoFrom}, deux routages :`);
    console.log(`    teneur de marché  aucun frais affiché, ${CRYPTO_MARKET_MAKER} par jambe dans le prix (0,95 $ par 100 $, depuis le ${SCHEDULE.rebateFrom})`);
    console.log(`                      écart entier ${CRYPTO_SPREAD_EXAMPLE} par jambe dans l'exemple de Robinhood, exécution au bid ou à l'ask`);
    console.log(`    bourse            EDX / Bitstamp, taker puis maker par volume 30 jours :`);
    for (const t of CRYPTO_TIERS) {
      const upto =
        t.upto === Infinity
          ? "au-delà"
          : t.upto >= 1e6
            ? `jusqu'à ${t.upto / 1e6} M$`
            : `jusqu'à ${t.upto / 1e3} k$`;
      console.log(`      ${upto.padEnd(18)} ${(t.taker * 100).toFixed(3)} %   ${(t.maker * 100).toFixed(3)} %`);
    }
    console.log(`\n  ce que le Royaume-Uni refuse, page « Investments you can make on Robinhood UK » :`);
    console.log(`    ${[...UK_BARRED].join(", ")} (PRIIPs, pas de KID), la crypto, les actions non américaines,`);
    console.log(`    celles cotées hors bourse américaine, les fonds fermés, sociétés en commandite,`);
    console.log(`    royalty trusts, units, actions de préférence et New York registry shares`);
    console.log(`    l'ISA se limite aux titres cotés en bourse américaine et aux ADR`);
    console.log(`    le suffixe du ticker OTC tranche : ...Y un ADR, ...F une ordinaire étrangère`);
    console.log(`  hors sujet ici : options ${0.5} $ le contrat (${0.35} $ en Gold), marge 5,00 % sous 50 000 $`);
    console.log(`  non modélisé : droits de garde ADR, prélevés par la banque dépositaire et variables`);
    console.log(`  pas au catalogue : options, contrats à terme`);

    const cover = coverage();
    if (cover) {
      const euLines = rows.filter((r) => !r.usOnly).length;
      console.log("\n  catalogue :");
      for (const [type, row] of Object.entries(cover)) {
        const extra = type === "CRYPTO" ? "" : `, ${row.withBook} avec carnet 605, ${row.n - row.withBook} frais seuls`;
        const otc = row.otc ? `, dont ${row.otc} OTC (${row.adr} ADR, ${row.ordinary} ordinaires étrangères)` : "";
        console.log(`    ${String(type).padEnd(6)} ${row.n} lignes${extra}${otc}`);
      }
      console.log(`    dont ${euLines} vendues par Robinhood Europe, ${rows.length - euLines} par les seules US et UK`);
      const ukSells = rows.filter((r) => !UK_BARRED.has(String(r.type).toUpperCase()) && !isCrypto(r) && !isForeignOrdinary(r)).length;
      const isaSells = rows.filter(
        (r) => !UK_BARRED.has(String(r.type).toUpperCase()) && !isCrypto(r) && !isForeignOrdinary(r) && (!isOverTheCounter(r) || isAdr(r))
      ).length;
      console.log(`    Robinhood U.K. en vend ${ukSells}, son ISA ${isaSells}`);
    }
    process.exit(0);
  }

  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node robinhood/robinhood_cost.mjs <ticker|ISIN> [place] [devise]\n" +
        "        [--nat=FR] [--entity=us|uk|eu] [--isa] [--weekend] [--shares=n] [--price=p] [--amount=x] [--json] [--schedule]\n" +
        "  ex.   node robinhood/robinhood_cost.mjs AAPL --shares=10 --price=230\n" +
        "        node robinhood/robinhood_cost.mjs AAPL --shares=10 --price=230 --nat=FR    (Classic Stock Token)\n" +
        "        node robinhood/robinhood_cost.mjs AAPL --shares=10 --price=230 --nat=GB --isa\n" +
        "        node robinhood/robinhood_cost.mjs BTC --amount=1000 --nat=FR"
    );
    process.exit(1);
  }

  const nat = arg("nat") || "";
  const out = roundTrip({
    etf,
    place,
    currency,
    nat,
    entity: arg("entity"),
    shares: arg("shares") != null ? Number(arg("shares")) : 10,
    price: arg("price") != null ? Number(arg("price")) : undefined,
    amount: arg("amount") != null ? Number(arg("amount")) : 1000,
    bp: arg("bp") != null ? Number(arg("bp")) : null,
    perShare: arg("perShare") != null ? Number(arg("perShare")) : null,
    commission: arg("commission") != null ? Number(arg("commission")) : COMMISSION_RATE,
    weekend: argv.includes("--weekend"),
    isa: argv.includes("--isa"),
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.usd == null ? 1 : 0);
  }

  if (!out.listing || out.onlineBuy === false) {
    console.error(out.why);
    if (out.alternatives?.length) console.error(`  ailleurs : ${out.alternatives.join(", ")}`);
    process.exit(1);
  }

  const show = (x) => (x == null ? "N/A" : x);
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || "sans nom"}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}`);
  console.log(`${out.entityName}${nat ? `, résidence ${nat.toUpperCase()}` : ""}, compte en ${out.cashCurrency}\n`);

  if (out.trade?.amount != null) {
    console.log(`${out.trade.amount} $ aller-retour\n`);
  } else if (out.trade) {
    console.log(
      `${out.trade.shares} part${out.trade.shares > 1 ? "s" : ""} à ${out.trade.price} ${l.currency} = ` +
        `${out.trade.notional.toFixed(2)} ${l.currency} (${show(out.trade.notionalUsd)} $)\n`
    );
  }

  console.log(`aller-retour     : ${show(out.usd)} $`);
  console.log(`frais du courtier: ${show(out.brokerFees)} $`);
  if (out.parts) {
    console.log(`  carnet         : ${show(out.parts.marché)} $`);
    if (out.parts.réglementaire) console.log(`  régulateurs    : ${out.parts.réglementaire} $   (SEC ${out.sell?.sec ?? 0}, TAF ${out.sell?.taf ?? 0})`);
    if (out.parts.change) console.log(`  change         : ${out.parts.change} $`);
    if (out.parts.commission) console.log(`  commission     : ${out.parts.commission} $`);
  }
  if (out.why) console.log(`  ${out.why}`);
  if (out.atMinimum) console.log(`  (au minimum du centime par transaction)`);

  console.log(`\n  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.fxIfConverted) console.log(`  change ${out.fxIfConverted} l'aller-retour si converti, hors du total`);

  if (out.remark) console.log(`\n${out.remark}`);
  if (out.url) console.log(`\n${out.url}`);
}
