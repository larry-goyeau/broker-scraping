// What one round trip costs at BUX: buy n shares at price p, sell them back at
// once, market order both ways. `roundTrip()` answers the whole bill in dollars
// and, beside it, the part BUX keeps.
//
// BUX B.V. (NL), a subsidiary of ABN AMRO, phone app only, eight EU countries.
// The catalogue is recovered from screen recordings (`bux_scraping.mjs`). Cash
// is euro and the card is in euro. Three plans on getbux.com/fees, re-read
// 2026-09-15 and unchanged since 2026-09-10.
//
// Market order, each way:
//   EU stocks    Basic 3,99 € · Plus 1,99 € · Prime 0,99 €
//   US stocks    0,99 € on every plan
//   ETF / ETC    0,99 € on every plan
//
// The ticket is a flat order fee and not a percentage, so it is the whole of
// the commission on a small trip and a rounding error on a large one. On top of
// it BUX bills an FX markup on anything that is not euro — 0,75 % Basic,
// 0,25 % Plus, 0,20 % Prime — once on the buy and once on the sell.
//
// One live Plus trip on 2026-09-10, euro cash: TXG (US88025U1097), market both
// ways, one share. Tickets 0,99 € each way. Cash 70,00 → 67,48 €.
//
// Three ex-ante cost reports pulled on 2026-09-15, one per fee market — Apple
// on NASDAQ, Air Liquide on Euronext Paris, Telefonica on the Bolsa de Madrid —
// settle three things the fee card and that trip left open. MiFID II binds BUX
// to them item by item, and on the American one the four items add to the
// printed total at the cent, so nothing is hiding between the lines.
//
//   the tickets   0,99 € on NASDAQ, 1,99 € on Paris and on Madrid, each way,
//                 which is the Plus column of the card exactly.
//   the markup    0,25 % of the euro amount, disclosed as its own line. The
//                 sell leg of every report reads higher — 1,68 € against
//                 1,25 € on Apple, printed as 0,34 % against 0,25 % — and that
//                 is arithmetic, not a wider leg: the report grows the position
//                 three years at its own assumed return, 10,25 % a year here,
//                 and charges the same rate on 670 € instead of 500 €. The
//                 spreads grow the same way, 0,15 € then 0,20 €, both 0,03 %.
//                 The 0,33 % this file carried from the 2026-09-10 sell was the
//                 same arithmetic on a 57,32 € report, and never a debit: that
//                 trip was charged its two tickets and a cash line, and the
//                 per-leg conversion figures came off the report, not the
//                 account. So there is one rate, the card's, and the doubt it
//                 was kept against did not exist.
//   the taxes     0,40 % on the French line and 0,20 % on the Spanish one,
//                 below.
//
// What the reports disclose and the app hides is worth its own line. The order
// review names one cost, the commission, and folds the conversion into the
// EUR/USD printed beside it. Reading both sides of Apple a moment apart at
// 16:02 measures it without trusting any outside rate — 1,151 87 to buy,
// 1,157 7 to sell, a mid of 1,154 781, 0,2527 % on each side. Symmetric, and
// the card's figure. So the markup is no longer only read, and the 0,28 % this
// file briefly measured off one sell ticket against the ex-ante's own printed
// reference was that reference being 0,085 % stale, not a wider leg.
//
// It is also the larger fee, and the one nobody is shown: 2,50 € of conversion
// on a 500 € round trip against 1,98 € of commission.
//
// Three things the card charges that are not this trip, and stay in the remark
// or out entirely:
//
//   Variable service fee   0,20 %/an Basic from the first euro, 0,10 %/an above
//                          250 k€ (Plus) or 500 k€ (Prime). A cost of holding,
//                          not of trading, so it is named and not counted.
//   Zero Order             zero commission, but executed at the end of the day
//                          between 16:00 CET and the close, capped at 3/month
//                          on Plus and 5 on Prime, absent from Basic. A round
//                          trip of two of them is free and this file does not
//                          price it: the price is not the one you asked for.
//   Investment Plan        the buy leg is free on every plan, the sell is an
//                          ordinary market order. Half a trip, so not this one.
//
// Deposits and withdrawals are free on all three plans. Signing up for a
// shareholders' meeting costs 10 € and touches no trade.
//
// The Spanish tax was the open question of this file and is now a rate. BUX's
// own ex-ante charges 1,03 € on 515,34 € of Telefonica bought on the Bolsa de
// Madrid — 0,20 %, the Spanish FTT — while the root map, which reads
// Trading212's disclosure, comes back with a measured zero on every Spanish
// line including that one. Both can be true: the tax falls on the intermediary,
// who may collect it or leave the buyer to declare it, and the two brokers
// evidently choose differently. So `OWN_FTT` carries it here rather than in the
// root map, the same way bunq carries the Italian rate the same sweep missed.
// France needs no such patch: BUX's 2,00 € on 500 € of Air Liquide is the map's
// 0,40 % to the cent, which is also a check on the map itself.
//
// One figure is still not modelled, and it would only raise the bill:
//
//   SEC and TAF  The American regulators take 0,0027 8 % of a sale and
//                0,000 166 $ a share. Neither is on the fee card nor on any of
//                the three ex-ante reports, and on a 500 € Apple trip they come
//                to about a cent and a fifth of a cent — under the rounding of
//                a report that prints to the cent, so their absence there is
//                not evidence either way. Left out, and the confidence line
//                says by how much.
//
//   https://getbux.com/fees/
//
//   node bux/bux_cost.mjs CAC --shares=10 --price=24
//   node bux/bux_cost.mjs AAPL NASDAQ USD --plan=plus --shares=10 --price=230
//   node bux/bux_cost.mjs TXG NASDAQ USD --plan=plus --shares=1 --price=66
//   node bux/bux_cost.mjs TEF BME EUR --amount=1000 --plan=prime
//   node bux/bux_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("bux-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://getbux.com/fees/",
  readOn: "2026-09-15",
  entity: "BUX B.V. (NL), filiale d'ABN AMRO",
};

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

