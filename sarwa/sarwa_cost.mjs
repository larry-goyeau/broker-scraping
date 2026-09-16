// What one round trip costs at Sarwa Trade: buy n shares at price p, sell
// them back at once, in dollars. Coins are bought by the amount, so they
// are handed that and no price.
//
// The affine triple hid the dollar floor. A $230 share pays $1 a side, not
// 0.25 %, and the percentage only takes over at $400. `roundTrip` is given
// the size and charges the greater of the two, twice.
//
// Abu Dhabi company (FSRA, ADGM), re-read 2026-09-16 — rates unchanged
// since the 13th. The catalogue is Alpaca's American book in dollars
// (ARCA folded into AMEX) plus 27 coins. Sarwa does not execute: it is a
// fully disclosed introducing partner of Alpaca Securities LLC. The
// account holds dollars and only dollars.
//
//   stocks / ETF / ETN   max($1, 0.25 %) a side
//   crypto               0 commission, 1.50 % inside the price a side
//
// The $1 is in the number, so it stays out of the remark. Nothing per
// share, no opening, custody, closing or inactivity — the pricing page
// says so against the neighbours. Options are $4 a contract and are not
// in this catalogue. Invest (0.4–0.85 % a year) and Save (0.5 %) are
// other products.
//
// SEC / TAF / CAT are not copied. Alpaca pays them and its Broker API
// has a `passThroughFees` switch; Sarwa's fee page and its help centre
// name one charge and stop. Inventing the neighbour's levies would be
// worse than leaving them out. Stamp / FTT come from the tax map.
//
// The account holds dollars. A USD listing (the whole catalogue today)
// needs no conversion and pays none. A line in another currency would
// convert both ways at the published pair — 3.6823 AED in, 3.6639 out,
// against a 3.6725 peg — and that 0.50 % sits in `usd` and `brokerFees`.
// Funding the dollar wallet from dirhams is the same pair used once, not
// per order, so it stays out. A local UAE transfer is free; the card
// (2.99 % + 1 AED local, 3.99 % + 1 AED foreign) is the other door.
//
// Two tickets on 2026-09-13 settle what the cards do not say: a $100
// bitcoin buy filled at the ticket price with no side commission, and
// that ticket sat 1.50 % above the tape. Sarwa's guide still prints
// 0.75 %. The sell leg was not measured — the account held none — and
// is priced at the same 1.50 % on the review the buy confirmed.
// Robinhood is the warning: its markup sat entirely on the buy.
//
//   https://www.sarwa.co/en/pricing
//   https://help.sarwa.co/hc/en-us/articles/4410507627281-What-are-the-fees-for-Sarwa-Trade
//   https://help.sarwa.co/hc/en-us/articles/4407308904337-What-FX-rates-are-charged
//   https://www.sarwa.co/blog/how-to-buy-bitcoin-in-uae/
//
//   node sarwa/sarwa_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node sarwa/sarwa_cost.mjs AAPL NASDAQ USD --shares=1 --price=230
//   node sarwa/sarwa_cost.mjs VOO
//   node sarwa/sarwa_cost.mjs BTC --amount=1000
//   node sarwa/sarwa_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("sarwa-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  pricing: "https://www.sarwa.co/en/pricing",
  trade: "https://help.sarwa.co/hc/en-us/articles/4410507627281-What-are-the-fees-for-Sarwa-Trade",
  fx: "https://help.sarwa.co/hc/en-us/articles/4407308904337-What-FX-rates-are-charged",
  card: "https://help.sarwa.co/hc/en-us/articles/8702263696157-What-are-the-fees-associated-with-card-funding",
  options: "https://help.sarwa.co/hc/en-us/articles/21539119145501-What-are-the-fees-for-trading-options-on-Sarwa",
  crypto: "https://www.sarwa.co/blog/how-to-buy-bitcoin-in-uae/",
  carrier: "https://alpaca.markets/blog/sarwa-first-fintech-to-launch-options-trading-in-the-middle-east/",
  readOn: "2026-09-16",
  previouslyRead: "2026-09-13",
  entity: "Sarwa Digital Wealth (Capital) Limited",
  carrierName: "Alpaca Securities LLC",
};

