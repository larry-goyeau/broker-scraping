// What one round trip costs at Superhero (Superhero Markets Pty Ltd for
// Australian shares, Superhero Securities Limited for US shares): buy n
// shares at price p on the ASX, Cboe Australia or a US exchange, sell them
// back at once, online, in dollars.
//
// Fee Schedule of 9 August 2026, read 2026-10-26 (the pricing page prints
// the same "From $2" and "50bps"):
//   Trading Account Brokerage (ASX)  "A$2 brokerage for all trades up to
//                                    A$20,000 or 0.01% for trades above
//                                    A$20,000", each buy and each sell.
//                                    The pricing table gives ASX and CBOE.
//   US Trading Account Brokerage     "US$2 brokerage for all trades up to
//                                    US$20,000 or 0.01% for trades above
//                                    US$20,000".
//   FX Transfer Fee                  "50 bps (US$0.0050 added to rate)" to
//                                    move money between AUD and USD.
//   SEC fee, FINRA TAF               "Charged by the SEC / FINRA, see
//                                    sec.gov / finra.gov": no figure, so 0
//                                    like the other files.
// The account is funded in AUD only and withdrawn in AUD only (deposits.mjs):
// a US line converts AUD to USD on the buy and back on the sale, 0.5 % of
// the amount each way, in the total. ADR fees (US$0.01-0.05 a share, charged
// by the depositary), transfers and the 1.5 % instant-settlement fee are not
// this trade. Australia has no stamp duty on listed shares; a US FTT comes
// from taxMap.mjs by ISIN.
//
// Book: the row's own book on the ASX (XASX) or Cboe Australia (CHIA). US:
// the T&Cs (v5.1, 15 October 2026) define "US Execution and Clearing
// Provider" as "Apex Clearing Corporation", so the book is the 605 times
// Apex's 606 Q once spreads/rule606.mjs maps `superhero: "apex"`; until
// then it is the quoted NBBO.
//
//   https://docs.superhero.com.au/guides/Superhero+Fee+Schedule.pdf
//   https://www.superhero.com.au/invest/pricing/
//   https://docs.superhero.com.au/guides/Superhero+Terms+Conditions.pdf
//
//   node brokers/superhero/superhero_cost.mjs BHP ASX AUD --shares=100 --price=45
//   node brokers/superhero/superhero_cost.mjs BHP ASX AUD --shares=1000 --price=45
//   node brokers/superhero/superhero_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/superhero/superhero_cost.mjs SPY ARCX USD --shares=100 --price=650
//   node brokers/superhero/superhero_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { qOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { taxesOf, taxRates, taxGap } from "../../taxMap.mjs";
import { depositHas } from "../../deposits.mjs";

const FOLDER = "superhero";
const CATALOGUE = new URL("superhero-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://docs.superhero.com.au/guides/Superhero+Fee+Schedule.pdf",
  pricing: "https://www.superhero.com.au/invest/pricing/",
  readOn: "2026-10-26",
  dated: "2026-08-09",
  entity: "Superhero Markets Pty Ltd (ASX), Superhero Securities Limited (US)",
};

const BASE = "AUD";
// Each trade, AUD on the ASX and Cboe, USD in the US: a flat 2 up to
// 20,000 of order value, 0.01 % of the whole order above.
const FLAT = 2;
const FLAT_UP_TO = 20_000;
const RATE = 0.0001;
const FX_ONE_WAY = 0.005;
const US_MICS = new Set(["XNAS", "XNYS", "XASE", "ARCX", "BATS", "TXSE"]);

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  if (amount == null || Number.isNaN(amount)) return null;
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

