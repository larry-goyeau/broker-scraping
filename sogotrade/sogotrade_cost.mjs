// What one round trip costs at SogoTrade: buy n shares at price p, sell them
// back at once (online, regular hours, market), in dollars.
//
// The affine triple had nowhere to put the penny add-on or the $5 F-share.
// This trip is a market click: $2.88 a side on listed and OTC. A qualifying
// limit (100+ shares or ≥ $2,000, not a penny) is $0 and stays in the
// remark. `roundTrip` is given the size and charges what is charged.
//
// SogoTrade, Inc. (US). Tables re-read 2026-09-17 from the commissions PDF
// (SEC footnote dated 6 April 2026; CAT and inactivity notes on the same
// file) and the HTML card, which prints the same equity grid. The catalogue
// is `sogotrade_scraping.mjs` — US stocks, ETFs and Bakkt crypto. Until that
// file has been run, this one answers that the book is missing.
//
//   listed / OTC market                                    $2.88
//   listed limit, not a penny, 100+ shares or ≥ $2,000     $0 (remark)
//   listed odd-lot limit under $2,000                      $2.88
//   OTC limit (any size)                                   $2.88
//   penny (under $1), listed or OTC                        $2.88
//     + greater of $0.0003/share (cap 5 % of principal)
//       and 0.25 % of principal, each way
//   foreign ordinary OTC (“F” share)                       + $5
//   crypto (Bakkt)                                         max($1, 1 % of value)
//
// This trip takes the printed spread as a market order. Get Paid to Trade
// ($0.001 / share) wants a non-marketable limit of 100+ shares in regular
// hours, and Pink is excluded. The rebate stays out.
//
// SEC uses their April 2026 print ($20.60 / $1,000,000). TAF they still
// print at $0.000166 / $8.30; the number uses the current $0.000195 / $9.79
// the other US files use, ceil-to-cent with their $0.01 minimum. CAT is
// named and assessed at $0. Stamp / FTT from taxMap by ISIN. Cash is USD
// and every listing is USD, so FX stays out.
//
// Tickets already in the number stay out of the remark. The $0 limit, the
// $100 penny opening floor, ADR custody ($0.01–$0.10 / share / year) and
// wires stay in the remark. Get Paid to Trade and inactivity stay out.
//
//   https://content.sogotrade.com/pdf/en-us/commissionsfeesen.pdf
//   https://www.sogotrade.com/en-us/home/commissionfeeshare.aspx/commissions-and-fees.aspx
//
//   node sogotrade/sogotrade_cost.mjs AAPL NASDAQ USD --shares=10 --price=230
//   node sogotrade/sogotrade_cost.mjs F NYSE USD --shares=10 --price=13.5
//   node sogotrade/sogotrade_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("sogotrade-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://content.sogotrade.com/pdf/en-us/commissionsfeesen.pdf",
  page: "https://www.sogotrade.com/en-us/home/commissionfeeshare.aspx/commissions-and-fees.aspx",
  readOn: "2026-09-17",
  secAsOf: "2026-04-06",
  entity: "SogoTrade, Inc. (US)",
};

const SEC_RATE = 0.0000206;
const TAF_PER_SHARE = 0.000195;
const TAF_CAP = 9.79;
const TAF_ON_PAGE = { perShare: 0.000166, cap: 8.3 };
const CENT = 0.01;
const TICKET = 2.88;
const FREE_SHARES = 100;
const FREE_PRINCIPAL = 2000;
const PENNY = 1;
const LOW_PER_SHARE = 0.0003;
const LOW_PER_SHARE_CAP = 0.05;
const LOW_PCT = 0.0025;
const PENNY_OPEN_MIN = 100;
const F_SHARE = 5;
const CRYPTO_MIN = 1;
const CRYPTO_PCT = 0.01;
const GP2T = 0.001;
const ASSISTED = 25;
const ADR = { low: 0.01, high: 0.1 };
const ADR_NAMED = /\b(ADR|GDR|ADS)\b/i;
const INACTIVITY = { each: 3, period: "quarter", equityWaives: 10000 };
const WIRE = { domestic: 30, foreign: 50, ccy: "USD" };
const ACH = 0;
const CHECK = { regular: 5, overnight: 50, ccy: "USD" };
const ACAT = { out: 75, ccy: "USD" };

