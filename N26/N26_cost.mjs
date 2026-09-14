// What one round trip costs at N26: buy n shares at price p, sell them back at
// once, in dollars. A coin is bought by the dollar instead, and answers to
// `amount`.
//
// The affine triple this file used to answer was not wrong in its shape — a flat
// ticket and a proportional book is exactly a × p × n + c — and that is what made
// the real mistake easy to miss. The number was wrong because the venue was wrong.
//
// N26 Bank SE takes the order and Upvest Securities GmbH executes it, and Upvest
// publishes the list of places it can execute at. There are four, and it says so
// in as many words: euro shares and euro ETPs at Tradegate or Quotrix, sterling
// shares and sterling ETPs at J.P. Morgan. No Xetra, no Nasdaq, no Sydney, no
// Manila. The old file read the spread at whichever venue `N26_scraping.mjs` had
// guessed from `stocks.csv` — and that guess is not a reading of anything N26
// prints, it is a csv pick, with the currency invented from it by a lookup table
// that turns NASDAQ into USD and LSE into GBP. So the book it charged was often
// Xetra's, and on the 2 366 catalogue lines quoted at both, Tradegate's spread is
// 2,20 fois Xetra's — 41,1 bp against 16,2 at the median. The old answer
// understated the part of the bill that is much the largest one here, by more
// than half, on every line it read in Frankfurt.
//
// So the ISIN is trusted and the rest of the row is not. Execution is Tradegate
// where Tradegate trades the line and Quotrix where it does not — Upvest's policy
// names both without ranking them, and two readings rank them. The fine print
// under every order preview names one of them only: « to forward the order to
// Upvest Securities GmbH for execution at Tradegate Exchange as available ». And
// « as available » turns out to be load-bearing: Tradegate's own order book page
// says of Keller Group « wird nicht an der Tradegate BSX gehandelt », while the
// app prices it at 35,80 € and offers to buy it. The second venue is real and is
// reached.
//
// Reading Tradegate first is what made the sweep worth redoing. `spread.mjs` only
// ever asked Tradegate about the 1 022 lines whose catalogue venue already said
// Tradegate — and that venue is the guess. Handing the same sweep the list of
// ISINs instead of the list of venues took Tradegate from 4 090 lines to 4 661 of
// 5 142, so 571 lines that would have been priced at Quotrix's much wider book
// are now priced where the order will actually go. 251 lines have neither and
// answer N/A, which is honest twice over: there is no book to price them against,
// and a fair number are not N26 listings at all but photo-matching accidents, an
// Emirati insurer filed under ADX and priced in euros being the clearest.
//
// Barème relu le 2026-09-14.
//
//   Actions / ETF / ETC     0,90 € par ordre, achat comme vente, depuis le
//                           2026-09-02 — le trading était gratuit depuis
//                           janvier 2025, et la gratuité s'est arrêtée en même
//                           temps que le PFOF a été interdit
//   Plans d'épargne         0            (pas ce trajet)
//   Garde                   0
//   Go / Metal              9,90 € / 16,90 € par mois, 3 / 10 ordres gratuits
//                           par mois. Standard et Smart n'ont aucun quota.
//   Crypto                  1,5 % Bitcoin, 2,5 % les autres, 3,5 % sur des
//                           « low-liquidity coins » dont la liste n'est pas
//                           publiée. Metal : 1 % / 2 % jusqu'à 5 000 € par mois
//                           civil, puis le tarif normal.
//   Crypto, minimum         1 € par ordre, et l'ordre commence à 1 €
//
// Four things the old file did not carry.
//
// The first is the venue, said above, and it is the whole reason to touch this
// file.
//
// The second is the crypto book. The old file charged the published percentage
// and nothing else, on the ground that crypto « has no tape ». But N26 says
// plainly that the prices shown in the app are Bitpanda's and not its own, and
// that they « may include spreads ». A percentage charged on top of a marked-up
// price is not the whole bill, and the markup is now measured rather than
// feared. Two order previews of 100 €, minutes apart on 2026-09-14:
//
//   BTC  14:39   0,00145491 coin   fee 1,49 €   coin at 67 709 €, market 67 517
//   ETH  14:47   0,04467472 coin   fee 2,49 €   coin at  2 182,67 €, market 2 175,70
//
// So 0,28 % above the market on bitcoin and 0,32 % on ether, charged on top of
// the fee the app prints. That is a fifth of the printed fee, not the second
// fee of equal size I had warned about, and it is now in the total instead of
// in a warning. It also runs the way it should — the thinner coin costs more —
// which is why a coin with no ticket of its own is charged the wider of the two
// readings and told that it is a floor.
//
// The same tickets settle how the fee is taken, which no page says. The 100 € is
// what leaves the account, fee included: the rate shown, 68 733 € and 2 238,40 €,
// is the euros spent divided by the coins received, to a thousandth of a percent
// on both. It is the all-in rate and not a quote. Read the other way — fee added
// on top of a 100 € purchase — the markup would come out at 1,80 % and 2,88 %,
// several times what Bitpanda takes, which is how that reading is known to be
// the wrong one. Both fees also landed one cent under the published rate, 1,49
// for 1,50 and 2,49 for 2,50, printed as « 1,4 % » and « 2,4 % »: too small to
// build a rule on, so the published rate stands and the observation is carried
// in `confidence` rather than in the arithmetic.
//
// The third is that the crypto fee is rounded up to the next whole cent on each
// order — N26 says so, and says the rounding is at most a cent.
//
// The fourth is the euro minimum of 1 € per crypto order, which the old file
// computed correctly and then put in a `floor` field the page had no column for.
// Same disease as everywhere else: the floor is the entire bill at small size.
//
// What is charged and is in the number: the ticket each way; the Tradegate or
// Quotrix spread, once, the book being already a round trip; stamp duty and
// financial transaction taxes from `taxMap.mjs`, on the purchase only; and for a
// coin, the percentage each way, compounded, floored at a euro and rounded up to
// the cent.
//
// What is not in the number: the free trades of Go and Metal, which are a monthly
// allowance and cannot be attributed to one trade; the product costs of an ETF,
// which are a charge on holding; and the conversion. N26 publishes no foreign
// exchange fee for investing, and there is none to publish — a dollar-denominated
// share is bought in euros at Tradegate, so the conversion happens inside the
// market maker's quote and is already counted, once, in the spread that is
// charged here. That is worth stating rather than leaving as a suspicious zero.
//
// Residency is not decided here: `accepted.mjs` holds the eighteen countries N26
// serves stocks in, and the page filters on it.
//
// App only, not the web app. Hours 08:00–21:00 CET, Monday to Friday; an order
// left outside them waits. No live trip in this deposit.
//
//   https://n26.com/en-eu/stocks-and-etfs
//   https://support.n26.com/en-eu/app-and-features/savings-and-invest/how-stocks-and-etfs-work-at-n26
//   https://n26.com/en-eu/crypto
//   https://eu-assets.contentstack.com/v3/assets/blt4a5ee0113ab335fb/bltc1b2304cb5f11b46/6a4775fe310892726ee90bc1/upvest_best_execution_policy.pdf
//
//   node N26/N26_cost.mjs EUNL --shares=10 --price=100
//   node N26/N26_cost.mjs BTC --amount=1000
//   node N26/N26_cost.mjs BTC --amount=1000 --plan=metal
//   node N26/N26_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("n26-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  stocks: "https://n26.com/en-eu/stocks-and-etfs",
  stocksHelp: "https://support.n26.com/en-eu/app-and-features/savings-and-invest/how-stocks-and-etfs-work-at-n26",
  crypto: "https://n26.com/en-eu/crypto",
  execution:
    "https://eu-assets.contentstack.com/v3/assets/blt4a5ee0113ab335fb/bltc1b2304cb5f11b46/6a4775fe310892726ee90bc1/upvest_best_execution_policy.pdf",
  readOn: "2026-09-14",
  equityFeeFrom: "2026-09-02",
  entity: "N26 Bank SE (DE) transmet, Upvest Securities GmbH exécute et conserve ; crypto par Bitpanda Asset Management",
};

