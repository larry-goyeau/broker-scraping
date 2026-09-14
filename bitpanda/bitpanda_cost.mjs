// What one round trip costs at Bitpanda: buy n units at price p, sell them back
// at once. `roundTrip()` answers the bill in dollars.
//
// Two products sit behind one catalogue, and they are priced nothing alike.
//
// Real Stocks / ETFs / ETCs (Bitpanda Financial Services, executed on Quotrix,
// quoted in EUR) cost a flat ticket and the spread, with no percentage at all.
// Crypto on the retail app costs a percentage and no ticket.
//
// Both were re-read on 2026-09-14, and this time against the two Cost
// Transparency documents rather than the help centre. They are the MiFID
// disclosures, they carry version numbers and dates, and they say more than the
// support pages do:
//
//   https://cdn.bitpanda.com/terms-and-conditions/cost-transparency-equity-bitpanda-en-1.0.0.pdf
//   https://cdn.bitpanda.com/terms-and-conditions/cost-transparency-crypto-bitpanda-en-2.0.0.pdf
//
// The equity document (v1.0.0, 28 January 2026) confirms the ticket and settles
// what the help page left vague. The fee is one unit of the wallet currency per
// order — EUR 1, USD 1, GBP 1, CHF 1, HUF 400, PLN 4, RON 5, CZK 20, SEK 10,
// DKK 10 — and this catalogue is entirely in euro. Opening an account and
// keeping it are free, and so is the Austrian and German tax withholding. Its
// first footnote is the important one: "Spreads may apply in addition", which
// is the whole answer to the help page's talk of price adjustments. There is no
// figure for the adjustment anywhere, so the Quotrix book stands as the spread.
//
// The crypto document (v2.0.0) is where this file was wrong. The retail premium
// is not 0.99 % across the board: it is a four-tier table assigned coin by coin.
//
//   Tier 1   stablecoins                                          0.99 %
//   Tier 2   Bitcoin, VSN                                         0.99 %
//   Tier 3   other crypto assets                                  1.49 %
//   Tier 4   market cap under 100 M EUR, and Spotlight assets     2.49 %
//
// The old file charged every coin the Bitcoin rate, which was wrong for all but
// a handful. But reading the tiers off the document was not enough either,
// because the document does not say which coins sit under the 100 M EUR line.
//
// So they were asked. `createOffer` quotes a trade without filling it and hands
// back the fee it would take, which makes the tier readable per coin for
// nothing. `bitpanda-tiers.mjs` swept all 560 on 2026-09-14 and wrote what came
// back to `bitpanda-tiers.json`, which this file now prefers over any guess:
//
//   0.00 %   1 coin     EURCV, which the document does not describe at all
//   0.99 %   9 coins    BTC, VSN, and seven fiat-pegged tokens
//   1.49 % 137 coins
//   2.49 % 405 coins
//
// Tier 4 is not the exception the document's wording suggests, it is the rule:
// three coins in four are charged 2.49 %, so the round trip on most of the list
// is 4.98 % rather than the 1.98 % the old file printed. Defaulting to Tier 3,
// as this file did for an hour, was wrong for 405 of the 552 coins priced.
// An unmeasured coin is therefore assumed dear rather than cheap.
//
// The arithmetic behind the quote is exact: the price comes back as
// `priceWithoutFee / (1 − rate)` to six digits, so the premium is taken out of
// the gross amount and nothing visible rides beside it. Whether `priceWithoutFee`
// is itself the true market price is the one thing no quote can answer — there
// is no public book for a coin to check it against, and settling it would take
// holding one and quoting the sale back.
//
// Out of a round trip, and left out on purpose: an outgoing securities transfer
// costs EUR 30 per ISIN and a shareholder registration EUR 60, but those price
// leaving or voting, not trading. Fusion (0.25 % down to 0.02 % by volume) and
// the crypto indices (1.99 %) are other products and not this catalogue. Owning
// VSN and electing to pay in it takes 20 % off the fees; the default customer
// does not, so the table prints the undiscounted card.
//
// The ticket was probed the same day at three sizes, and it is a ticket at all
// of them: 25 €, 5 000 € and 50 000 € of EUNL each quoted a fee of exactly 1 €,
// which is 4 % of the first and 0 % of the last. The quoted price equalled
// `priceWithoutFee` every time — 126.55, 126.55, 126.545 — so the euro is
// charged beside the notional and never folded into it, and the spread that the
// help page says is "adjusted based on your trading amount" did not move across
// a range of two thousand to one. The Quotrix book stands at any size a retail
// reader will ask for.
//
// One live trip on 2026-09-09: 25 € of EUNL (IE00B4L5Y983) both ways. The
// offer quoted 1 € each way, taken from the notional (net 24 € of ETF on the
// buy, 23 € cash back on the sell). Offer price 126.18 / 126.185, same as
// priceWithoutFee — no extra % sitting on top of the book. The 0.4 bp gap
// is the market ticking up, not a cost (sold above the buy). The trade
// object's `price` (131.44 / 120.93) is all-in (25/qty, 23/qty). Cash
// 500 → 498. Position back to 0.
//
// A second equity trip on 2026-09-14 says the same on a foreign line: 25 € of
// Sandvik (SE0000667891), a Swedish share quoted here in euro. One euro each
// way, and the price without fee moved 32.79 → 32.63 between the two legs,
// 0.49 %, which is a plausible spread for a cross-border name and nothing like
// the gap the coins show. Cash 47.79 → 45.67, of which 2 € are the tickets.
// The ticket, not a percentage, remains the whole of what Bitpanda charges on
// a share.
//
// Crypto is the opposite story, and the reason the crypto branch no longer
// stops at the barème: see CRYPTO_GAP_MEDIAN below. The short of it is that a
// coin costs about twice its advertised premium, because the price Bitpanda
// calls "without fee" is quoted lower to sell than to buy. It quotes that sell
// side to someone holding nothing, so the gap is read per coin for free.
//
//   node bitpanda/bitpanda_cost.mjs AAPL --shares=10 --price=200
//   node bitpanda/bitpanda_cost.mjs IE00B4L5Y983 QUOTRIX EUR --shares=1 --price=126
//   node bitpanda/bitpanda_cost.mjs BTC --shares=1 --price=60000
//   node bitpanda/bitpanda_cost.mjs --schedule
//   node bitpanda/bitpanda-live-experiment.mjs --probe --amount=25
//   node bitpanda/bitpanda-live-experiment.mjs --live --amount=25
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("bitpanda-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  stocks: "https://support.bitpanda.com/hc/en-us/articles/24575224671516-Real-Stocks-ETFs-on-Bitpanda",
  fees: "https://support.bitpanda.com/hc/en-us/articles/360000902525-What-fees-and-premiums-can-I-expect-to-pay-on-Bitpanda",
  fusion: "https://support.bitpanda.com/hc/en-us/articles/16663481714844-Bitpanda-Fusion",
  costEquity: "https://cdn.bitpanda.com/terms-and-conditions/cost-transparency-equity-bitpanda-en-1.0.0.pdf",
  costCrypto: "https://cdn.bitpanda.com/terms-and-conditions/cost-transparency-crypto-bitpanda-en-2.0.0.pdf",
  readOn: "2026-09-14",
  entity: "Bitpanda Financial Services (AT), Real Securities on Quotrix",
};

