// For one listing, one venue and one currency, the three coefficients of
//
//     coût (USD) = a × p × n + b × n + c
//
// on Sarwa, with n the number of shares and p the share price. Sarwa is an Abu
// Dhabi company (FSRA, ADGM) selling an American book: the catalogue is all US
// listings quoted in dollars, plus a short shelf of coins. The account itself is
// in dollars.
//
// Sarwa does not execute anything. It is a fully disclosed introducing partner of
// Alpaca Securities LLC, built on Alpaca's Broker API, which is why this
// catalogue is Alpaca's own asset list down to the venue codes — `ARCA` folded
// into AMEX, and `FTXU` still printed on the crypto rows.
//
// ---- what Sarwa charges ----
//
// One line, and it is the whole schedule for a share: the greater of $1 or 0.25 %
// of the order amount, on the buy and again on the sell. So `a` is 0.005 and the
// round trip cannot cost less than $2. The minimum bites under $400 an order,
// where it is worth more than the percentage.
//
// That $1 is not a `c`. A `c` would be charged on every order whatever its size,
// and here the percentage takes over as soon as the order is worth $400. It is a
// floor on the round trip, which is what `floor` and the `min fees` remark say.
//
// ---- what Sarwa does not charge ----
//
// Nothing per share. The pricing page makes the point against its competitors in
// as many words — "No fee per share, no withdrawal fee, no inactivity fee, or
// custody fee" — so `b` carries the market's effective spread and nothing else.
// No account opening, custody, closing or inactivity fee either.
//
// ---- what nobody publishes ----
//
// The American regulators. Alpaca pays the SEC fee, FINRA's TAF and the CAT levy
// on every one of these trades, and Alpaca's Broker API has a `passThroughFees`
// switch that decides whether the partner's client sees them. Sarwa's fee page
// and its help centre both name one charge and stop there, so this file prices
// one charge and stops there. The omission is worth 0,00206 % of a sale plus two
// hundredths of a cent a share: against a commission of 0,5 % it cannot move a
// decision, and inventing it would be worse than leaving it out.
//
// ---- the dirham ----
//
// The account is in dollars and only in dollars, so a trade needs no conversion
// and the `a` above is complete. Funding it does: Sarwa sells dollars at 3.6823
// dirhams and buys them back at 3.6639, against a peg of 3.6725, which is 0.27 %
// going in, 0.23 % coming out, and almost exactly 0.50 % for the money's own
// round trip. That is a cost of the account, not of the trade — a UAE resident
// pays it once however many shares it later buys — so it stays out of `a` and is
// named in `fees.fx` instead.
//
// ---- crypto ----
//
// No commission, and a spread inside the price worth 1.50 % a leg — three
// percent for the round trip, which makes this the dearest coin on the shelf by
// some way. Sarwa's guide still advertises half of that. It is wrong, and
// `CRYPTO_CHECK` holds the ticket that says so.
//
//   node sarwa/sarwa_cost.mjs VOO
//   node sarwa/sarwa_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node sarwa/sarwa_cost.mjs BTC
//   node sarwa/sarwa_cost.mjs --schedule
//
// `roundTripCost(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue } from "../venues.mjs";
import { plus, finite, bookParts } from "../na.mjs";
import { QUOTE } from "../fx.mjs";

const CATALOGUE = new URL("sarwa-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  pricing: "https://www.sarwa.co/en/pricing",
  trade: "https://help.sarwa.co/hc/en-us/articles/4410507627281-What-are-the-fees-for-Sarwa-Trade",
  fx: "https://help.sarwa.co/hc/en-us/articles/4407308904337-What-FX-rates-are-charged",
  crypto: "https://www.sarwa.co/blog/how-to-buy-bitcoin-in-uae/",
  carrier: "https://alpaca.markets/blog/sarwa-first-fintech-to-launch-options-trading-in-the-middle-east/",
  readOn: "2026-09-13",
};

// The whole of the equity card.
const COMMISSION_RATE = 0.0025;
const COMMISSION_MIN = 1;

// Below this the dollar is worth more than the percentage. 1 / 0.0025.
const MIN_BITES_UNDER = COMMISSION_MIN / COMMISSION_RATE;

