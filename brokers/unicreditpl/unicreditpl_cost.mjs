// What one round trip costs at UniCredit Polska (UniCredit S.A. Spółka
// Akcyjna Oddział w Polsce): buy n shares at price p, sell them back at
// once, in dollars. Self-directed investing in the UniCredit app; it is the
// only channel the regulations give for orders.
//
// Tabela opłat i prowizji in force from 12 November 2025, read 2026-10-20.
// Part 1.
//
//   Polish shares and ETF
//     15 basis points (0.15 %) of the trade, min 4 PLN, per order
//   Foreign shares and ETF
//     3 basis points (0.03 %) of the trade, min 1 EUR, USD, CHF or GBP,
//     per order, in the order currency
//   Opening and running the account, custody of Polish and foreign
//   securities, transfers to and from the UniCredit current account: free.
//
// Point 4.11: what the bank pays its partners comes out of these fees and
// is not charged again, so no exchange or SEC fee is added. Part 3 names
// FTT and UK stamp duty; they come from the tax map. The MiFID brochure's
// ex-ante examples (10 000 PLN GPW, 31.50 PLN; 15 000 PLN abroad, 9.45 PLN)
// match these rates.
//
// FX. Regulations §7g: a conversion uses the rate the bank offers its
// clients. The retail fee list, part 8: standard margin 0.5 % over the
// interbank rate, none on EUR/PLN (and CZK, DKK, HUF, SEK, RON pairs). PLN,
// EUR, USD, GBP and CHF are all cash accounts (deposits.mjs), so every
// listing has its own cash and the margin is the remark, not this ticket.
//
// Orders are executed, and held, by Interactive Brokers Ireland Limited
// (MiFID brochure, 2.1, 2.2 and the counterparty table: Polish, European and
// US shares, and ETF). IBIE routes US equities to Interactive Brokers LLC,
// so a US line uses that firm's Rule 606 Q (alias unicreditpl ->
// interactivebrokers in spreads/rule606.mjs). Without the alias the US book
// is the quoted NBBO.
//
//   https://unicredit.pl/dam/jcr:3e4a56fa-2a70-4546-96f0-1100ac2475a7/Tabela%20op%C5%82at%20i%20prowizji.pdf
//   https://unicredit.pl/dam/jcr:9ddad51f-1964-4b02-9767-bb77c276a6e2/Broszura%20informacyjna%20MiFID%20wersja%20od%2004.01.2026.pdf
//   https://unicredit.pl/dam/jcr:c4bf5152-a0f7-4fb7-a0b1-ec58853eb789/Regulamin%20%C5%9Bwiadczenia%20us%C5%82ug%20maklerskich%20(przyjmowanie,%20przekazywanie%20i%20wykonywanie%20zlece%C5%84,%20prowadzenie%20rachunku).pdf
//   https://unicredit.pl/dam/jcr:b33bf891-a2e1-4570-8277-f941a5a90df1/lista-oplat-i-prowizji-dla-klientow-detalicznych-wersja-obowiazujaca-od-14-wrzesnia-2026.pdf
//   https://unicredit.pl/indywidualni/inwestycje/inwestowanie-samodzielne
//   all read on 2026-10-20
//
//   node brokers/unicreditpl/unicreditpl_cost.mjs PLPKO0000016 XWAR PLN --shares=10 --price=50
//   node brokers/unicreditpl/unicreditpl_cost.mjs US0378331005 XNAS USD --shares=10 --price=230
//   node brokers/unicreditpl/unicreditpl_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare, qOf } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer, listingCash, fxRemark } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("unicreditpl-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://unicredit.pl/dam/jcr:3e4a56fa-2a70-4546-96f0-1100ac2475a7/Tabela%20op%C5%82at%20i%20prowizji.pdf",
  mifid: "https://unicredit.pl/dam/jcr:9ddad51f-1964-4b02-9767-bb77c276a6e2/Broszura%20informacyjna%20MiFID%20wersja%20od%2004.01.2026.pdf",
  fx: "https://unicredit.pl/dam/jcr:b33bf891-a2e1-4570-8277-f941a5a90df1/lista-oplat-i-prowizji-dla-klientow-detalicznych-wersja-obowiazujaca-od-14-wrzesnia-2026.pdf",
  readOn: "2026-10-20",
  tariffOn: "2025-11-12",
  entity: "UniCredit S.A. Spółka Akcyjna Oddział w Polsce",
  venue: "Interactive Brokers Ireland Limited",
};