// One unit of the wallet currency per order, as the equity document prices it.
// The catalogue is euro-only, so EUR 1 is what ever gets charged here; the rest
// is kept because it is the same fee and a later catalogue may not be in euro.
const FEE_EACH = { EUR: 1, USD: 1, GBP: 1, CHF: 1, HUF: 400, PLN: 4, RON: 5, CZK: 20, SEK: 10, DKK: 10 };
const FEE_EACH_EUR = FEE_EACH.EUR;

// Crypto cost transparency v2.0.0, §2.1. Per side, already inside the quote.
const CRYPTO_TIERS = {
  1: { rate: 0.0099, what: "stablecoins" },
  2: { rate: 0.0099, what: "Bitcoin, VSN" },
  3: { rate: 0.0149, what: "autres crypto-actifs" },
  4: { rate: 0.0249, what: "capitalisation sous 100 M€ et actifs Spotlight" },
};
// What Bitpanda actually quoted, coin by coin, from `bitpanda-tiers.mjs`. A
// quote is free — no offer is ever accepted — so the tier is measured rather
// than guessed, which matters because guessing it well is impossible: the line
// between Tier 3 and Tier 4 is a market capitalisation nothing here carries.
const TIERS_FILE = new URL("bitpanda-tiers.json", import.meta.url);
const measured = fs.existsSync(TIERS_FILE) ? JSON.parse(fs.readFileSync(TIERS_FILE, "utf8")) : null;
const MEASURED_RATE = measured?.byTicker || {};