// Inside the price, each way. Measured, against Sarwa's own guide, which says
// half of this and is wrong: see `CRYPTO_CHECK`.
const CRYPTO_SPREAD_EACH_WAY = 0.015;

// A live buy ticket on bitcoin, read at 11:29 Paris on 2026-09-13 and not
// confirmed. The app showed two prices on one screen: 76 687.93 $ on the chart,
// 77 806.88 $ on the ticket. The independent tape at that minute — Binance
// BTCUSDT, which opened the minute at 76 680.00 and closed it at 76 655.76 —
// says the chart was the market, so the gap is Sarwa's and nobody else's.
//
// That gap is 1.47 % against the start of the minute and 1.50 % against its end,
// so the leg costs 1.50 % and the screenshot cannot say it more precisely than
// the second it was taken. Sarwa's own guide claims 0.75 %, which the reading
// misses by 544 $ on a 77 800 $ coin; 1.50 % misses by 31 $, four hundredths of
// a percent. The guide is stale, and the schedule it describes has doubled.
//
// The 100 $ entered bought 0.001285233 units at exactly the ticket price, to the
// sixth decimal, so nothing is charged beside the price: the "zero commission"
// is true and irrelevant.
//
// The sell leg is not measured — quoting it needs a position, and this account
// held none. It is priced at the same 1.50 % on the strength of the review that
// the buy leg has just confirmed, which states both legs explicitly. Robinhood
// is the warning here: its markup turned out to sit entirely on the buy.
const CRYPTO_CHECK = {
  on: "2026-09-13 11:29 Paris",
  coin: "BTC",
  spent: 100,
  units: 0.001285233,
  ticketPrice: 77806.88,
  chartPrice: 76687.93,
  tape: { source: "Binance BTCUSDT 1 min", open: 76680.0, close: 76655.76, low: 76653.33 },
  markupLow: 0.014696,
  markupHigh: 0.015049,
  guideClaimed: 0.0075,
  sellLegMeasured: false,
};

// Not in the catalogue: the scraper keeps shares, funds and coins.
const OPTION_PER_CONTRACT = 4;

// Dirhams per dollar. The peg is the central bank's, unchanged since 1997.
const AED_FUNDING = 3.6823;
const AED_WITHDRAWAL = 3.6639;
const AED_PEG = 3.6725;

// Card funding, which is not a trading cost either but is the one line that can
// dwarf every other: 2.99 % on a UAE card, 3.99 % on a foreign one.
const CARD_LOCAL = 0.0299;
const CARD_FOREIGN = 0.0399;

const ROUND_TRIP_MIN = 2 * COMMISSION_MIN;
const REMARK_EQUITY = `min fees ${ROUND_TRIP_MIN} $.`;

const catalogue = JSON.parse(fs.readFileSync(CATALOGUE, "utf8"));
const rows = Array.isArray(catalogue) ? catalogue : catalogue.rows || [];
const spreads = JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cryptoBase = (ticker) => String(ticker || "").split("/")[0].toUpperCase();
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));

const fxMarkup = (rate) => Math.abs(rate / AED_PEG - 1);

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
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "USD") ||
      crypto[0];
    return { named, matches: [{ row, venue: null }] };
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

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0 });
    slot.n += 1;
    if (isCrypto(r)) continue;
    const { venue } = listingKey(r);
    const leaf =
      venue?.mic &&
      spreads[String(r.isin || "").toUpperCase()]?.[venue.mic]?.[String(r.currency || "USD").toUpperCase()];
    if (leaf?.bp != null || leaf?.perShare != null) slot.withBook += 1;
  }
  return out;
}