const POLISH_RATE = 0.0015;
const POLISH_MIN = 4;
const FOREIGN_RATE = 0.0003;
// Part 1: "nie mniej niż 1 EUR/USD/CHF/GBP".
const FOREIGN_MIN = { EUR: 1, USD: 1, CHF: 1, GBP: 1 };
// Retail fee list, part 8. One conversion, over the interbank rate.
const FX_MARGIN = 0.005;
const FX_FREE = new Set(["EUR/PLN", "CZK/PLN", "DKK/PLN", "HUF/PLN", "SEK/PLN", "RON/PLN", "EUR/CZK", "EUR/DKK", "EUR/HUF", "EUR/SEK", "EUR/RON"]);
const US_MICS = new Set(["XNYS", "XNAS", "XASE", "BATS", "ARCX"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

function polishMarket(listing) {
  if (listing.mic === "XWAR") return true;
  const ex = loose(listing.brokerExchange);
  return ex === "GPW" || ex === "XWAR" || ex === "WARSAWSTOCKEXCHANGE";
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

function legOf(listing) {
  if (polishMarket(listing)) {
    return { rate: POLISH_RATE, min: POLISH_MIN, currency: "PLN", label: "0.15 % min 4 PLN" };
  }
  const cash = listingCash(listing.currency);
  const min = FOREIGN_MIN[cash];
  if (min == null) return null;
  return { rate: FOREIGN_RATE, min, currency: cash, label: `0.03 % min ${min} ${cash}` };
}

const free = (a, b) => FX_FREE.has(`${a}/${b}`) || FX_FREE.has(`${b}/${a}`);

// The other cash accounts, with the margin each pays into this currency.
function fxNote(currency) {
  const cash = listingCash(currency);
  const others = ["PLN", "EUR", "USD", "GBP", "CHF"].filter((c) => c !== cash);
  const zero = others.filter((c) => free(c, cash));
  if (!zero.length) return fxRemark(String(FX_MARGIN * 100), cash);
  return fxRemark(String(FX_MARGIN * 100), cash, `(0% from ${zero.join(", ")})`);
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is the ticket.
 */
export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
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
    return { ...answer, why: "le catalogue UniCredit Polska n'existe pas encore : lancer `node brokers/unicreditpl/unicreditpl_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue UniCredit Polska` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez UniCredit Polska`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "unicreditpl",
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const rule = legOf(listing);
  if (!rule) {
    return { ...answer, listing, why: `${listing.currency} n'a pas de minimum dans la tabela opłat` };
  }
  const cash = listingCash(listing.currency);
  // A deposit currency is never converted. Anything else pays the margin on
  // the buy and on the sale.
  const held = depositHas("unicreditpl", null, cash);
  const fxRate = held ? 0 : FX_MARGIN;
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const american = US_MICS.has(listing.mic) && listing.currency === "USD";
  const shared = {
    ...answer,
    listing,
    cashCurrency: rule.currency,
    remark: held ? fxNote(listing.currency) : "",
    url: SCHEDULE.url,
    basis: `tabela opłat UniCredit Polska du ${SCHEDULE.tariffOn}, relue le ${SCHEDULE.readOn} : ${rule.label} par ordre`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
  };
  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0) || !(p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  let marketPerShare = perShare ?? leaf?.perShare ?? null;
  if (american && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "unicreditpl", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketBp == null && marketPerShare != null ? { source: "us605" } : m.venue,
    toUsd: (x) => dollars(x, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const side = Math.max(notional * rule.rate, rule.min);
  const sideUsd = dollars(side, rule.currency);
  const commissionUsd = plus(sideUsd, sideUsd);
  const fxUsd = notionalUsd == null ? null : notionalUsd * fxRate * 2;
  const brokerFees = plus(commissionUsd, fxUsd);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);
  const confidence = [
    shared.basis,
    polishMarket(listing) ? "GPW, ordre dans l'application" : `ordre dans l'application, commission en ${rule.currency}`,
    held ? `compte en ${cash}, sans conversion` : `conversion ${FX_MARGIN * 100} % par jambe`,
    `exécution ${SCHEDULE.venue}`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? american
          ? qOf("unicreditpl") != null
            ? `carnet US ${marketPerShare} $ la part, Q 606 d'Interactive Brokers LLC`
            : `carnet NBBO coté ${marketPerShare} $ la part : pas d'alias 606 pour unicreditpl`
          : `carnet ${marketPerShare} $ la part`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange || "aucune place"}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    commission: {
      rate: rule.rate,
      min: rule.min,
      currency: rule.currency,
      eachWay: true,
      sellRate: rule.rate,
    },
    bp: marketBp,
    perShare: marketPerShare,
    ...(bookUsd == null
      ? {
          why: `aucun carnet pour ${m.unsourced?.name || listing.exchange || listing.isin} : ${m.unsourced?.why || "pas de feuille de carnet"}`,
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
      ...(fxUsd ? { change: finite(fxUsd, 6) } : {}),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
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
          poland: "0.15 % min 4 PLN",
          foreign: "0.03 % min 1 EUR, USD, CHF or GBP",
          account: "free; custody free",
          conversion: "0.5 % over interbank, 0 on EUR/PLN; remark only, every listing currency is a cash account",
          rule606: "unicreditpl -> interactivebrokers",
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
    console.error("usage : node brokers/unicreditpl/unicreditpl_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${show(out.brokerFees)} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}