const COMMISSION_RATE = 0.0025;
const COMMISSION_MIN = 1;
const MIN_BITES_UNDER = COMMISSION_MIN / COMMISSION_RATE;
const CRYPTO_SPREAD_EACH_WAY = 0.015;
const OPTION_PER_CONTRACT = 4;
const AED_FUNDING = 3.6823;
const AED_WITHDRAWAL = 3.6639;
const AED_PEG = 3.6725;
const CARD_LOCAL = 0.0299;
const CARD_FOREIGN = 0.0399;
const CASH = "USD";
const FX_IN = Math.abs(AED_FUNDING / AED_PEG - 1);
const FX_OUT = Math.abs(AED_WITHDRAWAL / AED_PEG - 1);
const FX_TRIP = FX_IN + FX_OUT;

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

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cryptoBase = (ticker) => String(ticker || "").split("/")[0].toUpperCase();
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

function taxParts(isin) {
  const tax = taxesOf(isin);
  const rates = { ...taxRates(tax) };
  delete rates.PTM_LEVY;
  delete rates.PTM;
  const taxTotal = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  return { tax, rates, taxTotal };
}

function commissionEach(notional) {
  if (notional == null || !Number.isFinite(Number(notional))) return null;
  return Math.max(COMMISSION_MIN, Number(notional) * COMMISSION_RATE);
}

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
      crypto.find((r) => String(r.currency).toUpperCase() === CASH) ||
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
    .filter((m) => !wantCurrency || String(m.row.currency || CASH).toUpperCase() === wantCurrency);

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
    const { venue, unsourced } = listingKey(r);
    const { leaf } = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency || CASH,
      unsourced,
    });
    if (leaf?.bp != null || leaf?.perShare != null) slot.withBook += 1;
  }
  return out;
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || CASH} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function needsFx(currency) {
  return String(currency || "").toUpperCase() !== CASH;
}