const TICKET_EUR = 0.9;
const CRYPTO_MIN_EUR = 1;
const CRYPTO_ROUNDING_EUR = 0.01;
const METAL_CRYPTO_CAP_EUR = 5000;
const CRYPTO_DAILY_LIMIT_EUR = 50000;

// Upvest's policy lists Tradegate and Quotrix for euro instruments without
// saying which comes first, and three readings together settle the order.
//
// The app's fine print, under every preview: « to forward the order to Upvest
// Securities GmbH for execution at Tradegate Exchange as available ». Tradegate
// is therefore named and the others are not, which makes it first.
//
// And « as available » is not a formality. Tradegate's own order book page
// answers, for Keller Group, « wird nicht an der Tradegate BSX gehandelt » —
// it does not trade the line — while the N26 app prices it at 35,80 € and offers
// to buy it. So the second venue exists and is reached, and it is Quotrix.
//
// Sterling goes to a bank rather than to an exchange and has no book to read.
const VENUES = {
  eur: [
    { mic: "XGAT", name: "Tradegate", ccy: "EUR" },
    { mic: "XQTX", name: "Quotrix", ccy: "EUR", fallback: true },
  ],
  gbp: { name: "J.P. Morgan", ccy: "GBP", offExchange: true },
};

// Four order previews taken in the app on 2026-09-14 at 100 € each, nothing
// confirmed. Every one of them printed the same single line of cost:
//
//   EUNL   iShares Core MSCI World   ≈ 0,79 part à 126,10 €   frais 0,90 €
//   FMC1   Ford Motor                ≈ 8,29 parts à 12,06 €   frais 0,90 €
//   01K    Keller Group              ≈ 2,79 parts à 35,80 €   frais 0,90 €
//   B26A   iShares iBonds Dec 2026   ≈ 17,9 parts à 5,59 €    frais 0,90 €
//
// They settle four things. The ticket is 0,90 € flat and identical on a European
// ETF, an American share and a British one, so nothing is tiered and nothing is
// waived. It is charged on top of the amount rather than taken out of it: Ford's
// 8,29 parts at 12,06 € is 100,00 € of stock and not 99,10 €. Ford is quoted in
// euros under its German line FMC1 — there is no dollar anywhere on the ticket
// and no conversion line, which is what this file said and what explains N26
// publishing no investing FX fee. And the size is fractional, from a euro up.
//
// The cost disclosure document behind the B26A preview says the rest. Upvest's
// « Informations sur les coûts ex ante » of 14.09.2026 14:25, on 17,90 units at
// 5,59 € for 100,00 €, over its assumed three-year horizon:
//
//   Coûts des services            1,80 €   dont transactions 1,80, uniques 0,00
//   Coûts des produits            0,39 €   dont permanents 0,36, transactions 0,03
//   Avantages de tiers            0,00 €   partenaire comme Upvest
//   Taux de change                  —
//
// The 1,80 € is two tickets, so the document prices the round trip and not the
// purchase, and it agrees with this file to the cent. The zero on inducements is
// the payment-for-order-flow ban of 1 July 2026 showing up as a number, and it
// is the reason the free trading of the previous eighteen months ended. The dash
// on the exchange rate confirms the euro settlement a second time.
//
// Two things the document does not contain, and they matter in opposite ways.
//
// It carries no implicit cost: the spread at Tradegate appears nowhere in it.
// Upvest discloses what it charges, and the difference between bid and offer is
// not something it charges. So the book added here is not a double count of the
// 1,80 € — it is the part of the bill Upvest's own disclosure leaves out, and on
// this very line it is about a tenth of a cent, while on an illiquid German
// share it is several euros.
//
// And it carries no tax, because an Irish ETF owes none. The note is explicit
// that service costs « comprennent […] les droits de timbre, les taxes sur les
// transactions financières et les frais de change », so a tax would have shown up
// inside that 1,80 €. Two further documents, same day, same 100 €, say which
// taxes do and which do not:
//
//   Keller Group   GB0004866223   14:30   services 1,80 €   = 2 × 0,90
//   LVMH           FR0000121014   14:35   services 2,20 €   = 2 × 0,90 + 0,40
//
// British stamp duty is not passed through. Half a percent on Keller would have
// been 0,50 € and the form shows two tickets and nothing else: the order settles
// through Clearstream and not CREST, and CREST is where the duty is collected.
// So it is dropped from the total by name.
//
// The French transaction tax is passed through, at 0,40 % — 0,40 € on 100 € — and
// the form even says on which side. Its year-by-year table reads 1,30 € in year
// one and 0,90 € in year three: a ticket plus the tax when buying, a bare ticket
// when selling. That is `taxMap.mjs`'s rate to the cent and this file's rule to
// the side, confirmed rather than assumed.
const MEASURED = {
  on: "2026-09-14",
  how: "aperçus d'ordre dans l'application et document de coûts ex ante d'Upvest, à 100 €, rien de confirmé",
  ticketConfirmed: true,
  ticketAdditive: true,
  roundTripDisclosed: { serviceCosts: 1.8, ccy: "EUR", equals: "2 × 0,90 €" },
  inducements: 0,
  taxes: {
    stampDuty: { passedThrough: false, on: "Keller Group GB0004866223, services 1,80 €" },
    frenchFtt: { passedThrough: true, rate: 0.004, side: "achat", on: "LVMH FR0000121014, services 2,20 €" },
  },
  venue: "Tradegate quand il cote la ligne, Quotrix sinon",
  fallbackProven: "Keller Group : coté par l'app, refusé par Tradegate",
  foreignQuotedInEur: true,
  spreadNotDisclosed: true,
};

