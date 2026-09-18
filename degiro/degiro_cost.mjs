// What one round trip costs at DEGIRO NL: buy n shares at price p, sell
// them back at once, online, Basic / Active / Trader, AutoFX, in dollars.
//
// The affine triple hid the cliffs. PTM £1.50 above £10 000 lived only in
// `threshold`, which the page never added. Crypto's €0.01 floor sat in
// `floor` the same way. `roundTrip` is given the size and charges what is
// charged.
//
// flatexDEGIRO Bank Dutch Branch. Schedule from 1 January 2026, re-read
// 2026-09-15 — unchanged since the 10th. Custody prints the same stock /
// tracker tickets; it is not a second coefficient. Options, futures, bonds,
// funds and BNP / SGC OTC warrants are not in this catalogue (28 187 lines:
// 19 005 stocks, 8 499 ETFs, 457 ETC, 204 ETN, 22 crypto).
//
//   Stocks   AMS / BRU                         2.00 € + 1.00 € handling
//            US / CA                           1.00 € + 1.00 € handling
//            Europe (Xetra, LSE, Tradegate, …) 3.90 € + 1.00 € handling
//            ASX / Frankfurt floor / HK / SG / Tokyo
//                                              5.00 € + 1.00 € handling
//   Trackers Tradegate (Kernselectie)          0.00 € + 1.00 € handling
//            other venues                      2.00 € + 1.00 € handling
//   Crypto   Tradias                           0.29 %, min 0.01 €, no handling
//
// Handling is €1 on every order except Tradegate stocks and crypto. It
// covers third-party execution fees (clearing, SEC, TAF), so those stay
// out of the number. A live AAPL NDQ trip on 2026-09-10 paid the 2 €
// ticket each way and 0.50 % AutoFX, nothing else. Fair Use on the
// Kernselectie was withdrawn with the October 2025 rewrite: every
// Tradegate tracker is €0 + €1.
//
// What is in the number: the ticket each way (commission + handling, or
// the crypto percentage at its floor); AutoFX 0.25 % each way on a
// non-euro tape, measured; Irish stamp 1 % and UK stamp 0.50 % on a share
// purchase (taxMap when it has the ISIN, else the rates DEGIRO says it
// passes through); French / Italian / Spanish FTT from the same map, never
// invented; PTM £1.50 each way on a UK share above 10 000 £; the market
// spread, once.
//
// Connectivity (€2.50 / year per exchange, max 0.25 % AUM — not AMS, BRU,
// Tradias, or the Kernselectie), Xetra-Gold custody (0.025 % / month) and
// ADR pass-through are holding costs and stay in the remark. Manual FX
// (€10 + 0.25 %, USD / GBP cash) is not this trip. Withdrawals are free.
// Custody 0, inactivity 0.
//
//   https://www.degiro.nl/tarieven
//   https://www.degiro.nl/data/pdf/Tarievenoverzicht.pdf
//   https://www.degiro.nl/tarieven/etf-kernselectie
//
//   node degiro/degiro_cost.mjs AAPL NDQ USD --shares=1 --price=230
//   node degiro/degiro_cost.mjs EUNL TDG EUR --shares=1 --price=108
//   node degiro/degiro_cost.mjs EUNL XET EUR --shares=1 --price=108
//   node degiro/degiro_cost.mjs IWDA EAM EUR --shares=1 --price=108
//   node degiro/degiro_cost.mjs BTC --amount=1000
//   node degiro/degiro_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("degiro-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://www.degiro.nl/data/pdf/Tarievenoverzicht.pdf",
  page: "https://www.degiro.nl/tarieven",
  core: "https://www.degiro.nl/tarieven/etf-kernselectie",
  readOn: "2026-09-15",
  previouslyRead: "2026-09-10",
  revised: "2026-01-01",
  entity: "DEGIRO (flatexDEGIRO Bank Dutch Branch, NL)",
};

const FX_EACH_WAY = 0.0025;
const CRYPTO_RATE = 0.0029;
const CRYPTO_MIN = 0.01;
const PTM = { each: 1.5, currency: "GBP", above: 10000 };
const IE_STAMP = 0.01;
const UK_STAMP = 0.005;
const XETRA_GOLD = "DE000A0S9GB0";
const UK_ISSUERS = /^(GB|JE|GG|IM)$/;
const ADR_NAMED = /\bADR\b/i;

const CHECK = {
  isin: "US0378331005",
  ticker: "AAPL",
  venue: "NDQ",
  n: 1,
  buy: 322.86,
  sell: 322.83,
  commissionEach: 2,
  cash: { start: 290, end: 284.58 },
  fxRoundTrip: 0.00502,
  on: "2026-09-10",
};

