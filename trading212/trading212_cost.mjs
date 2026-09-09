// What one round trip costs at Trading212: buy n shares at price p, sell them back at once, in
// the form the front end asked for.
//
//   coût (USD) = a × toUsd(p) × n + b × n + c
//
// Three terms because fees come in three shapes, and a broker charges in whichever it likes: `a`
// for everything that follows the amount, `b` for what is charged by the share, `c` for what is
// charged by the order. A fee charged on one leg only needs no fourth term: two affine legs sum to
// an affine round trip, so a sell-side charge lands in the same coefficient at half the weight a
// two-sided one would have. What the folding costs is the ability to answer a different question —
// the price of a single leg, or of holding — which these three numbers cannot be unpacked into.
//
// Three families of instrument, and they do not cost the same kind of money:
//
//   fonds        le spread du carnet, rien d'autre. Deux centièmes de pour cent sur un gros ETF.
//   actions      le spread, plus une taxe à l'achat là où la place en lève une, plus les frais
//                réglementaires américains à la vente. La taxe domine : le droit de timbre
//                britannique coûte 0,5 %, vingt-cinq fois le carnet de la même action.
//   crypto       ni commission ni taxe, mais un écart achat-vente de deux pour cent, cent fois
//                celui d'un ETF. C'est le seul cas où Trading212 tient les deux prix lui-même.
//
// `a` is a fraction of the amount. `b` and `c` are dollars, the same unit Swissquote and
// tastytrade answer in, so a FINRA line and a Swiss franc ticket can sit on the same row.
// The dollar cost of a trip is `a × toUsd(p) × n + b × n + c`. Conversion of the *notional*
// is still left out of `a`: it costs 0.15 % each way when the account is not funded in the
// line's currency, thirty basis points on the round trip, against the 1.84 bp that IUSQ
// actually costs. Taking a fund's dollar line instead of its euro line multiplies that
// notional bill by seventeen, and no precision on the spread survives that choice.
//
//   node trading212/trading212_cost.mjs IUSQ "Deutsche Börse Xetra" EUR
//   node trading212/trading212_cost.mjs HSBA "London Stock Exchange" GBX --shares=100
//   node trading212/trading212_cost.mjs AAPL NASDAQ USD --shares=100 --price=320
//   node trading212/trading212_cost.mjs BTC/EUR --json
//
// Import instead of calling it if the front end is in node: `roundTripCost(...)` returns the same
// object the CLI prints, and reads four files rather than the network, so it needs no await.

import fs from "node:fs";
import { listingKey, resolveVenue } from "../venues.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";