/** Brokerage of one trade, in the trade's currency. */
export function brokerage(value) {
  return value > FLAT_UP_TO ? value * RATE : FLAT;
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const want = place ? listingKey({ exchange: place, mic: place }) : {};
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (want.venue && m.venue) return m.venue.mic === want.venue.mic;
      return loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

/**
 * The whole bill for buying `shares` at `price` and selling straight back.
 * `usd` is the number the page prints. `brokerFees` is Superhero's
 * brokerage and its forced conversion.
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
    cashCurrency: BASE,
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Superhero n'existe pas encore : lancer `node brokers/superhero/superhero_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Superhero` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Superhero`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? code(m.row.mic) ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const american = US_MICS.has(code(listing.mic)) && listing.currency === "USD";
  const settle = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, settle);
  const basis = american
    ? `barème Superhero du ${SCHEDULE.dated}, relu le ${SCHEDULE.readOn} : 2 USD l'ordre jusqu'à 20 000 USD, 0,01 % au-delà ; SEC et TAF sans montant (0) ; change forcé AUD ↔ USD 0,5 % par sens (50 bps), compte en AUD seulement`
    : `barème Superhero du ${SCHEDULE.dated}, relu le ${SCHEDULE.readOn} : 2 AUD l'ordre jusqu'à 20 000 AUD, 0,01 % au-delà, ASX comme Cboe Australia`;
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? settle : BASE,
    basis,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: held ? 0 : FX_ONE_WAY * 2,
  };
  if (!american && listing.currency !== BASE) {
    return { ...shared, why: `${listing.currency} sur ${listing.exchange} : Superhero n'imprime que l'ASX, Cboe Australia et les États-Unis` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const side = brokerage(notional);
  const commissionUsd = dollars(side * 2, american ? "USD" : BASE);
  // SEC and TAF: the schedule points to sec.gov and finra.gov, no figure.
  const tafUsd = 0;
  // Forced conversion: AUD in on the buy, back to AUD on the sale.
  const fxUsd = held ? 0 : notionalUsd == null ? null : notionalUsd * FX_ONE_WAY * 2;
  const brokerFees = plus(commissionUsd, fxUsd);

  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const gap = taxGap(listing.isin, listing.type, listing.mic);
  const taxUsd = gap || notionalUsd == null ? null : notionalUsd * taxPct;

  const q = american ? qOf(FOLDER) : null;
  let marketBp = bp ?? (american ? null : book.leaf?.bp ?? null);
  let marketPerShare = perShare ?? (american ? null : book.leaf?.perShare ?? null);
  if (american && bp == null && perShare == null) {
    marketPerShare = usBookPerShare({ broker: FOLDER, ticker: listing.ticker, fallback: book.leaf?.perShare ?? null });
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: american && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (v) => dollars(v, listing.currency),
  });
  const bookUsd =
    parts.a == null || parts.b == null || notionalUsd == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, commissionUsd, fxUsd, tafUsd, taxUsd);

  const unknown = [
    bookUsd == null
      ? american
        ? `pas de carnet 605 pour ${listing.ticker || etf}`
        : `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`
      : null,
    gap,
  ].filter(Boolean);
  const confidence = [
    basis,
    `courtage ${Number(side.toPrecision(6))} ${american ? "USD" : "AUD"} par sens${notional > FLAT_UP_TO ? " (0,01 % au-delà de 20 000)" : ""}`,
    american ? "SEC et TAF : la grille renvoie à sec.gov et finra.gov sans montant, comptés 0" : "ligne en AUD : pas de change",
    american && !held ? `change forcé ${finite(fxUsd, 6)} $ (0,5 % à l'aller et au retour)` : null,
    taxPct ? `taxe ${Object.entries(taxRates(tax)).map(([k, v]) => `${k} ${(100 * v).toFixed(2)} %`).join(", ")} (taxMap.mjs)` : null,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} bp`
      : marketPerShare != null
        ? q != null
          ? `carnet 605 × Q (Apex Clearing), ${marketPerShare} $ la part`
          : `NBBO coté ${marketPerShare} $ la part : pas de Q pour superhero dans spreads/rule606.mjs`
        : null,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    bp: marketBp,
    perShare: marketPerShare,
    ...(unknown.length ? { why: unknown.join(" ; ") } : {}),
    commission: { each: side, currency: american ? "USD" : BASE, eachWay: true },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(commissionUsd, 6),
      change: finite(fxUsd, 6),
      réglementaire: finite(tafUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    tax,
    confidence,
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          brokerage: "2 (AUD on ASX/Cboe, USD in the US) a trade up to 20,000, 0.01% above",
          secTaf: "no figure printed: 0",
          fx: "0.5% AUD<->USD each way, in the total (AUD cash only)",
        },
        null,
        2
      )
    );
    return;
  }
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/superhero/superhero_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