// Read off the 552 coins the sweep priced. Tier 4 is not the exception the
// document's wording suggests, it is the rule: 405 coins are charged 2.49 %,
// 137 are charged 1.49 %, nine are charged 0.99 %, and EURCV is charged
// nothing at all. So a coin nobody quoted is assumed dear rather than cheap.
const CRYPTO_FALLBACK = CRYPTO_TIERS[4].rate;

// The premium is only half the bill. Four live round trips on 2026-09-14, 25 €
// each, show that `priceWithoutFee` is not one price: it is quoted lower to
// sell than to buy, and the gap is about as wide again as the premium itself.
// ADA is the plainest case — 0.186081 to buy, 0.181457 to sell three seconds
// later, 2.48 % apart, on a coin whose spread on a real exchange is a
// hundredth of that. Bitpanda is the counterparty, there is no book between
// the two prices, so the gap is its own and it is counted here.
//
//   coin      palier   annoncé A/R   écart caché   caisse
//   EURCV     —          0.00 %        0.00 %       0.00 %
//   BTC       2          1.96 %        1.49 %       3.48 %
//   ADA       3          2.96 %        2.48 %       5.36 %
//   BIGTIME   4          4.80 %        4.87 %       9.52 %
//
// EURCV settles the question that one flat markup would answer just as well:
// it quotes 1.0000 both ways and gives back every cent, so nothing is charged
// beside the premium — the gap tracks the coin rather than the platform.
// `cash` is what the caisse actually lost, kept beside the quoted figures so
// the claim can be read against the measurement instead of recomputed from it.
const TRIPS = {
  on: "2026-09-14",
  amountFiat: 25,
  cash: { start: 50, end: 43.29 },
  byTier: {
    2: { coin: "BTC", gap: 0.0149, disclosed: 0.0196, cash: 0.0348 },
    3: { coin: "ADA", gap: 0.0248, disclosed: 0.0296, cash: 0.0536 },
    4: { coin: "BIGTIME", gap: 0.0487, disclosed: 0.048, cash: 0.0952 },
  },
};

// Those four trips only paid for the method. Bitpanda quotes the sell side to
// someone holding nothing, so `bitpanda-tiers.mjs` reads the gap coin by coin
// for free, and the four live trips agree with the free reading to within a few
// basis points. That per-coin figure is what gets used; these medians are the
// fallback for a coin the sweep never reached, and they are worth keeping in
// sight because one witness per tier turned out to be a poor guide — BTC sits
// at the top of its tier and ADA near the bottom of its own.
//
//   taux      coins   écart caché A/R : 1er décile   médiane   9e décile   max
//   0.00 %        1                         0.00 %    0.00 %      0.00 %   0.00 %
//   0.99 %        9                         0.48 %    0.61 %      1.49 %   1.49 %
//   1.49 %      137                         2.59 %    3.76 %      4.02 %   4.76 %
//   2.49 %      407                         4.72 %    4.94 %      5.71 %   8.77 %
const CRYPTO_GAP_MEDIAN = { 2: 0.0061, 3: 0.0376, 4: 0.0494 };