// Anchored to the repository rather than to whatever directory the shell happens to be in, so this
// works both as `node trading212/trading212_cost.mjs` and from inside the folder.
const CATALOGUE = new URL("trading212-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);
const TAXES = new URL("../parsed_json/taxes.json", import.meta.url);
const CRYPTO = new URL("t212-crypto.json", import.meta.url);

// ------------------------------------------------------------------ the broker's terms

// `c`, charged by the order, is zero on all but one line, and measured as such. Trading212's own
// ex-ante cost disclosure returns COMMISSION, CUSTODY_FEE and PLATFORM_FEE at zero for every
// instrument asked of it, on entry and on exit, across six thousand lines and sixteen exchanges.
// No entry of the account's own history carries a fee, a tax or a commission of any kind. And a
// round trip on a single share of EUNL cost one cent, which no flat charge could survive.
//
// The exception is the British takeover levy, which is flat and is therefore the one real `c` in
// this catalogue — but it only appears above a threshold, so it is reported separately rather
// than folded in. See PTM below.
const FLAT = 0;

// `b`, charged by the share, is the American regulatory fee and nothing else. FINRA's Trading
// Activity Fee is 0.000195 per share on the sale of a covered equity security, and Trading212
// passes it through without a margin: the disclosure returns 0.02 on a hundred shares, 0.14 on
// seven hundred, 0.20 on a thousand, which is that rate rounded to the cent at each step.
//
// It is charged on the sale alone, so a round trip pays it once — the number below is already the
// round-trip figure, not double it.
//
// Two things about it do not fit `a × p × n + b × n + c`, and they are worth carrying forward to
// brokers where they bite. The first is the cap: past about fifty thousand shares the term stops
// growing, and FINRA assesses that cap per execution rather than per order, so a sale broken into
// five fills gets five caps — which makes the cost depend on how the order was sliced, something
// no function of n and p can see. The second is rounding: every line is rounded to the cent, which
// is why this fee reads as exactly zero below about thirty shares. The error is bounded by half a
// cent per fee line, so it disappears into nothing on any order worth placing.
const FINRA_PER_SHARE = 0.000195;
const FINRA_CAP = 9.79;

// The SEC's Section 31 fee, on the sale alone, proportional to the amount. Read off the same
// disclosure: 6.59 on a sale of 319 980 dollars, 1.81 on 88 080, both of which are this rate
// rounded up to the cent.
const SEC_RATE = 0.0000206;

// The British takeover levy. Flat, both ways, and only above ten thousand pounds of consideration
// — a hundred shares of HSBC at 1 578p paid none, seven hundred paid it on each leg. It is the one
// charge here that a linear form genuinely cannot hold, since it switches on at a threshold, so
// the answer carries it as a condition rather than inside `c`.
const PTM = { each: 1.5, currency: "GBP", above: 10000 };

// Applies to conversion only, and only when the account is not funded in the line's currency. Left
// out of `a` on purpose, per the assumption above. Read off the same disclosure: on a 126.66 EUR
// order in a GBX line it returns CURRENCY_CONVERSION_FEE at 0.19 EUR on entry and 0.19 again on
// exit, and puts the round trip at a ratio of 0.003.
const FX_EACH_WAY = 0.0015;

// Where the estimate can be trusted on a fund, and where it cannot. Twenty-seven real round trips
// on six funds fixed this: below about 4 bp of published spread the estimate came within 6%, three
// funds out of three; above 6 bp it was wrong by up to a factor of two, in either direction, and
// seven published variables were tried against that error without ordering it. Half the published
// spread, sound on a narrow book and indicative on a wide one.
const NARROW_BP = 2.5;

// Real round trips, kept as a check on the figures above and never as a substitute for them. This
// file answers from published data alone, so that anyone can reproduce it and so that six funds out
// of fourteen thousand do not get a private accuracy the rest cannot have. What the trades are
// worth is the error bar: medians of the readings, with their range, and GC40 shows why the range
// matters — 5.42 bp three times running at midday against 3.74 to 8.01 the previous afternoon, the
// same fund on two consecutive days.
const CHECKS = {
  "IE00B4L5Y983|XETR|EUR": { bp: 0.99, trips: 6, range: [0.79, 1.18], on: "2026-08-26" },
  // A hundred Eutelsat at 1.8405 cost 0.84 EUR on 184.05, which is 0.456% — and it decomposes:
  // 0.40% of French transaction tax, exactly the rate the disclosure quoted, leaving 5.6 bp for
  // the book. That residue is itself a check, since two ticks of 0.0005 on a 1.84 price is 5.4 bp.
  "FR0010221234|XPAR|EUR": { bp: 5.6, trips: 1, range: [5.6, 5.6], on: "2026-09-07", note: "après déduction des 0,40 % de taxe française" },
  "IE00B6R52259|XETR|EUR": { bp: 1.87, trips: 6, range: [1.87, 1.87], on: "2026-08-26" },
  "IE00B5BMR087|XETR|EUR": { bp: 1.12, trips: 3, range: [1.12, 1.12], on: "2026-08-27" },
  "LU1681046931|XETR|EUR": { bp: 5.42, trips: 6, range: [3.74, 8.01], on: "2026-08-27" },
  "IE00BKM4GZ66|XETR|EUR": { bp: 2.1, trips: 4, range: [1.47, 2.73], on: "2026-08-27" },
  "LU2196472984|XETR|EUR": { bp: 2.66, trips: 2, range: [2.66, 2.66], on: "2026-08-27" },
  // Ten HSBC bought and sold at once cost 1.49 EUR on 185.26, and the whole of it is accounted
  // for: 0.920 of stamp duty at half a per cent, 0.552 of conversion at fifteen hundredths each
  // way, and 0.018 left over, which is one basis point of book against the 1.27 published. Every
  // term in this file is exercised by that one trade, and none of them is off by more than a
  // fiftieth.
  "GB0005405286|XLON|GBX": { bp: 1.0, trips: 1, range: [1.0, 1.0], on: "2026-09-07", note: "après déduction du timbre et du change" },
  // One Apple, bought and sold at once on NASDAQ. The cash moved 0.12 EUR on a 272.22 debit,
  // 4.4 bp of the euro amount. The account had already converted dollars the day before, so
  // that 0.12 is book plus the American fees and nothing else. Converted back at the fill's
  // own rate (316.40 / 272.24) it is 0.139 $, of which SEC + FINRA take 0.007 $ and the book
  // the remaining 0.133 $ — 4.2 bp against the 0.36 bp Rule 605 publishes for the 100-to-499
  // bucket. The 605 figure stays the published `b`; this check is the error bar on an odd lot.
  "US0378331005|XNAS|USD": {
    perShare: 0.133,
    bp: 4.2,
    trips: 1,
    range: [0.12, 0.12],
    on: "2026-09-08",
    note: "1 part, 0,12 € tout compris (compte déjà en dollars) ; carnet 0,133 $ contre 0,01154 $ en Rule 605",
  },
};

// What the taxed round trip proves, kept where the confidence message can quote it: the tax is not
// merely disclosed, it is charged, and at the rate disclosed. Reported alongside any taxed line
// because a rate read off a broker's own calculator and a rate taken out of an account are two
// different kinds of fact.
const TAX_CHECK = { pair: "ETL", venue: "Euronext Paris", amount: 184.05, paid: 0.84, tax: 0.004, residual: 5.6, on: "2026-09-07" };

// One real crypto round trip, for the same purpose. Fifty euros of Bitcoin bought and sold back at
// once cost 0.96 EUR, 1.92% of the amount, against the 2.01% the order review had quoted a second
// earlier. The review is honest to within five per cent, which is what licenses reading the rest of
// the crypto book off it rather than trading it.
const CRYPTO_CHECK = { pair: "BTC/EUR", amount: 50, paid: 0.96, measured: 0.0192, quoted: 0.0201, on: "2026-09-07" };

// The American book, measured rather than published. Rule 605 averages orders of a hundred
// shares; a single share paid eleven times that average, which is what the confidence
// message quotes on every US line so the 605 figure is not read as what a retail odd lot
// actually crosses.
const US_CHECK = {
  pair: "AAPL",
  venue: "NASDAQ",
  n: 1,
  paid: 0.12,
  price: 316.4,
  perShare: 0.133,
  published: 0.01154,
  ratio: 11.5,
  on: "2026-09-08",
};

// -------------------------------------------------------------------------- the files

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};
const read = (path) => (fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : null);
const taxFile = read(TAXES);
const cryptoFile = read(CRYPTO);

