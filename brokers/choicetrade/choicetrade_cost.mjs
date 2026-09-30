// What one round trip costs at ChoiceTrade: buy n shares at price p, sell
// them back at once, market, regular hours, online platform, in dollars.
//
// The affine triple this file used to answer hid two cliffs and a ceiling.
// Listed names under a dollar pay the $25 OTC ticket, but `roundTripCost`
// called `ticketEach({ market })` without a price, so every listed line came
// back at $0 — including the penny stocks. OTC trades above 10 000 shares add
// $0.002 a share; that lived only in `exactCost`, which the page never called.
// FINRA's $9.79 TAF cap sat in a `cap` field with no column. `roundTrip` is
// given the size and charges what is charged.
//
// ChoiceTrade (US). The catalogue is American (`choicetrade_scraping.mjs`):
// 19 843 lines on 2026-09-15 — 6 551 ETFs, 13 215 stocks, 7 616 of them OTC.
// Options are not in the book and are not priced.
//
// Barème relu le 2026-09-15 sur https://www.choicetrade.com/pricing.php.
// Inchangé depuis le 10. Commission par sens, plateforme online :
//
//   NYSE / Nasdaq / AMEX (and the NMS tapes in this catalogue — ARCA, BATS,
//   IEX) at $1.00 or above     $0
//   Everything else, ≤ 10 000 shares     $25
//   Shares above 10 000                  + $0.002 / share
//
// "$0 comm applies to online platform." DAY+EXT ($0.005 / share), daytrading
// ($0.002), Elite ($0.002) and DAS ($0.003) are other platforms and are not
// this trip. Broker-assist is $30 on top and is not this trip either.
//
// "All Regulatory, Exchange, OCC … surcharges, if applicable, are extra."
// SEC and TAF use the current figures the other US files use. CAT, NSCC
// illiquid charges and venue fees are not on the card and stay out of the
// number rather than being borrowed from a neighbour.
//
// What is in the number: the commission each way, including the $1 listed
// cliff and the 10 000-share OTC add-on; SEC on the sale; TAF on the sale,
// capped at $9.79; French FTT on the ADRs that carry it, from the tax map;
// the market spread, once.
//
// What stays in the remark: inactivity ($55 / quarter unless 5 trades;
// fractionals do not count), $10 / month on a non-US account, and on an OTC
// line the carrying fee ($40 / month, $100 at 100 000 shares). Wires
// ($35 domestic / $60 foreign), ACH out ($5) and the $100 minimum balance
// are the same kind of thing and stay out of the total.
//
// No live trip is in this deposit yet.
//
//   https://www.choicetrade.com/pricing.php
//
//   node choicetrade/choicetrade_cost.mjs IAU --shares=1 --price=82
//   node choicetrade/choicetrade_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node choicetrade/choicetrade_cost.mjs AGSCF OTC USD --shares=1 --price=2
//   node choicetrade/choicetrade_cost.mjs AGSCF OTC USD --shares=12000 --price=2
//   node choicetrade/choicetrade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("choicetrade-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.choicetrade.com/pricing.php",
  readOn: "2026-09-15",
  previouslyRead: "2026-09-10",
  entity: "ChoiceTrade (US)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const LISTED_MIN_PRICE = 1;
const OTC_TICKET = 25;
const OTC_OVER_SHARES = 10000;
const OTC_OVER_PER_SHARE = 0.002;

const WITHDRAW = { ach: 5, wireDomestic: 35, wireForeign: 60, ccy: "USD" };
const INACTIVITY = { amount: 55, per: "quarter", waivedAt: 5, ccy: "USD" };
const NON_US_MONTHLY = { amount: 10, ccy: "USD" };
const OTC_CARRY = { under100k: 40, at100k: 100, ccy: "USD" };

const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|BATS|CBOE|IEX)$/;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function feeMarketOf(row, mic) {
  const code = loose(row?.exchange);
  const m = String(mic || "").toUpperCase();
  if (LISTED_MICS.has(m) || LISTED_CODES.test(code)) return "listed";
  if (code === "OTC" || code === "PINK" || /^(OTC|PINK|GREY)/.test(code)) return "otc";
  return "otc";
}