const tierOfRate = (rate) => {
  if (rate === 0) return null;
  if (rate <= CRYPTO_TIERS[1].rate) return 2;
  if (rate <= CRYPTO_TIERS[3].rate) return 3;
  return 4;
};

export function cryptoRateOf(ticker) {
  const t = String(ticker || "").split("/")[0].toUpperCase();
  const seen = MEASURED_RATE[t];
  // An entry written before the gap sweep is a bare rate.
  const rate = typeof seen === "number" ? seen : seen?.rate;
  if (!Number.isFinite(rate)) return { rate: CRYPTO_FALLBACK, gap: null, tier: 4, measured: false };

  const tier = tierOfRate(rate);
  // A coin that charges 2.49 % does not quote both sides at one price. MOG
  // trades near a ten-millionth of a euro, too small for the quote to carry a
  // gap at the precision it is printed with, so the zero is a rounding artefact
  // and the tier median serves instead.
  const raw = typeof seen === "object" ? seen.gap : null;
  const gap = Number.isFinite(raw) && (raw > 0 || rate === 0) ? raw : null;
  return { rate, gap, tier, measured: true };
}

const CHECK = {
  isin: "IE00B4L5Y983",
  ticker: "EUNL",
  venue: "QUOTRIX",
  amountFiat: 25,
  buyOffer: 126.18,
  sellOffer: 126.185,
  feeEach: 1,
  cash: { start: 500, end: 498 },
  on: "2026-09-09",
};