// The crypto readings in this deposit, and the only place a Bitpanda markup is
// written down at all. Kept as the raw tickets rather than as percentages, so
// that the arithmetic below can be checked against the screens it came from.
const BITPANDA_TICKETS = [
  {
    coin: "BTC",
    on: "2026-09-14 14:39 CEST",
    spendEur: 100,
    receivedCoins: 0.00145491,
    feeEur: 1.49,
    feeShown: "1,4 %",
    rateShownEur: 68732.58,
    market: { source: "Kraken XBTEUR, bougie d'une minute", low: 67496.8, high: 67537.6 },
  },
  {
    coin: "ETH",
    on: "2026-09-14 14:47 CEST",
    spendEur: 100,
    receivedCoins: 0.04467472,
    feeEur: 2.49,
    feeShown: "2,4 %",
    rateShownEur: 2238.4,
    market: { source: "Kraken ETHEUR, bougie d'une minute", low: 2175.51, high: 2175.88 },
  },
];

// The rate the app shows is the all-in one: the euros spent divided by the coins
// received give it back to a thousandth of a percent on both tickets. So
// Bitpanda's own price is what is left once the printed fee is set aside, and its
// markup is that price against the market in the same minute.
const BITPANDA = new Map(
  BITPANDA_TICKETS.map((t) => {
    const allIn = t.spendEur / t.receivedCoins;
    const price = (t.spendEur - t.feeEur) / t.receivedCoins;
    const mid = (t.market.low + t.market.high) / 2;
    return [t.coin, { ...t, allIn, price, mid, markup: price / mid - 1, allInVsMarket: allIn / mid - 1 }];
  })
);

// Bitcoin is marked up 0,28 % and ether 0,32 %. Thinner coin, wider markup, which
// is the expected direction and the reason a coin with no ticket of its own is
// charged the widest reading rather than the nearest one: that is a floor, and it
// is said to be one wherever it is used.
const BITPANDA_WIDEST = [...BITPANDA.values()].reduce((a, b) => (b.markup > a.markup ? b : a));

function markupOf(coin) {
  const seen = BITPANDA.get(String(coin || "").toUpperCase());
  return seen ? { markup: seen.markup, ticket: seen, measured: true } : { markup: BITPANDA_WIDEST.markup, ticket: BITPANDA_WIDEST, measured: false };
}

const DEFAULT_PLAN = "standard";