const LISTED_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS", "IEXG"]);
const LISTED_CODES = /^(NASDAQ|NYSE|AMEX|ARCA|NYSEARCA|BATS|BZX|CBOE|IEX)$/;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
warmListingIndex(rows);
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const up = (value) =>
  value == null || Number.isNaN(value) ? null : value > 0 ? Math.ceil(value / CENT - 1e-9) * CENT : 0;

const isCrypto = (row) => code(row?.type) === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const isOverTheCounter = (row) => /^(OTC|PINK|GREY|OTCBB|OTCQX|OTCQB|OTCCE|PINX)$/i.test(String(row?.exchange || ""));
const isFShare = (row) => isOverTheCounter(row) && /^[A-Z]{4}F$/.test(code(row?.ticker));
const isPenny = (price) => Number(price) > 0 && Number(price) < PENNY;
const isAdr = (row) => ADR_NAMED.test(String(row?.name || ""));

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

export function feeMarketOf(row, mic) {
  if (isCrypto(row)) return "crypto";
  const raw = code(row?.exchange);
  const m = code(mic);
  if (isOverTheCounter(row) || raw === "OTC" || /^(OTC|PINK|GREY)/.test(raw)) return "otc";
  if (LISTED_MICS.has(m) || LISTED_CODES.test(raw)) return "listed";
  return null;
}

export function lowPriceFee(shares, notional) {
  const n = Number(shares);
  const amt = Number(notional);
  if (!(n > 0) || !(amt > 0)) return null;
  return Math.max(Math.min(LOW_PER_SHARE * n, LOW_PER_SHARE_CAP * amt), LOW_PCT * amt);
}

export function commissionSide({ market, shares, price, notional, fShare = false }) {
  const n = Number(shares);
  const p = Number(price);
  const amt = Number(notional);
  if (market === "crypto") {
    if (!(amt > 0)) return null;
    return Math.max(CRYPTO_MIN, CRYPTO_PCT * amt);
  }
  if (!(n > 0) || !(p > 0) || !(amt > 0)) return null;
  const pennyAdd = isPenny(p) ? lowPriceFee(n, amt) : 0;
  const foreign = fShare ? F_SHARE : 0;
  return TICKET + pennyAdd + foreign;
}

export function limitWouldBeFree({ market, shares, price, notional }) {
  const n = Number(shares);
  const p = Number(price);
  const amt = Number(notional);
  if (market !== "listed" || isPenny(p)) return false;
  return n >= FREE_SHARES || amt >= FREE_PRINCIPAL;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const resolved = place ? resolveVenue({ exchange: place, mic: place }) : {};
  const wantVenue = resolved.venue || null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);

  const named = rowsNamed(rows, asked, (r) => {
    if (isCrypto(r) && loose(r.ticker) === asked) return true;
    return loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked;
  });
  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(String(place)))) {
    return { named, matches: crypto.map((r) => ({ row: r, ...listingKey(r) })) };
  }

  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const priced = named.filter((r) => feeMarketOf(r) != null);
  const pool = exactCode.length ? exactCode : priced.length ? priced : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || code(m.row.currency || "USD") === wantCurrency);

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
    const market = feeMarketOf(r, book.mic ?? venue?.mic) || "?";
    const slot = (out[type] ||= { n: 0, withBook: 0, otc: 0, crypto: 0, byMarket: {} });
    slot.n += 1;
    if (isOverTheCounter(r)) slot.otc += 1;
    if (isCrypto(r)) slot.crypto += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    const mk = (slot.byMarket[market] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) mk.withBook += 1;
  }
  return out;
}

function remarkOf({ market, listing, penny, freeLimit }) {
  const lines = [];
  if (market === "crypto") {
    lines.push("Crypto through Bakkt.");
  } else {
    if (freeLimit) lines.push("Limit $0 broker fees.");
    if (penny) lines.push(`$${PENNY_OPEN_MIN} minimum to open a stock under $1.`);
    if (isAdr(listing)) lines.push(`Depositary receipt $${ADR.low}–$${ADR.high} per share per year.`);
  }
  return lines.join("\n");
}