const TO_VENUES = {
  QUOTRIX: "QUOTRIX",
  "BÖRSE DÜSSELDORF": "QUOTRIX",
  "BOERSE DUSSELDORF": "QUOTRIX",
  DUSSELDORF: "QUOTRIX",
  XQTX: "QUOTRIX",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const cryptoBase = (ticker) => String(ticker || "").split("/")[0].toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

const venueRow = (row) => ({
  ...row,
  exchange: TO_VENUES[String(row.exchange || "").toUpperCase()] || row.exchange,
});


function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCrypto(r) && (loose(cryptoBase(r.ticker)) === asked || loose(r.ticker) === asked);
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "EUR") ||
      crypto[0];
    return { named, matches: [{ row, venue: null }] };
  }

  const matches = named
    .filter((r) => !isCrypto(r))
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
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    if (isCrypto(r)) {
      const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
      slot.n += 1;
      const mk = (slot.byMarket.crypto ||= { n: 0, withBook: 0 });
      mk.n += 1;
      continue;
    }
    const { venue, unsourced } = listingKey(venueRow(r));
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[book.mic || venue?.mic || "unsourced"] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function cryptoCost(row, answer, { amount }) {
  const listing = {
    isin: null,
    ticker: row.ticker,
    name: row.name,
    type: "CRYPTO",
    mic: null,
    exchange: "Bitpanda (app)",
    currency: String(row.currency || "EUR").toUpperCase(),
  };
  const { rate, gap, tier, measured: isMeasured } = cryptoRateOf(row.ticker);
  // What the barème says, plus what the quote hides. Both are Bitpanda's.
  const gapMeasured = gap != null;
  const spread = gapMeasured ? gap : tier ? CRYPTO_GAP_MEDIAN[tier] ?? 0 : 0;
  const trip = rate * 2 + spread;
  const what = tier ? CRYPTO_TIERS[tier].what : "gratuit chez Bitpanda";
  const seen = tier ? TRIPS.byTier[tier] : null;
  const witness = seen?.coin || "EURCV";

  const shared = {
    ...answer,
    listing,
    feeMarket: "crypto",
    cashCurrency: listing.currency,
    remark: "",
    parts: null,
    bp: Number((trip * 1e4).toFixed(0)),
    perShare: null,
    url: SCHEDULE.costCrypto,
    basis:
      `barème retail Bitpanda, ${(rate * 100).toFixed(2)} % par sens` +
      (tier ? ` (palier ${tier}, ${what})` : ` (${what})`) +
      `, ${isMeasured ? `coté le ${measured?.readOn || SCHEDULE.readOn}` : `supposé, coin non coté`}` +
      (spread
        ? `, plus ${(spread * 100).toFixed(2)} % d'écart caché dans le prix` +
          (gapMeasured ? ` coté sur ce coin` : `, médiane du palier ${tier}`)
        : ""),
    commission: { rate, tier, eachWay: true, currency: listing.currency },
    spreadTrip: spread,
    spreadMeasured: gapMeasured,
    tier,
    tierMeasured: isMeasured,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    confidence:
      (isMeasured
        ? `Premium coté chez Bitpanda le ${measured?.readOn || SCHEDULE.readOn} sans exécuter, sur ${measured?.amount || 25} € : ` +
          `${(rate * 100).toFixed(2)} % par sens, soit ${(rate * 2 * 100).toFixed(2)} % l'aller-retour affiché.`
        : `Ce coin n'a pas été coté : faute de mieux il prend ${(rate * 100).toFixed(2)} % par sens, ` +
          `le tarif que 409 des 556 coins mesurés paient réellement. Relancer bitpanda-tiers.mjs après un scraping.`) +
      ` ; ` +
      (spread
        ? `Le premium annoncé ne fait que la moitié de la note : Bitpanda cote le prix dit hors frais ` +
          `${(spread * 100).toFixed(2)} % plus bas à la vente qu'à l'achat, ` +
          (gapMeasured
            ? `écart lu sur ce coin même le ${measured?.readOn || SCHEDULE.readOn}.`
            : `faute d'avoir coté ce coin, la médiane de son palier.`) +
          ` Étant la contrepartie et non un carnet, cet écart lui revient, et le total le compte.`
        : `EURCV cote 1,0000 dans les deux sens et rend chaque centime : aller-retour réel de ` +
          `${TRIPS.amountFiat} € le ${TRIPS.on}, caisse inchangée. Rien n'est prélevé sur ce coin.`) +
      ` ; ` +
      (seen
        ? `La méthode est payée : aller-retour réel de ${TRIPS.amountFiat} € sur ${witness} le ${TRIPS.on}, ` +
          `${(seen.cash * 100).toFixed(2)} % perdus à la caisse pour ${(seen.disclosed * 100).toFixed(2)} % ` +
          `de frais affichés. Bitpanda cote une vente à qui ne détient rien, donc le même écart se lit ` +
          `gratuitement, et la lecture gratuite retrouve l'aller-retour réel à quelques points de base près.`
        : `Bitpanda cote une vente à qui ne détient rien, donc l'écart se lit gratuitement sur chaque coin.`) +
      ` ; ` +
      `Cost Transparency Crypto v2.0.0 §2.1 annonce quatre paliers — 0,99 % stablecoins et Bitcoin, ` +
      `1,49 % les autres, 2,49 % sous 100 M€ de capitalisation. Le balayage des 556 coins montre que le palier 4 ` +
      `est la règle et non l'exception : 409 à 2,49 %, 137 à 1,49 %, 9 à 0,99 %, et EURCV à 0 %. ; ` +
      `L'écart caché suit le coin et non le palier, d'où la lecture coin par coin : médiane 0,61 % à 0,99 %, ` +
      `3,76 % à 1,49 %, 4,94 % à 2,49 %, mais de 4,72 % à 8,77 % entre les premier et dernier déciles du ` +
      `dernier palier. Un seul témoin par palier aurait mal fini : BTC est le plus cher du sien, ADA parmi ` +
      `les moins chers du sien. ; ` +
      `L'écart ne dépend guère de la taille : sur ADA, 2,506 % à 25 € et 2,573 % à 50 000 €. Il bouge en ` +
      `revanche d'une vingtaine de points de base d'une heure à l'autre, donc il se relit. ; ` +
      `Fusion (0,25 % à 0,02 %) et les indices BCI (1,99 %) sont d'autres produits, pas ce catalogue. ; ` +
      `Détenir VSN et choisir de payer en VSN retire 20 % des frais annoncés, mais le tarif imprimé est celui ` +
      `sans remise, et rien ne dit que la remise touche l'écart caché. ; ` +
      `Certains coins exigent une acceptation de conditions avant d'être négociables — ZIL a refusé l'ordre ` +
      `avec terms.mandatory.not.accepted / TRADING_CRYPTO_TRADE_ONLY_BUY — ce que le catalogue ne signale pas.`,
  };

  // A coin is bought by the dollar, so the size arrives as an amount rather
  // than a count and a price.
  const a = Number(amount);
  if (!(a > 0)) return { ...shared, why: "aucun montant pour cet aller-retour" };

  const usd = a * trip;
  return {
    ...shared,
    usd: finite(usd, 6),
    // Bitpanda deals as principal, so there is no exchange, no regulator and no
    // tax to carve out: the premium and the gap inside the quote are both its
    // own take, and broker fees are the whole cost.
    brokerFees: finite(usd, 6),
    trade: { amount: a, currency: QUOTE },
    parts: {
      premium: finite(a * rate * 2, 6),
      premiumEachWay: rate,
      spread: finite(a * spread, 6),
      spreadTrip: spread,
    },
  };
}