// -------------------------------------------------------------------------- the listing

// The broker's catalogue is the authority on what it sells, so the search runs through it rather
// than through a list of instruments: a line Trading212 does not offer has no cost here, however
// liquid its book is elsewhere.
function findListing({ etf, place, currency }) {
  const asked = String(etf || "").toUpperCase();
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) =>
      String(r.isin || "").toUpperCase() === asked ||
      String(r.ticker || "").toUpperCase() === asked ||
      String(r.code || "").toUpperCase() === asked
  );

  // Crypto has no ISIN and no venue, so it cannot go through the venue filter at all.
  const crypto = named.filter((r) => r.type === "CRYPTO");
  if (crypto.length && !wantVenue) return { named, matches: [{ row: crypto[0], venue: null }], wantVenue: null };

  const matches = named
    .filter((r) => r.type !== "CRYPTO")
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantVenue || m.venue?.mic === wantVenue.mic)
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches, wantVenue };
}

// What the broker's own disclosure says this line is taxed, or an honest silence. Absence means
// two different things and they must not be conflated: on a venue swept line by line, a missing
// code has simply not been read yet; on a venue that was only sampled, a missing code means the
// sample found nothing there, which is weaker but is not nothing.
function taxesOf(code, exchange) {
  if (!taxFile) return { known: false, why: "relevé fiscal absent : lancer node taxes.mjs" };
  const entry = taxFile.byCode?.[code];
  if (entry) return { known: true, buy: entry.achat ?? {}, sell: entry.vente ?? {}, sellRead: Boolean(entry.venteRelevée) };
  const swept = (taxFile.sweptInFull ?? []).includes(exchange);
  const sampled = Object.values(taxFile.byCode ?? {}).filter((e) => e.exchange === exchange).length;
  return swept
    ? { known: false, why: `${exchange} est balayée ligne à ligne mais celle-ci n'a pas encore été lue` }
    : {
        known: false,
        assumedZero: true,
        why: `aucune taxe rencontrée sur ${exchange} dans un échantillon de ${sampled} lignes ; cette ligne n'a pas été lue individuellement`,
      };
}