/**
 * One side, in dollars. Listed at $1 or more is free. A listed print under a
 * dollar, and every OTC fill, is the $25 ticket; shares past 10 000 add $0.002.
 */
export function commissionSide({ market, price, shares } = {}) {
  const n = shares == null ? null : Number(shares);
  const p = price == null ? null : Number(price);
  if (market === "listed") {
    if (p == null || !Number.isFinite(p)) return null;
    if (p >= LISTED_MIN_PRICE) return { charged: 0, ticket: 0, overage: 0, currency: "USD" };
  }
  if (market !== "listed" && market !== "otc") return null;
  if (n == null || !Number.isFinite(n)) return null;
  const over = n > OTC_OVER_SHARES ? (n - OTC_OVER_SHARES) * OTC_OVER_PER_SHARE : 0;
  return { charged: OTC_TICKET + over, ticket: OTC_TICKET, overage: over, currency: "USD" };
}

function remarkOf(market) {
  const lines = [
    `Inactivity $${INACTIVITY.amount}/${INACTIVITY.per} unless ${INACTIVITY.waivedAt} trades.`,
    `$${NON_US_MONTHLY.amount}/month for non-U.S. accounts.`,
  ];
  if (market === "otc") {
    lines.push(`OTC carrying $${OTC_CARRY.under100k}/month ($${OTC_CARRY.at100k} at 100k shares).`);
  }
  return lines.join("\n");
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rowsNamed(rows, asked, 
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const matches = named
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
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    const book = spreadLeaf(spreads, {
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

/**
 * The whole bill for buying `shares` at `price` and selling them straight back.
 * `usd` is the number the page prints; `brokerFees` is the commission alone.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = { usd: null, brokerFees: null, etf, place, currency, onlineBuy: true, cashCurrency: "USD" };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue ChoiceTrade n'existe pas encore : lancer `node choicetrade/choicetrade_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ChoiceTrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ChoiceTrade`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "choicetrade",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "USD").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row, listing.mic);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
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
    remark: remarkOf(market),
    withdraw: WITHDRAW,
  };

  const n = Number(shares);
  const p = Number(price);
  const hasN = n > 0;
  const hasP = p > 0;
  const basis =
    `barème ChoiceTrade online, palier ${market}, relu le ${SCHEDULE.readOn}` +
    (market === "listed"
      ? ` : 0 $ au-dessus de ${LISTED_MIN_PRICE} $, ticket ${OTC_TICKET} $ en dessous`
      : ` : ${OTC_TICKET} $ par sens, + ${OTC_OVER_PER_SHARE} $ / part au-delà de ${OTC_OVER_SHARES}`);

  if (!hasN) {
    return {
      ...shared,
      basis,
      why: "aucun nombre de parts",
      confidence: confidenceOf({ market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct }),
    };
  }
  if (market === "listed" && !hasP) {
    return {
      ...shared,
      basis,
      why: "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({ market, listing, leaf, marketBp, marketPerShare, unsourced: m.unsourced, taxPct, n }),
    };
  }

  const notional = hasP ? n * p : null;
  const notionalUsd = hasP ? toUsd(notional, listing.currency) : null;
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buy = commissionSide({ market, price: hasP ? p : null, shares: n });
  const sell = commissionSide({ market, price: hasP ? p : null, shares: n });
  const buyUsd = buy?.charged ?? null;
  const sellUsd = sell?.charged ?? null;
  const brokerFees = plus(buyUsd, sellUsd);

  const secUsd = notionalUsd == null ? null : notionalUsd * SEC_RATE;
  const tafUsd = Math.min(TAF_CAP, TAF_PER_SHARE * n);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;

  const usd = plus(bookUsd, brokerFees, secUsd, tafUsd, taxUsd);

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
    trade: {
      shares: n,
      price: hasP ? p : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    buy: {
      commission: finite(buyUsd, 6),
      native: buy,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell,
      sec: finite(secUsd, 6),
      taf: finite(tafUsd, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd), 6),
    },
    commission: {
      each: buy?.charged ?? null,
      ticket: buy?.ticket ?? null,
      overage: buy?.overage ?? null,
      currency: "USD",
      eachWay: true,
      platform: "online",
    },
    basis,
    confidence: confidenceOf({
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      buy,
      n,
      p: hasP ? p : null,
      tafUsd,
    }),
  };
}

function confidenceOf({
  market,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  buy,
  n,
  p,
  tafUsd,
}) {
  const said = [];
  said.push(
    `commission ChoiceTrade online, palier ${market}, page lue le ${SCHEDULE.readOn} ` +
      `(inchangée depuis le ${SCHEDULE.previouslyRead})`
  );
  if (market === "listed") {
    said.push(
      p != null && p < LISTED_MIN_PRICE
        ? `imprimé sous ${LISTED_MIN_PRICE} $ : ticket ${OTC_TICKET} $ par sens, le palier « All other U.S. Stock Trades »`
        : `0 $ par sens au-dessus de ${LISTED_MIN_PRICE} $. DAY+EXT, daytrading, Elite et DAS ne sont pas cet aller-retour`
    );
  } else {
    said.push(
      `ticket ${OTC_TICKET} $ par sens` +
        (buy?.overage
          ? `, plus ${Number(buy.overage.toPrecision(4))} $ au-delà de ${OTC_OVER_SHARES} parts`
          : `, sans le ${OTC_OVER_PER_SHARE} $ / part tant que l'ordre reste sous ${OTC_OVER_SHARES} parts`)
    );
  }
  said.push(
    `SEC ${SEC_RATE} du montant à la vente, TAF FINRA ${TAF_PER_SHARE} $ la part ` +
      `(plafond ${TAF_CAP} $)` +
      (tafUsd != null && n != null && TAF_PER_SHARE * n > TAF_CAP
        ? ` — le plafond mord : ${Number(tafUsd.toPrecision(4))} $`
        : "")
  );
  if (taxPct) said.push(`taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs`);
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) {
    said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
  } else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    `hors total : CAT, NSCC illiquide et frais de place, « extra » sur la page sans tarif. ` +
      `Inactivité ${INACTIVITY.amount} $ / trimestre sous ${INACTIVITY.waivedAt} trades, ` +
      `${NON_US_MONTHLY.amount} $ / mois hors US` +
      (market === "otc"
        ? `, portage OTC ${OTC_CARRY.under100k} $ / mois (${OTC_CARRY.at100k} $ à 100 000 parts)`
        : "") +
      `. Compte en dollars, aucune conversion. Aucun aller-retour réel dans ce dépôt`
  );
  if (leaf == null && market === "listed") said.push(`pas de feuille 605 pour ${listing.isin}`);
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
          listed: { commission: 0, minPrice: LISTED_MIN_PRICE },
          otc: { ticket: OTC_TICKET, overShares: OTC_OVER_SHARES, overPerShare: OTC_OVER_PER_SHARE },
          sec: SEC_RATE,
          taf: { perShare: TAF_PER_SHARE, cap: TAF_CAP },
          withdraw: WITHDRAW,
          inactivity: INACTIVITY,
          nonUsMonthly: NON_US_MONTHLY,
          otcCarry: OTC_CARRY,
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
      "usage : node choicetrade_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node choicetrade_cost.mjs --schedule\n" +
        "  ex.   node choicetrade_cost.mjs IAU --shares=1 --price=82\n" +
        "        node choicetrade_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node choicetrade_cost.mjs AGSCF OTC USD --shares=1 --price=2"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
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
    if (out.alternatives?.length) {
      console.log(`\nce que ChoiceTrade propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.trade) {
    const t = out.trade;
    if (t.notional != null) {
      console.log(
        `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
          `${t.notional.toFixed(2)} ${t.currency}` +
          (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
      );
      console.log();
    }
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