const PLANS = {
  standard: { id: "standard", label: "N26 Standard", monthly: 0, freeTrades: 0, crypto: { btc: 0.015, other: 0.025 } },
  smart: { id: "smart", label: "N26 Smart", monthly: 4.9, freeTrades: 0, crypto: { btc: 0.015, other: 0.025 } },
  go: { id: "go", label: "N26 Go", monthly: 9.9, freeTrades: 3, crypto: { btc: 0.015, other: 0.025 } },
  metal: { id: "metal", label: "N26 Metal", monthly: 16.9, freeTrades: 10, crypto: { btc: 0.01, other: 0.02 } },
};

const PLAN_ALIAS = { standard: "standard", std: "standard", free: "standard", smart: "smart", go: "go", metal: "metal" };

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const isBtc = (row) =>
  /^(BTC|XBT|BITCOIN)$/i.test(String(row?.ticker || "")) || /^bitcoin$/i.test(String(row?.name || ""));

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

const pct = (x, digits = 2) => (100 * x).toFixed(digits).replace(".", ",");
const euro = (x, digits = 2) => Number(x).toFixed(digits).replace(".", ",");

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

export function feeMarketOf(row) {
  if (isCrypto(row)) return isBtc(row) ? "btc" : "crypto";
  return "equity";
}

export function cryptoRate(plan, market) {
  const picked = typeof plan === "string" ? planOf(plan) : plan;
  if (!picked) return null;
  return market === "btc" ? picked.crypto.btc : picked.crypto.other;
}

/**
 * Where Upvest would send this ISIN. Tradegate first, Quotrix next, and nothing
 * at all if neither quotes it — which is a fact about the order and not a gap in
 * this repository's data, since those two are the whole euro list.
 */
export function executionOf(isin) {
  const id = String(isin || "").toUpperCase();
  for (const v of VENUES.eur) {
    const leaf = spreads[id]?.[v.mic]?.[v.ccy];
    if (leaf && (leaf.bp != null || leaf.perShare != null)) return { ...v, leaf };
  }
  return null;
}

// N26's fees never compound the way a percentage does, but a percentage charged
// on a coin does: the fee comes out of what is bought, and the sale is of what
// is left. So the round trip is 1 − (1 − r)² of the amount, not 2r.
const compounded = (rate) => 1 - (1 - rate) ** 2;

// « Die Gebühren werden immer zum nächsten vollen Cent aufgerundet. » Null in,
// null out: a fee that could not be computed is not a fee of zero.
function upToCent(euros) {
  if (euros == null || !Number.isFinite(Number(euros))) return null;
  return Math.ceil(Number(euros) / CRYPTO_ROUNDING_EUR) * CRYPTO_ROUNDING_EUR;
}

/** One side's crypto fee, in euros, floored and rounded as N26 charges it. */
export function cryptoFeeSide({ euros, market, plan = DEFAULT_PLAN }) {
  const rate = cryptoRate(plan, market);
  if (rate == null) return null;
  if (euros == null || !Number.isFinite(Number(euros))) return null;
  const raw = Number(euros) * rate;
  return { rate, raw, charged: upToCent(Math.max(CRYPTO_MIN_EUR, raw)), floored: raw < CRYPTO_MIN_EUR };
}

// The remark carries only what the number cannot: an allowance that belongs to a
// month rather than to a trade, and a product cost that belongs to holding the
// line rather than trading it.
function remarkOf({ market, listing }) {
  if (market === "btc" || market === "crypto") {
    return (
      `Metal 16.90 €/mo: 1% BTC / 2% other, up to ${METAL_CRYPTO_CAP_EUR} € a month.\n` +
      `No withdrawal to an external wallet.`
    );
  }
  const said = ["Go 9.90 €/mo: 3 trades with no broker fees.\nMetal 16.90 €/mo: 10 trades with no broker fees."];
  if (String(listing?.type || "").toUpperCase() !== "STOCK") said.push("ETF product costs (TER) apply on top.");
  return said.join("\n");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    return { named, matches: [{ row: crypto[0], ...listingKey(crypto[0]) }] };
  }

  // The row's own exchange and currency are the scraper's guesses, so they are
  // used to pick between duplicate rows and never to decide where the order goes.
  const equities = named.filter((r) => !isCrypto(r));
  const exactCode = wantPlace ? equities.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : equities;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches: matches.length ? matches : equities.map((r) => ({ row: r, ...listingKey(r) })) };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const slot = (out[type] ||= { n: 0, tradegate: 0, quotrix: 0, sansCarnet: 0 });
    slot.n += 1;
    if (isCrypto(r)) continue;
    const at = executionOf(r.isin);
    if (!at) slot.sansCarnet += 1;
    else if (at.fallback) slot.quotrix += 1;
    else slot.tradegate += 1;
  }
  return out;
}