// ---------------------------------------------------------------------------- the cost

export function roundTripCost({ etf, place, currency, bp = null }) {
  const { named, matches, wantVenue } = findListing({ etf, place, currency });

  // `b` and `c` are known before the listing is even found, being terms of the account rather than
  // of the instrument, so a failed lookup still answers about them honestly: it is `a` alone that
  // goes null when nothing is on file.
  const answer = {
    a: null,
    b: 0,
    c: FLAT,
    ccy: QUOTE,
    // The clamps a linear form cannot express, null when the broker imposes none. `floor` is the
    // least a round trip can cost whatever its size, `cap` is where a term stops growing, and
    // `threshold` is a charge that switches on above an amount.
    floor: null,
    cap: null,
    threshold: null,
    etf,
    place,
    currency,
  };

  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Trading212` };

  // ------------------------------------------------------------------------------ crypto
  const cryptoRow = named.find((r) => r.type === "CRYPTO");
  if (cryptoRow && (!place || /crypto/i.test(place))) return cryptoCost(cryptoRow, answer);

  if (!wantVenue && place) return { ...answer, why: `place non reconnue : "${place}"`, alternatives: listAlternatives(named) };
  if (!matches.length)
    return { ...answer, why: `${etf} n'est pas coté sur cette place dans cette devise chez Trading212`, alternatives: listAlternatives(named) };

  // One line per (ticker, place, currency) in this catalogue, so the first match is the only match.
  const m = matches[0];
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    code: m.row.code || null,
    type: m.row.type || null,
    mic: m.venue.mic,
    exchange: m.venue.name,
    currency: String(m.row.currency || "").toUpperCase(),
  };

  const leaf = spreads[listing.isin]?.[listing.mic]?.[listing.currency] ?? null;
  const tax = taxesOf(listing.code, m.row.exchange);

  // The taxes are a rate of the amount, which is `a`, and they fall on the purchase alone — the
  // disclosure returns nothing on the sale for any of them. A one-sided charge sums into the same
  // coefficient, so the rate goes in as it comes.
  const taxRates = {};
  for (const [name, line] of Object.entries(tax.buy ?? {})) {
    if (line.ofValue != null) taxRates[name] = line.ofValue;
  }
  const taxTotal = Object.values(taxRates).reduce((s, r) => s + r, 0);

  // American lines carry the regulatory fees, and only they do: the disclosure returns them on
  // NASDAQ, NYSE and the over-the-counter market, and on nothing else.
  const american = ["XNAS", "XNYS", "ARCX", "XASE", "BATS"].includes(listing.mic) || /OTC/i.test(m.row.exchange || "");

  // The market term, in whichever unit its source publishes. Europe reads a spread off the book,
  // in basis points of the amount, which is `a`. America reads an effective spread off the Rule 605
  // reports, in dollars per share, which is `b`. Neither converts into the other without a price,
  // so each stays where it belongs.
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = leaf?.perShare ?? null;

  if (marketBp == null && marketPerShare == null && !taxTotal && !american) {
    return {
      ...answer,
      listing,
      tax,
      // Null rather than zero, always: a spread nobody has measured must not read as a free trade.
      why: `aucun spread relevé pour ${listing.ticker || listing.isin} sur ${listing.exchange} en ${listing.currency}`,
    };
  }

  const a = (marketBp ?? 0) / 1e4 + taxTotal + (american ? SEC_RATE : 0);
  const bookUsd = american || listing.currency === "USD" ? (marketPerShare ?? 0) : toUsd(marketPerShare ?? 0, listing.currency) ?? 0;
  const b = bookUsd + (american ? FINRA_PER_SHARE : 0);

  const isBritish = listing.mic === "XLON";
  const perPound = listing.currency === "GBX" ? 100 : 1;

  return {
    ...answer,
    // cost (USD) = a × toUsd(p) × n + b × n + c. `b` and `c` are dollars.
    a: Number(a.toPrecision(4)),
    b: Number(b.toPrecision(6)),
    ccy: QUOTE,
    listing,
    // What each term is made of, because a single coefficient hides which charge dominates — and
    // on a British share the tax is twenty-five times the book.
    parts: {
      marché: marketBp != null ? Number((marketBp / 1e4).toPrecision(4)) : marketPerShare != null ? `${marketPerShare} par part` : null,
      taxes: Object.keys(taxRates).length ? taxRates : null,
      réglementaire: american ? { SEC: SEC_RATE, FINRA: `${FINRA_PER_SHARE} par part` } : null,
    },
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? null,
    basis: bp ? "imposé" : leaf ? "publié" : "pas de carnet relevé, seules les taxes et frais sont comptés",
    tax,
    cap: american ? { b: FINRA_CAP, why: "plafond FINRA par exécution, pas par ordre : un ordre découpé en cinq paie cinq plafonds" } : null,
    threshold: isBritish
      ? {
          c: Number(toUsd(2 * PTM.each, "GBP").toPrecision(6)),
          currency: QUOTE,
          above: PTM.above * perPound,
          aboveCurrency: listing.currency,
          why: `prélèvement PTM de ${PTM.each} £ par ordre et par sens, au-delà de ${PTM.above} £ de montant`,
        }
      : null,
    confidence: confidenceOf({ marketBp, marketPerShare, taxTotal, american, tax, type: listing.type }),
    // What real orders paid on this very line, when any have been placed. Reported so the figure
    // above can be judged, never folded into it.
    check: checkFor(listing, { bp: marketBp, perShare: marketPerShare }),
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: FX_EACH_WAY * 2,
    remark:
      (isBritish ? "UK takeover levy (PTM) £3 above £10,000.\n" : "") +
      "FX 0.30% if not funded in the listing currency.",
  };
}

