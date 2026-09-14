// What one round trip costs at BHM Capital: buy n shares at price p, sell
// them back at once. `roundTrip()` answers the bill in dollars rather than an
// affine triple, so the percentage, the flat order fee and its VAT land in one
// number instead of three the caller has to reassemble.
//
// BHM Capital Financial Services PJSC (AE, SCA). The catalogue is Rubix
// (`trading.bhmuae.ae`, `bhmuae_scraping.mjs`). This login's book is DFM and Nasdaq
// Dubai (AED and USD). ADX is on the same local card and is wired; ADSM /
// TDWL are mapped in the scraper in case a later dump actually has them.
// International executions (US 0.03 $ / share, KSA 0.22 %, …) sit further
// down the same page and are not copied — they are not in this book.
//
// VAT is charged line by line on the card (most 5 %, DFM CMA 0 %) and is folded
// into the rate. DFM and Nasdaq Dubai also print a flat ORDER FEE (10 AED /
// 3 USD / 10 AED), plus VAT; that is a ticket every time, not a minimum of the
// percentage, so it is charged on each leg whatever the size. ADX has no order
// fee. No live trip is in this deposit yet.
//
// The card was read again on 2026-09-14 against the four UAE tables, and the
// local block needed no correction. It was also read against Al Ramz's card,
// which prices the same exchanges: the two agree, line for line, on what DFM,
// the CDS and the regulator take, and on the 0,125 each keeps for itself. The
// one thing they do not share is the flat fee — Al Ramz floors its commission
// at ten dirhams, BHM charges ten dirhams on top of it — which is what settles
// the ticket as BHM's own money rather than the exchange's.
//
// What the reading settled is as much what is absent as what is there:
//
//   no minimum      The "Minimum (per transaction)" column exists on the page,
//                   but only for Bahrain and Amman through the Tabadul hub and
//                   for the international card (USD 18 on America, GBP 50 on
//                   London, and so on). None of the three UAE tables has one,
//                   so a one-share order pays the ticket and the percentage of
//                   almost nothing, and that is the whole bill.
//   no custody      The safe custody tables price fifteen foreign markets a
//                   year — mostly 0.05 %, 0.2 % on Kuwait, free on Saudi and
//                   America — and the UAE is on neither list. Nothing to leave
//                   out of the trip, because nothing is charged.
//   no data fee     The market data subscriptions price Saudi, Kuwait, Qatar,
//                   Oman, Bahrain, Egypt, London and the American tapes. DFM
//                   and Nasdaq Dubai are not on that list either.
//
// Withdrawing says only "bank charges may apply on cash transfers", with no
// figure, and a withdrawal prices moving cash out rather than trading anyway.
//
//   https://www.bhmuae.ae/pricing/
//
//   node bhmuae/bhmuae_cost.mjs CHAE --shares=100 --price=2
//   node bhmuae/bhmuae_cost.mjs AIRARABIA DFM AED --shares=1000 --price=3
//   node bhmuae/bhmuae_cost.mjs ABTC NASDAQDUBAI USD --shares=100 --price=20
//   node bhmuae/bhmuae_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("bhmuae-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.bhmuae.ae/pricing/",
  readOn: "2026-09-14",
  entity: "BHM Capital Financial Services PJSC (AE)",
};

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);

// `parts` are of notional per side. `ticket` is charged every order, in
// `ticketCcy`, then VAT if `ticketVat` is set.
const RULE = {
  dfm: {
    parts: [
      { name: "MARKET", rate: 0.001, vat: 0.05 },
      { name: "BROKER", rate: 0.00125, vat: 0.05 },
      { name: "CMA", rate: 0.0005, vat: 0 },
    ],
    ticket: 10,
    ticketCcy: "AED",
    ticketVat: 0.05,
  },
  adx: {
    parts: [
      { name: "MARKET", rate: 0.00025, vat: 0.05 },
      { name: "BROKER", rate: 0.00125, vat: 0.05 },
    ],
  },
  difx_usd: {
    parts: [
      { name: "DIFX", rate: 0.001, vat: 0.05 },
      { name: "BROKER", rate: 0.00125, vat: 0.05 },
    ],
    ticket: 3,
    ticketCcy: "USD",
    ticketVat: 0.05,
  },
  difx_aed: {
    parts: [
      { name: "DIFX", rate: 0.001, vat: 0.05 },
      { name: "BROKER", rate: 0.00125, vat: 0.05 },
    ],
    ticket: 10,
    ticketCcy: "AED",
    ticketVat: 0.05,
  },
};