// Stocks is sold to residents of these eight countries and to no one else, and
// BUX cannot take a U.S. person at all (FATCA, client agreement §1). It is a
// fact about the reader rather than about the line, so it travels beside the
// price instead of turning `onlineBuy` off.
const RESIDENCY = ["AT", "BE", "DE", "ES", "FR", "IE", "IT", "NL"];

const TRANSFER = { deposit: 0, withdrawal: 0, currency: "EUR" };

// BUX does not execute where its app lists a line. European shares and funds go
// to Equiduct on BUX's own trading membership, or through ABN AMRO Clearing to
// Cboe Europe BATS and Cboe Europe Chix, with fractions crossed at a systematic
// internaliser — Tower Research Capital Europe, or ABN AMRO Clearing itself
// (Order Execution Policy of 2024-07-11, §4.5 and §4.6). Not one of those four
// publishes a tape this repo reads, and the catalogue names the listing venue
// the app shows rather than any of them.
//
// So when the named venue has no book of its own, a euro line is priced on the
// tightest of the deep regulated books Equiduct's VBBO aggregates. Equiduct
// quotes the volume-weighted best bid and offer across those books, so every
// one of them is a ceiling on what BUX actually crosses, and the tightest is
// the ceiling that claims the least. The order below is no longer a preference,
// only the set that is looked in. It carries `bookProxy` so the displayed venue
// stays the one the app names.
const EU_PROXY_MICS = ["XETR", "XPAR", "XAMS", "XBRU", "XMIL", "XWBO", "XLIS", "XFRA"];

// Never added to the bill. Kept as numbers only so the confidence line can say
// what leaving them out is worth instead of waving at them.
const US_REGULATORS = { secRate: 0.0000278, tafPerShare: 0.000166, tafCap: 8.3 };

// The one live trip. Only the cash line and the commissions were charged; the
// per-leg change came off that day's ex-ante report and is marked as such,
// because it carries the same three-year growth as the ones below and is not a
// debit anyone saw.
const CHECK = {
  isin: "US88025U1097",
  ticker: "TXG",
  plan: "plus",
  accountCcy: "EUR",
  n: 1,
  buy: { priceUsd: 66.44, commission: 0.99 },
  sell: { priceUsd: 66.06, commission: 0.99 },
  cash: { start: 70, end: 67.477 },
  commissionPaid: 1.98,
  exAnte: { valueEur: 57.32, buyFx: 0.14, buyFxPct: 0.0025, sellFx: 0.19, sellFxPct: 0.0033 },
  on: "2026-09-10",
};