function cryptoTrip({ row, plan, amount, answer }) {
  const market = feeMarketOf(row);
  const coin = String(row.ticker || row.query || "").toUpperCase();
  const listing = {
    isin: row.isin || null,
    ticker: row.ticker || null,
    name: row.name || null,
    type: "CRYPTO",
    mic: null,
    exchange: "N26 Crypto (Bitpanda)",
    // The cash is the N26 current account, so the currency is not a choice.
    currency: "EUR",
    brokerExchange: row.exchange || "CRYPTO",
  };

  // The reference book is no longer what is charged: the markup measured on the
  // app's own ticket is taken against a market mid, so it already contains the
  // half-spread a buyer crosses. The book is kept to be shown next to it, as the
  // width of the market Bitpanda is marking up.
  const book = spreadLeaf(spreads, { isin: `CRYPTO:${coin}`, mic: null, currency: "USD" });
  const marketBp = book.leaf?.bp ?? null;
  const mk = markupOf(coin);
  const markupBp = 1e4 * compounded(mk.markup);

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    plan: plan.id,
    cashCurrency: "EUR",
    bp: markupBp,
    url: book.leaf?.url ?? SCHEDULE.crypto,
    fx: fxNote("EUR"),
    remark: remarkOf({ market, listing }),
    commission: {
      rate: cryptoRate(plan, market),
      min: CRYPTO_MIN_EUR,
      currency: "EUR",
      eachWay: true,
      roundedUpTo: CRYPTO_ROUNDING_EUR,
      plan: plan.id,
    },
    basis:
      `barème N26 Crypto, ${plan.label}, lu le ${SCHEDULE.readOn} : ` +
      `${(100 * cryptoRate(plan, market)).toFixed(1).replace(".", ",")} % par sens, ` +
      `plancher ${CRYPTO_MIN_EUR} € par ordre, arrondi au cent supérieur, ` +
      `plus ${pct(markupOf(coin).markup)} % de majoration Bitpanda par sens, ` +
      `${markupOf(coin).measured ? `mesurée le ${markupOf(coin).ticket.on}` : `mesurée sur ${BITPANDA_WIDEST.coin}, faute d'aperçu pour ${coin}`}`,
  };

  const a = Number(amount);
  if (!(a > 0)) return { ...shared, why: "aucun montant pour cette crypto" };

  const euros = a / (usdPer("EUR") || NaN);
  if (!Number.isFinite(euros)) return { ...shared, why: "le montant n'a pas pu être converti en euros" };

  const buy = cryptoFeeSide({ euros, market, plan });
  // The sale is of what the purchase left, so it is charged on a smaller amount.
  const sell = cryptoFeeSide({ euros: euros * (1 - (buy?.rate ?? 0)), market, plan });
  const buyUsd = buy ? dollars(buy.charged, "EUR") : null;
  const sellUsd = sell ? dollars(sell.charged, "EUR") : null;

  // The fee comes out of what is spent, so the markup is paid on what is left of
  // it, and again on the way back out — the same compounding as the fee itself.
  const investedUsd = buyUsd == null ? null : a - buyUsd;
  const markupUsd = investedUsd == null ? null : investedUsd * compounded(mk.markup);
  const usd = plus(markupUsd, buyUsd, sellUsd);
  // La majoration de Bitpanda est dans le prix et non sur la facture : elle
  // reste du côté du marché, comme un écart de carnet.
  const brokerFees = plus(buyUsd, sellUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    trade: { amount: a, currency: "USD", euros: finite(euros, 6) },
    buy: { commission: finite(buyUsd, 6), native: buy ? { charged: buy.charged, raw: finite(buy.raw, 6), floored: buy.floored, currency: "EUR" } : null },
    sell: { commission: finite(sellUsd, 6), native: sell ? { charged: sell.charged, raw: finite(sell.raw, 6), floored: sell.floored, currency: "EUR" } : null },
    parts: { marché: finite(markupUsd, 6), commission: finite(plus(buyUsd, sellUsd), 6) },
    confidence: cryptoConfidence({ coin, plan, market, buy, marketBp, book, euros, mk }),
  };
}