const HOME = new Set(["EAM", "EBR"]);
const US_CA = new Set(["NDQ", "NSY", "ASE", "TOR", "TSV", "CSE"]);
const ASIA = new Set(["ASX", "FRA", "HKS", "SGX", "TSE"]);
const EUROPE = new Set([
  "XET",
  "TDG",
  "EPA",
  "MIL",
  "LSE",
  "SWX",
  "MAD",
  "IRL",
  "ELI",
  "OSL",
  "OMX",
  "HSE",
  "OMK",
  "ATH",
  "WSE",
  "WEN",
  "PSE",
]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isTracker = (type) => /^(ETF|ETN|ETC)$/i.test(type || "");
const isRetail = (listing) => String(listing?.type || "").toUpperCase() === "STOCK";
const issuerCc = (isin) => String(isin || "").slice(0, 2).toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const toCcy = (amount, from, to) => {
  if (String(from || "").toUpperCase() === String(to || "").toUpperCase()) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  if (usd == null || !(per > 0)) return null;
  return usd / per;
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function feeMarketOf(row) {
  const code = loose(row?.exchange);
  const type = String(row?.type || "").toUpperCase();
  if (type === "CRYPTO" || code === "TRD") return "crypto";
  if (isTracker(type)) return code === "TDG" ? "etf_core" : "etf";
  if (HOME.has(code)) return "home";
  if (US_CA.has(code)) return "us_ca";
  if (ASIA.has(code)) return "asia";
  if (EUROPE.has(code)) return "europe";
  return null;
}

/**
 * Commission and handling in euros, one way. The Degiro hiq code is the
 * source of the band: FRA is the Frankfurt floor (€5), not Xetra, and CSE
 * is the Canadian Securities Exchange (€1), not Copenhagen.
 */
export function ticketOf(row) {
  const market = feeMarketOf(row);
  const code = loose(row?.exchange);
  if (!market) return null;
  if (market === "crypto") {
    return { market, comm: 0, handling: 0, rate: CRYPTO_RATE, min: CRYPTO_MIN, each: null };
  }
  if (market === "etf_core") {
    return { market, comm: 0, handling: 1, rate: 0, min: 0, each: 1 };
  }
  if (market === "etf") {
    return { market, comm: 2, handling: 1, rate: 0, min: 0, each: 3 };
  }
  const comm = market === "home" ? 2 : market === "us_ca" ? 1 : market === "asia" ? 5 : 3.9;
  const handling = code === "TDG" ? 0 : 1;
  return { market, comm, handling, rate: 0, min: 0, each: comm + handling };
}

export function commissionSide({ row, amountEur }) {
  const ticket = ticketOf(row);
  if (!ticket) return null;
  if (ticket.rate) {
    if (amountEur == null || !Number.isFinite(Number(amountEur))) return null;
    const raw = Number(amountEur) * ticket.rate;
    const charged = Math.max(ticket.min, raw);
    return { charged, comm: charged, handling: 0, raw, floored: raw < ticket.min, currency: "EUR" };
  }
  return {
    charged: ticket.each,
    comm: ticket.comm,
    handling: ticket.handling,
    raw: ticket.each,
    floored: false,
    currency: "EUR",
  };
}

function connectivityOf(row, market) {
  const code = loose(row?.exchange);
  if (HOME.has(code) || market === "crypto" || market === "etf_core") return false;
  return true;
}

function remarkOf({ row, market, listing }) {
  const lines = [];
  if (connectivityOf(row, market)) lines.push("Connectivity €2.50/year per exchange.");
  if (String(listing?.isin || "").toUpperCase() === XETRA_GOLD) {
    lines.push("Xetra-Gold custody 0.025%/month.");
  }
  if (ADR_NAMED.test(String(listing?.name || ""))) {
    lines.push("ADR pass-through billed as incurred.");
  }
  return lines.join("\n");
}

/**
 * Stamp from the tax map when Trading212 swept the ISIN. Irish and British
 * shares it never asked about still pay the rates DEGIRO says it passes
 * through (1 % / 0.50 %). A German name on London is not a UK share.
 */
export function taxesFor(isin, listing) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  if (Object.keys(mapped).length) return { tax, rates: mapped, source: "taxMap" };
  if (!isRetail(listing)) return { tax, rates: {}, source: null };
  const cc = issuerCc(isin);
  if (cc === "IE") return { tax, rates: { stamp: IE_STAMP }, source: "degiro" };
  if (cc === "GB") return { tax, rates: { stamp: UK_STAMP }, source: "degiro" };
  return { tax, rates: {}, source: null };
}

function levyEach({ listing, notional, currency }) {
  if (!isRetail(listing)) return { ptm: 0 };
  const cc = issuerCc(listing.isin);
  const mic = String(listing.mic || "").toUpperCase();
  const london = mic === "XLON" || loose(listing.brokerExchange) === "LSE";
  if (!london || !UK_ISSUERS.test(cc)) return { ptm: 0 };
  const gbp = toCcy(notional, currency, "GBP");
  if (gbp == null) return { ptm: null };
  return { ptm: gbp > PTM.above ? PTM.each : 0, ptmCcy: PTM.currency };
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter(
    (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked
  );
  const exactCode = wantPlace ? named.filter((r) => loose(r.exchange) === wantPlace) : [];
  const pool = exactCode.length ? exactCode : named;
  const matches = pool
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (exactCode.length) return true;
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
    const book = spreadLeaf(spreads, {
      isin: r.isin,
      mic: venue?.mic ?? null,
      currency: r.currency,
      unsourced,
    });
    const market = feeMarketOf(r) || "?";
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
 * The whole bill for buying `shares` at `price` (or putting `amount` into a
 * coin) and selling straight back. `usd` is the number the page prints;
 * `brokerFees` is the DEGIRO ticket and AutoFX. Stamp stays out.
 */
export function roundTrip({ etf, place, currency, shares, price, amount, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
  };

  if (!catalogue) {
    return { ...answer, why: "le catalogue DEGIRO n'existe pas encore : lancer `node degiro/degiro_scraping.mjs`" };
  }

  let { named, matches } = findListing({ etf, place, currency });
  if (amount != null && matches.length > 1) {
    const coins = matches.filter((hit) => feeMarketOf(hit.row) === "crypto");
    if (coins.length) matches = coins;
  }
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue DEGIRO` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez DEGIRO`,
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
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const ticket = ticketOf(m.row);
  if (!ticket) {
    return {
      ...answer,
      listing,
      why: `${listing.brokerExchange} n'a pas de palier publié pour ce type`,
    };
  }

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const { tax, rates, source: taxSource } = taxesFor(listing.isin, listing);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);
  const fxPct = listing.currency === "EUR" ? 0 : FX_EACH_WAY;
  const crypto = ticket.market === "crypto";

  const shared = {
    ...answer,
    listing,
    feeMarket: ticket.market,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf({ row: m.row, market: ticket.market, listing }),
    check: listing.isin === CHECK.isin ? CHECK : null,
  };

  const basis =
    `barème DEGIRO NL ${ticket.market}, brochure du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn}` +
    (ticket.rate
      ? ` : ${(ticket.rate * 100).toFixed(2)} %, plancher ${ticket.min} €`
      : ` : ${ticket.comm} € + ${ticket.handling} € de handling`);

  const n = Number(shares);
  const p = Number(price);
  const cash = Number(amount);
  const notional =
    n > 0 && p > 0 ? n * p : crypto && cash > 0 ? cash : null;

  if (notional == null) {
    return {
      ...shared,
      basis,
      why: crypto
        ? "aucun montant pour cette ligne"
        : !(n > 0)
          ? "aucun nombre de parts"
          : "aucun prix pour cette ligne : lancer node prices.mjs",
      confidence: confidenceOf({
        ticket,
        listing,
        leaf,
        marketBp,
        marketPerShare,
        unsourced: m.unsourced,
        taxPct,
        taxSource,
        fxPct,
      }),
    };
  }

  const notionalUsd = toUsd(notional, listing.currency);
  const notionalEur = toCcy(notional, listing.currency, "EUR");
  const bookUsd =
    marketBp != null && notionalUsd != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null
        ? marketPerShare * n
        : null;

  const buy = commissionSide({ row: m.row, amountEur: notionalEur });
  const sell = commissionSide({ row: m.row, amountEur: notionalEur });
  const buyUsd = buy ? dollars(buy.charged, "EUR") : null;
  const sellUsd = sell ? dollars(sell.charged, "EUR") : null;
  const fxUsd = fxPct && notionalUsd != null ? notionalUsd * fxPct * 2 : 0;
  const brokerFees = plus(buyUsd, sellUsd, fxUsd);

  const taxUsd = crypto || notionalUsd == null ? (crypto ? 0 : null) : notionalUsd * taxPct;
  const levy = levyEach({ listing, notional, currency: listing.currency });
  const ptmUsd = levy.ptm == null ? null : dollars((levy.ptm || 0) * 2, levy.ptmCcy || "GBP") ?? 0;

  const usd = plus(bookUsd, brokerFees, taxUsd, ptmUsd);

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
      shares: n > 0 ? n : null,
      price: p > 0 ? p : null,
      amount: crypto ? notional : null,
      notional,
      notionalUsd: finite(notionalUsd, 6),
      notionalEur: finite(notionalEur, 6),
      currency: listing.currency,
    },
    buy: {
      commission: finite(buyUsd, 6),
      native: buy ? { ...buy, charged: finite(buy.charged, 6), raw: finite(buy.raw, 6) } : null,
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
      fx: finite(fxUsd ? fxUsd / 2 : 0, 6),
    },
    sell: {
      commission: finite(sellUsd, 6),
      native: sell ? { ...sell, charged: finite(sell.charged, 6), raw: finite(sell.raw, 6) } : null,
      fx: finite(fxUsd ? fxUsd / 2 : 0, 6),
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(brokerFees, 6),
      taxes: finite(taxUsd, 6),
      change: finite(fxUsd, 6),
      réglementaire: finite(ptmUsd, 6),
    },
    levy: { ptm: levy.ptm },
    commission: {
      each: ticket.each,
      comm: ticket.comm,
      handling: ticket.handling,
      rate: ticket.rate || null,
      min: ticket.min || null,
      currency: "EUR",
      eachWay: true,
    },
    basis,
    confidence: confidenceOf({
      ticket,
      listing,
      leaf,
      marketBp,
      marketPerShare,
      unsourced: m.unsourced,
      taxPct,
      taxSource,
      fxPct,
      buy,
      levy,
    }),
  };
}