// Crypto is priced by Trading212 itself, not by an exchange, so nothing in `spread.json` speaks for
// it. What replaces it is the broker's own order review, which quotes a price to buy and, for a
// negative amount, a price to sell: the round trip is the gap between them, and it is the entire
// cost — no commission, no tax, no per-share line anywhere in the response.
function cryptoCost(row, answer) {
  const quote = cryptoFile?.quotes?.[row.code] ?? null;
  const listing = {
    isin: null,
    ticker: row.ticker,
    name: row.name,
    code: row.code,
    type: "CRYPTO",
    mic: null,
    exchange: "Trading212 (teneur de marché)",
    currency: String(row.currency || "").toUpperCase(),
  };
  if (!quote?.roundTrip) {
    return { ...answer, listing, why: `aucun écart relevé pour ${row.ticker} : lancer trading212/t212-crypto.mjs` };
  }
  return {
    ...answer,
    a: Number(quote.roundTrip.toPrecision(4)),
    b: 0,
    c: 0,
    listing,
    parts: { marché: Number(quote.roundTrip.toPrecision(4)), taxes: null, réglementaire: null },
    quote: { achat: quote.ask, vente: quote.bid, milieu: quote.mid, relevé: quote.at },
    basis: "relevé sur la revue d'ordre de Trading212, les deux sens au même instant",
    confidence:
      `l'écart est celui que le courtier cotait au moment du relevé et il bouge avec le marché ; ` +
      `un aller-retour réel de ${CRYPTO_CHECK.amount} € sur ${CRYPTO_CHECK.pair} a payé ` +
      `${(100 * CRYPTO_CHECK.measured).toFixed(2)} % contre ${(100 * CRYPTO_CHECK.quoted).toFixed(2)} % annoncés, ` +
      `soit ×${(CRYPTO_CHECK.measured / CRYPTO_CHECK.quoted).toFixed(2)}` +
      (quote.roundTrip < 0.001 ? ` — attention, un écart aussi petit sur un prix à ${quote.mid} tient à l'arrondi et n'est pas fiable` : ""),
    check: {
      bp: Number((1e4 * CRYPTO_CHECK.measured).toFixed(0)),
      trips: 1,
      range: [CRYPTO_CHECK.paid, CRYPTO_CHECK.paid],
      on: CRYPTO_CHECK.on,
      ratio: Number((CRYPTO_CHECK.measured / CRYPTO_CHECK.quoted).toFixed(2)),
      note: row.ticker === CRYPTO_CHECK.pair ? null : `mesuré sur ${CRYPTO_CHECK.pair}, pas sur cette paire`,
    },
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: FX_EACH_WAY * 2,
    remark: "Broker spread. FX 0.30% if not funded in the listing currency.",
  };
}