export function roundTrip({ etf, place, currency, shares, price, amount, bp = null, perShare = null }) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Bitpanda n'existe pas encore : lancer `node bitpanda/bitpanda_scraping.mjs` avec app.bitpanda.com ouvert",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Bitpanda` };

  const cryptoRow = named.find(isCrypto);
  if (cryptoRow && (!place || /crypto/i.test(place))) {
    const picked = matches[0]?.row || cryptoRow;
    return cryptoCost(picked, answer, { amount });
  }

  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Bitpanda`,
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
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "EUR").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const ticketCcy = FEE_EACH[listing.currency] != null ? listing.currency : "EUR";
  const ticketEach = FEE_EACH[ticketCcy];
  const ticketUsd = dollars(ticketEach * 2, ticketCcy);

  const shared = {
    ...answer,
    listing,
    feeMarket: "quotrix",
    cashCurrency: listing.currency,
    remark: "",
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.costEquity,
    basis: `Real Securities Bitpanda, ticket ${ticketEach} ${ticketCcy} × 2, carnet Quotrix, lu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      each: dollars(ticketEach, ticketCcy),
      roundTrip: ticketUsd,
      currency: QUOTE,
      native: { each: ticketEach, roundTrip: ticketEach * 2, currency: ticketCcy },
    },
    cEur: FEE_EACH_EUR * 2,
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: listing.currency === "EUR" ? 0 : null,
    confidence:
      `Cost Transparency Equity v1.0.0 du 28 janvier 2026 : ${ticketEach} ${ticketCcy} par ordre, ` +
      `soit ${ticketEach * 2} ${ticketCcy} l'aller-retour, et aucun pourcentage de courtage. ; ` +
      `Confirmé le ${CHECK.on} sur ${CHECK.ticker} (${CHECK.amountFiat} €, ` +
      `offre ${CHECK.buyOffer} / ${CHECK.sellOffer}, caisse ${CHECK.cash.start} → ${CHECK.cash.end}) : ` +
      `le prix d'offre était celui hors frais, donc rien ne se cachait au-dessus du carnet. ; ` +
      `La note 1 du document dit « Spreads may apply in addition » sans les chiffrer, mais le ticket ` +
      `a été coté le ${SCHEDULE.readOn} à 25 €, 5 000 € et 50 000 € : 1 € à chaque fois, prix égal au prix hors frais, ` +
      `donc le spread ne s'élargit pas avec la taille et le carnet Quotrix tient. ; ` +
      `Second aller-retour le ${TRIPS.on} sur Sandvik (SE0000667891), action suédoise cotée ici en euro : ` +
      `1 € par sens là aussi, mais le prix hors frais a bougé de 0,49 % entre les deux jambes, contre 0,4 bp ` +
      `sur ${CHECK.ticker}. Reste à savoir si c'est le carnet d'une ligne transfrontalière ou une marge de change ` +
      `que Quotrix ne montre pas : sur une action hors zone euro, le total peut manquer un demi-pour-cent. ; ` +
      `Ouverture, garde et retenue fiscale autrichienne et allemande gratuites. ; ` +
      `Frais du courtier = le seul ticket, puisque le carnet est au marché et les taxes au trésor.` +
      (leaf ? "" : ` ; Pas de feuille Quotrix pour cet ISIN dans spread.json.`),
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
    };
  }

  const notional = dollars(n * p, listing.currency);

  // The book is already a round trip, so it is counted once rather than per leg.
  const bookUsd =
    marketBp != null && notional != null
      ? (notional * marketBp) / 1e4
      : marketPerShare != null
        ? dollars(marketPerShare * n, listing.currency)
        : null;
  const taxUsd = notional != null ? notional * taxTotal : 0;

  const usd = plus(bookUsd, ticketUsd, taxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    // The ticket is the only thing Bitpanda keeps. It charges no percentage at
    // all, so on anything but a very small order it is the cheapest line on the
    // page — and on a 25 € order it is 8 % of the notional.
    brokerFees: finite(ticketUsd, 6),
    trade: { shares: n, price: p, currency: listing.currency, notional: n * p, notionalUsd: notional },
    parts: {
      marché: finite(bookUsd, 6),
      ticket: ticketUsd,
      taxes: Object.keys(rates).length ? finite(taxUsd, 6) : null,
    },
    ...(bookUsd == null
      ? { why: `aucun carnet Quotrix pour ${listing.isin} : ${m.unsourced?.why || "pas de feuille dans spread.json"}` }
      : {}),
  };
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
          feeEach: FEE_EACH,
          cryptoTiers: CRYPTO_TIERS,
          cryptoMeasured: measured
            ? { readOn: measured.readOn, amount: measured.amount, coins: Object.keys(MEASURED_RATE).length }
            : null,
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
      "usage : node bitpanda_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=usd] [--json]\n" +
        "        node bitpanda_cost.mjs --schedule\n" +
        "  ex.   node bitpanda_cost.mjs AAPL --shares=10 --price=200\n" +
        "        node bitpanda_cost.mjs IE00B4L5Y983 QUOTRIX EUR --shares=1 --price=126\n" +
        "        node bitpanda_cost.mjs BTC --amount=1000"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : 1000,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Bitpanda propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.feeMarket}${out.tier ? ` palier ${out.tier}` : ""}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    console.log(
      (t.shares != null
        ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
          (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
        : `${t.amount} $ aller-retour`) + "\n"
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const p = out.parts || {};
    if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
    if (p.ticket != null) console.log(`  ticket         : ${p.ticket} $   (${out.commission?.native?.each} ${out.commission?.native?.currency} × 2)`);
    if (p.premium != null) console.log(`  premium        : ${p.premium} $   (${(p.premiumEachWay * 100).toFixed(2)} % par sens, les deux)`);
    if (p.spread) console.log(`  écart caché    : ${p.spread} $   (${(p.spreadTrip * 100).toFixed(2)} % l'aller-retour, dans le prix)`);
    if (p.taxes) console.log(`  taxes          : ${p.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) console.log(`\n${out.remark}`);

  if (out.url) console.log(`\n${out.url}`);
}