/**
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling straight back. `usd` is the number the page prints;
 * `brokerFees` is only what Sarwa bills — the $1 / 0.25 % on a share, the
 * 1.50 % inside a coin's price, and the published FX when the listing is
 * not the dollar the account holds. The book and any stamp stay in the total.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount,
  bp = null,
  perShare = null,
}) {
  const { named, matches } = findListing({ etf, place, currency });
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: CASH,
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue Sarwa n'existe pas encore : lancer `node sarwa/sarwa_scraping.mjs`",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Sarwa` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Sarwa`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  if (crypto) return cryptoTrip(m.row, { ...answer, amount, bp });

  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency || CASH,
    unsourced: m.unsourced,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || CASH).toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const { tax, rates, taxTotal } = taxParts(listing.isin);
  const converted = needsFx(listing.currency);

  const shared = {
    ...answer,
    listing,
    feeMarket: "us",
    cashCurrency: CASH,
    onlineBuy: true,
    remark: "",
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.pricing,
    basis: `barème Sarwa Trade, relu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      rate: COMMISSION_RATE,
      min: COMMISSION_MIN,
      cap: null,
      flat: null,
      currency: CASH,
      eachWay: true,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: converted ? FX_TRIP : 0,
    custody: 0,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return {
      ...shared,
      why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        listing,
        leaf,
        marketBp,
        marketPerShare,
        taxTotal,
        unsourced: m.unsourced,
        converted,
      }),
    };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const each = commissionEach(notionalUsd);
  const commissionUsd = each == null ? null : each * 2;
  const bookUsd =
    marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const fxUsd = converted && notionalUsd != null ? notionalUsd * FX_TRIP : 0;
  const usd = plus(bookUsd, commissionUsd, fxUsd, taxUsd);
  const brokerFees = plus(commissionUsd, fxUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: n,
      price: p,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: confidenceOf({
      listing,
      leaf,
      marketBp,
      marketPerShare,
      taxTotal,
      unsourced: m.unsourced,
      each,
      notionalUsd,
      converted,
    }),
  };
}

function cryptoTrip(row, { amount, bp, ...answer }) {
  const listing = {
    isin: null,
    ticker: row.ticker,
    name: row.name,
    type: "CRYPTO",
    mic: null,
    exchange: "Crypto",
    currency: String(row.currency || CASH).toUpperCase(),
    brokerExchange: row.exchange || null,
  };
  const shared = {
    ...answer,
    listing,
    feeMarket: "crypto",
    cashCurrency: CASH,
    onlineBuy: true,
    remark: "",
    bp: Number((CRYPTO_SPREAD_EACH_WAY * 2 * 1e4).toFixed(0)),
    perShare: null,
    url: SCHEDULE.crypto,
    basis: `écart 1,50 % dans le prix chaque sens, mesuré le ${CRYPTO_CHECK.on}`,
    commission: {
      rate: 0,
      min: 0,
      cap: null,
      flat: null,
      currency: CASH,
      eachWay: true,
      spreadEachWay: CRYPTO_SPREAD_EACH_WAY,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    custody: 0,
    measured: CRYPTO_CHECK,
  };

  const cash = Number(amount);
  if (!(cash > 0)) {
    return {
      ...shared,
      why: "aucun montant",
      confidence: cryptoConfidence(),
    };
  }

  const notionalUsd = dollars(cash, CASH);
  const bookUsd = notionalUsd == null ? null : notionalUsd * CRYPTO_SPREAD_EACH_WAY * 2;
  // The guide's 0.75 % is not added on top: the ticket already is the price.
  const usd = plus(bookUsd, 0);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(bookUsd, 6),
    trade: {
      shares: null,
      price: null,
      amount: cash,
      notional: cash,
      notionalUsd: finite(notionalUsd, 6),
      currency: CASH,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: 0,
      taxes: 0,
    },
    confidence: cryptoConfidence({ amount: cash, bp }),
  };
}

function confidenceOf({
  listing,
  leaf,
  marketBp,
  marketPerShare,
  taxTotal,
  unsourced,
  each,
  notionalUsd,
  converted,
}) {
  const kind = listing.type === "STOCK" ? "action" : listing.type === "ETF" ? "fonds" : listing.type || "titre";
  const said = [];
  said.push(
    `barème unique de Sarwa Trade (${kind}) : le plus élevé de ${COMMISSION_MIN} $ ou ` +
      `${(COMMISSION_RATE * 100).toFixed(2)} % du montant, par ordre, relu le ${SCHEDULE.readOn} ` +
      `(inchangé depuis le ${SCHEDULE.previouslyRead})`
  );
  if (each != null && notionalUsd != null) {
    said.push(
      each === COMMISSION_MIN
        ? `plancher ${COMMISSION_MIN} $ par jambe, le dollar mord sous ${MIN_BITES_UNDER} $`
        : `au prorata, le notionnel dépasse ${MIN_BITES_UNDER} $`
    );
  }
  said.push(
    `rien par part, rien à l'ouverture, à la garde, à la clôture ni à l'inactivité, page tarifaire`
  );
  said.push(
    `Sarwa n'exécute pas : elle introduit chez ${SCHEDULE.carrierName}, ce qui explique que ce catalogue soit celui d'Alpaca`
  );
  said.push(
    `SEC / TAF / CAT absents du barème Sarwa : Alpaca les paie et laisse chaque partenaire décider de les refacturer, ` +
      `elles ne sont donc pas inventées ici`
  );
  if (converted) {
    said.push(
      `change ${(100 * FX_TRIP).toFixed(2)} % l'aller-retour dans le total : la ligne n'est pas en dollar, ` +
        `paire publiée ${AED_FUNDING} / ${AED_WITHDRAWAL} contre ${AED_PEG}`
    );
  } else {
    said.push(
      `change hors du total : la ligne est déjà en dollar, ${(100 * FX_IN).toFixed(2)} % seulement ` +
        `à l'entrée en dirhams (${AED_FUNDING} contre une parité de ${AED_PEG})`
    );
  }
  if (taxTotal > 0) said.push(`taxe de transfert ${(100 * taxTotal).toFixed(2)} % prise dans la carte des taxes`);
  if (marketBp == null && marketPerShare == null) {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source 605"}`
    );
  } else if (marketBp != null) {
    said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  } else if (marketPerShare != null) {
    said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  }
  if (!leaf) said.push(`carnet absent pour cette ligne`);
  said.push(`aucun aller-retour réel dans ce dépôt`);
  return said.join(" ; ");
}

function cryptoConfidence() {
  const said = [
    `aucune commission : tout est dans l'écart, et il vaut 1,50 % par jambe, soit 3,00 % l'aller-retour`,
    `ticket d'achat réel le ${CRYPTO_CHECK.on}, non validé : l'app affichait ${CRYPTO_CHECK.chartPrice} $ ` +
      `sur le graphique et ${CRYPTO_CHECK.ticketPrice} $ sur le ticket, au même instant`,
    `la bande indépendante (${CRYPTO_CHECK.tape.source}) donne ${CRYPTO_CHECK.tape.open} $ à l'ouverture de la ` +
      `minute et ${CRYPTO_CHECK.tape.close} $ à sa clôture : le graphique était le marché`,
    `cela place la marge entre ${(CRYPTO_CHECK.markupLow * 100).toFixed(2)} % et ` +
      `${(CRYPTO_CHECK.markupHigh * 100).toFixed(2)} % selon la seconde retenue`,
    `les ${CRYPTO_CHECK.spent} $ saisis achetaient ${CRYPTO_CHECK.units} unités exactement au prix du ticket`,
    `le guide de Sarwa annonce encore ${(CRYPTO_CHECK.guideClaimed * 100).toFixed(2)} % : cette lecture le ` +
      `manque de 544 $ sur une pièce à 77 800 $, quand 1,50 % le manque de 31 $`,
    `ATTENTION la jambe vendeuse n'est pas mesurée — la coter demande une position, et le compte n'en avait ` +
      `aucune. Elle est supposée symétrique sur la foi de la revue que l'achat vient de confirmer`,
    `le carnet Binance / Coinbase / ALPA n'est pas ajouté : la traversée est déjà dans les 1,50 %`,
    `bitcoin pris pour plancher : les 26 autres pièces n'ont pas de ticket`,
  ];
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  const positional = argv.filter((a) => !a.startsWith("--"));

  if (argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          commissionRate: COMMISSION_RATE,
          commissionMin: COMMISSION_MIN,
          minBitesUnder: MIN_BITES_UNDER,
          cryptoSpreadEachWay: CRYPTO_SPREAD_EACH_WAY,
          cryptoCheck: CRYPTO_CHECK,
          optionPerContract: OPTION_PER_CONTRACT,
          aed: {
            funding: AED_FUNDING,
            withdrawal: AED_WITHDRAWAL,
            peg: AED_PEG,
            inMarkup: Number(FX_IN.toPrecision(3)),
            outMarkup: Number(FX_OUT.toPrecision(3)),
            roundTrip: Number(FX_TRIP.toPrecision(3)),
            cardLocal: CARD_LOCAL,
            cardForeign: CARD_FOREIGN,
          },
          cashCurrency: CASH,
          coverage: coverage(),
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node sarwa/sarwa_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=usd]\n" +
        "        [--json] [--schedule]\n" +
        "  ex.   node sarwa/sarwa_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node sarwa/sarwa_cost.mjs AAPL NASDAQ USD --shares=1 --price=230\n" +
        "        node sarwa/sarwa_cost.mjs VOO\n" +
        "        node sarwa/sarwa_cost.mjs BTC --amount=1000"
    );
    process.exit(1);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: arg("shares") != null ? Number(arg("shares")) : null,
    price: arg("price") != null ? Number(arg("price")) : null,
    amount: arg("amount") != null ? Number(arg("amount")) : null,
    bp: arg("bp") != null ? Number(arg("bp")) : null,
    perShare: arg("perShare") != null ? Number(arg("perShare")) : null,
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Sarwa propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.feeMarket}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    if (t.amount != null) {
      console.log(`${t.amount} ${t.currency} aller-retour\n`);
    } else {
      console.log(
        `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
          (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
          "\n"
      );
    }
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const p = out.parts || {};
    if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
    if (p.courtage != null) console.log(`  courtage       : ${p.courtage} $`);
    if (p.change) console.log(`  change         : ${p.change} $`);
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