const TO_VENUES = {
  ADSM: "ADX",
  DIFX: "NASDAQDUBAI",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
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

const venueRow = (row) => ({
  ...row,
  exchange: TO_VENUES[row.exchange] || row.exchange,
});

export function rateOf(rule) {
  if (!rule?.parts) return 0;
  return rule.parts.reduce((sum, line) => sum + line.rate * (1 + (line.vat || 0)), 0);
}

export function ticketOf(rule) {
  if (!rule?.ticket) return 0;
  return rule.ticket * (1 + (rule.ticketVat || 0));
}

// The share of the rate BHM keeps. Every other line names its counterparty —
// MARKET is the exchange, CMA the regulator, DIFX is Nasdaq Dubai — and each
// would be charged whoever carried the order, so none of them is BHM's. The VAT
// on the broker line goes to the state rather than to BHM, but it exists only
// because the commission does and leaves with it, so it counts as the price of
// choosing this broker.
//
// Al Ramz settles what the labels leave open. Its card breaks DFM into courtier
// 0,125 + marché 0,050 + SCA 0,050 + CDS 0,050, and BHM's three lines are the
// same money under two names: BHM's single MARKET 0,100 is Al Ramz's marché and
// CDS together, BHM's CMA is Al Ramz's SCA, and the two brokers charge the very
// same 0,125 for themselves. ADX matches line for line. Two cards written
// independently agree on what DFM and the regulator take, which is as close to
// a second source as this deposit will get without a live trip.
export function brokerRateOf(rule) {
  if (!rule?.parts) return 0;
  return rule.parts
    .filter((line) => line.name === "BROKER")
    .reduce((sum, line) => sum + line.rate * (1 + (line.vat || 0)), 0);
}

function remarkOf() {
  // Nothing to warn about: the percentage, the ticket and its VAT are all in
  // the total, and the card charges the UAE block no custody and no data fee.
  return "";
}

export function feeMarketOf(exchange, mic, currency) {
  const code = loose(exchange);
  const m = String(mic || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  if (code === "DFM" || m === "XDFM") return "dfm";
  if (code === "ADX" || code === "ADSM" || m === "XADS") return "adx";
  if (code === "DIFX" || code === "NASDAQDUBAI" || code === "NASDAQDXB") {
    return ccy === "AED" ? "difx_aed" : "difx_usd";
  }
  return null;
}


function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      const ex = loose(m.row.exchange);
      return ex === wantPlace || loose(TO_VENUES[m.row.exchange] || "") === wantPlace || ex.includes(wantPlace);
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
    const { venue, unsourced } = listingKey(venueRow(r));
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r.exchange, book.mic ?? venue?.mic, r.currency);
    const slot = (out[type] ||= { n: 0, withBook: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market || "?"] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
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
      why: "le catalogue BHM n'existe pas encore : lancer `node bhmuae/bhmuae_scraping.mjs` avec trading.bhmuae.ae ouvert",
    };
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue BHM` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez BHM`,
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
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const market = feeMarketOf(m.row.exchange, listing.mic, listing.currency);
  const rule = RULE[market];
  if (!market || !rule) {
    return {
      ...answer,
      listing,
      feeMarket: market,
      remark: "international card, not this file.",
      why: `${listing.exchange || m.row.exchange} n'est pas sur le bloc local BHM (DFM / ADX / Nasdaq Dubai)`,
      tax: taxesOf(listing.isin),
      fx: fxNote(listing.currency),
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = US_MICS.has(listing.mic);
  const tax = taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxTotal = Object.values(rates).reduce((s, r) => s + r, 0);
  const commissionPct = rateOf(rule) * 2;
  const ticketEach = ticketOf(rule);
  const ticketCcy = rule.ticketCcy || listing.currency;

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: listing.currency,
    remark: remarkOf(),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème BHM ${market}, lu le ${SCHEDULE.readOn} (page Pricing)`,
    tax,
    commission: {
      rate: rateOf(rule),
      brokerRate: brokerRateOf(rule),
      ticket: ticketEach || null,
      ticketPrinted: rule.ticket ?? null,
      currency: ticketCcy,
      eachWay: true,
      parts: rule.parts,
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    // The card prices no conversion. Nasdaq Dubai quotes the same line in both
    // AED and USD and the account holds both, so which side the client funds is
    // his own affair and never lands in `usd`.
    fxIfConverted: null,
    confidence: confidenceOf({ market, rule, leaf, taxTotal, commissionPct, ticketEach }),
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
        ? american
          ? marketPerShare * n
          : dollars(marketPerShare * n, listing.currency)
        : null;

  // Percentage and taxes scale with the amount; the ticket does not, and is
  // charged whole on each leg however small the order.
  const commissionUsd = notional != null ? notional * commissionPct : null;
  const ticketUsd = ticketEach ? (dollars(ticketEach * 2, ticketCcy) ?? null) : 0;
  const taxUsd = notional != null ? notional * taxTotal : 0;

  const usd = plus(bookUsd, commissionUsd, ticketUsd, taxUsd);
  // The ticket is BHM's too. Al Ramz trades the same exchanges and prints the
  // same ten dirhams and three dollars as a floor under its commission, never
  // as a charge on top: DFM levies no flat fee per order, or Al Ramz's clients
  // would pay it as well. What BHM adds there it adds for itself.
  const brokerUsd = plus(notional != null ? notional * brokerRateOf(rule) * 2 : null, ticketUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerUsd, 6),
    trade: { shares: n, price: p, currency: listing.currency, notional: n * p, notionalUsd: notional },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      ticket: ticketUsd || null,
      taxes: Object.keys(rates).length ? finite(taxUsd, 6) : null,
    },
    ...(bookUsd == null
      ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
      : {}),
  };
}

function confidenceOf({ market, rule, leaf, taxTotal, commissionPct, ticketEach }) {
  const said = [
    `Barème ${market} de la carte BHM du ${SCHEDULE.readOn} (bhmuae.ae/pricing) : ` +
      `${(rateOf(rule) * 100).toFixed(4)} % par jambe, TVA de chaque ligne comprise` +
      (ticketEach
        ? `, plus un ticket de ${rule.ticket} ${rule.ticketCcy} + TVA par ordre.`
        : `, et pas de ticket sur cette place.`),
    `Total = carnet + ${(commissionPct * 100).toFixed(4)} % de courtage` +
      (ticketEach ? ` + ticket × 2` : "") +
      (taxTotal ? ` + taxes` : "") +
      `.`,
    `Frais courtier = la ligne BROKER, ${(brokerRateOf(rule) * 200).toFixed(4)} % sur l'aller-retour` +
      (ticketEach ? `, plus le ticket` : "") +
      `. Le reste de la carte nomme l'échange, le régulateur ou Nasdaq Dubaï, ` +
      `et la carte d'Al Ramz reverse exactement les mêmes montants sur les mêmes places.`,
    `Le bloc émirati ne porte ni minimum par transaction, ni frais de garde, ni abonnement de données : ` +
      `les trois colonnes existent sur la page mais s'arrêtent aux marchés voisins et à la carte internationale.`,
    `Aucun aller-retour réel chez BHM dans ce dépôt.`,
  ];
  if (!leaf) said.push(`Pas de feuille de carnet pour cet ISIN sur cette place.`);
  return said.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, rules: RULE, coverage: coverage() }, null, 2));
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node bhmuae_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--json]\n" +
        "        node bhmuae_cost.mjs --schedule\n" +
        "  ex.   node bhmuae_cost.mjs CHAE --shares=100 --price=2\n" +
        "        node bhmuae_cost.mjs AIRARABIA DFM AED --shares=1 --price=3\n" +
        "        node bhmuae_cost.mjs ABTC NASDAQDUBAI USD --shares=1 --price=20"
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

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que BHM propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
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
    console.log(
      `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const p = out.parts || {};
    if (p.marché != null) console.log(`  carnet         : ${p.marché} $`);
    if (p.courtage != null) console.log(`  courtage       : ${p.courtage} $   (${out.feeMarket}, TVA comprise, les deux jambes)`);
    if (p.ticket) {
      console.log(
        `  ticket         : ${p.ticket} $   (${out.commission?.ticketPrinted} ${out.commission?.currency} + TVA × 2)`
      );
    }
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