// Three ex-ante cost reports pulled from the app on 2026-09-15 on a Plus
// account, one per fee market. MiFID II binds BUX to these line by line, which
// is why they settle what the fee card leaves silent — a tax the card never
// mentions, and a markup the order screen never shows.
//
// The sell percentages read higher than the buy ones and are not. Each report
// grows the position at its own assumed return for three years and then applies
// the same rate to the larger number: Apple at 10.25 % a year turns 500 € into
// 670 €, and 0,25 % of 670 € is exactly the 1,68 € printed as "0,34 %". The
// spreads do it too — 0,15 € on 500 €, 0,20 € on 670 €, both 0,03 %. So the
// rate is one rate both ways, and the 0,33 % this file used to read off the
// 2026-09-10 sell was that same arithmetic, not a wider sell leg.
const EX_ANTE = {
  on: "2026-09-15",
  plan: "plus",
  holdingYears: 3,
  monthlyEur: 2.99,
  custodyAbove: 250000,
  custodyRate: 0.001,
  apple: {
    isin: "US0378331005",
    name: "Apple",
    exchange: "NASDAQ - ALL MARKETS",
    amountEur: 500,
    growth: 0.1025,
    rateEurPerUsd: 0.8667,
    buy: { commission: 0.99, fx: 1.25, fxPct: 0.0025, ftt: null, spread: 0.15, total: 2.39 },
    sell: { commission: 0.99, fx: 1.68, spread: 0.2, total: 2.87 },
  },
  airLiquide: {
    isin: "FR0000120073",
    name: "Air Liquide",
    exchange: "EURONEXT - EURONEXT PARIS",
    amountEur: 500,
    growth: 0.071,
    buy: { commission: 1.99, fx: null, ftt: 2.0, fttPct: 0.004, spread: 0.15, total: 4.14 },
    sell: { commission: 1.99, fx: null, spread: 0.18, total: 2.17 },
  },
  telefonica: {
    isin: "ES0178430E18",
    name: "Telefonica",
    exchange: "BOLSA DE MADRID",
    amountEur: 515.34,
    growth: 0.071,
    buy: { commission: 1.99, fx: null, ftt: 1.03, fttPct: 0.002, spread: 0.15, total: 3.17 },
    sell: { commission: 1.99, fx: null, spread: 0.19, total: 2.18 },
  },
};

// Four order-review screens read on 2026-09-15 without placing anything. The
// review is where the markup stops being a disclosure and becomes a rate: the
// "Costs" block names one line, the commission, and the conversion is folded
// into the EUR/USD printed beside it.
//
// Reading both sides of the same line a moment apart makes the measurement
// self-contained, with no outside reference to drift against. A buy hands over
// euro for dollars and a sell does the reverse, so BUX must quote under the
// market one way and over it the other; the geometric mean of the two is the
// market and half the gap is the margin. Apple at 16:02 came back 1,151 87 to
// buy and 1,157 7 to sell, a mid of 1,154 781 and 0,2527 % on each side —
// symmetric to the fourth decimal, and the card's 0,25 %.
//
// That also disposes of the 0,28 % this file measured an hour earlier off a
// single sell ticket against the ex-ante's own printed rate: that reference,
// 1,153 802 at 15:40, sat 0,085 % under the mid measured at 16:02, so the
// excess was the clock and not a wider leg.
const PREVIEW = {
  on: "2026-09-15",
  plan: "plus",
  apple: {
    at: "16:02",
    buy: { priceUsd: 330.38, shares: 1.74325, rate: 1.15187, commission: 0.99, orderValueEur: 500.99 },
    sell: { priceUsd: 330.2, shares: 1.743265, rate: 1.1577, commission: 0.99, orderValueEur: 496.22525 },
  },
  telefonica: {
    buyAt: "16:00",
    sellAt: "16:01",
    shares: 140,
    // The buy ticket names the tax; the sell ticket has no such line, and its
    // total is the notional less the commission exactly. Buy-side only, which
    // is how `roundTrip` already charges it.
    buy: { price: 3.685, commission: 1.99, ftt: 1.06, orderValueEur: 518.95 },
    sell: { price: 3.684, commission: 1.99, orderValueEur: 513.77 },
  },
};