const checkFor = (listing, used) => {
  const check = CHECKS[`${listing.isin}|${listing.mic}|${listing.currency}`];
  if (!check) return null;
  const published = used?.perShare ?? used?.bp;
  const measured = check.perShare ?? check.bp;
  return { ...check, ratio: published ? Number((measured / published).toFixed(2)) : null };
};

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "place non dite"}`).slice(0, 12);

// Never silently confident. The regimes are not equally well established and the differences are
// large enough to matter to whoever reads the number.
function confidenceOf({ marketBp, marketPerShare, taxTotal, american, tax, type }) {
  const said = [];

  if (taxTotal > 0) {
    said.push(
      `la taxe est lue sur la divulgation de coûts du courtier pour cette ligne précise, ce qui est plus sûr que tout le reste ici : ` +
        `elle vaut ${(100 * taxTotal).toFixed(2)} % du montant et pèse donc ` +
        `${marketBp ? `${(1e4 * taxTotal / marketBp).toFixed(0)} fois le carnet` : "bien plus que le carnet"}`
    );
    said.push(
      `et elle est bien prélevée, pas seulement annoncée : ${TAX_CHECK.amount} € de ${TAX_CHECK.pair} achetés puis revendus ` +
        `le ${TAX_CHECK.on} ont coûté ${TAX_CHECK.paid} €, soit les ${(100 * TAX_CHECK.tax).toFixed(2)} % de taxe plus ${TAX_CHECK.residual} pb de carnet ; ` +
        `le timbre britannique a été vérifié de la même façon, à 0,5 % près du centime`
    );
  } else if (tax?.assumedZero && !american) {
    said.push(tax.why);
  } else if (tax && !tax.known && !american) {
    said.push(`fiscalité non établie pour cette ligne : ${tax.why}`);
  }

  if (marketBp != null) {
    // The error bar comes from twenty-seven round trips on funds. Three shares have since been
    // round-tripped as well — Eutelsat, HSBC, and Apple. The two European ones landed within a
    // basis point of the published book once tax and conversion were taken out. Apple did not:
    // Rule 605 is a hundred-share average, and one share paid eleven times that. The message
    // says so rather than borrowing the funds' confidence for a family that has not earned it.
    const onFunds = type === "ETF" ? "" : ` — l'écart-type vient de fonds ; deux actions seulement ont été tradées, et toutes deux sont tombées à un point de base près`;
    said.push(
      marketBp <= NARROW_BP
        ? `carnet serré : sur les trois fonds de ce régime qui ont été tradés, l'estimation est tombée à 6 % près${onFunds}`
        : `carnet large (plus de ${NARROW_BP} bp) : dans ce régime l'estimation s'est trompée d'un facteur deux dans les deux sens, compter de ${(marketBp * 0.5).toFixed(1)} à ${(marketBp * 1.8).toFixed(1)} bp${onFunds}`
    );
  } else if (marketPerShare != null) {
    said.push(
      `le carnet vient des rapports Rule 605, moyenne mensuelle des ordres de 100 à 499 parts` +
        (marketPerShare > 0.01
          ? ` ; à ${marketPerShare} $ par part ce bucket est déjà large`
          : ` ; à ${marketPerShare} $ par part ce bucket est serré`)
    );
    said.push(
      `une part de ${US_CHECK.pair} le ${US_CHECK.on} a coûté ${US_CHECK.paid} € (${US_CHECK.perShare} $ de carnet) ` +
        `contre ${US_CHECK.published} $ publiés, soit ×${US_CHECK.ratio} — un ordre d'une part paie plus que cette moyenne, ` +
        `et le 605 reste la figure pour un ordre de cent parts`
    );
  } else if (type !== "CRYPTO") {
    said.push(`aucun carnet relevé sur cette ligne : seules les taxes et les frais réglementaires sont comptés, le spread manque`);
  }

  if (american) said.push(`frais réglementaires américains à la vente, arrondis au cent, donc nuls en dessous d'une trentaine de parts`);

  return said.join(" ; ");
}

