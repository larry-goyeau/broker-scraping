// What one round trip costs at Canadia Securities: buy n shares on the
// Cambodia Securities Exchange and sell them straight back, in dollars.
// The online path is the CSX Mobile Trading System (https://mts.csx.com.kh)
// and the CSX Trade app, which the placing-order page and the FAQ name next
// to the counter, e-mail and phone. CSX shares are quoted in riel and the
// account holds riel or dollars (deposits.mjs), so nothing is converted.
//
// https://canasecurities.com.kh/brokerage-fee/ read on 2026-10-21, stock
// trading fee by volume per transaction, individual investor:
//   up to KHR 2,000,000,000 (USD 500,000)   0.47 %
//   above KHR 2,000,000,000                 0.45 %
// The rate is set by the size of each transaction and applies to the whole
// amount; each buy and each sell is a transaction. No minimum is printed.
// The institutional rate (0.40 %) is not for a retail account and stays out.
// https://canasecurities.com.kh/placing-order/ and
// https://canasecurities.com.kh/faqs/ read the same day: orders go in at the
// counter, by e-mail, by phone or by the MTS / CSX Trade app; cash is
// deposited in KHR or USD. https://canasecurities.com.kh/securities-trading/
// prints the trading currency as the Khmer riel. No page prints an exchange,
// clearing, regulator levy or tax on top, so none is added.
//
// In the total: the CSX book crossed and 0.47 % or 0.45 % each side. No
// remark. The CSX book is not stored, so the total stays unknown until it is.
//
//   node brokers/canadia/canadia_cost.mjs ABC XCSX KHR --shares=100 --price=9000
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";

const CATALOGUE = new URL("canadia-parsed.json", import.meta.url);
const PAGE = "https://canasecurities.com.kh/brokerage-fee/";
const READ_ON = "2026-10-21";
const RATE = 0.0047;
const LARGE_RATE = 0.0045;
const TIER = 2_000_000_000; // KHR per transaction
const rateFor = (notionalKhr) => (notionalKhr > TIER ? LARGE_RATE : RATE);
const BASE = "KHR";
const REMARK = "";

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};

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
    url: PAGE,
    remark: REMARK,
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Canadia Securities n'existe pas encore : lancer `node brokers/canadia/canadia_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Canadia Securities` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Canadia Securities`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency} @ ${r.exchange}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "canadia",
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
  const cash = depositHas("canadia", null, listing.currency) ? listing.currency : BASE;
  const marketBp = bp ?? book.leaf?.bp ?? null;
  const marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  const shared = {
    ...answer,
    cashCurrency: cash,
    remark: [REMARK, m.row.remark].filter(Boolean).join(" "),
    listing,
    basis:
      `page « Brokerage Fee » de Canadia Securities relue le ${READ_ON}. ` +
      `Investisseur individuel : 0,47 % par transaction jusqu'à 2 milliards de KHR, 0,45 % au-delà, sur tout le montant, chaque sens, sans minimum ; aucun autre frais par ordre publié.`,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    bp: marketBp,
    perShare: marketPerShare,
  };

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0)) return { ...shared, why: "aucun nombre de parts" };
  if (!(p > 0)) return { ...shared, why: "aucun prix pour cette ligne : lancer node assets/prices.mjs" };

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const notionalKhr = listing.currency === "KHR" ? notional : null;
  const rate = notionalKhr == null ? null : rateFor(notionalKhr);
  if (rate == null) return { ...shared, why: `aucun barème Canadia Securities publié pour une ligne en ${listing.currency}` };
  const commissionLocal = notional * rate * 2;
  const brokerFees = dollars(commissionLocal, listing.currency);
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null ? null : parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees);
  const why =
    usd != null
      ? null
      : notionalUsd == null
        ? `aucun cours en dollars pour ${listing.currency} dans fx.mjs`
        : `aucun carnet pour ${listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}`;
  const confidence = [
    shared.basis,
    "aucune redevance de la CSX ni du SERC publiée par le courtier",
    `ligne ${listing.currency}, payée en ${cash} : aucun change`,
    marketBp != null
      ? `carnet ${Number(marketBp.toPrecision(4))} pb`
      : marketPerShare != null
        ? `carnet ${marketPerShare} ${listing.currency} par titre`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    commission: { buy: rate, sell: rate, minimum: 0, tier: TIER, aboveTier: LARGE_RATE, currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      taxes: 0,
      courtageLocal: finite(commissionLocal, 6),
    },
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
  const arg = (flag, fallback) => {
    const hit = process.argv.find((item) => item.startsWith(`--${flag}=`));
    return hit ? hit.slice(flag.length + 3) : fallback;
  };
  const [etf, place, currency] = process.argv.slice(2).filter((item) => !item.startsWith("--"));
  console.log(JSON.stringify(roundTrip({ etf, place, currency, shares: Number(arg("shares", "10")), price: Number(arg("price", "0")) }), null, 2));
}

printCli();