// The mid the two Apple tickets bracket, and the margin on each side of it.
const PREVIEW_MID = Math.sqrt(PREVIEW.apple.buy.rate * PREVIEW.apple.sell.rate);
const PREVIEW_FX_PCT = PREVIEW_MID / PREVIEW.apple.buy.rate - 1;

// What the live ticket charged as Spanish tax, against its own displayed
// notional. A touch over the ex-ante's 0,20 % — the screen warns the tax is
// indicative on a market order whose fill is not known yet — so the rate stays
// 0,20 % and this is the reading beside it.
const PREVIEW_FTT_PCT = PREVIEW.telefonica.buy.ftt / (PREVIEW.telefonica.shares * PREVIEW.telefonica.buy.price);

// Spain, read off BUX's own ex-ante rather than taken from the root map. The
// map sweeps Trading212 and comes back with a zero on every Spanish line; BUX
// charges 1,03 € on 515,34 € of Telefonica. Both can be true — collecting the
// tax or leaving the buyer to declare it is the intermediary's choice — and
// what this file owes its reader is what BUX does. Same shape as bunq, which
// found the map's Italian zero the same way.
const OWN_FTT = {
  ES: { name: "SPANISH_FTT", rate: 0.002 },
};

const DEFAULT_PLAN = "basic";

const PLANS = {
  basic: {
    id: "basic",
    label: "Basic",
    eu: 3.99,
    us: 0.99,
    etf: 0.99,
    fx: 0.0075,
    monthly: 0,
    custody: 0.002,
    custodyAbove: 0,
    zeroOrders: 0,
  },
  plus: {
    id: "plus",
    label: "Plus",
    eu: 1.99,
    us: 0.99,
    etf: 0.99,
    fx: 0.0025,
    monthly: 2.99,
    custody: 0.001,
    custodyAbove: 250000,
    zeroOrders: 3,
  },
  prime: {
    id: "prime",
    label: "Prime",
    eu: 0.99,
    us: 0.99,
    etf: 0.99,
    fx: 0.002,
    monthly: 7.99,
    custody: 0.001,
    custodyAbove: 500000,
    zeroOrders: 5,
  },
};

const PLAN_ALIAS = {
  basic: "basic",
  plus: "plus",
  prime: "prime",
  free: "basic",
  default: "basic",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function planOf(name) {
  const id = PLAN_ALIAS[loose(name || DEFAULT_PLAN).toLowerCase()] || PLAN_ALIAS[loose(name)];
  return PLANS[id] || PLANS[DEFAULT_PLAN];
}

// The map's rates, plus the one BUX bills where the map measured a zero. If the
// sweep ever does return a Spanish rate, that one wins and nothing is doubled.
export function taxesFor(isin) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  const cc = String(isin || "").slice(0, 2).toUpperCase();
  const own = OWN_FTT[cc];
  const already = own && Object.keys(mapped).some((k) => /SPANISH/i.test(k));
  const added = own && !already ? { [own.name]: own.rate } : {};
  return { tax, rates: { ...mapped, ...added }, added: Object.keys(added), country: cc };
}

export function ticketOf(plan, market) {
  const p = typeof plan === "string" ? planOf(plan) : plan;
  if (market === "etf") return p.etf;
  if (market === "us") return p.us;
  return p.eu;
}

// Which of the three tickets a line falls under. This says nothing about the
// conversion: a fund is billed 0,99 € wherever it trades, and whether BUX also
// charges its markup is decided by the settlement currency below. Today every
// fund in the catalogue is in euro, so the two questions have the same answer —
// the day one is listed in dollars they will not.
export function feeMarketOf(row, mic) {
  const type = String(row?.type || "").toUpperCase();
  if (type === "ETF" || type === "ETC" || type === "ETN") return "etf";
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (US_MICS.has(m) || /^(NASDAQ|NYSE|AMEX|ARCA|BATS|CBOE)$/.test(code)) return "us";
  return "eu";
}