// ------------------------------------------------------------------------------- entrée

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };
  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;

  if (!etf) {
    console.error(
      "usage : node trading212_cost.mjs <ticker|ISIN|code> [place] [devise] [--shares=n] [--price=p] [--bp=x] [--json]\n" +
        '  ex.  node trading212_cost.mjs IUSQ "Deutsche Börse Xetra" EUR --shares=20\n' +
        '       node trading212_cost.mjs HSBA "London Stock Exchange" GBX --shares=100\n' +
        "       node trading212_cost.mjs BTC/EUR"
    );
    process.exit(2);
  }

  const out = roundTripCost({ etf, place, currency, bp: flag("bp") ? Number(flag("bp")) : null });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else if (out.a == null) {
    console.log(`a = null   b = ${out.b}   c = ${out.c}\n${out.why}`);
    if (out.alternatives?.length) console.log(`\nce que Trading212 propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
  } else {
    const l = out.listing;
    console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
    console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${l.type?.toLowerCase() || "?"}\n`);

    const detail = [];
    if (out.parts?.marché != null) detail.push(`carnet ${out.parts.marché}`);
    for (const [name, rate] of Object.entries(out.parts?.taxes ?? {})) detail.push(`${name} ${rate}`);
    if (out.parts?.réglementaire) detail.push(`SEC ${out.parts.réglementaire.SEC}`);
    console.log(`a = ${out.a}   (au prorata du montant${detail.length ? " : " + detail.join(" + ") : ""})`);
    console.log(`b = ${out.b} $   (par part${out.b ? " : taxe FINRA sur la vente" : " : rien"})`);
    console.log(`c = ${out.c} $   (par ordre : ni commission, ni garde, ni plateforme)`);
    const fx = out.fx?.listing ?? usdPer(l.currency);
    console.log(`\ncoût = ${out.a} × p × n × ${fx != null ? Number(fx.toPrecision(6)) : "?"} + ${out.b} × n + ${out.c}   ($ ; p en ${l.currency})`);
    console.log(`  ${out.basis}`);

    if (out.threshold) console.log(`  au-delà de ${out.threshold.above} ${out.threshold.aboveCurrency || out.threshold.currency}, ajouter ${out.threshold.c} $ — ${out.threshold.why}`);
    if (out.cap) console.log(`  plafond sur b : ${out.cap.b} $ — ${out.cap.why}`);
    if (out.quote) console.log(`  achat ${out.quote.achat}, vente ${out.quote.vente}, milieu ${out.quote.milieu}`);
    for (const line of out.confidence.split(" ; ")) console.log(`  ${line}`);
    if (out.check)
      console.log(
        `  vérification : ${out.check.trips} aller${out.check.trips > 1 ? "s" : ""}-retour${out.check.trips > 1 ? "s" : ""} réel${
          out.check.trips > 1 ? "s" : ""
        } le ${out.check.on} ${out.check.ratio ? `soit ×${out.check.ratio}` : ""}${out.check.note ? ` (${out.check.note})` : ""}`
      );

    const n = Number(flag("shares"));
    const p = Number(flag("price"));
    if (n > 0 && p > 0) {
      const amount = n * p;
      const amountUsd = toUsd(amount, l.currency);
      const extra = out.threshold && amount >= out.threshold.above ? out.threshold.c : 0;
      console.log(`\n${n} part${n > 1 ? "s" : ""} à ${p} ${l.currency} = ${amount.toFixed(2)} ${l.currency}` + (amountUsd != null ? ` (${amountUsd.toFixed(2)} $)` : ""));
      if (amountUsd != null) {
        console.log(`  aller-retour : ${(out.a * amountUsd + out.b * n + out.c + extra).toFixed(3)} $${extra ? ` (dont ${extra} $ de prélèvement PTM)` : ""}`);
        console.log(`  si la devise du compte diffère, ajouter ${(out.fxIfConverted * amountUsd).toFixed(2)} $ de change`);
      }
    }
    if (out.url) console.log(`\n${out.url}`);
  }
}