/**
 * The whole bill for buying `shares` at `price` and selling them straight
 * back. `usd` is the number the page prints; `brokerFees` is only
 * SogoTrade's ticket (limit / OTC / penny / F-share / Bakkt), twice.
 */
export function roundTrip({
  etf,
  place,
  currency,
  shares,
  price,
  amount = null,
  bp = null,
  perShare = null,
}) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "USD",
  };

  if (!catalogue) {
    return {
      ...answer,
      why: "le catalogue SogoTrade n'existe pas encore : lancer `node sogotrade/sogotrade_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue SogoTrade` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez SogoTrade`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "sogotrade",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency) || "USD",
    brokerExchange: m.row.exchange || null,
    otc: isOverTheCounter(m.row),
    fShare: isFShare(m.row),
    adr: isAdr(m.row),
  };

  const market = feeMarketOf(m.row, listing.mic);
  if (!market) {
    return {
      ...answer,
      listing,
      cashCurrency: "USD",
      remark: "",
      why: `${listing.brokerExchange || listing.exchange} n'est pas une place tarifée chez SogoTrade`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const tax = crypto ? { rates: {} } : taxesOf(listing.isin);
  const rates = taxRates(tax);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional = crypto && cash > 0 ? cash : n > 0 && p > 0 ? n * p : null;
  const penny = !crypto && isPenny(p);
  const ticket = commissionSide({
    market,
    shares: n,
    price: p,
    notional,
    fShare: listing.fShare,
  });
  const freeLimit = limitWouldBeFree({ market, shares: n, price: p, notional });
  const blockedPenny = penny && notional != null && notional < PENNY_OPEN_MIN;

  const shared = {
    ...answer,
    listing,
    feeMarket: market,
    cashCurrency: "USD",
    onlineBuy: !blockedPenny,
    remark: remarkOf({ market, listing, penny, freeLimit }),
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    basis: `barème SogoTrade online market, palier ${market}, relu le ${SCHEDULE.readOn}`,
    tax,
    commission: {
      each: ticket,
      currency: "USD",
      eachWay: true,
      platform: "online",
      hours: "regular",
      order: crypto ? "crypto" : "market",
    },
    ccy: QUOTE,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    withdraw: { ach: ACH, wireDomestic: WIRE.domestic, wireForeign: WIRE.foreign, ccy: "USD" },
  };

  if (blockedPenny) {
    return {
      ...shared,
      why: `ouverture penny : ${PENNY_OPEN_MIN} $ minimum (ordre de ${notional} $)`,
      confidence: confidenceOf({
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
      }),
    };
  }

  if (notional == null || ticket == null) {
    return {
      ...shared,
      why: crypto
        ? "aucun montant pour cette ligne crypto"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        market,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
      }),
    };
  }

  const notionalUsd = toUsd(notional, listing.currency);
  const commissionUsd = ticket * 2;
  const bookUsd = crypto
    ? 0
    : marketPerShare != null
      ? marketPerShare * n
      : marketBp != null && notionalUsd != null
        ? (notionalUsd * marketBp) / 1e4
        : null;
  const taxUsd = crypto || notionalUsd == null ? 0 : notionalUsd * taxPct;
  const secUsd = crypto || notionalUsd == null ? 0 : up(notionalUsd * SEC_RATE);
  const tafRaw = crypto ? 0 : Math.min(n * TAF_PER_SHARE, TAF_CAP);
  const tafUsd = crypto ? 0 : up(tafRaw);
  const usd = plus(bookUsd, commissionUsd, taxUsd, secUsd, tafUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(commissionUsd, 6),
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${
            m.unsourced?.why || "pas de feuille de carnet"
          }`,
        }
      : {}),
    trade: {
      shares: crypto ? null : n,
      price: crypto ? null : p,
      amount: crypto ? notional : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      currency: listing.currency,
    },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      réglementaire: finite(plus(secUsd, tafUsd), 6),
      taxes: finite(taxUsd, 6),
    },
    sell: crypto
      ? null
      : {
          sec: finite(secUsd, 6),
          taf: finite(tafUsd, 6),
          tafCapped: tafRaw >= TAF_CAP,
        },
    confidence: confidenceOf({
      market,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      n,
      p,
      notional,
      ticket,
      freeLimit,
      tafUsd,
      tafCapped: !crypto && tafRaw >= TAF_CAP,
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
  n,
  p,
  notional,
  ticket,
  freeLimit,
  tafUsd,
  tafCapped,
}) {
  const said = [];
  said.push(
    `commission SogoTrade online market, palier ${market}, lue le ${SCHEDULE.readOn} ` +
      `sur le PDF (SEC au ${SCHEDULE.secAsOf})`
  );
  if (ticket != null) {
    said.push(
      `ticket ${Number(ticket.toPrecision(4))} $ par sens` +
        (ticket === TICKET && freeLimit
          ? ` (limite 0 $ : ${n} parts × ${p} $ = ${Number(notional).toFixed(2)} $)`
          : "")
    );
  }
  if (market === "crypto") {
    said.push(`crypto Bakkt : max(${CRYPTO_MIN} $, ${100 * CRYPTO_PCT} % du montant) par sens`);
  } else {
    said.push(
      `SEC ${SEC_RATE} du montant à la vente (taux imprimé du ${SCHEDULE.secAsOf}), ` +
        `TAF ${TAF_PER_SHARE} $/part plafonnée à ${TAF_CAP} $` +
        (tafCapped ? `, le plafond mord` : "") +
        ` — la page imprime encore ${TAF_ON_PAGE.perShare} $ / ${TAF_ON_PAGE.cap} $`
    );
    said.push(`CAT nommé et facturé 0 $`);
  }
  if (taxPct) said.push(`taxe de transfert ${(100 * taxPct).toFixed(2)} % prise dans taxMap.mjs`);
  if (market === "crypto") said.push(`pas de carnet : le 1 % est le coût, pas N/A`);
  else if (marketBp != null) said.push(`carnet ${Number(marketBp.toPrecision(4))} bp`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part`);
  else {
    said.push(
      `pas de feuille de carnet : ${unsourced?.name || listing.exchange}, ${
        unsourced?.why || "pas de source"
      }`
    );
  }
  if (!leaf && market !== "crypto") said.push(`carnet absent pour cette ligne`);
  said.push(
    `hors trajet : Get Paid to Trade ${GP2T} $/part (limite non exécutable, 100+ parts), ` +
      `assisted +${ASSISTED} $, virement ${WIRE.domestic} $ / ${WIRE.foreign} $, ` +
      `ACAT sortant ${ACAT.out} $, inactivité ${INACTIVITY.each} $ / trimestre. ` +
      `Compte en dollars, pas de change. Aucun aller-retour réel dans ce dépôt`
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
        {
          ...SCHEDULE,
          listed: { limitFreeFromShares: FREE_SHARES, limitFreeFromPrincipal: FREE_PRINCIPAL, market: TICKET },
          otc: TICKET,
          penny: {
            ticket: TICKET,
            perShare: LOW_PER_SHARE,
            perShareCap: LOW_PER_SHARE_CAP,
            pct: LOW_PCT,
            openMin: PENNY_OPEN_MIN,
          },
          fShare: F_SHARE,
          crypto: { min: CRYPTO_MIN, pct: CRYPTO_PCT },
          gp2t: GP2T,
          assisted: ASSISTED,
          sec: SEC_RATE,
          taf: { used: { perShare: TAF_PER_SHARE, cap: TAF_CAP }, onPage: TAF_ON_PAGE },
          cat: 0,
          cash: "USD",
          inactivity: INACTIVITY,
          withdraw: { ach: ACH, check: CHECK, ...WIRE },
          acat: ACAT,
          adr: ADR,
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
      "usage : node sogotrade/sogotrade_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]\n" +
        "        node sogotrade/sogotrade_cost.mjs --schedule\n" +
        "  ex.   node sogotrade/sogotrade_cost.mjs AAPL NASDAQ USD --shares=10 --price=230\n" +
        "        node sogotrade/sogotrade_cost.mjs F NYSE USD --shares=10 --price=13.5"
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
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que SogoTrade propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      `  [${out.feeMarket}]\n`
  );

  if (out.trade) {
    const t = out.trade;
    console.log(
      (t.shares
        ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}`
        : `${t.notional.toFixed(2)} ${t.currency}`) +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "") +
        "\n"
    );
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.réglementaire) console.log(`  réglementaire  : ${parts.réglementaire} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    console.log("");
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}\n`);
  }

  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