function confidenceOf({
  ticket,
  listing,
  leaf,
  marketBp,
  marketPerShare,
  unsourced,
  taxPct,
  taxSource,
  fxPct,
  buy,
  levy,
}) {
  const said = [];
  said.push(
    `DEGIRO NL Basic/Active/Trader, palier ${ticket.market}, brochure du ${SCHEDULE.revised} relue le ${SCHEDULE.readOn} ` +
      `(inchangée depuis le ${SCHEDULE.previouslyRead})`
  );
  if (ticket.rate) {
    said.push(
      buy?.floored
        ? `le plancher mord : ${Number(buy.raw.toPrecision(3))} € calculés, ${ticket.min} € facturés par sens`
        : `crypto ${(ticket.rate * 100).toFixed(2)} % par sens, plancher ${ticket.min} €, pas de handling`
    );
  } else {
    said.push(`ticket ${ticket.comm} € + handling ${ticket.handling} € par sens`);
  }
  if (fxPct) {
    said.push(
      `AutoFX ${(FX_EACH_WAY * 100).toFixed(2)} % par sens, mesuré le ${CHECK.on} ` +
        `(AAPL NDQ, cash ${CHECK.cash.start} → ${CHECK.cash.end}, ${(CHECK.fxRoundTrip * 100).toFixed(2)} % RT)`
    );
  } else {
    said.push(`cotation EUR : pas de change`);
  }
  if (!ticket.rate) {
    said.push(
      `SEC / TAF dans le handling, pas en sus. Aller-retour AAPL NDQ le ${CHECK.on} : tickets ${CHECK.commissionEach} €, rien d'autre hors AutoFX`
    );
  }
  if (taxPct) {
    said.push(
      taxSource === "degiro"
        ? `taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant — timbre ${issuerCc(listing.isin)} que DEGIRO dit répercuter (cet ISIN n'est pas dans taxMap.mjs)`
        : `taxe à l'achat ${(100 * taxPct).toFixed(2)} % du montant, depuis taxMap.mjs`
    );
  }
  if (levy?.ptm) {
    said.push(`PTM ${PTM.each} £ par sens, le montant dépasse ${PTM.above} £`);
  }
  if (marketBp != null) said.push(`carnet publié ${Number(marketBp.toPrecision(4))} bp, aller-retour`);
  else if (marketPerShare != null) said.push(`carnet Rule 605, ${marketPerShare} $ la part, moyenne 100–499 parts`);
  else {
    said.push(
      `aucun carnet : ${unsourced?.name || listing.exchange}, ${unsourced?.why || "pas de source"}. ` +
        `Le total est N/A faute de mesure, pas faute de frais`
    );
  }
  said.push(
    `hors total : connectivité 2,50 € / an / place (sauf AMS, BRU, Tradias, Kernselectie), ` +
      `FX manuel 10 € + 0,25 %, virement gratuit. Téléphone + 10 €, obligations et options hors de cet aller-retour`
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
          fxEachWay: FX_EACH_WAY,
          crypto: { rate: CRYPTO_RATE, min: CRYPTO_MIN },
          ptm: PTM,
          check: CHECK,
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
      "usage : node degiro_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=€] [--json]\n" +
        "        node degiro_cost.mjs --schedule\n" +
        "  ex.   node degiro_cost.mjs AAPL NDQ USD --shares=1 --price=230\n" +
        "        node degiro_cost.mjs EUNL TDG EUR --shares=1 --price=108\n" +
        "        node degiro_cost.mjs BTC --amount=1000"
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

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) {
      console.log(`\nce que DEGIRO propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange || "—"}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}\n`
  );

  if (out.trade?.notional != null) {
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
  if (out.basis) console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