// Only what the round trip does not already carry. The ticket is in
// `commission` and saying it again here read as a second charge.
function remarkOf({ plan } = {}) {
  const lines = [];
  if (plan.monthly) lines.push(`${plan.monthly} €/month.`);
  if (plan.custodyAbove) {
    lines.push(`Custody ${(plan.custody * 100).toFixed(2)}%/year above €${plan.custodyAbove / 1000}k.`);
  } else if (plan.custody) {
    lines.push(`Custody ${(plan.custody * 100).toFixed(2)}%/year.`);
  }
  return lines.join("\n");
}

function bookFor({ isin, mic, currency, unsourced }) {
  const named = spreadLeaf(spreads, { isin, mic, currency, unsourced });
  if (named.leaf) return named;

  const id = String(isin || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  if (!id || ccy !== "EUR") return named;

  // The tightest of the list, not the first. Equiduct quotes the best bid and
  // offer across the books it aggregates, so every one of them is a ceiling on
  // what BUX crosses and the tightest is simply the ceiling that says the least
  // that is not known. Taking the first was arbitrary: it put Xetra in front of
  // every line, and on a Spanish blue chip Xetra is a thin secondary listing —
  // Telefonica reads 16.58 bp there against 2.78 on four other tapes, and BUX's
  // own buy and sell tickets a minute apart on 2026-09-15 were one tick, 2.71.
  let best = null;
  let fallback = null;
  for (const m of EU_PROXY_MICS) {
    const leaf = spreads[id]?.[m]?.[ccy];
    if (!leaf) continue;
    if (leaf.bp != null) {
      if (!best || leaf.bp < best.leaf.bp) best = { leaf, mic: m, proxy: true };
    } else if (leaf.perShare != null && !fallback) {
      fallback = { leaf, mic: m, proxy: true };
    }
  }
  return best || fallback || named;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (!m.row.exchange) return false;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = bookFor({
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r, book.mic ?? venue?.mic);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function roundTrip({ etf, place, currency, shares, price, amount, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
    plan: picked.id,
    residency: RESIDENCY,
    transfer: TRANSFER,
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue BUX n'existe pas encore : lancer `node bux/bux_scraping.mjs`" };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BUX` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BUX`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = bookFor({
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
    // A borrowed book does not move the line: the venue stays the one the app
    // names, and where the spread was read is said separately.
    mic: (book.proxy ? m.venue?.mic : book.mic ?? m.venue?.mic) ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const each = ticketOf(picked, market);
  const converted = listing.currency !== "EUR";
  const { tax: taxRow, rates, added } = taxesFor(listing.isin);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    bp: marketBp,
    perShare: marketPerShare,
    bookMic: book.mic ?? null,
    bookProxy: Boolean(book.proxy),
    url: leaf?.url ?? SCHEDULE.source,
    tax: taxRow,
    fx: fxNote(listing.currency),
    fxIfConverted: converted ? picked.fx : 0,
    remark: remarkOf({ plan: picked }),
    commission: { each, roundTrip: each * 2, currency: "EUR", eachWay: true, plan: picked.id },
    basis: `barème BUX ${picked.label}, palier ${market}, lu le ${SCHEDULE.readOn}`,
  };
  const said = (why) => ({
    ...shared,
    why,
    confidence: confidenceOf({ picked, market, each, converted, marketBp, marketPerShare, rates, taxPct, added, listing, leaf, book }),
  });

  // A ticket is a ticket whether or not a book was ever taped, but a total that
  // silently drops the spread would read as a cheaper broker, so the size has to
  // resolve before anything is added up.
  const n = Number(shares) > 0 ? Number(shares) : null;
  const p = Number(price) > 0 ? Number(price) : null;
  const typed = Number(amount) > 0 ? Number(amount) : null;
  const notional = typed ?? (n && p ? n * p : null);
  if (notional == null) {
    return said(n && !p ? "aucun prix pour cette ligne : lancer node prices.mjs" : "aucun montant ni nombre de parts");
  }
  const units = n ?? (typed && p ? typed / p : null);

  const notionalUsd = dollars(notional, listing.currency);
  // The book is already a round trip — a spread crossed on the way in and again
  // on the way out — so it is counted once and not per side.
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null && units != null
        ? marketPerShare * units
        : null;

  const ticketEachUsd = dollars(each, "EUR");
  const ticketUsd = ticketEachUsd == null ? null : ticketEachUsd * 2;
  const fxUsd = converted && notionalUsd != null ? 2 * notionalUsd * picked.fx : 0;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;

  const usd = plus(bookUsd, ticketUsd, fxUsd, taxUsd);
  // What BUX keeps. The ticket is its price and the markup is its margin on the
  // conversion; the spread belongs to whoever quoted it and the tax to a
  // treasury, so neither is counted here.
  const brokerFees = plus(ticketUsd, fxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    // Saying "no book" when the book is there and the share count is not would
    // send the reader hunting for a tape that exists.
    ...(bookUsd == null
      ? {
          why:
            marketPerShare != null && units == null
              ? `carnet ${listing.exchange || "cette place"} coté par part : il faut un prix pour convertir un montant en nombre de parts`
              : `aucun carnet pour ${listing.exchange || "cette place"} : ${m.unsourced?.why || "pas de feuille dans spread.json"}`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    buy: {
      commission: finite(ticketEachUsd, 6),
      native: { charged: each, currency: "EUR" },
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(ticketEachUsd, 6),
      native: { charged: each, currency: "EUR" },
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(ticketUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: confidenceOf({ picked, market, each, converted, marketBp, marketPerShare, rates, taxPct, added, listing, leaf, book }),
  };
}

function confidenceOf({ picked, market, each, converted, marketBp, marketPerShare, rates, taxPct, added, listing, leaf, book }) {
  const lines = [];
  const tier = market === "us" ? "action américaine" : market === "etf" ? "fonds" : "action européenne";

  lines.push(
    `Ticket ${each} € par jambe (${tier}, ordre au marché), barème ${picked.label} lu le ${SCHEDULE.readOn}. ` +
      `C'est un forfait et non un pourcentage, donc il pèse tout sur un petit ordre et presque rien sur un gros.`
  );

  if (converted) {
    lines.push(
      `Change ${(picked.fx * 100).toFixed(2)} % à l'achat et autant à la vente, la ligne se réglant en ` +
        `${listing.currency} sur un compte en euro. Le taux dépend de la formule et non de la devise : ` +
        `0,75 % en Basic, 0,25 % en Plus, 0,20 % en Prime.`
    );
    lines.push(
      `Aller-retour réel le ${CHECK.on} en ${CHECK.plan} sur ${CHECK.ticker} : tickets ${CHECK.commissionPaid} €, ` +
        `caisse ${CHECK.cash.start} → ${CHECK.cash.end} €. Le change n'y a jamais été débité à part, et les ` +
        `${CHECK.exAnte.buyFx} € puis ${CHECK.exAnte.sellFx} € que ce fichier lui prêtait venaient de l'ex-ante de ` +
        `ce jour-là, pas de la caisse. Les ${(100 * CHECK.exAnte.sellFxPct).toFixed(2)} % de la jambe de vente, qui ` +
        `faisaient douter d'un second taux, sont un artefact : chaque rapport fait grandir la ligne ` +
        `${EX_ANTE.holdingYears} ans au rendement qu'il suppose puis applique le même taux au plus gros nombre. ` +
        `Apple le montre en clair — ${EX_ANTE.apple.buy.fx} € sur ${EX_ANTE.apple.amountEur} € à l'achat, ` +
        `${EX_ANTE.apple.sell.fx} € à la vente, soit ${(100 * EX_ANTE.apple.buy.fxPct).toFixed(2)} % des deux côtés ` +
        `à ${(100 * EX_ANTE.apple.growth).toFixed(2)} % l'an — et les écarts grandissent pareil.`
    );
    lines.push(
      `Le taux est mesuré et non plus seulement lu : les deux écrans de revue d'Apple du ${PREVIEW.on} à ` +
        `${PREVIEW.apple.at}, sans ordre passé, cotent ${PREVIEW.apple.buy.rate} à l'achat et ` +
        `${PREVIEW.apple.sell.rate} à la vente. L'un convertit des euros en dollars et l'autre l'inverse, donc le ` +
        `milieu ${PREVIEW_MID.toFixed(6)} est le marché et la marge est ${(100 * PREVIEW_FX_PCT).toFixed(4)} % de ` +
        `chaque côté, symétrique et conforme au barème. La mesure ne s'appuie sur aucune référence extérieure, donc ` +
        `aucune dérive de cours ne la biaise.`
    );
    lines.push(
      `Cette marge est invisible à l'écran : la rubrique « Costs » du ticket ne nomme que la commission, ` +
        `${PREVIEW.apple.buy.commission} € sur une ligne américaine, et le change est replié dans le taux affiché à ` +
        `côté. Il pèse pourtant davantage — ` +
        `${(2 * picked.fx * PREVIEW.apple.buy.orderValueEur).toFixed(2)} € d'aller-retour sur ` +
        `${Math.round(PREVIEW.apple.buy.orderValueEur)} €, contre ${(2 * picked.us).toFixed(2)} € de commissions.`
    );
    lines.push(
      `SEC et TAF ne sont chiffrés nulle part : ni sur la carte, ni sur aucun des trois ex-ante du ${EX_ANTE.on}, ` +
        `dont celui d'Apple dont les quatre lignes font le total au centime. ` +
        `Ils ne sont pas comptés ici, ce qui manque ${(US_REGULATORS.secRate * 100).toFixed(5)} % du produit de la ` +
        `vente plus ${US_REGULATORS.tafPerShare} $ par part — sur l'aller-retour mesuré, un cinquième de centime, ` +
        `trop peu pour que la caisse le montre.`
    );
  } else {
    lines.push(`Ligne en euro comme le compte : aucune conversion, donc aucune marge de change.`);
  }

  if (added?.length) {
    const t = EX_ANTE.telefonica;
    lines.push(
      `Taxe espagnole ${(100 * OWN_FTT.ES.rate).toFixed(1)} % à l'achat, lue chez BUX et non dans la carte racine, ` +
        `qui était jusqu'ici la réserve principale de ce fichier : l'ex-ante de ${t.name} du ${EX_ANTE.on} facture ` +
        `${t.buy.ftt} € sur ${t.amountEur} € à la Bourse de Madrid, quand le balayage Trading212 rend zéro sur ` +
        `toutes les espagnoles. Les deux peuvent dire vrai, un intermédiaire pouvant collecter la taxe ou laisser ` +
        `l'acheteur la déclarer, et ce qui compte ici est ce que BUX prélève. Même geste que chez bunq, qui a trouvé ` +
        `le zéro italien de la carte en défaut de la même façon.`
    );
    lines.push(
      `Le ticket d'achat le confirme à l'écran le ${PREVIEW.on} : ${PREVIEW.telefonica.shares} parts à ` +
        `${PREVIEW.telefonica.buy.price} €, « Est. financial transaction tax » ${PREVIEW.telefonica.buy.ftt} €, et le ` +
        `total ${PREVIEW.telefonica.buy.orderValueEur} € tombe juste. Cela fait ` +
        `${(100 * PREVIEW_FTT_PCT).toFixed(3)} %, un cheveu au-dessus des 0,2 % de l'ex-ante, l'écran prévenant que ` +
        `la taxe est estimée tant que le prix d'exécution n'est pas connu ; le taux retenu reste celui du barème. ` +
        `Le ticket de vente de la même minute n'a aucune ligne de taxe et son total est le notionnel moins la seule ` +
        `commission, donc la taxe ne frappe que l'achat — ce que ce fichier comptait déjà ainsi.`
    );
  } else if (taxPct > 0) {
    const named = Object.entries(rates).map(([k, v]) => `${k} ${(100 * v).toFixed(3)} %`).join(", ");
    const fr = listing.isin.startsWith("FR")
      ? ` L'ex-ante d'${EX_ANTE.airLiquide.name} du ${EX_ANTE.on} facture ${EX_ANTE.airLiquide.buy.ftt} € sur ` +
        `${EX_ANTE.airLiquide.amountEur} €, soit les ${(100 * EX_ANTE.airLiquide.buy.fttPct).toFixed(1)} % de la carte : ` +
        `BUX et la carte concordent sur la France.`
      : "";
    lines.push(`Taxe à l'achat depuis la carte racine : ${named}.${fr}`);
  } else {
    lines.push(`Aucune taxe de transaction sur cette ligne dans la carte racine.`);
  }

  if (!leaf) {
    lines.push(
      `Pas de feuille de carnet pour cet ISIN, ni sur la place affichée ni sur les carnets de repli : le total est ` +
        `N/A, un carnet manquant ne devant pas passer pour une place gratuite.`
    );
  } else if (marketBp == null) {
    lines.push(`Carnet ${listing.exchange || "?"} à ${marketPerShare} $ par part, écart effectif de la bande américaine 605, compté une fois pour l'aller-retour.`);
  } else if (book?.proxy) {
    lines.push(
      `Carnet emprunté à ${book.mic} et non à la place affichée, ${marketBp} points de base : BUX n'exécute de toute ` +
        `façon pas là où son application cote, mais chez Equiduct sur sa propre adhésion, ou chez Cboe Europe via ABN ` +
        `AMRO Clearing, et les fractions chez un internalisateur — aucun des quatre ne publie de bande ici. Equiduct ` +
        `cote le meilleur prix pondéré des carnets qu'il agrège, dont celui-ci, donc l'écart retenu est un plafond et ` +
        `non une estimation de la place. C'est le plus serré des carnets disponibles et non le premier d'une liste : ` +
        `tous sont des plafonds, celui-là est le moins bavard.` +
        (listing.isin.startsWith("ES")
          ? ` Aucune bande de Madrid n'est collectée ici, donc la doublure d'une espagnole reste une cotation ` +
            `étrangère. Sur Telefonica ce choix est éprouvé : les tickets d'achat et de vente de BUX du ` +
            `${PREVIEW.on} écartent d'un seul pas, ${PREVIEW.telefonica.buy.price} contre ` +
            `${PREVIEW.telefonica.sell.price} €, soit ` +
            `${(1e4 * (PREVIEW.telefonica.buy.price - PREVIEW.telefonica.sell.price) / ((PREVIEW.telefonica.buy.price + PREVIEW.telefonica.sell.price) / 2)).toFixed(2)} ` +
            `points de base, quand Xetra en affichait 16,58 et quatre autres bandes 2,78.`
          : "")
    );
  } else {
    lines.push(
      `Carnet ${listing.exchange || "?"}${listing.mic ? ` (${listing.mic})` : ""} à ${marketBp} points de base, compté ` +
        `une fois pour l'aller-retour. La place est celle que l'application affiche : l'ordre part chez Equiduct ou ` +
        `Cboe Europe, qui cotent au moins aussi serré.`
    );
  }

  lines.push(
      `Ni Zero Order ni Investment Plan ne sont cet aller-retour : le premier ne coûte rien mais s'exécute en fin de ` +
      `journée et ` +
      (picked.zeroOrders ? `n'est donné que ${picked.zeroOrders} fois par mois en ${picked.label}` : `n'existe pas en ${picked.label}`) +
      `, le second n'achetant gratuitement que la moitié du trajet.`
  );

  lines.push(
    `Hors aller-retour : ` +
      (picked.monthly ? `${picked.monthly} €/mois, ` : `aucun abonnement, `) +
      (picked.custodyAbove
        ? `garde ${(picked.custody * 100).toFixed(2)} %/an au-delà de ${(picked.custodyAbove / 1000).toFixed(0)}k €`
        : `garde ${(picked.custody * 100).toFixed(2)} %/an dès le premier euro`) +
      `, dépôts et retraits gratuits. BUX ne sert que ${RESIDENCY.length} pays (${RESIDENCY.join(", ")}) et ` +
      `aucune personne américaine.`
  );

  return lines.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          defaultPlan: DEFAULT_PLAN,
          residency: RESIDENCY,
          transfer: TRANSFER,
          notModelled: US_REGULATORS,
          ownFtt: OWN_FTT,
          exAnte: EX_ANTE,
          preview: { ...PREVIEW, mid: Number(PREVIEW_MID.toFixed(6)), fxPct: Number(PREVIEW_FX_PCT.toFixed(6)), fttPct: Number(PREVIEW_FTT_PCT.toFixed(5)) },
          plans: PLANS,
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
      "usage : node bux_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=e] [--plan=basic|plus|prime] [--json]\n" +
        "        node bux_cost.mjs --schedule\n" +
        "  ex.   node bux_cost.mjs CAC --shares=10 --price=24\n" +
        "        node bux_cost.mjs AAPL NASDAQ USD --plan=plus --shares=10 --price=230\n" +
        "        node bux_cost.mjs TEF BME EUR --amount=1000 --plan=prime"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\nce que BUX propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}  [${picked.label}]\n`
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