export function roundTripCost({
  etf,
  place,
  currency,
  bp = null,
  perShare = null,
  commission = COMMISSION_RATE,
}) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    a: null,
    // Sarwa charges nothing per share: whatever lands in b is the book's.
    b: null,
    c: 0,
    ccy: QUOTE,
    floor: { amount: ROUND_TRIP_MIN, per: "aller-retour", each: COMMISSION_MIN },
    cap: null,
    etf,
    place,
    currency,
  };

  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Sarwa` };

  const cryptoRow = named.find(isCrypto);
  if (cryptoRow && (!place || /crypto/i.test(place))) {
    const picked = matches[0]?.row || cryptoRow;
    return cryptoCost(picked, answer);
  }

  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Sarwa`,
      alternatives: named
        .map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`)
        .slice(0, 12),
    };
  }

  const m = matches[0];
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
    otc: false,
  };

  const leaf = (listing.mic && spreads[listing.isin]?.[listing.mic]?.[listing.currency]) || null;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const mkt = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (x) => x,
  });

  return {
    ...answer,
    a: finite(plus(2 * commission, mkt.a), 4),
    b: finite(mkt.b, 6),
    listing,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? null,
    basis:
      bp || perShare
        ? "imposé"
        : marketBp != null || marketPerShare != null
          ? "publié"
          : "frais seuls",
    fees: {
      commissionOfAmountEachWay: commission,
      commissionMinEachWay: COMMISSION_MIN,
      minBitesUnder: MIN_BITES_UNDER,
      perShare: 0,
      secOfAmount: null,
      tafPerShare: null,
      catPerShareEachWay: null,
      optionPerContract: OPTION_PER_CONTRACT,
      fx: {
        funding: AED_FUNDING,
        withdrawal: AED_WITHDRAWAL,
        peg: AED_PEG,
        inMarkup: Number(fxMarkup(AED_FUNDING).toPrecision(3)),
        outMarkup: Number(fxMarkup(AED_WITHDRAWAL).toPrecision(3)),
        roundTrip: Number((1 - AED_WITHDRAWAL / AED_FUNDING).toPrecision(3)),
        cardLocal: CARD_LOCAL,
        cardForeign: CARD_FOREIGN,
      },
      carrier: "Alpaca Securities LLC",
      schedule: SCHEDULE,
    },
    confidence: confidenceOf({
      market: marketBp ?? marketPerShare,
      match: m,
      touchWide: (marketPerShare ?? 0) > 0.01,
      commission,
      type: listing.type,
    }),
    fxIfConverted: null,
    measured: null,
    remark: REMARK_EQUITY,
  };
}

function cryptoCost(row, answer) {
  const listing = {
    isin: null,
    ticker: row.ticker,
    name: row.name,
    type: "CRYPTO",
    mic: null,
    exchange: "Sarwa (crypto)",
    currency: String(row.currency || "USD").toUpperCase(),
  };
  return {
    ...answer,
    a: Number((CRYPTO_SPREAD_EACH_WAY * 2).toPrecision(4)),
    b: 0,
    c: 0,
    // No minimum is published on a coin, and the commission that carries the
    // equity floor does not exist here.
    floor: null,
    cap: null,
    listing,
    // The account is in dollars and the coin is quoted in dollars.
    cashCurrency: "USD",
    feeMarket: "crypto",
    remark: "",
    parts: { spreadEachWay: CRYPTO_SPREAD_EACH_WAY },
    bp: Number((CRYPTO_SPREAD_EACH_WAY * 2 * 1e4).toFixed(0)),
    perShare: null,
    url: SCHEDULE.crypto,
    basis: `1,50 % d'écart dans le prix, chaque sens, aucune commission, mesuré sur un ticket réel`,
    fees: {
      spreadEachWay: CRYPTO_SPREAD_EACH_WAY,
      commissionOfAmountEachWay: 0,
      secOfAmount: 0,
      tafPerShare: 0,
      carrier: "Alpaca Securities LLC",
      schedule: SCHEDULE,
    },
    confidence:
      `aucune commission : tout est dans l'écart, et il vaut 1,50 % par jambe, soit 3,00 % l'aller-retour. ` +
      `Ticket d'achat réel le ${CRYPTO_CHECK.on}, non validé : l'app affichait ${CRYPTO_CHECK.chartPrice} $ ` +
      `sur le graphique et ${CRYPTO_CHECK.ticketPrice} $ sur le ticket, au même instant et sur le même écran. ` +
      `La bande indépendante (${CRYPTO_CHECK.tape.source}) donne ${CRYPTO_CHECK.tape.open} $ à l'ouverture de la ` +
      `minute et ${CRYPTO_CHECK.tape.close} $ à sa clôture : le graphique de Sarwa était donc bien le marché, ` +
      `et l'écart lui appartient. Cela place la marge entre ` +
      `${(CRYPTO_CHECK.markupLow * 100).toFixed(2)} % et ${(CRYPTO_CHECK.markupHigh * 100).toFixed(2)} % selon la ` +
      `seconde retenue. Les ${CRYPTO_CHECK.spent} $ saisis achetaient ${CRYPTO_CHECK.units} unités exactement au ` +
      `prix du ticket, donc rien n'est prélevé à côté du prix. ` +
      `Le guide de Sarwa annonce encore ${(CRYPTO_CHECK.guideClaimed * 100).toFixed(2)} % : cette lecture le ` +
      `manque de 544 $ sur une pièce à 77 800 $, quand 1,50 % le manque de 31 $. Le guide est périmé. ` +
      `ATTENTION la jambe vendeuse n'est pas mesurée — la coter demande une position, et le compte n'en avait ` +
      `aucune. Elle est supposée symétrique sur la foi de la revue que l'achat vient de confirmer ; ` +
      `chez Robinhood, la marge s'est révélée entière sur l'achat et nulle sur la vente. ` +
      `Le carnet Binance / Coinbase n'est pas ajouté : la traversée est déjà dedans`,
    fxIfConverted: null,
    measured: CRYPTO_CHECK,
  };
}