function cryptoConfidence({ coin, plan, market, buy, marketBp, book, euros, mk }) {
  const rate = cryptoRate(plan, market);
  const said = [];
  said.push(
    `N26 Crypto par Bitpanda, ${plan.label}, lu le ${SCHEDULE.readOn} : ` +
      `${(100 * rate).toFixed(1).replace(".", ",")} % par sens, prélevés sur ce qui est dépensé, donc composés` +
      (mk.measured
        ? ` — l'aperçu du ${mk.ticket.on} a facturé ${euro(mk.ticket.feeEur)} € sur ${mk.ticket.spendEur} €, ` +
          `un centime de moins que le barème, et l'a affiché « ${mk.ticket.feeShown} » ; les deux aperçus lus ` +
          `sont l'un et l'autre à un centime sous le taux publié, que le fichier garde`
        : "")
  );
  if (buy?.floored) {
    said.push(
      `au plancher : le ticket de ${CRYPTO_MIN_EUR} € est toute la commission, ` +
        `le calcul au barème n'en donnerait que ${Number(buy.raw).toPrecision(3)} €`
    );
  }
  said.push(`arrondi au cent supérieur sur chaque ordre, ce que le modèle affine ne pouvait pas dire`);
  if (plan.id === "metal") {
    said.push(
      `remise Metal valable jusqu'à ${METAL_CRYPTO_CAP_EUR} € par mois civil, frais d'achat compris — ` +
        `au-delà le tarif redevient 1,5 % / 2,5 %, et ce fichier ne sait pas où en est le mois`
    );
  }
  const t = mk.ticket;
  said.push(
    `majoration Bitpanda de ${pct(mk.markup)} % par sens, comptée dans le total : N26 dit que les prix ` +
      `affichés sont ceux de Bitpanda et non les siens et qu'ils « peuvent contenir des spreads », et ` +
      `l'aperçu du ${t.on} le chiffre — ${t.spendEur} € donnaient ${t.receivedCoins} ${t.coin} pour ` +
      `${euro(t.feeEur)} € de frais annoncés, soit ${euro(t.price, 2)} € la pièce une fois ces frais mis de ` +
      `côté, quand Kraken la traitait entre ${euro(t.market.low, 2)} et ${euro(t.market.high, 2)} € dans la ` +
      `même minute`
  );
  said.push(
    `le taux affiché par l'application, ${euro(t.rateShownEur, 2)} €, est le taux tout compris et non une ` +
      `cotation : c'est ${t.spendEur} € divisés par les parts reçues, au millième de pour cent — lu dans ` +
      `l'autre sens, frais ajoutés par-dessus, la majoration ressortirait à ${pct(t.allInVsMarket)} %, ` +
      `plusieurs fois ce que Bitpanda prend, ce qui est la façon de savoir que cette lecture-là est la mauvaise`
  );
  if (!mk.measured) {
    said.push(
      `aucun aperçu pour ${coin} dans ce dépôt : la majoration retenue est la plus large des deux lues, ` +
        `${[...BITPANDA.values()].map((m) => `${m.coin} ${pct(m.markup)} %`).join(" et ")} — une pièce moins ` +
        `traitée l'est vraisemblablement davantage encore, donc c'est un plancher et non une estimation`
    );
  }
  said.push(
    marketBp != null
      ? `pour mémoire, le marché de référence lui-même est large de ${Number(marketBp).toPrecision(3)} bp` +
        (book.assumed ? ` (${book.mic}, le plus large des deux, la place n'étant pas dite)` : ` (${book.mic})`) +
        ` : la majoration ci-dessus est ce que Bitpanda ajoute par-dessus, elle ne s'y additionne pas`
      : `aucun carnet de référence pour ${coin} : le total tient quand même, la majoration étant un ` +
        `pourcentage et non une lecture de carnet`
  );
  said.push(`3,5 % sur les « low-liquidity coins », sans liste publiée : non appliqué faute de savoir qui est concerné`);
  said.push(`limite de ${CRYPTO_DAILY_LIMIT_EUR} € et de 200 ordres par 24 h — aucun retrait vers un portefeuille externe`);
  said.push(`aucun aller-retour réel chez N26 dans ce dépôt`);
  return said.join(" ; ");
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `buy` and `sell` say what each side paid.
 */
export function roundTrip({ etf, place, currency, shares, price, amount, bp = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  // The catalogue's venue is the scraper's csv pick and the execution venue is
  // Upvest's published list, so this file overrides the page's default of
  // trusting the catalogue. See `venueAuthoritative` in `front.mjs`.
  const answer = {
    usd: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
    venueAuthoritative: true,
    plan: picked?.id ?? plan,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (standard|smart|go|metal)` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue N26 n'existe pas encore : lancer `node N26/N26_scraping.mjs`" };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue N26` };

  const cryptoRow = named.find(isCrypto);
  if (cryptoRow && (!place || /crypto/i.test(place))) {
    return cryptoTrip({ row: cryptoRow, plan: picked, amount, answer });
  }
  if (!matches.length) {
    return { ...answer, why: `${etf} n'est pas au catalogue N26 sous cette forme`, alternatives: listAlternatives(named) };
  }

  const m = matches[0];
  const isin = String(m.row.isin || "").toUpperCase();
  const at = executionOf(isin);
  const rowCcy = String(m.row.currency || "EUR").toUpperCase();

  const listing = {
    isin,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    // What the client actually trades on, not what the catalogue guessed.
    mic: at?.mic ?? null,
    exchange: at?.name ?? (rowCcy === "GBP" ? VENUES.gbp.name : "Upvest"),
    currency: at?.ccy ?? (rowCcy === "GBP" ? VENUES.gbp.ccy : "EUR"),
    brokerExchange: m.row.exchange || null,
  };

  const tax = taxesOf(isin);
  const all = taxRates(tax);

  // Two lines of `taxMap.mjs` are dropped here, and for different reasons.
  //
  // The PTM levy because it is not a rate at all: it is one pound flat above ten
  // thousand, and it is levied on transactions executed under the UK takeover
  // code rather than on a German exchange. Carried as a percentage it would be
  // wrong twice over.
  //
  // British stamp duty because Upvest does not collect it, which is measured and
  // not reasoned: the ex-ante document for a 100 € purchase of Keller Group on
  // 2026-09-14 at 14:30 prices the whole round trip at 1,80 €, two tickets and
  // nothing else, on a form whose own note says service costs « comprennent […]
  // les droits de timbre ». Half a percent would have shown. It does not, because
  // the order settles through Clearstream and not CREST, which is where the duty
  // is collected. The same mechanism would exempt Irish stamp duty; only the
  // British case was measured, and `taxMap.mjs` carries no Irish line anyway.
  const DROPPED = ["PTM_LEVY", "STAMP_DUTY"];
  const rates = Object.fromEntries(Object.entries(all).filter(([k]) => !DROPPED.includes(k)));
  const dropped = DROPPED.filter((k) => all[k] != null);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const ticketUsd = dollars(TICKET_EUR, "EUR");

  const shared = {
    ...answer,
    listing,
    feeMarket: "equity",
    plan: picked.id,
    catalogueVenue: m.row.exchange || null,
    bp: bp ?? at?.leaf?.bp ?? null,
    url: at?.leaf?.url ?? SCHEDULE.stocks,
    tax,
    fx: fxNote(rowCcy),
    remark: remarkOf({ market: "equity", listing }),
    commission: { each: TICKET_EUR, currency: "EUR", eachWay: true, perOrder: true, freeTrades: picked.freeTrades },
    basis:
      `barème N26 actions / ETF / ETC : ${TICKET_EUR} € par ordre depuis le ${SCHEDULE.equityFeeFrom}, ` +
      `lu le ${SCHEDULE.readOn} — exécution Upvest ` +
      (at ? `à ${at.name} (${at.mic})` : rowCcy === "GBP" ? `chez ${VENUES.gbp.name}, hors bourse` : "sans carnet"),
  };

  if (!at) {
    return {
      ...shared,
      why:
        rowCcy === "GBP"
          ? `Upvest exécute le sterling chez ${VENUES.gbp.name}, hors bourse et sans carnet publié : aucun écart chiffrable`
          : `${listing.ticker || isin} n'a de carnet ni à Tradegate ni à Quotrix, les deux places euro d'Upvest`,
      confidence: confidenceOf({ picked, at, marketBp: null, taxPct, rates, dropped, listing, rowCcy }),
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ picked, at, marketBp: shared.bp, taxPct, rates, dropped, listing, rowCcy }),
    };
  }

  // The price arrives in whatever currency the catalogue row claims, and that
  // claim is a guess; converting it to dollars is the one thing the guess cannot
  // spoil, since the same money is the same money.
  const notional = n * p;
  const notionalUsd = dollars(notional, rowCcy);
  const marketBp = shared.bp;

  // The book is already a round trip, so it is added once and not per side.
  const bookUsd = marketBp != null && notionalUsd != null ? (notionalUsd * marketBp) / 1e4 : null;
  // Stamp duty and transaction taxes are charged on the purchase alone.
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const usd = plus(bookUsd, ticketUsd, ticketUsd, taxUsd);
  // What the broker keeps, told apart from the total because the page prints the
  // two side by side. A free trade waives a ticket and nothing else: the book
  // belongs to whoever quoted it and the transaction tax to a treasury, and
  // « 3 free trades » beside a single number would read as if it waived those
  // too.
  const brokerFees = plus(ticketUsd, ticketUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: rowCcy },
    buy: { commission: finite(ticketUsd, 6), native: { charged: TICKET_EUR, currency: "EUR" }, taxes: finite(taxUsd, 6), taxRates: Object.keys(rates).length ? rates : null },
    sell: { commission: finite(ticketUsd, 6), native: { charged: TICKET_EUR, currency: "EUR" } },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(plus(ticketUsd, ticketUsd), 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: confidenceOf({ picked, at, marketBp, taxPct, rates, dropped, listing, rowCcy }),
  };
}