export function exactCost({
  shares,
  price,
  bp = null,
  perShare = null,
  commission = COMMISSION_RATE,
  crypto = false,
}) {
  const proceeds = shares * price;
  const market = ((bp ?? 0) / 1e4) * proceeds + (perShare ?? 0) * shares;

  if (crypto) {
    const spread = 2 * proceeds * CRYPTO_SPREAD_EACH_WAY;
    return {
      spread: Number(spread.toFixed(6)),
      commission: 0,
      market: Number(market.toFixed(4)),
      alone: Number((spread + market).toFixed(4)),
      marginal: Number((spread + market).toFixed(4)),
    };
  }

  // The greater of the dollar and the percentage, on each of the two orders.
  const leg = Math.max(COMMISSION_MIN, proceeds * commission);
  const fee = 2 * leg;
  return {
    commission: Number(fee.toFixed(6)),
    perLeg: Number(leg.toFixed(6)),
    atMinimum: proceeds * commission < COMMISSION_MIN,
    sec: 0,
    taf: 0,
    cat: 0,
    market: Number(market.toFixed(4)),
    alone: Number((fee + market).toFixed(4)),
    marginal: Number((fee + market).toFixed(4)),
  };
}

const confidenceOf = ({ market, match, touchWide, commission, type }) => {
  const kind = type === "STOCK" ? "action" : type === "ETF" ? "fonds" : type || "titre";
  const base =
    `barème unique de Sarwa Trade (${kind}) : le plus élevé de ${COMMISSION_MIN} $ ou ` +
    `${(commission * 100).toFixed(2)} % du montant, par ordre, donc ${(commission * 200).toFixed(2)} % ` +
    `l'aller-retour et jamais moins de ${ROUND_TRIP_MIN} $. Le minimum mord sous ${MIN_BITES_UNDER} $ par ordre. ` +
    `Rien par part, rien à l'ouverture, à la garde, à la clôture ni à l'inactivité, page tarifaire lue le ${SCHEDULE.readOn}. ` +
    `Sarwa n'exécute pas : elle introduit chez Alpaca Securities, ce qui explique que ce catalogue soit celui d'Alpaca. ` +
    `Les taxes américaines — SEC, TAF de la FINRA, CAT — ne sont nulle part au barème de Sarwa, alors qu'Alpaca ` +
    `les paie et laisse chaque partenaire décider de les refacturer. Elles ne sont donc pas comptées ici : ` +
    `elles vaudraient 0,00206 % d'une vente, un quatre-centième de la commission. ` +
    `Le change dirham est hors de a — le compte est en dollars et un aller-retour de titres n'en demande aucun ; ` +
    `c'est l'argent qui le paie en entrant et en sortant, ${(fxMarkup(AED_FUNDING) * 100).toFixed(2)} % puis ` +
    `${(fxMarkup(AED_WITHDRAWAL) * 100).toFixed(2)} %. Aucun aller-retour réel`;

  if (market == null) {
    return (
      `${base}. Aucun carnet : ${match.unsourced?.name || "cette place"}, ` +
      `${match.unsourced?.why || "pas de source 605"}. À lire comme un plancher`
    );
  }
  return (
    `${base}. Spread effectif publié : moyenne mensuelle sur les ordres immédiats de 100 à 499 ` +
    `parts, cinq teneurs, Citadel et Virtu manquants` +
    (touchWide
      ? `. ATTENTION carnet large : sous 100 parts, l'amélioration de prix que ce chiffre ` +
        `contient n'a pas lieu. Pour un lot rompu, passer la touche cotée en \`perShare\``
      : "")
  );
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = argv.filter((a) => !a.startsWith("--"));

  if (argv.includes("--schedule")) {
    console.log(`barème Sarwa, lu le ${SCHEDULE.readOn}`);
    console.log(`  ${SCHEDULE.pricing}`);
    console.log(`  actions ${SCHEDULE.trade}`);
    console.log(`  change  ${SCHEDULE.fx}`);
    console.log(`  crypto  ${SCHEDULE.crypto}`);
    console.log(`  porteur ${SCHEDULE.carrier}\n`);
    console.log("  actions et ETF, une seule ligne :");
    console.log(`    commission     le plus élevé de ${COMMISSION_MIN} $ ou ${COMMISSION_RATE} du montant, par ordre`);
    console.log(`                   le minimum mord sous ${MIN_BITES_UNDER} $ par ordre, soit ${ROUND_TRIP_MIN} $ l'aller-retour`);
    console.log(`    par part       0 — « No fee per share », page tarifaire`);
    console.log(`    compte         0 à l'ouverture, à la garde, à la clôture, à l'inactivité`);
    console.log(`    SEC / TAF / CAT  non publiées : Alpaca les paie, Sarwa ne dit pas si elle les refacture`);
    console.log(`\n  crypto :`);
    console.log(`    commission     0`);
    console.log(`    écart          ${CRYPTO_SPREAD_EACH_WAY} dans le prix, chaque sens, soit ${(CRYPTO_SPREAD_EACH_WAY * 2 * 100).toFixed(2)} % l'aller-retour`);
    console.log(`                   mesuré le ${CRYPTO_CHECK.on} : ticket ${CRYPTO_CHECK.ticketPrice} $ contre marché ${CRYPTO_CHECK.chartPrice} $`);
    console.log(`                   le guide de Sarwa annonce encore ${CRYPTO_CHECK.guideClaimed}, soit la moitié : il est périmé`);
    console.log(`                   jambe vendeuse non mesurée, supposée symétrique`);
    console.log(`\n  change dirham, hors de a car le compte est en dollars :`);
    console.log(`    entrée         ${AED_FUNDING} AED / USD contre une parité de ${AED_PEG}, soit ${(fxMarkup(AED_FUNDING) * 100).toFixed(2)} %`);
    console.log(`    sortie         ${AED_WITHDRAWAL} AED / USD, soit ${(fxMarkup(AED_WITHDRAWAL) * 100).toFixed(2)} %`);
    console.log(`    aller-retour   ${((1 - AED_WITHDRAWAL / AED_FUNDING) * 100).toFixed(2)} % de l'argent, une fois, pas par ordre`);
    console.log(`    carte          ${CARD_LOCAL} + 1 AED locale, ${CARD_FOREIGN} + 1 AED étrangère`);
    console.log(`\n  hors sujet ici : options ${OPTION_PER_CONTRACT} $ le contrat, Invest 0,4 à 0,85 % l'an, Save 0,5 % l'an`);
    console.log(`  pas au catalogue : options`);
    const cover = coverage();
    if (cover) {
      console.log("\n  catalogue :");
      for (const [type, row] of Object.entries(cover)) {
        const extra = type === "CRYPTO" ? "" : `, ${row.withBook} avec carnet 605, ${row.n - row.withBook} frais seuls`;
        console.log(`    ${String(type).padEnd(6)} ${row.n} lignes${extra}`);
      }
    }
    process.exit(0);
  }

  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node sarwa/sarwa_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json] [--schedule]\n" +
        "  ex.   node sarwa/sarwa_cost.mjs AAPL NASDAQ USD --shares=1 --price=230\n" +
        "        node sarwa/sarwa_cost.mjs VOO\n" +
        "        node sarwa/sarwa_cost.mjs BTC"
    );
    process.exit(1);
  }

  const commission = arg("commission") != null ? Number(arg("commission")) : COMMISSION_RATE;
  const answer = roundTripCost({
    etf,
    place,
    currency,
    bp: arg("bp") != null ? Number(arg("bp")) : null,
    perShare: arg("perShare") != null ? Number(arg("perShare")) : null,
    commission,
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(answer, null, 2));
    process.exit(answer.a == null ? 1 : 0);
  }

  if (!answer.listing) {
    console.error(answer.why);
    if (answer.alternatives?.length) console.error(`  ailleurs : ${answer.alternatives.join(", ")}`);
    process.exit(1);
  }

  const show = (x) => (x == null ? "N/A" : x);
  const l = answer.listing;
  const crypto = l.type === "CRYPTO";
  console.log(`${l.ticker || l.isin} — ${l.name || "sans nom"}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`);
  const marketA = answer.bp != null ? ` + ${answer.bp} bp de carnet` : "";
  const marketB = answer.perShare != null ? `spread effectif ${answer.perShare}` : "carnet inconnu";
  console.log(
    `a = ${show(answer.a)}   (au prorata : ${
      crypto
        ? `écart ${CRYPTO_SPREAD_EACH_WAY} chaque sens, dans le prix`
        : `commission ${commission} aux deux jambes${marketA}`
    })`
  );
  console.log(`b = ${show(answer.b)}   (par part : ${crypto ? "rien" : `aucun frais de Sarwa, ${marketB}`})`);
  console.log(
    `c = ${answer.c}   (par ordre : ${crypto ? "rien, l'écart est dans a" : "rien de fixe, le dollar est un plancher"})`
  );
  console.log(`\ncoût = ${show(answer.a)} × p × n + ${show(answer.b)} × n + ${answer.c}   (${answer.basis})`);
  if (answer.floor?.amount != null) {
    console.log(
      `  plancher ${answer.floor.amount} ${answer.ccy} par ${answer.floor.per} : ` +
        `${answer.floor.each} $ par ordre, qui l'emporte sous ${MIN_BITES_UNDER} $`
    );
  }
  console.log(`  ${answer.confidence}`);
  if (answer.url) console.log(`\n${answer.url}`);

  const shares = arg("shares") != null ? Number(arg("shares")) : null;
  const price = arg("price") != null ? Number(arg("price")) : null;
  if (shares && price) {
    const exact = exactCost({
      shares,
      price,
      bp: answer.bp,
      perShare: answer.perShare,
      commission,
      crypto,
    });
    const affine = plus(
      answer.a == null ? null : answer.a * price * shares,
      answer.b == null ? null : answer.b * shares,
      answer.c
    );
    console.log(`\n${shares} part${shares > 1 ? "s" : ""} à ${price} ${l.currency} :`);
    console.log(`  formule affine            ${affine == null ? "N/A" : affine.toFixed(4)} ${l.currency}`);
    if (crypto) {
      console.log(`  écart ${CRYPTO_SPREAD_EACH_WAY} × 2      ${exact.spread} ${l.currency}`);
    } else {
      console.log(
        `  commission réelle         ${exact.commission} ${l.currency}   (${exact.perLeg} par ordre` +
          (exact.atMinimum ? `, au plancher du dollar` : `, au prorata`) +
          `)`
      );
      const known = answer.bp != null || answer.perShare != null;
      console.log(`  dont marché ${known ? exact.market.toFixed(4) : "N/A"}`);
      console.log(`  total ${known ? exact.alone.toFixed(4) : "N/A"} ${l.currency}`);
      if (exact.atMinimum) {
        console.log(
          `  la formule affine sous-estime : sous ${MIN_BITES_UNDER} $ par ordre c'est le dollar qui s'applique, pas a`
        );
      }
    }
  }
}