function confidenceOf({ picked, at, marketBp, taxPct, rates, dropped, listing, rowCcy }) {
  const said = [];
  said.push(
    `ticket N26 de ${TICKET_EUR} € par ordre depuis le ${SCHEDULE.equityFeeFrom}, facturé à l'achat comme à la vente, ` +
      `converti en dollars au mid BCE du ${FX_AS_OF}` +
      (MEASURED.ticketConfirmed
        ? ` — vérifié le ${MEASURED.on} sur quatre aperçus d'ordre à 100 €, identique sur un ETF européen, ` +
          `une action américaine et une britannique, et ajouté au montant plutôt que prélevé dessus`
        : "")
  );
  said.push(
    `le document de coûts ex ante d'Upvest du ${MEASURED.on} chiffre les « coûts des services » de ` +
      `l'aller-retour à ${MEASURED.roundTripDisclosed.serviceCosts.toFixed(2).replace(".", ",")} €, ` +
      `soit ${MEASURED.roundTripDisclosed.equals} au centime près, et les avantages de tiers à zéro — ` +
      `l'interdiction du paiement pour flux d'ordres du 1er juillet 2026 lue comme un chiffre`
  );
  said.push(
    at
      ? at.fallback
        ? `place d'exécution ${at.name} (${at.mic}) : Tradegate ne cote pas cette ligne, et l'aperçu d'ordre ` +
          `dit « for execution at Tradegate Exchange as available » — le repli d'Upvest est donc atteint, ` +
          `ce que Keller Group a montré le ${MEASURED.on}, coté par l'application et refusé par Tradegate`
        : `place d'exécution ${at.name} (${at.mic}), non pas déduite du catalogue mais lue le ${MEASURED.on} ` +
          `au bas de l'aperçu d'ordre : « to forward the order to Upvest Securities GmbH for execution at ` +
          `Tradegate Exchange as available »`
      : `aucune place d'exécution avec un carnet pour cette ligne`
  );
  if (listing.brokerExchange && loose(listing.brokerExchange) !== loose(at?.mic) && at) {
    said.push(
      `le catalogue rangeait cette ligne sous ${listing.brokerExchange} : c'est le choix de stocks.csv fait par ` +
        `N26_scraping.mjs, pas une place imprimée par N26, et l'ancien fichier y lisait l'écart — ` +
        `à Xetra il est deux fois plus étroit qu'à Tradegate`
    );
  }
  if (marketBp != null) {
    said.push(
      `carnet ${Number(marketBp).toPrecision(4)} bp, aller-retour — il s'ajoute aux frais et ne les double pas : ` +
        `le document d'Upvest ne contient aucun coût implicite, la différence entre l'achat et la vente ` +
        `n'étant pas quelque chose qu'Upvest facture`
    );
  }
  else said.push(`aucun carnet : le total est N/A et non un total sans marché`);

  if (taxPct) {
    said.push(
      `${Object.keys(rates).join(", ")} ${(100 * taxPct).toFixed(2).replace(".", ",")} % à l'achat seulement, ` +
        (Object.keys(rates).includes("FRENCH_TRANSACTION_TAX")
          ? `confirmée le ${MEASURED.on} : le document ex ante sur 100 € de LVMH chiffre l'aller-retour à ` +
            `2,20 €, soit deux tickets et 0,40 € de taxe, et sa ventilation par année la met à l'achat seul ` +
            `— 1,30 € la première année, 0,90 € la troisième`
          : `depuis taxMap.mjs, non vérifiée sur cette ligne : les documents ex ante lus confirment la taxe ` +
            `française et infirment le timbre britannique, les autres restent à voir`)
    );
  }
  if (dropped?.includes("STAMP_DUTY")) {
    said.push(
      `droit de timbre britannique écarté, et mesuré plutôt que raisonné : le document ex ante du ` +
        `${MEASURED.on} sur 100 € de Keller Group chiffre l'aller-retour à 1,80 €, deux tickets et rien ` +
        `d'autre, sur un formulaire dont la note dit que ses coûts de service comprennent les droits de ` +
        `timbre — le règlement passe par Clearstream et non par CREST, où la taxe se perçoit`
    );
  }
  if (dropped?.includes("PTM_LEVY")) {
    said.push(
      `prélèvement PTM écarté : taxMap.mjs le porte en pourcentage alors que c'est une livre forfaitaire ` +
        `au-delà de 10 000 £, et il frappe les transactions exécutées sous le code britannique, pas Tradegate`
    );
  }
  if (rowCcy !== "EUR" && at) {
    said.push(
      `le catalogue annonce cette ligne en ${rowCcy}, devise déduite de la place par le scraper : ` +
        `l'ordre se règle en euros à ${at.name}, et la conversion est déjà dans l'écart facturé ici — ` +
        `l'aperçu du ${MEASURED.on} sur Ford le montre coté 12,06 € sous sa ligne allemande FMC1, ` +
        `sans un dollar ni une ligne de change nulle part sur le ticket`
    );
  }
  if (picked.freeTrades) {
    said.push(
      `hors total : ${picked.freeTrades} ordres gratuits par mois avec ${picked.label} à ${picked.monthly} € par mois — ` +
        `un quota mensuel ne s'impute pas à un aller-retour`
    );
  }
  said.push(`garde gratuite, plans d'épargne gratuits — les frais courants d'un ETF restent à la charge du porteur`);
  said.push(
    `aucun aller-retour réel chez N26 dans ce dépôt : tout ce qui précède est lu avant exécution, ` +
      `sur des aperçus et sur le document ex ante, et rien n'a été confirmé`
  );
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
        { ...SCHEDULE, ticket: TICKET_EUR, plans: PLANS, venues: VENUES, crypto: { min: CRYPTO_MIN_EUR, metalCap: METAL_CRYPTO_CAP_EUR }, coverage: coverage() },
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
      "usage : node N26_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=usd] [--plan=standard|smart|go|metal] [--json]\n" +
        "        node N26_cost.mjs --schedule\n" +
        "  ex.   node N26_cost.mjs EUNL --shares=10 --price=100\n" +
        "        node N26_cost.mjs BTC --amount=1000 --plan=metal"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : 1000,
    bp: flag("bp") ? Number(flag("bp")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(`\nce que N26 propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  const l = out.listing;
  const money = (x) => (x == null ? "N/A" : `${Number(x).toFixed(4)} $`);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      (out.catalogueVenue && loose(out.catalogueVenue) !== loose(l.mic) ? `   [catalogue : ${out.catalogueVenue}]` : "") +
      "\n"
  );

  if (out.trade?.shares) {
    const t = out.trade;
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${Number(t.notional).toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${Number(t.notionalUsd).toFixed(2)} $)` : "") +
        "\n"
    );
  } else if (out.trade?.amount) {
    console.log(`${out.trade.amount} $ aller-retour (${Number(out.trade.euros).toFixed(2)} €)\n`);
  }

  const side = (name, s) => {
    if (!s) return;
    const lines = [];
    if (s.commission != null || s.native) {
      lines.push(
        `  commission   ${money(s.commission)}` +
          (s.native ? `   (${Number(s.native.charged).toPrecision(4)} ${s.native.currency}${s.native.floored ? ", au plancher" : ""})` : "")
      );
    }
    if (s.taxes) lines.push(`  taxes        ${money(s.taxes)}`);
    if (lines.length) console.log(`${name}\n${lines.join("\n")}`);
  };
  side("achat", out.buy);
  side("vente", out.sell);
  if (out.parts?.marché != null) {
    const what = out.feeMarket === "equity" ? "carnet     " : "majoration ";
    console.log(`marché\n  ${what}  ${money(out.parts.marché)}   (aller-retour)`);
  }

  const base = out.trade?.notionalUsd ?? out.trade?.amount ?? null;
  console.log(
    `\ntotal        ${money(out.usd)}` + (out.usd != null && base ? `   soit ${((100 * out.usd) / base).toFixed(3)} % du montant` : "")
  );
  if (out.usd == null && out.why) console.log(`coût N/A — ${out.why}`);
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ").filter(Boolean)) console.log(`  ${line}`);
  if (out.remark) console.log(`\nremarque\n  ${out.remark.split("\n").join("\n  ")}`);
  if (out.url) console.log(`\n${out.url}`);
}
